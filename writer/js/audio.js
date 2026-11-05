/* Stream-audio v1, T3 (frontend): the play screen's audio player.
 *
 * The backend (T2) relays CosyVoice3 audio per paragraph; this
 * module is the browser side of that contract (design
 * stream-audio-design.md §3/§6):
 * - Per-paragraph speaker button: plays ONLY that paragraph's
 *   cached audio, then stops; tapping again stops it. Works
 *   whether the auto-speak flag is on or off.
 * - Auto-speak flag (OFF by default, persisted per user): when
 *   ON, each newly completed scene reads aloud automatically
 *   once its audio is ready. Browsers block autoplay without
 *   a user gesture, so auto-read only starts after the reader
 *   has interacted (tapped, typed) - the flag enables it from
 *   the next turn onward, never on page load with no input.
 * - Background pre-generation (§6): as soon as a scene's text
 *   is complete, its paragraphs are synthesized in the
 *   background while the reader reads; a speaker button plays
 *   CACHED audio (instant once ready, "Generating..." before
 *   that). v1 never streams live sentence-by-sentence.
 * - Play/pause + stop for the current reading, plus mute.
 *   These control the current paragraph or auto-read queue;
 *   they do not change the auto-speak flag itself.
 * - If audio fails or the TTS service is down, the text still
 *   works: a quiet "Audio unavailable" state, never a stalled
 *   scene. No sentence highlight in v1.
 *
 * No DOM dependency at import time: the player takes its
 * collaborators (synthesize/probe/audio element/storage) as
 * constructor deps, so the state machine is testable in node
 * without a browser. play.js passes the real apiFetch calls;
 * the harness passes stubs. Audio is content-addressed: the
 * cache key is a hash of the paragraph text + voice, so a
 * retried scene (same position, different text) can never
 * play the discarded scene's audio.
 *
 * Storage keys are the shared contract the reading-settings
 * panel binds to, same pattern as writer.streamReplies:
 * same key, same "1" = on value. */

export const AUTO_SPEAK_KEY = "writer.autoSpeak";
export const NARRATOR_VOICE_KEY = "writer.narratorVoice";
export const AUDIO_MUTED_KEY = "writer.audioMuted";
export const VOICES = ["vendetti", "klett"];
export const DEFAULT_VOICE = "vendetti";

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function autoSpeakOn(storage) {
  try {
    return (storage || safeStorage())?.getItem(AUTO_SPEAK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoSpeak(on, storage) {
  try {
    const store = storage || safeStorage();
    if (!store) return;
    if (on) store.setItem(AUTO_SPEAK_KEY, "1");
    else store.removeItem(AUTO_SPEAK_KEY);
  } catch {
    // Private mode or similar: the preference just is not kept.
  }
}

export function readVoice(storage) {
  try {
    const v = (storage || safeStorage())?.getItem(NARRATOR_VOICE_KEY);
    return VOICES.includes(v) ? v : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

export function setVoice(voice, storage) {
  if (!VOICES.includes(voice)) return;
  try {
    (storage || safeStorage())?.setItem(NARRATOR_VOICE_KEY, voice);
  } catch {
    // Not remembered; the default still applies.
  }
}

export function audioMuted(storage) {
  try {
    return (storage || safeStorage())?.getItem(AUDIO_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAudioMuted(muted, storage) {
  try {
    const store = storage || safeStorage();
    if (!store) return;
    if (muted) store.setItem(AUDIO_MUTED_KEY, "1");
    else store.removeItem(AUDIO_MUTED_KEY);
  } catch {
    // Session-only mute then.
  }
}

/* Small content hash (djb2, hex): the cache key for one
 * paragraph's audio. Two different texts never share audio,
 * even at the same scene/beat position after a retry. */
export function hashText(text) {
  let h = 5381;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

export function cacheKeyFor(text, voice) {
  return hashText(text) + ":" + voice;
}

export class AudioUnavailable extends Error {
  constructor(message) {
    super(message || "Audio unavailable");
    this.name = "AudioUnavailable";
  }
}

/* Beat states the UI renders from (beatState): idle (never
 * requested), generating (synthesis in flight), ready
 * (cached audio), unavailable (TTS down or refused),
 * playing / paused (this beat is the current reading). */
export function createAudioPlayer(deps = {}) {
  const synthesize = deps.synthesize || (() =>
    Promise.reject(new AudioUnavailable("no synthesize function")));
  const probe = deps.probe || (() => Promise.resolve(false));
  const createAudio = deps.createAudio || (() => new Audio());
  const createObjectURL = deps.createObjectURL ||
    ((blob) => URL.createObjectURL(blob));
  const revokeObjectURL = deps.revokeObjectURL ||
    ((url) => URL.revokeObjectURL(url));
  const storage = deps.storage || null;

  const cache = new Map(); // cacheKey -> {status, url, promise}
  let available = null; // null = unknown, true/false = probed
  let probePromise = null;
  let current = null; // {cacheKey, text, voice, audio, source}
  let queue = []; // [{cacheKey, text, voice}] remaining, or []
  let queueActive = false;
  let muted = audioMuted(storage);
  let userInteracted = false;
  const listeners = new Set();

  function notify() {
    for (const fn of listeners) {
      try { fn(snapshot()); } catch { /* a listener never breaks playback */ }
    }
  }

  function snapshot() {
    return {
      available,
      muted,
      currentKey: current ? current.cacheKey : null,
      paused: current ? current.audio.paused !== false : false,
      queueActive,
    };
  }

  function entryFor(text, voice) {
    return cache.get(cacheKeyFor(text, voice)) || null;
  }

  function beatState(text, voice) {
    if (available === false) return "unavailable";
    const key = cacheKeyFor(text, voice);
    if (current && current.cacheKey === key) {
      return current.audio.paused ? "paused" : "playing";
    }
    const entry = cache.get(key);
    if (!entry) return "idle";
    return entry.status;
  }

  function probeAvailability() {
    if (probePromise) return probePromise;
    probePromise = probe()
      .then((ok) => {
        available = ok === true;
        notify();
        return available;
      })
      .catch(() => {
        available = false;
        notify();
        return false;
      });
    return probePromise;
  }

  /* Start (or join) synthesis for one paragraph. Resolves to
   * the object URL; rejects AudioUnavailable on a 503/down
   * service, and leaves the entry cached either way so a
   * second tap never pays twice. */
  function ensureAudio(text, voice) {
    const key = cacheKeyFor(text, voice);
    const existing = cache.get(key);
    if (existing) {
      if (existing.status === "ready") return Promise.resolve(existing.url);
      if (existing.status === "generating") return existing.promise;
      return Promise.reject(new AudioUnavailable());
    }
    const entry = { status: "generating", url: null, promise: null };
    cache.set(key, entry);
    notify();
    entry.promise = synthesize(text, voice)
      .then((blob) => {
        entry.url = createObjectURL(blob);
        entry.status = "ready";
        notify();
        return entry.url;
      })
      .catch((err) => {
        entry.status = "unavailable";
        notify();
        throw err instanceof AudioUnavailable
          ? err
          : new AudioUnavailable(err && err.message);
      });
    return entry.promise;
  }

  function pregenerate(beats, voice) {
    for (const beat of beats || []) {
      if (!beat || !String(beat.text || "").trim()) continue;
      ensureAudio(beat.text, voice).catch(() => {
        // Background work never surfaces: the button for
        // that beat quietly shows "Audio unavailable".
      });
    }
  }

  function attachAudio(url) {
    const audio = createAudio();
    audio.src = url;
    audio.muted = muted;
    audio.onended = () => {
      if (queueActive && queue.length) {
        const next = queue.shift();
        playEntry(next).catch(() => advanceQueue());
      } else {
        queueActive = false;
        queue = [];
        current = null;
        notify();
      }
    };
    audio.onerror = () => {
      if (current) {
        const entry = cache.get(current.cacheKey);
        if (entry) entry.status = "unavailable";
      }
      stop();
    };
    return audio;
  }

  function advanceQueue() {
    if (queue.length) {
      const next = queue.shift();
      playEntry(next).catch(() => advanceQueue());
    } else {
      queueActive = false;
      current = null;
      notify();
    }
  }

  async function playEntry(item) {
    const url = await ensureAudio(item.text, item.voice);
    if (current) {
      try { current.audio.pause(); } catch { /* already stopped */ }
    }
    const audio = attachAudio(url);
    current = {
      cacheKey: item.cacheKey || cacheKeyFor(item.text, item.voice),
      text: item.text,
      voice: item.voice,
      audio,
      source: queueActive ? "queue" : "manual",
    };
    notify();
    try {
      await audio.play();
    } catch (err) {
      // Autoplay without a gesture (or a detached element):
      // stop quietly - the speaker buttons still work once
      // the reader has interacted.
      const wasCurrent = current && current.audio === audio;
      if (wasCurrent) {
        current = null;
        queueActive = false;
        queue = [];
      }
      notify();
      throw err;
    }
    notify();
  }

  /* Play exactly one paragraph, then stop: any queue is
   * cancelled, any current reading stops first. */
  async function playBeat(text, voice) {
    const key = cacheKeyFor(text, voice);
    if (current && current.cacheKey === key &&
        current.audio.paused === false) {
      stop();
      return;
    }
    queueActive = false;
    queue = [];
    await playEntry({ cacheKey: key, text, voice });
  }

  /* Read a scene's beats in order, each from its cached
   * audio (waiting for background generation where it is
   * still running); a failed beat is skipped, not fatal. */
  async function playQueue(beats, voice) {
    stop();
    const items = (beats || [])
      .filter((b) => b && String(b.text || "").trim())
      .map((b) => ({
        cacheKey: cacheKeyFor(b.text, voice),
        text: b.text,
        voice,
      }));
    if (!items.length) return;
    queue = items.slice(1);
    queueActive = true;
    try {
      await playEntry(items[0]);
    } catch {
      advanceQueue();
    }
  }

  /* Stop only an auto-read queue, leaving a manually
   * started paragraph playing (a new turn cancels the
   * queue for the scene it replaces, not the reader's
   * chosen paragraph). */
  function cancelQueue() {
    if (!queueActive) return;
    queueActive = false;
    queue = [];
    if (current && current.source === "queue") stop();
    else notify();
  }

  function pause() {
    if (current && current.audio.paused === false) {
      try { current.audio.pause(); } catch { /* already stopped */ }
      notify();
    }
  }

  function resume() {
    if (current && current.audio.paused) {
      current.audio.play().catch(() => {
        // Gesture-gated: stay paused, the button retries.
      });
      notify();
    }
  }

  function stop() {
    queueActive = false;
    queue = [];
    if (current) {
      try { current.audio.pause(); } catch { /* already stopped */ }
      try { current.audio.src = ""; } catch { /* stub audio */ }
      current = null;
    }
    notify();
  }

  function setMuted(m) {
    muted = m === true;
    setAudioMuted(muted, storage);
    if (current) current.audio.muted = muted;
    notify();
  }

  function reset() {
    stop();
    for (const entry of cache.values()) {
      if (entry.url) {
        try { revokeObjectURL(entry.url); } catch { /* already gone */ }
      }
    }
    cache.clear();
    available = null;
    probePromise = null;
    notify();
  }

  const player = {
    get available() { return available; },
    get muted() { return muted; },
    get userInteracted() { return userInteracted; },
    set userInteracted(v) { userInteracted = v === true; },
    get currentKey() { return current ? current.cacheKey : null; },
    beatState,
    probeAvailability,
    ensureAudio,
    pregenerate,
    playBeat,
    playQueue,
    cancelQueue,
    pause,
    resume,
    stop,
    setMuted,
    reset,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    snapshot,
  };
  return player;
}
