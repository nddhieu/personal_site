/* Play screen: live turns against the F3 turn pipeline.
 *
 * WIRING SECTION (separable): everything in this file is the live
 * play wiring - start a playthrough, Send/Continue as real turns,
 * diary from live state, Retry live (f3-t4) and Correct parked
 * as "Soon". The styling fixes (fonts, cards, tokens, prose
 * live in play.html/play.css and do not depend on this file's
 * turn logic; this file could be reverted to the T0 shell
 * independently of those fixes.
 *
 * Flow: book (GET /api/books/{id}) -> playthrough
 * (POST /api/books/{id}/playthroughs) -> turns
 * (POST /api/playthroughs/{id}/turns {action}) -> scene +
 * diary entry. State shapes: scenes [{turn, action, text}],
 * diary entries are one sentence each in the main character's
 * voice. Suggestions (F3 suggest, built on top of T1): the
 * turn response carries suggestions[] for the new scene; this
 * file renders them into the cards, opens the panel, and a
 * tap plays the turn by suggestion id. The starter actions
 * below only cover the time before the first turn lands. */

import { apiFetch, API_BASE, TOKEN_KEY, ApiError } from "./js/app-api.js";
import { getToken, clearToken, logout } from "./js/app-auth.js";
import { getTheme, toggleTheme } from "./js/theme.js";
import {
  renderTopbar,
  showLoading,
  showNote,
  friendlyError,
} from "./js/app-ui.js";
import {
  createAudioPlayer,
  autoSpeakOn,
  setAutoSpeak,
  readVoice,
  setVoice,
} from "./js/audio.js";

const BOOK_ID = new URLSearchParams(location.search).get("id") || "accad-kim";
const PLAYTHROUGH_KEY = "st_playthrough_" + BOOK_ID;

/* Starter actions shown before the pipeline generates its own
 * (story-f3-suggest). Keyed by book; a generic set covers any
 * other book. These stage text into the input; they are not
 * presented as generated suggestions. */
const STARTER_ACTIONS = {
  "accad-kim": [
    "I open the door and look at her properly.",
    "I ask who she is, and what happened out there.",
    "I step aside and invite her in, out of the rain.",
  ],
};
const DEFAULT_ACTIONS = [
  "I look around and take in the scene.",
  "I speak first.",
  "I wait, and watch what happens.",
];

const el = (id) => document.getElementById(id);
/* Scene audio (stream-audio v1, T3): per-paragraph speaker
 * buttons + auto-speak flag + transport, over the T2 relay
 * (POST /api/audio/synthesize, GET /api/audio/health). The
 * player owns synthesis, caching, and playback; this file
 * owns the buttons and the scene-completed hook. The relay
 * is an enhancement: a down TTS service only quiets the
 * buttons ("Audio unavailable"), it never blocks reading. */
const audioPlayer = createAudioPlayer({
  synthesize: (text, voice) =>
    apiFetch("/api/audio/synthesize", {
      method: "POST",
      body: { text, voice },
      response: "blob",
    }),
  probe: () =>
    apiFetch("/api/audio/health")
      .then((d) => Boolean(d && d.available))
      .catch(() => false),
});

/* A tap is a gesture: the first pointer/key interaction in
 * the session unlocks auto-read (browsers block autoplay
 * without one), so the flag can only auto-play from the
 * next turn onward, never on page load. */
function markAudioInteracted() {
  audioPlayer.userInteracted = true;
}
document.addEventListener("pointerdown", markAudioInteracted);
document.addEventListener("keydown", markAudioInteracted);

/* Outline speaker (Emochi tool-btn stroke idiom) and stop
 * square, swapped in place as the button's state changes. */
const SPEAKER_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const STOP_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/></svg>';

const AUDIO_BUTTON_TITLES = {
  idle: "Listen to this paragraph",
  generating: "Generating audio…",
  ready: "Listen to this paragraph",
  playing: "Stop listening",
  paused: "Listen to this paragraph",
  unavailable: "Audio unavailable",
};

/* One image icon per paragraph (Hieu, Nov 5), replacing the
 * "Generate image" / "Use as background" text buttons. The
 * icon is state-aware, mirroring syncAudioButton: no image
 * yet -> it generates one; an image exists -> it sets that
 * image as the page background; the current background's
 * icon is filled and offers Clear instead. The label always
 * names the action a tap will take. */
const IMAGE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';

const IMAGE_BUTTON_TITLES = {
  generate: "Generate image",
  background: "Use as background",
  clear: "Clear background",
};

function imageButtonState(scene, beatIndex) {
  if (!beatImageState(scene, beatIndex).file) return "generate";
  const key = beatKey(
    scenes.indexOf(scene), beatIndex);
  return sceneBackground && sceneBackground.key === key
    ? "clear" : "background";
}

function syncImageButton(btn, scene, beatIndex) {
  const state = imageButtonState(scene, beatIndex);
  btn.classList.toggle("has-image", state !== "generate");
  btn.classList.toggle("is-background", state === "clear");
  btn.innerHTML = IMAGE_SVG;
  btn.title = IMAGE_BUTTON_TITLES[state];
  btn.setAttribute("aria-label",
    IMAGE_BUTTON_TITLES[state] + " for this paragraph");
}

function syncAudioButton(btn, sceneIndex, beatText) {
  const voice = readVoice();
  const state = audioPlayer.beatState(beatText, voice);
  btn.classList.toggle("is-playing", state === "playing");
  btn.classList.toggle("is-generating", state === "generating");
  btn.classList.toggle("is-unavailable", state === "unavailable");
  // Only the unavailable state disables the button. The
  // in-flight scene is NOT disabled here: renderScenes runs
  // while a turn is still marked busy, and a disabled flag
  // set then would stay stuck until the next re-render. The
  // click handler is the guard instead (it ignores taps on
  // the scene being written while busy).
  btn.disabled = state === "unavailable";
  btn.innerHTML = state === "playing" ? STOP_SVG : SPEAKER_SVG;
  btn.title = AUDIO_BUTTON_TITLES[state];
  btn.setAttribute("aria-label", AUDIO_BUTTON_TITLES[state]);
}

/* Every speaker button on the page, refreshed in place
 * when the player reports a state change (generation
 * finished, playback started/stopped, probe answered). */
function updateAudioButtons() {
  const voice = readVoice();
  document.querySelectorAll("[data-testid^='scene-audio-btn-']")
    .forEach((btn) => {
      const key = btn.dataset.testid.slice("scene-audio-btn-".length);
      const [si, bi] = key.split(":").map(Number);
      const scene = scenes[si];
      if (!scene) return;
      const beats = splitBeats(sceneText(scene));
      if (beats[bi] === undefined) return;
      syncAudioButton(btn, si, beats[bi]);
    });
}

/* The transport (pause/resume, stop, mute) shows only while
 * something is playing or paused; mute persists per user. */
function updateAudioTransport() {
  const bar = el("audio-transport");
  if (!bar) return;
  const snap = audioPlayer.snapshot();
  const active = snap.currentKey !== null;
  bar.hidden = !active;
  const pauseBtn = el("audio-pause-btn");
  if (pauseBtn) {
    pauseBtn.textContent = snap.paused ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-label",
      snap.paused ? "Resume listening" : "Pause listening");
  }
  const muteBtn = el("audio-mute-btn");
  if (muteBtn) {
    muteBtn.textContent = snap.muted ? "Unmute" : "Mute";
    muteBtn.setAttribute("aria-label",
      snap.muted ? "Unmute" : "Mute");
    muteBtn.classList.toggle("is-muted", snap.muted);
  }
}

audioPlayer.onChange(() => {
  updateAudioButtons();
  updateAudioTransport();
});

async function onAudioButton(sceneIndex, beatIndex, beatText) {
  if (busy && sceneIndex === scenes.length - 1) return;
  const voice = readVoice();
  if (audioPlayer.beatState(beatText, voice) === "playing") {
    audioPlayer.stop();
    return;
  }
  try {
    if (autoSpeakOn()) {
      if (!scenes[sceneIndex]) return;
      const from = Number.isInteger(beatIndex) ? beatIndex : 0;
      // Read to the end of the book (Hieu, Nov 7): from the
      // tapped beat through the last beat of the last scene
      // that exists - scenes not yet written cannot play.
      // A new turn cancels this queue before it can read a
      // replaced scene's beats (runTurnBody -> cancelQueue),
      // and the player's lookahead synthesis keeps up with
      // scenes whose audio was never pre-generated.
      const beats = [];
      for (let si = sceneIndex; si < scenes.length; si++) {
        splitBeats(sceneText(scenes[si])).forEach((text, j) => {
          if (si === sceneIndex && j < from) return;
          beats.push({ key: beatKey(si, j), text });
        });
      }
      if (!beats.length) return;
      await audioPlayer.playQueue(beats, voice);
    } else {
      await audioPlayer.playBeat(beatText, voice);
    }
  } catch {
    // A failed play leaves the quiet state: the button
    // already shows "Audio unavailable"; reading continues.
  }
}

/* A scene just completed: pre-generate its paragraphs in
 * the background while the reader reads, and - when the
 * flag is on and the reader has already interacted - read
 * it aloud once the audio is ready. Only the newest scene
 * pre-generates; older scenes synthesize on first tap. */
function onSceneCompleted(sceneIndex) {
  const scene = scenes[sceneIndex];
  if (!scene) return;
  const beats = splitBeats(sceneText(scene))
    .map((text, j) => ({ key: beatKey(sceneIndex, j), text }));
  const voice = readVoice();
  audioPlayer.pregenerate(beats, voice);
  if (autoSpeakOn() && audioPlayer.userInteracted) {
    audioPlayer.playQueue(beats, voice);
  }
}

let book = null;
let playthroughId = sessionStorage.getItem(PLAYTHROUGH_KEY) || "";
let scenes = [];
let busy = false;
let currentSuggestions = [];
let loadedSuggestions = [];

function sceneText(scene) {
  return typeof scene === "string" ? scene : (scene && scene.text) || "";
}

function diaryText(entry) {
  return typeof entry === "string" ? entry : (entry && entry.text) || "";
}

/* User-input markers (Hieu, Oct 28): a scene that came from a turn
 * carries the action the reader typed or picked. A small marker
 * sits in the book just before that scene; clicking it expands
 * or collapses the input text. Markers + input text are app-only:
 * play.css hides them in print, and the book page never renders
 * them, so printed/exported prose stays clean. Expanded markers
 * survive re-renders (a landing scene rebuilds the list) via
 * expandedInputs. The marker precedes its scene paragraph; the
 * scene-image wrap follows it, so scrollToLatestScene looks for
 * the last scene paragraph rather than lastElementChild. */
let expandedInputs = new Set();

/* Instruction mode (Hieu, Oct 29): asterisk-wrapped text
 * (*...*) in the play input is a direction FOR the AI, not
 * story text. splitInstruction pulls those segments out of
 * the action and joins them into one direction string; the
 * turn sends {action, instruction} so the backend can pass
 * the direction to the pipeline without ever storing it in
 * the scene action, the diary, or the prose. An unmatched
 * asterisk is left alone (it is just a character, not an
 * instruction), and an empty segment contributes nothing.
 * The marker above still shows only the story action, so
 * instructions never appear in print/export either - they
 * are absent from the stored scene entirely, not merely
 * hidden like the markers. */
function splitInstruction(text) {
  const instructions = [];
  const action = String(text || "")
    .replace(/\*([^*]+)\*/g, (_match, inner) => {
      const trimmed = inner.trim();
      if (trimmed) instructions.push(trimmed);
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { action, instruction: instructions.join(" ") };
}

/* Beat images (Hieu, Oct 29): one image per paragraph (beat)
 * of a scene, generated ON DEMAND from its own button under
 * that paragraph - never all beats at once. The playthrough
 * state carries what the backend already has for a beat:
 * scene.beat_images[beat] = { image_prompt, image_file }.
 * The button under each paragraph follows that state, so a
 * tap never pays for a prompt twice: a beat with a prompt
 * skips the prompt call and goes straight to generation, and
 * a beat with an image just loads it. Regenerate re-runs
 * generation from the same stored prompt. The GET is
 * owner-only, so the bytes come through apiFetch (blob) - a
 * plain <img src> could not carry the bearer token. Shown
 * images live in sceneImageSrc ("scene:beat" -> object URL)
 * so a re-render after a turn keeps them; Reset revokes and
 * clears them. A failed generation never blocks reading:
 * the slot just stays empty and the button stays retriable.
 * Legacy: a scene's old per-scene image_file (pre-beat) still
 * shows under its first paragraph via beatImageState's beat-0
 * fallback, and the backend's beat GET serves that sidecar. */
let sceneImageSrc = new Map();

/* A scene's beats are its paragraphs, blank-line separated -
 * the same rule the backend splits with, so beat indexes
 * agree on both sides. A scene with no blank lines is one
 * beat; an empty scene renders one empty paragraph. */
function splitBeats(text) {
  const parts = String(text || "").replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [""];
}

function beatKey(sceneIndex, beatIndex) {
  return sceneIndex + ":" + beatIndex;
}

/* What the backend already has for one beat: its own entry
 * wins; beat 0 additionally falls back to the scene's legacy
 * per-scene image (NOT its legacy prompt - that prompt was
 * written for the whole scene, and reusing it for one
 * paragraph would reproduce the mismatch this slice fixes,
 * so a beat-0 Generate always writes a fresh beat prompt
 * unless the beat already has one). */
function beatImageState(scene, beatIndex) {
  const entries = (scene && scene.beat_images) || {};
  const entry = entries[String(beatIndex)] || {};
  return {
    prompt: entry.image_prompt || null,
    file: entry.image_file ||
      (beatIndex === 0 && scene ? scene.image_file || null : null),
  };
}

/* Scene background (todo, @Chubby): the reader can put one
 * beat's image behind the whole play page. The background
 * is the same owner-only blob the inline image uses, so it
 * reuses sceneImageSrc's object URL (never a bare <img src>
 * that could not carry the bearer token). The choice is
 * local to the reader: localStorage keeps only the beat key
 * ("scene:beat"), keyed by book + playthrough, and restore
 * re-fetches the bytes on load (object URLs do not survive
 * a reload). The page background is a dark, bottom-
 * weighted scrim over the image and the prose turns white
 * over it (see play.css), so the reading stays legible the
 * way the reference app does it; print drops it. Reset
 * clears it first, because
 * clearSceneImages revokes the object URL the background
 * would otherwise point at; Regenerate re-applies it to the
 * new URL for the same reason. A failed restore is silent:
 * the page just stays plain, and the button still offers
 * the image. */
let sceneBackground = null; // { key, url } or null

function sceneBackgroundKey() {
  return "st_scene_bg_" + BOOK_ID + "_" + (playthroughId || "");
}

function clearSceneBackground() {
  if (bgAdjusting) exitBgAdjust();
  const page = document.querySelector(".page-play");
  if (page) {
    page.style.backgroundImage = "";
    page.style.backgroundSize = "";
    page.style.backgroundPosition = "";
    page.classList.remove("has-scene-bg");
  }
  sceneBackground = null;
  try {
    localStorage.removeItem(sceneBackgroundKey());
  } catch {
    // Private mode or similar: the background still works
    // for this visit, it just is not remembered.
  }
}

function applySceneBackground(key, url) {
  const page = document.querySelector(".page-play");
  if (!page) return;
  page.style.backgroundImage =
    "linear-gradient(rgba(8,10,16,0.16), " +
    "rgba(8,10,16,0.52) 55%, rgba(8,10,16,0.86)), " +
    "url(\"" + url + "\")";
  page.classList.add("has-scene-bg");
  sceneBackground = { key, url };
  // The scene's saved position/fit rides every application
  // (first set, restore on load, regenerate follow) - see
  // the adjust block below.
  bgAdjust = readBgAdjust(bgAdjustSceneIndex());
  applyBgAdjust();
  ensureBgDims(url);
  try {
    localStorage.setItem(sceneBackgroundKey(), String(key));
  } catch {
    // As above: unremembered, not broken.
  }
}

/* Beat image URL path for one beat: the beat GET route,
 * which also serves a scene's legacy image for beat 0. */
function beatImagePath(sceneIndex, beatIndex) {
  return "/api/playthroughs/" + encodeURIComponent(playthroughId) +
    "/scenes/" + sceneIndex + "/beats/" + beatIndex + "/image";
}

async function toggleSceneBackground(sceneIndex, beatIndex) {
  if (busy || !playthroughId) return;
  const key = beatKey(sceneIndex, beatIndex);
  if (sceneBackground && sceneBackground.key === key) {
    clearSceneBackground();
    renderScenes();
    return;
  }
  const scene = scenes[sceneIndex];
  if (!scene || !beatImageState(scene, beatIndex).file) return;
  try {
    let url = sceneImageSrc.get(key);
    if (!url) {
      // Image exists server-side but is not shown inline
      // yet: load it the same way Show does, and the
      // re-render below shows it inline too.
      const blob = await apiFetch(
        beatImagePath(sceneIndex, beatIndex),
        { response: "blob" },
      );
      url = URL.createObjectURL(blob);
      sceneImageSrc.set(key, url);
    }
    applySceneBackground(key, url);
    renderScenes();
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      showSignedOut();
      return;
    }
    showPlayError(friendlyError(err));
  }
}

async function restoreSceneBackground() {
  let stored = null;
  try {
    stored = localStorage.getItem(sceneBackgroundKey());
  } catch {
    return;
  }
  if (stored === null) return;
  // Current shape: "scene:beat". Pre-beat values stored a
  // bare scene index; those restore as that scene's beat 0
  // through the legacy per-scene GET, which still serves.
  let sceneIndex;
  let beatIndex;
  let path;
  if (String(stored).includes(":")) {
    const parts = String(stored).split(":");
    sceneIndex = Number(parts[0]);
    beatIndex = Number(parts[1]);
    path = beatImagePath(sceneIndex, beatIndex);
  } else {
    sceneIndex = Number(stored);
    beatIndex = 0;
    path = "/api/playthroughs/" + encodeURIComponent(playthroughId) +
      "/scenes/" + sceneIndex + "/image";
  }
  if (!Number.isInteger(sceneIndex) || !Number.isInteger(beatIndex)) return;
  const scene = scenes[sceneIndex];
  if (!scene || !beatImageState(scene, beatIndex).file) return;
  try {
    const blob = await apiFetch(path, { response: "blob" });
    const url = URL.createObjectURL(blob);
    const key = beatKey(sceneIndex, beatIndex);
    const old = sceneImageSrc.get(key);
    if (old) URL.revokeObjectURL(old);
    sceneImageSrc.set(key, url);
    applySceneBackground(key, url);
    renderScenes();
  } catch {
    // Background restore is a nicety, not story state.
  }
}

/* Auto-show stored beat images (Hieu, Nov 8): a beat whose
 * image already exists server-side shows inline on its own
 * - the reader who generated images, left, and came back
 * sees the book exactly as they left it, no tap needed.
 * The loading is feed-style, like scrolling a social feed:
 * the reader lands at the LAST scene, so that scene's
 * pictured beats load first, immediately; every earlier
 * scene's pictured beats load lazily as the reader scrolls
 * toward them (either direction), watched by one
 * IntersectionObserver with a generous margin so the image
 * is ready before its paragraph arrives. Nothing bulk-
 * fetches the whole book on load. Each load fetches the
 * beat's blob (the same owner-only GET the background
 * toggle uses) and reveals the beat's <img> in place - no
 * re-render, so the reading position never jumps. Beats
 * already in sceneImageSrc (generated this visit, or the
 * background restore, which runs first at load) are
 * skipped, as are beats in flight or already failed this
 * session: a failed fetch is silent, leaves the slot
 * hidden, and is not retried on later scroll passes - the
 * image icon still loads it on tap. A 401 signs out, like
 * the other loaders here. Called explicitly after the
 * initial load and after a completed turn, never from
 * renderScenes, so re-renders stay free of network work;
 * without IntersectionObserver (very old browser) every
 * pictured beat loads immediately instead. */
const beatImageLoading = new Set();
const beatImageFailed = new Set();
const beatImageObserved = new Map(); // key -> wrap element
const beatImageTargets = new Map(); // wrap element -> { key, load }
let beatImageObserver = null;

function beatImageObserverInstance() {
  if (beatImageObserver) return beatImageObserver;
  beatImageObserver = new IntersectionObserver(onBeatImagesNear, {
    rootMargin: "700px 0px",
  });
  return beatImageObserver;
}

function onBeatImagesNear(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const info = beatImageTargets.get(entry.target);
    if (!info) continue;
    beatImageObserverInstance().unobserve(entry.target);
    beatImageObserved.delete(info.key);
    beatImageTargets.delete(entry.target);
    info.load();
  }
}

/* Fetch one beat's stored image and reveal it inline.
 * Fire-and-forget: every outcome is handled inside, so
 * callers never await it and reading is never blocked. */
async function loadBeatImage(sceneIndex, beatIndex, key, ptId) {
  if (beatImageLoading.has(key) || sceneImageSrc.has(key)) return;
  beatImageLoading.add(key);
  try {
    const blob = await apiFetch(
      beatImagePath(sceneIndex, beatIndex),
      { response: "blob" },
    );
    // A reset swapped the playthrough mid-flight: these
    // bytes belong to the old run, drop them.
    if (playthroughId !== ptId) return;
    const url = URL.createObjectURL(blob);
    if (sceneImageSrc.has(key)) {
      // Generated or restored while this fetch was in
      // flight: that fresher copy wins, drop ours.
      URL.revokeObjectURL(url);
      return;
    }
    sceneImageSrc.set(key, url);
    const img = document.querySelector(
      '[data-testid="scene-image-' + key + '"]',
    );
    if (img) {
      img.src = url;
      img.hidden = false;
    }
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      showSignedOut();
      return;
    }
    // Silent: the slot stays hidden, and the beat is not
    // retried on later scroll passes this session.
    beatImageFailed.add(key);
  } finally {
    beatImageLoading.delete(key);
  }
}

/* Watch one beat's image wrap so its stored image loads
 * as the reader scrolls near it. Re-renders replace the
 * wrap element, so a stale one is swapped for the live
 * one whenever this runs again. */
function observeBeatImage(sceneIndex, beatIndex, key, ptId) {
  const wrap = document.querySelector(
    '[data-testid="scene-image-wrap-' + key + '"]',
  );
  if (!wrap) {
    loadBeatImage(sceneIndex, beatIndex, key, ptId);
    return;
  }
  if (beatImageObserved.get(key) === wrap) return;
  const observer = beatImageObserverInstance();
  const prev = beatImageObserved.get(key);
  if (prev) {
    observer.unobserve(prev);
    beatImageTargets.delete(prev);
  }
  beatImageObserved.set(key, wrap);
  beatImageTargets.set(wrap, {
    key,
    load: () => loadBeatImage(sceneIndex, beatIndex, key, ptId),
  });
  observer.observe(wrap);
}

function loadExistingBeatImages() {
  if (!playthroughId) return;
  const ptId = playthroughId;
  const lastIndex = scenes.length - 1;
  const lazy = typeof IntersectionObserver === "function";
  scenes.forEach((scene, i) => {
    splitBeats(sceneText(scene)).forEach((_, j) => {
      const key = beatKey(i, j);
      if (sceneImageSrc.has(key) || beatImageLoading.has(key) ||
          beatImageFailed.has(key)) return;
      if (!beatImageState(scene, j).file) return;
      if (i === lastIndex || !lazy) {
        // The landing scene loads first and immediately;
        // with no IntersectionObserver there is no feed,
        // so everything loads up front as a fallback.
        loadBeatImage(i, j, key, ptId);
      } else {
        observeBeatImage(i, j, key, ptId);
      }
    });
  });
}

/* Background adjust (Hieu, Nov 8): with a scene background
 * active, the reader can move the image and choose how it
 * fits the screen - Fill (cover: fills the screen, may
 * crop) or Fit (contain: the whole image visible). The
 * #bg-adjust-btn icon in the header enters adjust mode:
 * dragging on the reading area repositions the image live,
 * the bar's chips switch the fit, Done leaves. Like the
 * background choice itself, the adjustment is reader-local:
 * localStorage per playthrough + the background's source
 * scene ("writer.bgAdjust.<playthroughId>.<sceneIndex>" =
 * {x, y, fit} as background-position percentages), applied
 * by applySceneBackground whenever that scene's image is
 * the background. Clearing the background KEEPS the saved
 * adjustment - it is harmless, and it is still right if the
 * same scene's image becomes the background again.
 * Percentages follow the CSS rule: position p% offsets the
 * image by (area - rendered image) * p/100 per axis, so a
 * pointer drag of d pixels moves p by d / (area - rendered)
 * * 100 (the range is negative under Fill, positive under
 * Fit - the sign carries). The background is
 * fixed-attachment, so the positioning area is the
 * viewport. The scrim layer is never adjusted: it stays
 * "cover, center" as the first size/position value. */
const BG_ADJUST_DEFAULT = { x: 50, y: 50, fit: "cover" };
let bgAdjust = { ...BG_ADJUST_DEFAULT };
let bgAdjusting = false;
let bgDragPoint = null; // last pointer point while dragging
let bgDims = null; // natural { w, h } of the current bg image
let bgDimsUrl = null;

function bgAdjustSceneIndex() {
  if (!sceneBackground) return null;
  const n = Number(String(sceneBackground.key).split(":")[0]);
  return Number.isInteger(n) ? n : null;
}

function bgAdjustKey(sceneIndex) {
  return "writer.bgAdjust." + (playthroughId || "") + "." +
    sceneIndex;
}

function readBgAdjust(sceneIndex) {
  if (sceneIndex === null) return { ...BG_ADJUST_DEFAULT };
  try {
    const raw = localStorage.getItem(bgAdjustKey(sceneIndex));
    if (!raw) return { ...BG_ADJUST_DEFAULT };
    const parsed = JSON.parse(raw);
    const x = Math.min(100, Math.max(0, Number(parsed.x)));
    const y = Math.min(100, Math.max(0, Number(parsed.y)));
    return {
      x: Number.isFinite(x) ? x : BG_ADJUST_DEFAULT.x,
      y: Number.isFinite(y) ? y : BG_ADJUST_DEFAULT.y,
      fit: parsed.fit === "contain" ? "contain" : "cover",
    };
  } catch {
    return { ...BG_ADJUST_DEFAULT };
  }
}

function saveBgAdjust() {
  const sceneIndex = bgAdjustSceneIndex();
  if (sceneIndex === null) return;
  try {
    localStorage.setItem(bgAdjustKey(sceneIndex),
      JSON.stringify(bgAdjust));
  } catch {
    // Private mode: the adjustment lasts the visit, like an
    // unremembered background.
  }
}

function applyBgAdjust() {
  const page = document.querySelector(".page-play");
  if (!page || !sceneBackground) return;
  const pct = (v) => String(Math.round(v * 10) / 10);
  page.style.backgroundSize =
    "cover, " + (bgAdjust.fit === "contain" ? "contain" : "cover");
  page.style.backgroundPosition =
    "center, " + pct(bgAdjust.x) + "% " + pct(bgAdjust.y) + "%";
}

/* The drag math needs the image's natural size; probe it
 * off the same object URL the background uses (the bytes
 * are already local, so this resolves immediately). Until
 * it lands, drags are inert rather than wrong. */
function ensureBgDims(url) {
  if (bgDimsUrl === url) return;
  bgDims = null;
  bgDimsUrl = url;
  try {
    const probe = new Image();
    probe.onload = () => {
      if (bgDimsUrl === url && probe.naturalWidth) {
        bgDims = { w: probe.naturalWidth, h: probe.naturalHeight };
      }
    };
    probe.src = url;
  } catch {
    // No Image constructor available: adjust still offers
    // the fit choice; drags simply never engage.
  }
}

function bgDragBy(dx, dy) {
  if (!bgDims) return;
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  if (!vw || !vh) return;
  const scale = bgAdjust.fit === "contain"
    ? Math.min(vw / bgDims.w, vh / bgDims.h)
    : Math.max(vw / bgDims.w, vh / bgDims.h);
  const rangeX = vw - bgDims.w * scale;
  const rangeY = vh - bgDims.h * scale;
  if (rangeX) {
    bgAdjust.x = Math.min(100, Math.max(0,
      bgAdjust.x + (dx / rangeX) * 100));
  }
  if (rangeY) {
    bgAdjust.y = Math.min(100, Math.max(0,
      bgAdjust.y + (dy / rangeY) * 100));
  }
  applyBgAdjust();
}

function clearSceneImages() {
  for (const url of sceneImageSrc.values()) {
    URL.revokeObjectURL(url);
  }
  sceneImageSrc.clear();
  // The auto-show loader starts over for the fresh run:
  // no stale wraps watched, no beat marked failed.
  if (beatImageObserver) beatImageObserver.disconnect();
  beatImageObserved.clear();
  beatImageTargets.clear();
  beatImageFailed.clear();
  beatImageLoading.clear();
}

/* Generation orientation (Hieu, Nov 8): tapping Generate
 * on a paragraph first opens the shape chooser in the
 * composer (play.html) - landscape or portrait, so a
 * portrait image can fit a phone screen edge-to-edge as a
 * background. One tap on a shape generates in that shape.
 * The choice is remembered (writer.imageOrientation) and
 * preselected next time; on a fresh profile a phone-width
 * viewport preselects portrait, a wide one landscape. The
 * backend maps the value to the bridge's width/height
 * (1216x704 / 704x1216); the stored image's real dimensions
 * govern how it displays. */
const ORIENTATION_KEY = "writer.imageOrientation";
let pendingGeneration = null; // { sceneIndex, beatIndex, btn, img }

function defaultOrientation() {
  try {
    const saved = localStorage.getItem(ORIENTATION_KEY);
    if (saved === "landscape" || saved === "portrait") {
      return saved;
    }
  } catch {
    // Storage unavailable: the viewport rule still applies.
  }
  return (window.innerWidth || 1024) <= 640
    ? "portrait" : "landscape";
}

function openOrientationChooser(sceneIndex, beatIndex, btn, img) {
  if (busy || !playthroughId) return;
  pendingGeneration = { sceneIndex, beatIndex, btn, img };
  syncOrientationChips();
  el("orientation-chooser").hidden = false;
}

function closeOrientationChooser() {
  pendingGeneration = null;
  el("orientation-chooser").hidden = true;
}

function syncOrientationChips() {
  const current = defaultOrientation();
  for (const [id, value] of [
    ["orientation-landscape", "landscape"],
    ["orientation-portrait", "portrait"],
  ]) {
    const chip = el(id);
    chip.classList.toggle("is-on", current === value);
    chip.setAttribute("aria-pressed",
      current === value ? "true" : "false");
  }
}

function chooseOrientation(choice) {
  if (!pendingGeneration) return;
  const pending = pendingGeneration;
  try {
    localStorage.setItem(ORIENTATION_KEY, choice);
  } catch {
    // Unremembered is fine: the generation still honors
    // this tap's shape.
  }
  closeOrientationChooser();
  generateBeatImage(pending.sceneIndex, pending.beatIndex,
    pending.btn, pending.img, choice);
}

/* Poll GET /image (blob) until the beat image exists, or the wait
 * runs out. The backend generates async (Hieu Nov 8): POST /image
 * returns 202 at once and the file lands ~2 min later, so a single
 * long request from a phone drops. A 404 means "not ready yet";
 * any other error is thrown. */
async function waitForBeatImage(base, timeoutMs = 300000, stepMs = 5000) {
  const started = Date.now();
  for (;;) {
    try {
      return await apiFetch(base + "/image", { response: "blob" });
    } catch (err) {
      if (err.status !== 404) throw err;
      if (Date.now() - started > timeoutMs) {
        throw new Error("Image generation timed out. Please try again.");
      }
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
  }
}

async function generateBeatImage(sceneIndex, beatIndex, btn, img,
    orientation) {
  if (busy || !playthroughId) return;
  const scene = scenes[sceneIndex];
  if (!scene) return;
  const key = beatKey(sceneIndex, beatIndex);
  const shown = sceneImageSrc.has(key);
  btn.disabled = true;
  btn.classList.add("is-generating");
  btn.title = "Generating image…";
  btn.setAttribute("aria-label", "Generating image…");
  const base = "/api/playthroughs/" + encodeURIComponent(playthroughId) +
    "/scenes/" + sceneIndex + "/beats/" + beatIndex;
  try {
    const state = beatImageState(scene, beatIndex);
    if (!state.file || shown) {
      // Generation (a shown image re-generates from the same
      // prompt; a first generate writes the prompt first
      // unless the backend already stored one for the beat).
      if (!state.prompt) {
        btn.title = "Writing image prompt…";
        btn.setAttribute("aria-label", "Writing image prompt…");
        const promptRes = await apiFetch(base + "/image-prompt",
          { method: "POST" });
        scene.beat_images = scene.beat_images || {};
        scene.beat_images[String(beatIndex)] =
          scene.beat_images[String(beatIndex)] || {};
        scene.beat_images[String(beatIndex)].image_prompt =
          promptRes.image_prompt;
      }
      btn.title = "Generating image…";
      btn.setAttribute("aria-label", "Generating image…");
      try {
        const genRes = await apiFetch(base + "/image", {
          method: "POST",
          body: { orientation: orientation || defaultOrientation() },
        });
        if (genRes.image_file) {
          scene.beat_images = scene.beat_images || {};
          scene.beat_images[String(beatIndex)] =
            scene.beat_images[String(beatIndex)] || {};
          scene.beat_images[String(beatIndex)].image_file =
            genRes.image_file;
        }
        // 202 (generating) carries no file yet; the poll below
        // waits for it to land.
      } catch (err) {
        // The POST dropped (phone network). The server may have
        // started the job before the connection fell, so fall
        // through to polling for the finished file instead of
        // failing at once. A real error (not a network drop)
        // still throws here.
        if (err.status !== 0) throw err;
      }
    }
    btn.title = "Loading image…";
    btn.setAttribute("aria-label", "Loading image…");
    const blob = await waitForBeatImage(base);
    const url = URL.createObjectURL(blob);
    const old = sceneImageSrc.get(key);
    if (old) URL.revokeObjectURL(old);
    sceneImageSrc.set(key, url);
    img.src = url;
    img.hidden = false;
    // A regenerate replaces the object URL: a background
    // pointing at the revoked one would go blank, so it
    // follows the new URL. The icon then re-syncs to the
    // beat's new state (it now offers Use as background, or
    // Clear if it is the background) - renderScenes is not
    // re-run here.
    if (sceneBackground && sceneBackground.key === key) {
      applySceneBackground(key, url);
    }
    syncImageButton(btn, scene, beatIndex);
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      showSignedOut();
      return;
    }
    // 503 is the backend's "not configured" (no bridge URL);
    // 502 is the bridge/ComfyUI failing, which includes the
    // story PC being off. Both need their own sentence, not
    // the generic busy message.
    if (err.status === 503) {
      showPlayError("Scene images aren't set up on this server yet.");
    } else if (err.status === 502) {
      showPlayError("Couldn't reach the image generator - the " +
        "story PC may be off. Try again later.");
    } else {
      showPlayError(friendlyError(err));
    }
    syncImageButton(btn, scene, beatIndex);
  } finally {
    btn.classList.remove("is-generating");
    btn.disabled = false;
  }
}

function renderScenes() {
  const prose = el("prose");
  prose.innerHTML = "";
  scenes.forEach((scene, i) => {
    const action = scene && scene.action ? String(scene.action) : "";
    if (action) {
      const key = scene.turn ?? i;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "turn-input-marker";
      marker.dataset.testid = "input-marker-" + key;
      const expanded = expandedInputs.has(key);
      marker.setAttribute("aria-expanded", String(expanded));
      marker.setAttribute("aria-label",
        "Your input for this scene: " + action);
      marker.textContent = "\u270e";
      const input = document.createElement("div");
      input.className = "turn-input";
      input.dataset.testid = "input-text-" + key;
      input.hidden = !expanded;
      input.textContent = action;
      marker.addEventListener("click", () => {
        const open = input.hidden;
        input.hidden = !open;
        marker.setAttribute("aria-expanded", String(open));
        if (open) expandedInputs.add(key);
        else expandedInputs.delete(key);
      });
      prose.append(marker, input);
    }
    // Beat rendering (Hieu, Oct 29): a scene is its
    // paragraphs, and each paragraph carries its own
    // controls at its start - one image per beat, never one
    // image at the end of the whole scene. The diary jump
    // target (F3 T3) stays on the first paragraph: the
    // opening premise is turn 0.
    splitBeats(sceneText(scene)).forEach((beatText, j) => {
      const key = beatKey(i, j);
      const p = document.createElement("p");
      if (j === 0 && typeof scene !== "string" &&
          Number.isInteger(scene && scene.turn)) {
        p.id = "scene-" + scene.turn;
      }
      p.textContent = beatText;
      prose.append(p);
      // Beat image (see the block above renderScenes):
      // the icon follows the beat's backend state, and the
      // image renders inline under its paragraph once
      // loaded. The icon itself opens the paragraph (below).
      const wrap = document.createElement("div");
      wrap.className = "scene-image-wrap";
      wrap.dataset.testid = "scene-image-wrap-" + key;
      const img = document.createElement("img");
      img.className = "scene-image";
      img.dataset.testid = "scene-image-" + key;
      img.alt = "Illustration for this paragraph";
      const shownUrl = sceneImageSrc.get(key);
      if (shownUrl) {
        img.src = shownUrl;
        img.hidden = false;
      } else {
        img.hidden = true;
      }
      // One image icon (Hieu, Nov 5), state-aware like the
      // speaker beside it: no image yet -> tap opens the
      // shape chooser and generates in the picked shape
      // (Hieu, Nov 8); image exists -> tap sets it as the
      // page background (the toggle shows it inline too);
      // the current background's icon is filled and taps
      // back to plain.
      const imgBtn = document.createElement("button");
      imgBtn.type = "button";
      imgBtn.className = "scene-image-btn";
      imgBtn.dataset.testid = "scene-image-btn-" + key;
      syncImageButton(imgBtn, scene, j);
      imgBtn.disabled = busy;
      imgBtn.addEventListener("click", () => {
        if (!beatImageState(scene, j).file) {
          openOrientationChooser(i, j, imgBtn, img);
        } else {
          toggleSceneBackground(i, j);
        }
      });
      // Speaker button (stream-audio v1, T3): one small
      // control per paragraph, inline at its start beside
      // the image icon - it plays this paragraph's cached
      // audio (background pre-generation, design section
      // 6). Auto-speak off: only this paragraph, then it
      // stops. Auto-speak on: keeps going from here
      // through the end of the book. Tapping another
      // speaker stops the current one at once and plays
      // the new one once ready; tap again stops it. Its
      // state (idle / generating / ready / playing /
      // unavailable) is refreshed in place by the player.
      const audioBtn = document.createElement("button");
      audioBtn.type = "button";
      audioBtn.className = "scene-audio-btn";
      audioBtn.dataset.testid = "scene-audio-btn-" + key;
      syncAudioButton(audioBtn, i, beatText);
      audioBtn.addEventListener("click",
        () => onAudioButton(i, j, beatText));
      wrap.append(img);
      // Beat icons inline (Hieu, Nov 5): the speaker and
      // image icons open the paragraph itself, floated at
      // its start (see .beat-icons in play.css), instead of
      // sitting on a controls line of their own - the prose
      // starts right after them on the first line and wraps
      // full-width below.
      const icons = document.createElement("span");
      icons.className = "beat-icons";
      icons.append(audioBtn, imgBtn);
      p.prepend(icons);
      prose.append(wrap);
    });
  });
}

function renderBible(stateBible) {
  const mc = (book && book.main_character) || {};
  const cast = ((book && book.supporting_cast) || [])
    .map((m) => m.name).join(", ");
  const traits = ((mc.sheet || {}).traits || []).join(", ");
  const rows = [
    ["World", (book && book.world) || ""],
    ["Main character", (mc.name || "") + (traits ? " - " + traits : "")],
    ["Cast", cast],
    ["Style", ((book && book.style && book.style.genre) || "") +
      " / " + ((book && book.language) || "")],
  ];
  if (stateBible) {
    if (stateBible.facts && stateBible.facts.length) {
      rows.push(["Story facts", stateBible.facts.join(" ")]);
    }
    if (stateBible.objects && stateBible.objects.length) {
      rows.push(["Objects", stateBible.objects.join(", ")]);
    }
  }
  const box = el("bible-summary");
  box.innerHTML = "";
  const dl = document.createElement("dl");
  dl.className = "bible-list";
  for (const [label, value] of rows) {
    if (!value) continue;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  box.append(dl);
}

/* Diary jump (F3 T3): tapping a diary entry is read-only
 * navigation - it closes the diary panel, scrolls to that
 * entry's scene, and briefly highlights it. It changes no
 * story state; rewind is the separate f3-t4 item. An entry
 * with no matching rendered scene leaves everything as-is. */
function jumpToScene(turn) {
  const scene = document.getElementById("scene-" + turn);
  if (!scene) return;
  el("diary-panel").hidden = true;
  scene.scrollIntoView({ block: "start", behavior: "smooth" });
  scene.classList.add("scene-jump-highlight");
  setTimeout(() => scene.classList.remove("scene-jump-highlight"), 2000);
}

function renderDiary(entries) {
  const list = el("diary-list");
  list.innerHTML = "";
  const items = (entries || []).filter((entry) => diaryText(entry));
  el("diary-empty").hidden = items.length > 0;
  for (const entry of items) {
    const li = document.createElement("li");
    const turn = typeof entry === "object" && entry !== null
      ? entry.turn
      : null;
    if (Number.isInteger(turn)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "diary-entry";
      btn.setAttribute("data-testid", "diary-entry-" + turn);
      btn.textContent = diaryText(entry);
      btn.addEventListener("click", () => jumpToScene(turn));
      li.append(btn);
    } else {
      // Legacy string entry (no turn): plain text, as before.
      li.textContent = diaryText(entry);
    }
    list.append(li);
  }
}

/* Suggestion cards (F3 suggest): generated cards carry a
 * server id and PLAY the turn when tapped (design-v2);
 * starter cards (before the first turn, no id) keep the old
 * behaviour of staging their text into the input. */
function renderSuggestions(list) {
  (list || []).slice(0, 3).forEach((s, i) => {
    const card = document.querySelector(
      '[data-testid="suggestion-' + (i + 1) + '"]',
    );
    if (!card) return;
    card.textContent = s.text;
    card.dataset.suggestionId = s.id;
    card.setAttribute(
      "aria-label",
      "Suggestion: " + s.text + (s.hint ? " - " + s.hint : ""),
    );
  });
}

function renderStarterCards() {
  const actions = STARTER_ACTIONS[BOOK_ID] || DEFAULT_ACTIONS;
  actions.forEach((text, i) => {
    const card = document.querySelector(
      '[data-testid="suggestion-' + (i + 1) + '"]',
    );
    if (!card) return;
    card.textContent = text;
    delete card.dataset.suggestionId;
    card.setAttribute("aria-label", "Suggestion: " + text);
  });
}

function openSuggestPanel() {
  el("suggest-panel").hidden = false;
  el("suggest-toggle").setAttribute("aria-expanded", "true");
}

async function refreshDiary() {
  if (!playthroughId) return null;
  try {
    const state = await apiFetch(
      "/api/playthroughs/" + encodeURIComponent(playthroughId),
    );
    renderDiary(state.diary);
    return state;
  } catch {
    return null;
  }
}

function showSignedOut() {
  el("play-status").hidden = true;
  el("play-layout").hidden = true;
  el("play-out").hidden = false;
}

function setBusy(b) {
  busy = b;
  el("continue-btn").disabled = b;
  el("action-input").disabled = b;
  el("suggest-toggle").disabled = b;
  el("reset-btn").disabled = b;
  el("settings-tile-restart").disabled = b;
  el("send-btn").disabled = b;
  refreshRetryButton();
  document
    .querySelectorAll(".suggestion-card")
    .forEach((card) => { card.disabled = b; });
  // The one image icon per beat is busy-gated like the
  // other controls; its generate/background routing reads
  // live beat state at click time, so no per-state disable
  // bookkeeping is needed here.
  document
    .querySelectorAll(".scene-image-btn")
    .forEach((btn) => { btn.disabled = b; });
}

function showPlayNote(text) {
  const n = el("play-note");
  n.className = "play-note";
  n.removeAttribute("role");
  showNote(n, text);
}

function showPlayError(text) {
  const n = el("play-note");
  n.className = "form-error";
  n.setAttribute("role", "alert");
  showNote(n, text);
}

/* After a turn lands, bring the reader to the START of the new
 * scene (Hieu, Oct 27) - they read it from its first line, not
 * from wherever the page happened to be sitting. The first
 * paragraph of the last scene carries its diary-jump id, so
 * it is the target; with per-beat rendering the LAST
 * paragraph would be the scene's last beat, not its start. */
function scrollToLatestScene() {
  const lastScene = scenes.length ? scenes[scenes.length - 1] : null;
  const first = lastScene && Number.isInteger(lastScene.turn)
    ? document.getElementById("scene-" + lastScene.turn)
    : null;
  const paragraphs = el("prose").querySelectorAll("p");
  const target = first || (paragraphs.length
    ? paragraphs[paragraphs.length - 1]
    : el("prose").lastElementChild);
  if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
}

/* Streaming turns (todo stream-replies): every turn goes to
 * the streaming sibling endpoint
 * (POST /api/playthroughs/{id}/turns/stream) and the new
 * scene's prose appears sentence by sentence as the pipeline
 * writes it, instead of landing all at once. The endpoint
 * speaks Server-Sent Events; each event's data is JSON:
 *   stage         - progress only; ignored here
 *   segment       - one provisional sentence of the draft
 *   revision      - QC rewrote the draft: {scene} is the
 *                   full final text, replacing the draft
 *   final_segment - segments of the checked scene (the
 *                   future audio build reads these; the
 *                   display already has the text)
 *   turn_final    - {result}: the exact dict the classic
 *                   /turns endpoint returns; finalizing
 *                   from it is shared with the classic path
 *   error         - {status, detail}: the turn failed
 * The streamed draft is PROVISIONAL: it lives in a scenes
 * entry the finalize step replaces, and a turn that fails
 * after prose showed removes it again - nothing streamed
 * is ever saved state (only the checked turn is recorded,
 * server side). If the stream fails before any prose
 * shows, the turn falls back to the classic POST once, so
 * a backend without the streaming endpoint behaves as
 * before.
 *
 * Streaming is unconditional (Hieu, Nov 7): the composer
 * Stream toggle and its writer.streamReplies key are gone -
 * every turn streams. (fetchStreamedTurn still falls back
 * to the classic POST once if the stream cannot start, so a
 * backend without the streaming endpoint behaves as
 * before.) */

/* The friendly wording for a streamed turn's error event:
 * the same sentences apiFetch produces for the same status
 * on the classic path, so a failed turn reads identically
 * however it was submitted. The event's detail string is
 * deliberately not shown (the classic path never shows the
 * server's detail either). */
function streamEventError(status) {
  if (status === 401) return new ApiError("unauthorized", 401);
  if (status === 404) {
    return new ApiError(
      "We couldn't find that. It may have been moved or removed.",
      404,
    );
  }
  if (status === 502 || status === 503) {
    return new ApiError(
      "The story engine is busy right now. Please try again in a moment.",
      status,
    );
  }
  return new ApiError(
    "Something went wrong. Please try again.",
    status || 0,
  );
}

async function fetchStreamedTurn(body, actionText) {
  const base = "/api/playthroughs/" + encodeURIComponent(playthroughId);
  const classicTurn = () =>
    apiFetch(base + "/turns", { method: "POST", body });

  let provisional = null;
  let provisionalParas = null;
  let displayed = false;

  /* The provisional scene is a normal scenes entry (the
   * reader's input marker, its paragraphs) whose text
   * grows; the finalize step replaces it with the checked
   * scene, and dropProvisional removes it when a turn
   * fails after prose already showed. */
  function createProvisional() {
    provisional = { action: actionText || "", text: "" };
    scenes.push(provisional);
    displayed = true;
    renderScenes();
    provisionalParas = captureProvisionalParas();
    scrollToLatestScene();
    showNote(el("play-note"), "");
  }

  /* The provisional scene's paragraph elements, captured
   * right after a render (when the DOM is known to match
   * the scenes state), so segment growth can update text
   * in place instead of rebuilding the whole prose. */
  function captureProvisionalParas() {
    const count = splitBeats(provisional.text).length;
    const found = [];
    const kids = el("prose").children;
    for (let k = kids.length - 1; k >= 0 && found.length < count; k--) {
      if (kids[k].tagName === "P") found.unshift(kids[k]);
    }
    return found.length === count ? found : null;
  }

  /* Grow the provisional text in place while the beat
   * layout is unchanged; a segment that opens a new
   * paragraph re-renders through the normal path. */
  function syncProvisional() {
    const beats = splitBeats(provisional.text);
    if (!provisionalParas || provisionalParas.length !== beats.length) {
      renderScenes();
      provisionalParas = captureProvisionalParas();
      return;
    }
    beats.forEach((beat, j) => {
      provisionalParas[j].textContent = beat;
    });
  }

  function appendSegment(text) {
    const t = String(text || "");
    if (!t) return;
    if (!provisional) createProvisional();
    // Segments are sentences: join with a space unless the
    // text already carries the separation.
    if (provisional.text && !/\s$/.test(provisional.text) &&
        !/^\s/.test(t)) {
      provisional.text += " ";
    }
    provisional.text += t;
    syncProvisional();
  }

  function applyRevision(scene) {
    if (!provisional) createProvisional();
    provisional.text = sceneText(scene);
    renderScenes();
    provisionalParas = captureProvisionalParas();
  }

  function dropProvisional() {
    if (!provisional) return;
    const i = scenes.indexOf(provisional);
    if (i >= 0) scenes.splice(i, 1);
    provisional = null;
    provisionalParas = null;
    renderScenes();
  }

  let res;
  try {
    const headers = { "Content-Type": "application/json" };
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = "Bearer " + token;
    res = await fetch(API_BASE + base + "/turns/stream", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    // The stream could not even start: nothing was shown,
    // so the classic POST is the whole turn.
    return classicTurn();
  }
  if (res.status === 401) throw new ApiError("unauthorized", 401);
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || !res.body || !contentType.includes("text/event-stream")) {
    // An older backend (or a proxy) answered without SSE:
    // fall back before anything was displayed.
    return classicTurn();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;
  let errorStatus = null;

  function handleFrame(frame) {
    let event = "message";
    const dataLines = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (!dataLines.length) return;
    let data;
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }
    if (event === "segment") appendSegment(data.text);
    else if (event === "revision") applyRevision(data.scene);
    else if (event === "error") errorStatus = data.status || 0;
    else if (event === "turn_final") finalResult = data.result || null;
    // stage and final_segment need no display work: the
    // segments/revision already carry the visible text.
  }

  try {
    let streamDone = false;
    while (!streamDone) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true })
        .replace(/\r\n/g, "\n");
      let cut = buffer.indexOf("\n\n");
      while (cut >= 0) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        handleFrame(frame);
        if (finalResult || errorStatus !== null) {
          streamDone = true;
          break;
        }
        cut = buffer.indexOf("\n\n");
      }
    }
    // A last frame the server closed without a trailing
    // blank line still counts.
    if (!streamDone && buffer.trim()) handleFrame(buffer);
  } catch {
    // The connection dropped mid-stream.
    if (!displayed) return classicTurn();
    dropProvisional();
    throw new ApiError(
      "The story engine stopped mid-scene. Please try again in a moment.",
      0,
    );
  } finally {
    try {
      reader.cancel();
    } catch {
      // Already closed.
    }
  }

  if (finalResult) {
    // Replace the provisional entry: applyTurnResult
    // pushes the checked scene it carries, in the same
    // position at the end of the book.
    const i = scenes.indexOf(provisional);
    if (i >= 0) scenes.splice(i, 1);
    return finalResult;
  }
  if (errorStatus !== null) {
    if (!displayed) return classicTurn();
    dropProvisional();
    throw streamEventError(errorStatus);
  }
  // The stream ended with neither a result nor an error.
  if (!displayed) return classicTurn();
  dropProvisional();
  throw new ApiError(
    "The story engine stopped mid-scene. Please try again in a moment.",
    0,
  );
}

/* One turn, however it was played: a typed action, a tapped
 * suggestion ({suggestion_id}), or Continue ({continue: true}).
 * On success the response's suggestions (when the backend
 * generated a set) replace the cards and the panel opens -
 * that is the moment the reader looks for them (Hieu, Oct 27).
 * When generation failed open (empty set), the current cards
 * and panel state are left exactly as they were. Every turn
 * goes through fetchStreamedTurn; it lands in
 * applyTurnResult and surfaces failures through
 * handleTurnError, so a streamed turn ends exactly like a
 * classic one. */
async function runTurnBody(body, actionText) {
  if (busy || !playthroughId) return;
  // A new turn cancels the auto-read queue for the scene it
  // replaces; a paragraph the reader started manually keeps
  // playing (cancelQueue only stops queue playback).
  audioPlayer.cancelQueue();
  setBusy(true);
  showLoading(el("play-note"), "Writing the next scene...");
  try {
    const result = await fetchStreamedTurn(body, actionText);
    await applyTurnResult(result, actionText, body);
  } catch (err) {
    handleTurnError(err, body);
  } finally {
    setBusy(false);
  }
}

/* The classic landing for a finished turn, shared with the
 * streaming path: the new scene joins the book, the reader
 * lands at its first line, the input clears, and the
 * turn's suggestions (when a full set came back) replace
 * the cards and open the panel. A retry body ({retry_turn})
 * rewinds first: the server already dropped the old tail,
 * so the local scenes at or after the retried turn go too,
 * and the new scene lands in their place instead of
 * appending after a scene that no longer exists. */
async function applyTurnResult(result, actionText, body) {
  const scene = result.scene || result.text || "";
  if (scene) {
    if (body && Number.isInteger(body.retry_turn)) {
      scenes = scenes.filter(
        (s) => !Number.isInteger(s.turn) || s.turn < result.turn,
      );
    }
    scenes.push({
      turn: result.turn,
      action: actionText || sceneActionText(result),
      text: scene,
    });
  }
  renderScenes();
  refreshRetryButton();
  // A re-rendered book can hold stored images this visit
  // has not loaded yet (e.g. a retry rewound to scenes
  // pictured in an earlier session): fill them in.
  loadExistingBeatImages();
  if (scene) {
    scrollToLatestScene();
    // The scene's text is complete: pre-generate its audio
    // in the background, and auto-read it when the flag is
    // on (onSceneCompleted handles both).
    onSceneCompleted(scenes.length - 1);
  }
  el("action-input").value = "";
  growInput();
  if (result.continued_with) {
    showPlayNote(
      'Continuing with: "' + result.continued_with.text + '" - ' +
        result.continued_with.hint,
    );
  } else {
    showNote(el("play-note"), "");
  }
  if (result.suggestions && result.suggestions.length === 3) {
    currentSuggestions = result.suggestions;
    renderSuggestions(currentSuggestions);
    openSuggestPanel();
  }
  const state = await refreshDiary();
  if (state && state.bible) renderBible(state.bible);
}

/* A failed turn, classic or streamed: the session is gone
 * (401), a stale suggestion/Continue pick expired (422 -
 * the scene and the current cards stay, just say so), or
 * a plain failure note. */
function handleTurnError(err, body) {
  if (err.status === 401) {
    clearToken();
    showSignedOut();
    return;
  }
  if (err.status === 422 && (body.suggestion_id || body.continue)) {
    // Stale pick (Milo's review condition): the scene and
    // the current cards stay; just say the pick expired.
    showPlayNote("That suggestion expired - pick another one.");
    if (currentSuggestions.length === 3) {
      renderSuggestions(currentSuggestions);
    }
    return;
  }
  showPlayError(friendlyError(err));
}

function sceneActionText(result) {
  return result.continued_with ? result.continued_with.text : "";
}

async function runTurn(action) {
  const { action: text, instruction } = splitInstruction(action);
  if (!text) {
    // An instruction alone is not a turn: there is no story
    // action for the AI to write from, so say so instead of
    // sending an empty action (or the raw asterisks).
    if (instruction) {
      showPlayNote("An instruction in *asterisks* needs a " +
        "story action with it - write what you do next too.");
    } else {
      showPlayNote("Write what you do next, or pick a suggestion.");
    }
    el("action-input").focus();
    return;
  }
  const body = { action: text };
  if (instruction) body.instruction = instruction;
  await runTurnBody(body, text);
}

/* The input starts at one row and grows with the text, up
 * to the five-line cap in play.css (Hieu, Oct 27). */
function growInput() {
  const input = el("action-input");
  input.style.height = "auto";
  input.style.height = input.scrollHeight + "px";
}
el("action-input").addEventListener("input", growInput);

/* Send button (Hieu, Nov 5): Enter makes a new line - the
 * textarea's default, so there is deliberately no keydown
 * handler - and the Send button sends the turn. This
 * reverses the Oct 27 Enter-sends rule at Hieu's direction;
 * suggestion cards and Continue still send programmatically
 * through runTurn/runTurnBody as before. */
el("send-btn").addEventListener("click", () => {
  runTurn(el("action-input").value);
});

el("suggest-toggle").addEventListener("click", () => {
  const panel = el("suggest-panel");
  panel.hidden = !panel.hidden;
  el("suggest-toggle").setAttribute(
    "aria-expanded",
    String(!panel.hidden),
  );
});

/* Scene audio controls (T3): the auto-speak flag and the
 * narrator voice live in the composer bar, on the same
 * localStorage contract the future reading-settings panel
 * binds to (writer.autoSpeak "1" = on, OFF by default;
 * writer.narratorVoice vendetti/klett). The Audio toggle is
 * a text button (Hieu, Nov 7): no checkbox - the .is-on
 * class (accent color + bold) vs the muted default carries
 * the state, mirrored by aria-pressed. The transport
 * (pause/resume, stop, mute) appears only while something
 * plays; it never changes the flag. */
const autoSpeakToggle = el("auto-speak-toggle");
if (autoSpeakToggle) {
  const syncAudioToggle = () => {
    const on = autoSpeakOn();
    autoSpeakToggle.classList.toggle("is-on", on);
    autoSpeakToggle.setAttribute("aria-pressed", String(on));
  };
  syncAudioToggle();
  autoSpeakToggle.addEventListener("click", () => {
    setAutoSpeak(!autoSpeakOn());
    syncAudioToggle();
  });
}
const voiceSelect = el("narrator-voice");
if (voiceSelect) {
  voiceSelect.value = readVoice();
  voiceSelect.addEventListener("change", () => {
    // A voice switch stops the current reading: cached
    // audio is per-voice, and the old voice must not keep
    // playing under the new selection.
    audioPlayer.stop();
    setVoice(voiceSelect.value);
    updateAudioButtons();
  });
}
const audioPauseBtn = el("audio-pause-btn");
if (audioPauseBtn) {
  audioPauseBtn.addEventListener("click", () => {
    const snap = audioPlayer.snapshot();
    if (snap.currentKey === null) return;
    if (snap.paused) audioPlayer.resume();
    else audioPlayer.pause();
  });
}
const audioStopBtn = el("audio-stop-btn");
if (audioStopBtn) {
  audioStopBtn.addEventListener("click", () => audioPlayer.stop());
}
const audioMuteBtn = el("audio-mute-btn");
if (audioMuteBtn) {
  audioMuteBtn.addEventListener("click", () => {
    audioPlayer.setMuted(!audioPlayer.muted);
  });
}
updateAudioTransport();

el("continue-btn").addEventListener("click", () => {
  const staged = el("action-input").value.trim();
  if (staged) {
    runTurn(staged);
    return;
  }
  if (currentSuggestions.length === 3) {
    // Let the backend pick its best trait-fit suggestion; the
    // response names the pick and why (continued_with).
    runTurnBody({ continue: true }, "");
    return;
  }
  const actions = STARTER_ACTIONS[BOOK_ID] || DEFAULT_ACTIONS;
  runTurn(actions[0]);
});

/* Retry (f3-t4): rewrite the last scene. Two-step, like
 * Reset: the first tap arms it and stages the last scene's
 * action in the input (editable - the reader may rewrite
 * the action before confirming); the second tap sends
 * {retry_turn, action} and the backend rewinds that scene
 * and reruns it. Only the last turn is retried from this
 * control - the backend accepts any scene, and per-scene
 * margin controls are a later step (they share this
 * surface with Milu's reading-view redesign, so this
 * control stays additive: one button + handler, no
 * restructuring of renderScenes or the composer). The
 * button is enabled only when a turn exists to retry and
 * no turn is in flight; a failed retry changes nothing,
 * because the local tail is dropped only when the new
 * scene lands in applyTurnResult. */
let retryArmed = false;
let retryTimer = null;

function lastRetryableScene() {
  if (scenes.length < 2) return null;
  const last = scenes[scenes.length - 1];
  return Number.isInteger(last.turn) && last.turn >= 1 ? last : null;
}

function refreshRetryButton() {
  const btn = el("retry-btn");
  if (!btn) return;
  const ok = !busy && lastRetryableScene() !== null;
  btn.disabled = !ok;
  btn.setAttribute("aria-disabled", String(!ok));
  if (!ok) disarmRetry();
}

function disarmRetry() {
  retryArmed = false;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const btn = el("retry-btn");
  if (!btn) return;
  btn.textContent = "Retry";
  btn.removeAttribute("aria-label");
  btn.classList.remove("confirming");
}

async function retryLastTurn() {
  if (busy || !playthroughId) return;
  const last = lastRetryableScene();
  if (!last) {
    showPlayNote("There is no scene to retry yet.");
    return;
  }
  if (!retryArmed) {
    retryArmed = true;
    const input = el("action-input");
    if (!input.value.trim()) {
      input.value = last.action || "";
      growInput();
    }
    const btn = el("retry-btn");
    btn.textContent = "Retry this scene? Tap again to confirm";
    btn.setAttribute(
      "aria-label", "Tap again to confirm retrying the last scene");
    btn.classList.add("confirming");
    showPlayNote(
      "Retrying discards the last scene and rewrites it from " +
        "your action - edit the action above first if you want " +
        "a different take, then tap Retry again to confirm.");
    retryTimer = setTimeout(disarmRetry, 5000);
    el("action-input").focus();
    return;
  }
  disarmRetry();
  const { action, instruction } = splitInstruction(
    el("action-input").value);
  const text = action || last.action || "";
  if (!text) {
    showPlayNote("Write what the scene should do, then tap " +
      "Retry again.");
    return;
  }
  const body = { retry_turn: last.turn, action: text };
  if (instruction) body.instruction = instruction;
  await runTurnBody(body, text);
}

el("retry-btn").addEventListener("click", retryLastTurn);

el("diary-btn").addEventListener("click", async () => {
  const panel = el("diary-panel");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) await refreshDiary();
});

/* Reset (Hieu's Oct 28 book test): wipes the current
 * playthrough and starts again from the beginning. Two-step
 * confirmation on the button itself: the first tap arms it
 * ("Reset story? Tap again to confirm") for 5 seconds; only
 * the second tap wipes anything, so a stray tap can never
 * destroy progress. The wipe deletes the run server-side
 * (not just locally): the resume listing surfaces the most
 * progressed run, so a local-only reset would be resurrected
 * on the next visit. After the delete, a fresh run is created
 * from the book's opening scene and rendered in place. */
let resetArmed = false;
let resetTimer = null;

function disarmReset() {
  resetArmed = false;
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  const btn = el("reset-btn");
  btn.textContent = "Reset story";
  btn.setAttribute("aria-label", "Reset the story and start over");
  btn.classList.remove("confirming");
  // The settings sheet's Restart tile shares this confirm
  // state (see onResetTap): disarming resets its label too.
  const tileLabel = el("settings-restart-label");
  tileLabel.textContent = "Restart";
  el("settings-tile-restart").classList.remove("confirming");
  el("settings-tile-restart").setAttribute(
    "aria-label", "Reset the story and start over");
}

async function resetPlaythrough() {
  if (busy || !playthroughId) return;
  const oldId = playthroughId;
  setBusy(true);
  showLoading(el("play-note"), "Starting over...");
  try {
    try {
      await apiFetch(
        "/api/playthroughs/" + encodeURIComponent(oldId),
        { method: "DELETE" },
      );
    } catch (err) {
      // Already gone (another tab reset it, or a stale id):
      // the wipe is done, just start fresh. Anything else -
      // including a signed-out 401 - aborts the reset.
      if (err.status === 401) {
        clearToken();
        showSignedOut();
        return;
      }
      if (err.status !== 404) throw err;
    }
    let state = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 2 && !state; attempt++) {
      try {
        state = await apiFetch(
          "/api/books/" + encodeURIComponent(BOOK_ID) + "/playthroughs",
          { method: "POST" },
        );
      } catch (err) {
        lastErr = err;
      }
    }
    if (!state) throw lastErr;
    playthroughId = state.id;
    sessionStorage.setItem(PLAYTHROUGH_KEY, playthroughId);
    scenes = state.scenes && state.scenes.length
      ? state.scenes
      : [{ turn: 0, text: book.opening_scene || "" }];
    clearSceneBackground();
    clearSceneImages();
    audioPlayer.reset();
    expandedInputs.clear();
    currentSuggestions = [];
    loadedSuggestions = [];
    renderScenes();
    renderDiary(state.diary);
    if (state.bible) renderBible(state.bible);
    renderStarterCards();
    el("suggest-panel").hidden = true;
    el("suggest-toggle").setAttribute("aria-expanded", "false");
    el("action-input").value = "";
    showPlayNote("Started over from the beginning.");
    el("prose").scrollIntoView({ block: "start", behavior: "smooth" });
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      showSignedOut();
      return;
    }
    // The old run is already deleted at this point, so the
    // page must not keep pointing at it: clear the stored id
    // so the next visit starts fresh instead of 404ing.
    playthroughId = "";
    sessionStorage.removeItem(PLAYTHROUGH_KEY);
    scenes = [{ turn: 0, text: (book && book.opening_scene) || "" }];
    clearSceneBackground();
    clearSceneImages();
    audioPlayer.reset();
    renderScenes();
    showPlayError(friendlyError(err));
  } finally {
    setBusy(false);
    disarmReset();
  }
}

/* One reset tap handler, two entry points: the header
 * menu's Reset story item and the settings sheet's Restart
 * tile share the SAME armed state and the same reset flow -
 * arming on either surface shows the confirm on both, and
 * the second tap on either runs resetPlaythrough. The
 * origin only decides which surface closes when the reset
 * actually runs (and where the "nothing to reset" note
 * leaves the reader): the arming tap keeps its surface
 * open so the confirm stays visible as the second tap's
 * target, exactly as the menu item always behaved. */
function onResetTap(origin) {
  if (busy) return;
  if (!playthroughId) {
    showPlayNote("No story in progress to reset.");
    if (origin === "sheet") closeSettingsSheet();
    else closePlayMenu();
    return;
  }
  if (!resetArmed) {
    resetArmed = true;
    const btn = el("reset-btn");
    btn.textContent = "Reset story? Tap again to confirm";
    btn.setAttribute(
      "aria-label", "Tap again to confirm resetting the story");
    btn.classList.add("confirming");
    const tileLabel = el("settings-restart-label");
    tileLabel.textContent = "Tap again to confirm";
    el("settings-tile-restart").classList.add("confirming");
    el("settings-tile-restart").setAttribute(
      "aria-label", "Tap again to confirm resetting the story");
    resetTimer = setTimeout(disarmReset, 5000);
    return;
  }
  if (origin === "sheet") closeSettingsSheet();
  else closePlayMenu();
  resetPlaythrough();
}

el("reset-btn").addEventListener("click", () => onResetTap("menu"));

/* Play header menu (Hieu, Nov 7): the Diary / Reset story /
 * Theme / Log out items in the dropdown behind #play-menu-btn.
 * Diary and Reset keep their ids, so the handlers above (diary
 * toggle, two-step reset confirm, setBusy's reset disable) work
 * unchanged; Theme and Log out call the same helpers the shared
 * topbar used (theme.js toggleTheme - its label names the theme
 * it switches to, exactly like the old topbar button - and
 * app-auth logout). init() removes the topbar's own Theme /
 * Log out buttons on this page only; renderTopbar itself is
 * shared and untouched, so home/book/create keep theirs.
 * Close rule: choosing an item closes the menu, except Reset's
 * first (arming) tap, which keeps the menu open so the confirm
 * text on the item itself stays visible as the second tap's
 * target - the two-step confirm works exactly as it did when
 * Reset was a standalone button. The menu also closes on an
 * outside tap and on Escape. */
const playMenuEl = el("play-menu");
const playMenuBtn = el("play-menu-btn");
const playMenuWrap = el("play-menu-wrap");
function setPlayMenu(open) {
  playMenuEl.hidden = !open;
  playMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}
function closePlayMenu() {
  setPlayMenu(false);
}
playMenuBtn.addEventListener("click", () => {
  setPlayMenu(playMenuEl.hidden);
});
document.addEventListener("click", (event) => {
  if (!playMenuEl.hidden && !playMenuWrap.contains(event.target)) {
    closePlayMenu();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePlayMenu();
});
el("diary-btn").addEventListener("click", closePlayMenu);
function syncPlayMenuTheme() {
  el("play-menu-theme").textContent =
    getTheme() === "dark" ? "Light" : "Dark";
}
el("play-menu-theme").addEventListener("click", () => {
  toggleTheme();
  syncPlayMenuTheme();
  closePlayMenu();
});
syncPlayMenuTheme();
el("play-menu-logout").addEventListener("click", () => {
  closePlayMenu();
  logout();
});

/* Story settings sheet + photo gallery (Hieu, Nov 8): the
 * circular #settings-btn at the end of the composer bar opens
 * a bottom sheet after the reference app's Chat Setting sheet
 * (dark translucent panel, centered title, X close, tile
 * grid). It is an ADDITIONAL entry point - the header menu
 * above keeps working unchanged. Tiles, v1 (every tile
 * works):
 *  - Images: a collage of the book's photos; opens the
 *    gallery (below).
 *  - Bible: opens the bible panel (below) holding the story
 *    bible summary that used to sit under the prose.
 *  - Diary: the same diary toggle #diary-btn drives, and
 *    the sheet closes (the panel lives behind it).
 *  - Theme: the same toggleTheme the header item calls; its
 *    bubble names the TARGET theme, synced with the header
 *    item's label by syncSettingsTheme. The sheet stays open
 *    so the flip is visible around it.
 *  - Restart: onResetTap("sheet") - the shared two-tap
 *    confirm, never a one-tap wipe.
 * The gallery collects every photo of the current
 * playthrough in story order (scene-level image, then each
 * beat image, per scene), reusing the exact image machinery
 * the paragraphs use: sceneImageSrc object URLs and the
 * beat GET route via beatImagePath/toggleSceneBackground.
 * No new endpoint, no new background state: the full view's
 * background button calls toggleSceneBackground, the same
 * function the per-paragraph icon drives, so the filled
 * icon, the localStorage choice and the adjust controls all
 * stay in sync. */
const settingsBtn = el("settings-btn");
const settingsSheet = el("settings-sheet");
const settingsBackdrop = el("settings-backdrop");
const settingsTiles = el("settings-tiles");
const galleryPanel = el("gallery-panel");
const biblePanel = el("bible-panel");
let galleryPhoto = null; // { sceneIndex, beatIndex, caption }

function showSettingsTiles() {
  galleryPanel.hidden = true;
  biblePanel.hidden = true;
  galleryPhoto = null;
  settingsTiles.hidden = false;
  el("settings-title").textContent = "Story settings";
}
function setSettingsSheet(open) {
  settingsSheet.hidden = !open;
  settingsBackdrop.hidden = !open;
  settingsBtn.setAttribute(
    "aria-expanded", open ? "true" : "false");
  if (open) {
    showSettingsTiles();
    syncSettingsTheme();
    refreshSettingsCollage();
  }
}
function closeSettingsSheet() {
  setSettingsSheet(false);
}
settingsBtn.addEventListener("click", () => {
  setSettingsSheet(settingsSheet.hidden);
});
el("settings-close").addEventListener("click", closeSettingsSheet);
settingsBackdrop.addEventListener("click", closeSettingsSheet);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSettingsSheet();
});

function syncSettingsTheme() {
  el("settings-theme-target").textContent =
    getTheme() === "dark" ? "Light" : "Dark";
}
el("settings-tile-theme").addEventListener("click", () => {
  toggleTheme();
  syncPlayMenuTheme();
  syncSettingsTheme();
});
syncSettingsTheme();

el("settings-tile-diary").addEventListener("click", () => {
  closeSettingsSheet();
  // The diary button's own listeners do the toggle + diary
  // refresh (and close the header menu, which is shut here);
  // a programmatic click keeps ONE diary code path.
  el("diary-btn").click();
});

el("settings-tile-restart").addEventListener("click",
  () => onResetTap("sheet"));

/* Every photo in the playthrough, in story order. A scene's
 * legacy per-scene image IS its beat-0 image (beatImageState
 * folds them together and the beat GET serves it), so the
 * scene-level entry is collected as beat 0 captioned
 * "Scene N"; beat entries follow in beat order captioned
 * "Scene N · Paragraph M", skipping a beat-0 entry that is
 * the same file as the scene-level one (never show one
 * photo twice). */
function collectGalleryPhotos() {
  const photos = [];
  scenes.forEach((scene, si) => {
    if (scene && scene.image_file) {
      photos.push({ sceneIndex: si, beatIndex: 0,
        caption: "Scene " + (si + 1) });
    }
    const entries = (scene && scene.beat_images) || {};
    const beatIndexes = Object.keys(entries)
      .map((k) => Number(k))
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
    for (const bi of beatIndexes) {
      const file = entries[String(bi)] &&
        entries[String(bi)].image_file;
      if (!file) continue;
      if (bi === 0 && scene.image_file && file === scene.image_file) {
        continue;
      }
      photos.push({ sceneIndex: si, beatIndex: bi,
        caption: "Scene " + (si + 1) + " · Paragraph " + (bi + 1) });
    }
  });
  return photos;
}

/* The object URL for one gallery photo: sceneImageSrc first
 * (the same cache the inline images use), else the beat GET
 * through apiFetch - loaded into that same cache, so the
 * inline slot and the gallery never hold two copies. */
async function galleryPhotoUrl(photo) {
  const key = beatKey(photo.sceneIndex, photo.beatIndex);
  let url = sceneImageSrc.get(key);
  if (url) return url;
  const blob = await apiFetch(
    beatImagePath(photo.sceneIndex, photo.beatIndex),
    { response: "blob" });
  url = URL.createObjectURL(blob);
  sceneImageSrc.set(key, url);
  return url;
}

async function refreshSettingsCollage() {
  const host = el("settings-collage");
  host.innerHTML = "";
  const photos = collectGalleryPhotos().slice(0, 3);
  if (!photos.length) {
    host.innerHTML = IMAGE_SVG;
    return;
  }
  for (const photo of photos) {
    try {
      const img = document.createElement("img");
      img.src = await galleryPhotoUrl(photo);
      img.alt = "";
      host.appendChild(img);
    } catch {
      // A photo that will not load just leaves the collage
      // one image shorter; the tile still opens the gallery.
    }
  }
  if (!host.children.length) host.innerHTML = IMAGE_SVG;
}

function openGalleryFull(photo, url) {
  galleryPhoto = photo;
  el("gallery-nav").hidden = true;
  el("gallery-grid").hidden = true;
  el("gallery-empty").hidden = true;
  const full = el("gallery-full");
  full.hidden = false;
  const img = el("gallery-full-img");
  img.src = url;
  img.alt = photo.caption;
  el("gallery-full-caption").textContent = photo.caption;
  syncGalleryBgBtn();
}
function syncGalleryBgBtn() {
  if (!galleryPhoto) return;
  const key = beatKey(galleryPhoto.sceneIndex,
    galleryPhoto.beatIndex);
  el("gallery-bg-btn").textContent =
    sceneBackground && sceneBackground.key === key
      ? "Clear background" : "Use as background";
}
el("gallery-bg-btn").addEventListener("click", async () => {
  if (!galleryPhoto) return;
  await toggleSceneBackground(
    galleryPhoto.sceneIndex, galleryPhoto.beatIndex);
  syncGalleryBgBtn();
});
el("gallery-full-back").addEventListener("click", () => {
  galleryPhoto = null;
  el("gallery-full").hidden = true;
  el("gallery-nav").hidden = false;
  el("gallery-grid").hidden = false;
});

async function openGallery() {
  settingsTiles.hidden = true;
  galleryPanel.hidden = false;
  el("settings-title").textContent = "Photos";
  el("gallery-full").hidden = true;
  el("gallery-nav").hidden = false;
  galleryPhoto = null;
  const grid = el("gallery-grid");
  grid.innerHTML = "";
  grid.hidden = false;
  const photos = collectGalleryPhotos();
  el("gallery-empty").hidden = photos.length > 0;
  for (const photo of photos) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "gallery-cell";
    cell.setAttribute("aria-label", photo.caption);
    const img = document.createElement("img");
    img.alt = photo.caption;
    const cap = document.createElement("span");
    cap.className = "gallery-cell-caption";
    cap.textContent = photo.caption;
    cell.append(img, cap);
    cell.addEventListener("click", async () => {
      try {
        openGalleryFull(photo, await galleryPhotoUrl(photo));
      } catch (err) {
        if (err.status === 401) {
          clearToken();
          showSignedOut();
          return;
        }
        showPlayError(friendlyError(err));
      }
    });
    grid.appendChild(cell);
    try {
      img.src = await galleryPhotoUrl(photo);
    } catch {
      // Cell keeps its caption; the photo itself can still
      // be retried from a fresh gallery open.
    }
  }
}
el("settings-tile-images").addEventListener("click", openGallery);
el("gallery-back").addEventListener("click", showSettingsTiles);

/* Story bible panel (Hieu, Nov 8): the Bible tile swaps the
 * tiles for the bible panel, the same swap the gallery uses.
 * The panel holds #bible-summary - the very element
 * renderBible has always filled - so the summary content,
 * its load/turn refreshes, and its styling hooks are all
 * unchanged; only its home moved (it used to be a <details>
 * block under the prose). Opening the sheet always lands on
 * the tiles: showSettingsTiles hides this panel too. */
function openBible() {
  settingsTiles.hidden = true;
  galleryPanel.hidden = true;
  biblePanel.hidden = false;
  el("settings-title").textContent = "Story bible";
}
el("settings-tile-bible").addEventListener("click", openBible);
el("bible-back").addEventListener("click", showSettingsTiles);

/* Background adjust controls (Hieu, Nov 8): the header icon
 * toggles adjust mode; the bar's chips set the fit; Done
 * (or the icon again, or Escape) leaves. While adjusting,
 * play.css takes pointer events off the layout and header
 * so a drag anywhere on the reading area is a drag of the
 * image; the document-level handlers below still see the
 * bar's own buttons first because their targets are inside
 * the bar, which the pointerdown handler excludes. */
const bgAdjustBtn = el("bg-adjust-btn");
const bgAdjustBar = el("bg-adjust-bar");
const bgFitFillBtn = el("bg-fit-fill");
const bgFitFitBtn = el("bg-fit-fit");

function syncBgAdjustControls() {
  const fill = bgAdjust.fit !== "contain";
  bgFitFillBtn.classList.toggle("is-on", fill);
  bgFitFillBtn.setAttribute("aria-pressed",
    fill ? "true" : "false");
  bgFitFitBtn.classList.toggle("is-on", !fill);
  bgFitFitBtn.setAttribute("aria-pressed",
    !fill ? "true" : "false");
  bgAdjustBtn.setAttribute("aria-pressed",
    bgAdjusting ? "true" : "false");
}

function enterBgAdjust() {
  if (!sceneBackground || bgAdjusting) return;
  bgAdjusting = true;
  document.querySelector(".page-play")
    .classList.add("bg-adjusting");
  bgAdjustBar.hidden = false;
  ensureBgDims(sceneBackground.url);
  syncBgAdjustControls();
}

function exitBgAdjust() {
  if (!bgAdjusting) return;
  bgAdjusting = false;
  bgDragPoint = null;
  document.querySelector(".page-play")
    .classList.remove("bg-adjusting");
  bgAdjustBar.hidden = true;
  saveBgAdjust();
  syncBgAdjustControls();
}

bgAdjustBtn.addEventListener("click", () => {
  if (bgAdjusting) exitBgAdjust();
  else enterBgAdjust();
});
el("bg-adjust-done").addEventListener("click", exitBgAdjust);
bgFitFillBtn.addEventListener("click", () => {
  bgAdjust.fit = "cover";
  applyBgAdjust();
  saveBgAdjust();
  syncBgAdjustControls();
});
bgFitFitBtn.addEventListener("click", () => {
  bgAdjust.fit = "contain";
  applyBgAdjust();
  saveBgAdjust();
  syncBgAdjustControls();
});
document.addEventListener("pointerdown", (event) => {
  if (!bgAdjusting) return;
  const target = event.target;
  if (target && typeof target.closest === "function" &&
      target.closest("#bg-adjust-bar, #bg-adjust-btn")) {
    return;
  }
  bgDragPoint = { x: event.clientX, y: event.clientY };
  if (typeof event.preventDefault === "function") {
    event.preventDefault();
  }
});
document.addEventListener("pointermove", (event) => {
  if (!bgAdjusting || !bgDragPoint) return;
  const dx = event.clientX - bgDragPoint.x;
  const dy = event.clientY - bgDragPoint.y;
  bgDragPoint = { x: event.clientX, y: event.clientY };
  if (dx || dy) bgDragBy(dx, dy);
  if (typeof event.preventDefault === "function") {
    event.preventDefault();
  }
});
document.addEventListener("pointerup", () => {
  if (bgDragPoint) {
    bgDragPoint = null;
    saveBgAdjust();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") exitBgAdjust();
});

/* Orientation chooser controls (Hieu, Nov 8): a tap on a
 * shape chip is the whole interaction - it remembers the
 * shape, closes the chooser, and generates. Cancel just
 * closes. */
el("orientation-landscape").addEventListener("click",
  () => chooseOrientation("landscape"));
el("orientation-portrait").addEventListener("click",
  () => chooseOrientation("portrait"));
el("orientation-cancel").addEventListener("click",
  closeOrientationChooser);

async function init() {
  renderTopbar({
    backHref: "./book.html?id=" + encodeURIComponent(BOOK_ID),
    backLabel: "Back to book",
    // Icon-only back control on this page (Hieu, Nov 7): a
    // left-arrow at the start of the bar, no text label; the
    // label survives as the aria-label.
    backIconOnly: true,
  });
  // Theme + Log out live in this page's header menu (above), so
  // the shared topbar's copies come off the play page; the other
  // pages keep theirs.
  for (const cls of ["app-topbar-theme", "app-topbar-logout"]) {
    const btn = document.querySelector("#app-topbar ." + cls);
    if (btn) btn.remove();
  }
  if (!getToken()) {
    showSignedOut();
    return;
  }
  try {
    book = await apiFetch("/api/books/" + encodeURIComponent(BOOK_ID));
  } catch (err) {
    if (err.status === 401) {
      showSignedOut();
      return;
    }
    const status = el("play-status");
    status.className = "form-error";
    status.setAttribute("role", "alert");
    status.textContent = friendlyError(err);
    return;
  }
  el("book-title").textContent = book.title;
  document.title = book.title + " - Story Realm";
  renderBible(null);
  try {
    // Reload resumes the same playthrough (its scenes and
    // its current suggestions come back with it); only a
    // first visit - or a playthrough that is gone - starts
    // a new one.
    let state = null;
    if (playthroughId) {
      try {
        state = await apiFetch(
          "/api/playthroughs/" + encodeURIComponent(playthroughId),
        );
      } catch (err) {
        if (err.status !== 404) throw err;
        state = null;
      }
    }
    if (!state) {
      // Returning reader, fresh tab or browser: sessionStorage
      // is gone, but the account's runs live server-side. Resume
      // the latest one instead of starting fresh while the work
      // sits on the server. A 4xx here means an older backend
      // without the list endpoint (404/405) - fall through to a
      // new playthrough, as before; a 5xx is a real server
      // problem and surfaces instead of silently duplicating
      // the reader's run.
      try {
        const mine = await apiFetch(
          "/api/books/" + encodeURIComponent(BOOK_ID) + "/playthroughs",
        );
        const latest = (mine.playthroughs || [])[0];
        if (latest) {
          state = await apiFetch(
            "/api/playthroughs/" + encodeURIComponent(latest.id),
          );
          playthroughId = state.id;
          sessionStorage.setItem(PLAYTHROUGH_KEY, playthroughId);
        }
      } catch (err) {
        if (err.status >= 500) throw err;
      }
    }
    if (!state) {
      state = await apiFetch(
        "/api/books/" + encodeURIComponent(BOOK_ID) + "/playthroughs",
        { method: "POST" },
      );
      playthroughId = state.id;
      sessionStorage.setItem(PLAYTHROUGH_KEY, playthroughId);
    }
    scenes = state.scenes && state.scenes.length
      ? state.scenes
      : [{ turn: 0, text: book.opening_scene || "" }];
    renderScenes();
    refreshRetryButton();
    await restoreSceneBackground();
    // Stored beat images show on their own (see
    // loadExistingBeatImages): after the background
    // restore, so its beat is already in sceneImageSrc
    // and the loader skips it. Not awaited - the images
    // fill in as they arrive and never block reading.
    loadExistingBeatImages();
    // Scene audio (T3): probe the relay once per load. When
    // it answers, pre-generate the newest scene's paragraphs
    // so its speaker buttons are ready; when it is down, the
    // probe marks every button "Audio unavailable" and no
    // generation is attempted. Auto-read never starts on
    // load - it needs a gesture first (see
    // markAudioInteracted), so only new turns auto-play.
    audioPlayer.probeAvailability().then((ok) => {
      if (ok && scenes.length) {
        const beats = splitBeats(sceneText(scenes[scenes.length - 1]))
          .map((text, j) => ({
            key: beatKey(scenes.length - 1, j), text,
          }));
        audioPlayer.pregenerate(beats, readVoice());
      }
    });
    renderDiary(state.diary);
    loadedSuggestions = state.suggestions || [];
    if (state.bible) renderBible(state.bible);
  } catch (err) {
    if (err.status === 401) {
      showSignedOut();
      return;
    }
    showPlayError(friendlyError(err));
    scenes = [{ turn: 0, text: book.opening_scene || "" }];
    renderScenes();
  }
  document.querySelectorAll(".suggestion-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (card.dataset.suggestionId) {
        runTurnBody(
          { suggestion_id: card.dataset.suggestionId },
          card.textContent,
        );
      } else {
        el("action-input").value = card.textContent;
        growInput();
        el("action-input").focus();
      }
    });
  });
  if (loadedSuggestions.length === 3) {
    // Reload case: the persisted set is still the current one
    // (panel stays collapsed on load, per the redesign).
    currentSuggestions = loadedSuggestions;
    renderSuggestions(currentSuggestions);
  } else {
    renderStarterCards();
  }
  el("play-status").hidden = true;
  el("play-layout").hidden = false;
}

init();
