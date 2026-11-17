/* Loading-states slice: audio retry (node writer/audio-loading.test.mjs).
 *
 * Covers retryAudio in the REAL writer/js/audio.js: a failed
 * synthesis leaves the beat "unavailable" and a retry
 * re-synthesizes instead of re-rejecting the cached failure,
 * while ready/generating entries never pay twice. No browser,
 * no network: synthesize/probe/audio element are stubs.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createAudioPlayer, AudioUnavailable } from "./js/audio.js";

function fakeAudio() {
  return {
    src: "",
    muted: false,
    paused: true,
    onended: null,
    onerror: null,
    play: async () => {},
    pause: () => {},
  };
}

function makePlayer({ failures = 0 } = {}) {
  let calls = 0;
  const synthesize = async () => {
    calls += 1;
    if (calls <= failures) throw new Error("tts down");
    return new Blob(["fake-audio"]);
  };
  const player = createAudioPlayer({
    synthesize,
    probe: async () => true,
    createAudio: fakeAudio,
    createObjectURL: () => "blob:fake-url",
    revokeObjectURL: () => {},
    storage: null,
  });
  return { player, calls: () => calls };
}

test("a failed synthesis is unavailable, and retryAudio re-synthesizes", async () => {
  const { player, calls } = makePlayer({ failures: 1 });
  await assert.rejects(player.ensureAudio("hello world", "vendetti"));
  assert.equal(player.beatState("hello world", "vendetti"), "unavailable");
  assert.equal(calls(), 1);
  const url = await player.retryAudio("hello world", "vendetti");
  assert.equal(url, "blob:fake-url");
  assert.equal(player.beatState("hello world", "vendetti"), "ready");
  assert.equal(calls(), 2);
});

test("retryAudio on a ready entry does not synthesize again", async () => {
  const { player, calls } = makePlayer({ failures: 0 });
  await player.ensureAudio("ready beat", "vendetti");
  assert.equal(calls(), 1);
  const url = await player.retryAudio("ready beat", "vendetti");
  assert.equal(url, "blob:fake-url");
  assert.equal(calls(), 1);
});

test("retryAudio while generating joins the in-flight synthesis", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const player = createAudioPlayer({
    synthesize: async () => {
      calls += 1;
      await gate;
      return new Blob(["fake-audio"]);
    },
    probe: async () => true,
    createAudio: fakeAudio,
    createObjectURL: () => "blob:fake-url",
    revokeObjectURL: () => {},
    storage: null,
  });
  const first = player.ensureAudio("slow beat", "vendetti");
  assert.equal(player.beatState("slow beat", "vendetti"), "generating");
  const retried = player.retryAudio("slow beat", "vendetti");
  release();
  assert.equal(await first, "blob:fake-url");
  assert.equal(await retried, "blob:fake-url");
  assert.equal(calls, 1);
  assert.equal(player.beatState("slow beat", "vendetti"), "ready");
});

test("a second failure stays unavailable until the next retry", async () => {
  const { player, calls } = makePlayer({ failures: 2 });
  await assert.rejects(player.ensureAudio("flaky beat", "vendetti"));
  await assert.rejects(
    player.retryAudio("flaky beat", "vendetti"),
    AudioUnavailable,
  );
  assert.equal(player.beatState("flaky beat", "vendetti"), "unavailable");
  assert.equal(calls(), 2);
  const url = await player.retryAudio("flaky beat", "vendetti");
  assert.equal(url, "blob:fake-url");
  assert.equal(player.beatState("flaky beat", "vendetti"), "ready");
  assert.equal(calls(), 3);
});
