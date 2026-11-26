/* Fake-DOM harness for the reading-view redesign, run on the
 * REAL writer/play.js (node writer/play-thought.test.mjs).
 *
 * Covers the thought-span slice of the design (room seq 580 /
 * 715 / 741): *...* spans render italic with markers stripped,
 * a whole-paragraph thought becomes a thought block only for
 * post-Nov-4 scenes; and the dialogue-bold slice (room seq 577
 * addendum): double-quoted speech renders bold against regular
 * narration. No browser, no network: init() takes the
 * signed-out path (no token in the stubbed storage) and the
 * tests drive renderScenes through the __playTest handle.
 *
 * This harness grows with the redesign: later slices add
 * cases here (background selection, settings panel, header
 * menu) instead of a second copy of the render code. */

import assert from "node:assert/strict";

/* --- Minimal fake DOM: only what play.js + its imports touch --- */
class FakeClassList {
  constructor(el) { this.el = el; }
  add(...names) { for (const n of names) this.el._classes.add(n); }
  remove(...names) { for (const n of names) this.el._classes.delete(n); }
  toggle(name, force) {
    if (force === undefined) force = !this.el._classes.has(name);
    if (force) this.el._classes.add(name);
    else this.el._classes.delete(name);
    return force;
  }
  contains(name) { return this.el._classes.has(name); }
}

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = String(text);
    this.parentNode = null;
  }
}

class FakeNode {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.childNodes = [];
    this.children = [];
    this.dataset = {};
    this._attrs = {};
    this._classes = new Set();
    this.classList = new FakeClassList(this);
    this._listeners = [];
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.id = "";
    this.src = "";
    this.alt = "";
    this.title = "";
    this.type = "";
    this.style = {};
    this._rawHtml = "";
  }
  get className() { return [...this._classes].join(" "); }
  set className(v) {
    this._classes = new Set(String(v || "").split(/\s+/).filter(Boolean));
  }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get textContent() {
    return this.childNodes.map((n) => n.textContent || "").join("");
  }
  set textContent(v) {
    this.childNodes = [];
    this.children = [];
    if (v !== "" && v !== null && v !== undefined) {
      this.append(new FakeText(v));
    }
  }
  get innerHTML() { return this._rawHtml; }
  set innerHTML(v) {
    // No HTML parsing: the code under test only clears ("") or
    // sets static SVG strings that are never queried back.
    this.childNodes = [];
    this.children = [];
    this._rawHtml = String(v);
  }
  append(...nodes) {
    for (const n of nodes) this._adopt(n, this.childNodes.length);
    return this;
  }
  prepend(...nodes) {
    let at = 0;
    for (const n of nodes) this._adopt(n, at++);
    return this;
  }
  appendChild(node) { this.append(node); return node; }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) this.childNodes.splice(i, 1);
    const j = this.children.indexOf(node);
    if (j >= 0) this.children.splice(j, 1);
    node.parentNode = null;
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  _adopt(node, index) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.splice(index, 0, node);
    if (node.nodeType !== 3) {
      const at = this.children.filter(
        (c) => this.childNodes.indexOf(c) < index).length;
      this.children.splice(at, 0, node);
    }
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  // paintMarkerAvatar (main fb14eb99, persona-faced markers) strips
  // role/aria-label off the avatar disc: the fake DOM must model it.
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(...args) { this._listeners.push(args); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const byId = new Map();
globalThis.localStorage = makeStorage();
globalThis.sessionStorage = makeStorage();
globalThis.location = { search: "?id=test-book", hostname: "localhost" };
globalThis.window = globalThis;
globalThis.fetch = () => Promise.reject(new Error("no network in harness"));
// The play page itself: applySceneBackground / applyBgAdjust
// paint the backdrop onto .page-play, so the fake document
// answers that one selector with a persistent node (every
// other selector still returns null, as before).
const pagePlayEl = new FakeNode("div");
pagePlayEl.classList.add("page-play");
globalThis.document = {
  body: new FakeNode("body"),
  title: "",
  getElementById(id) {
    if (!byId.has(id)) {
      const el = new FakeNode("div");
      el.id = id;
      byId.set(id, el);
    }
    return byId.get(id);
  },
  createElement(tag) { return new FakeNode(tag); },
  createTextNode(text) { return new FakeText(text); },
  querySelector(sel) {
    return sel === ".page-play" ? pagePlayEl : null;
  },
  querySelectorAll() { return []; },
  addEventListener() {},
};

const play = await import("./play.js");
// init() runs on import and takes the signed-out path (no
// token); let its microtasks settle before driving renders.
await new Promise((r) => setTimeout(r, 20));
const T = play.__playTest;

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log("ok - " + name);
}

/* --- parseThoughtSpans: pure parsing --- */
check("plain text stays one plain segment", () => {
  assert.deepEqual(T.parseThoughtSpans("Just narration."),
    [{ text: "Just narration.", thought: false }]);
});

check("a thought span splits out, markers stripped", () => {
  assert.deepEqual(
    T.parseThoughtSpans("He looked away. *He isn't even surprised,* she thought."),
    [
      { text: "He looked away. ", thought: false },
      { text: "He isn't even surprised,", thought: true },
      { text: " she thought.", thought: false },
    ]);
});

check("onomatopoeia spans are spans too (italicised, seq 715)", () => {
  const segs = T.parseThoughtSpans("*click* echoed down the hall.");
  assert.equal(segs[0].thought, true);
  assert.equal(segs[0].text, "click");
  assert.equal(segs[1].text, " echoed down the hall.");
});

check("a space-padded * span * stays literal", () => {
  assert.deepEqual(T.parseThoughtSpans("a * spaced * b"),
    [{ text: "a * spaced * b", thought: false }]);
});

check("unmatched asterisk stays literal", () => {
  assert.deepEqual(T.parseThoughtSpans("A * stray star and *click*"),
    [
      { text: "A * stray star and ", thought: false },
      { text: "click", thought: true },
    ]);
});

check("empty span ** stays literal", () => {
  assert.deepEqual(T.parseThoughtSpans("a ** b"),
    [{ text: "a ** b", thought: false }]);
});

check("empty text parses to one empty segment", () => {
  assert.deepEqual(T.parseThoughtSpans(""),
    [{ text: "", thought: false }]);
});

/* --- isThoughtBlockEligible: the Nov 4 gate --- */
check("no stamp means not eligible (never promote blind)", () => {
  assert.equal(T.isThoughtBlockEligible({ turn: 1, text: "*x*" }), false);
  assert.equal(T.isThoughtBlockEligible(null), false);
});
check("pre-Nov-4 stamp is not eligible", () => {
  assert.equal(T.isThoughtBlockEligible(
    { created_at: "2026-11-03T23:59:00Z" }), false);
});
check("post-Nov-4 stamp is eligible", () => {
  assert.equal(T.isThoughtBlockEligible(
    { created_at: "2026-11-05T10:00:00Z" }), true);
});
check("unparseable stamp is not eligible", () => {
  assert.equal(T.isThoughtBlockEligible({ created_at: "soon" }), false);
});

/* --- renderScenes through the real module --- */
function paragraphs() {
  const prose = document.getElementById("prose");
  return prose.children.filter((c) => c.tagName === "P");
}

check("rendered beats carry no raw asterisks; spans become <em>", () => {
  T.setScenes([{
    turn: 0,
    text: "The room was quiet.\n\n*He isn't even surprised,*\n\n*click*",
  }]);
  T.renderScenes();
  const ps = paragraphs();
  assert.equal(ps.length, 3);
  assert.equal(ps[0].textContent, "The room was quiet.");
  assert.equal(ps[0].childNodes.filter((n) => n.tagName === "EM").length, 0);
  const em1 = ps[1].childNodes.filter((n) => n.tagName === "EM");
  assert.equal(em1.length, 1);
  assert.equal(em1[0].textContent, "He isn't even surprised,");
  assert.equal(em1[0].classList.contains("thought-span"), true);
  assert.equal(ps[1].textContent.includes("*"), false);
  assert.equal(ps[1].classList.contains("thought-block"), false);
  // *click* italicises (seq 715) but is never a thought block.
  const em2 = ps[2].childNodes.filter((n) => n.tagName === "EM");
  assert.equal(em2.length, 1);
  assert.equal(em2[0].textContent, "click");
  assert.equal(ps[2].classList.contains("thought-block"), false);
  assert.equal(document.getElementById("prose").textContent.includes("*"), false);
});

check("post-Nov-4 whole-paragraph thought becomes a thought block", () => {
  T.setScenes([{
    turn: 1,
    created_at: "2026-11-05T10:00:00Z",
    text: "*He isn't posturing,*",
  }]);
  T.renderScenes();
  const ps = paragraphs();
  assert.equal(ps.length, 1);
  assert.equal(ps[0].classList.contains("thought-block"), true);
  assert.equal(ps[0].textContent, "He isn't posturing,");
});

check("pre-Nov-4 whole-paragraph span is italic only, never a block", () => {
  T.setScenes([{
    turn: 2,
    created_at: "2026-11-03T10:00:00Z",
    text: "*thud*",
  }]);
  T.renderScenes();
  const ps = paragraphs();
  assert.equal(ps[0].classList.contains("thought-block"), false);
  assert.equal(ps[0].childNodes.filter((n) => n.tagName === "EM").length, 1);
});

check("beat icons survive a re-render and a provisional re-sync", () => {
  T.setScenes([{ turn: 0, text: "First *thought* here." }]);
  T.renderScenes();
  T.renderScenes();
  let ps = paragraphs();
  assert.equal(ps.length, 1);
  const icons = (p) => p.children.filter(
    (c) => c.classList.contains("beat-icons"));
  assert.equal(icons(ps[0]).length, 1);
  // Same path the streaming sync uses: re-render the beat's
  // text in place; the icons span must stay first.
  T.renderBeatText(ps[0], "First *thought* here, longer.", { turn: 0 });
  assert.equal(icons(ps[0]).length, 1);
  assert.equal(ps[0].children[0].classList.contains("beat-icons"), true);
  assert.equal(ps[0].textContent,
    "First thought here, longer.");
});

check("action marker still renders alongside thought prose", () => {
  T.setScenes([{ turn: 3, action: "I open the door.", text: "*Here goes.*" }]);
  T.renderScenes();
  const prose = document.getElementById("prose");
  const marker = prose.children.filter(
    (c) => c.classList.contains("turn-input-marker"));
  assert.equal(marker.length, 1);
  // Main's persona-faced markers (fb14eb99) replaced the pencil
  // glyph: the marker now wears the account avatar disc, with
  // the accessible name on the button itself.
  assert.equal(marker[0].children.length, 1);
  assert.equal(marker[0].children[0].classList.contains("avatar-disc"), true);
  assert.equal(marker[0].title.startsWith("Your input · "), true);
});

/* --- parseDialogueSpans: pure parsing (seq 577 addendum) --- */
check("plain text stays one plain segment", () => {
  assert.deepEqual(T.parseDialogueSpans("Just narration."),
    [{ text: "Just narration.", dialogue: false }]);
});

check("straight-quoted speech splits out, quotes stripped", () => {
  assert.deepEqual(
    T.parseDialogueSpans('She turned. "We go now," she said.'),
    [
      { text: "She turned. ", dialogue: false },
      { text: "We go now,", dialogue: true },
      { text: " she said.", dialogue: false },
    ]);
});

check("curly-quoted speech splits out the same way", () => {
  assert.deepEqual(
    T.parseDialogueSpans("He nodded. “After you.”"),
    [
      { text: "He nodded. ", dialogue: false },
      { text: "After you.", dialogue: true },
    ]);
});

check("a mismatched quote pair stays literal", () => {
  assert.deepEqual(T.parseDialogueSpans('He said “go now."'),
    [{ text: "He said “go now.\"", dialogue: false }]);
});

check("unmatched quote stays literal", () => {
  assert.deepEqual(T.parseDialogueSpans('She said "go now.'),
    [{ text: 'She said "go now.', dialogue: false }]);
});

check("empty quoted span stays literal", () => {
  assert.deepEqual(T.parseDialogueSpans('a "" b'),
    [{ text: 'a "" b', dialogue: false }]);
});

check("single quotes are never dialogue (apostrophes safe)", () => {
  assert.deepEqual(T.parseDialogueSpans("It's 'her' call, he said."),
    [{ text: "It's 'her' call, he said.", dialogue: false }]);
});

/* --- renderScenes: dialogue bold alongside thought italics --- */
check("rendered dialogue becomes <strong>, quotes stripped", () => {
  T.setScenes([{
    turn: 4,
    text: 'The room was quiet.\n\n"We go now," she said.',
  }]);
  T.renderScenes();
  const ps = paragraphs();
  assert.equal(ps.length, 2);
  assert.equal(ps[0].childNodes.filter((n) => n.tagName === "STRONG").length, 0);
  const strong = ps[1].childNodes.filter((n) => n.tagName === "STRONG");
  assert.equal(strong.length, 1);
  assert.equal(strong[0].textContent, "We go now,");
  assert.equal(strong[0].classList.contains("dialogue-span"), true);
  assert.equal(ps[1].textContent, "We go now, she said.");
  assert.equal(ps[1].textContent.includes('"'), false);
});

check("thought and dialogue coexist in one paragraph", () => {
  T.setScenes([{
    turn: 5,
    text: '*Not now.* "We go," she said.',
  }]);
  T.renderScenes();
  const ps = paragraphs();
  assert.equal(ps.length, 1);
  assert.equal(ps[0].childNodes.filter((n) => n.tagName === "EM").length, 1);
  assert.equal(ps[0].childNodes.filter((n) => n.tagName === "STRONG").length, 1);
  assert.equal(ps[0].textContent, "Not now. We go, she said.");
});

check("a quoted span inside a thought stays italic thought, never bold", () => {
  T.setScenes([{
    turn: 6,
    text: '*She said "go" and meant it.*',
  }]);
  T.renderScenes();
  const ps = paragraphs();
  assert.equal(ps[0].childNodes.filter((n) => n.tagName === "STRONG").length, 0);
  const em = ps[0].childNodes.filter((n) => n.tagName === "EM");
  assert.equal(em.length, 1);
  assert.equal(em[0].textContent, 'She said "go" and meant it.');
});

/* --- slice 4a: narration/dialogue colour (one-element slice) --- */
const narrationSpans = (p) => p.childNodes.filter(
  (n) => n.tagName === "SPAN" && n.classList.contains("narration-span"));

check("rendered narration becomes <span>, dialogue stays <strong>", () => {
  T.setScenes([{
    turn: 7,
    text: 'The room was quiet.\n\n"We go now," she said.',
  }]);
  T.renderScenes();
  const ps = paragraphs();
  assert.equal(ps.length, 2);
  assert.equal(narrationSpans(ps[0]).length, 1);
  assert.equal(narrationSpans(ps[0])[0].textContent, "The room was quiet.");
  assert.equal(ps[0].childNodes.filter((n) => n.tagName === "STRONG").length, 0);
  const strong = ps[1].childNodes.filter((n) => n.tagName === "STRONG");
  assert.equal(strong.length, 1);
  assert.equal(strong[0].classList.contains("dialogue-span"), true);
  assert.equal(narrationSpans(ps[1]).length, 1);
  assert.equal(narrationSpans(ps[1])[0].textContent, " she said.");
  assert.equal(ps[1].textContent, "We go now, she said.");
});

check("pure narration leaves no bare text node behind", () => {
  T.setScenes([{ turn: 8, text: "Only narration here." }]);
  T.renderScenes();
  const ps = paragraphs();
  assert.equal(ps.length, 1);
  assert.equal(ps[0].childNodes.filter((n) => n.nodeType === 3).length, 0);
  assert.equal(narrationSpans(ps[0]).length, 1);
  assert.equal(ps[0].textContent, "Only narration here.");
});

check("narration spans survive an in-place re-render, icons stay first", () => {
  T.setScenes([{ turn: 9, text: 'Rain fell. "Stay," she said.' }]);
  T.renderScenes();
  let ps = paragraphs();
  const icons = (p) => p.children.filter(
    (c) => c.classList.contains("beat-icons"));
  assert.equal(icons(ps[0]).length, 1);
  T.renderBeatText(ps[0], 'Rain fell harder. "Stay," she said.', { turn: 9 });
  ps = paragraphs();
  assert.equal(icons(ps[0]).length, 1);
  assert.equal(ps[0].children[0].classList.contains("beat-icons"), true);
  assert.equal(narrationSpans(ps[0]).length, 2);
  assert.equal(ps[0].textContent, 'Rain fell harder. Stay, she said.');
});

check("a quoted span inside a thought gains no narration span", () => {
  T.setScenes([{
    turn: 10,
    text: '*She said "go" and meant it.*',
  }]);
  T.renderScenes();
  const ps = paragraphs();
  assert.equal(narrationSpans(ps[0]).length, 0);
  assert.equal(ps[0].childNodes.filter((n) => n.tagName === "STRONG").length, 0);
  assert.equal(ps[0].childNodes.filter((n) => n.tagName === "EM").length, 1);
});

check("dialogue-only paragraph has no narration span", () => {
  T.setScenes([{ turn: 11, text: '"Hi."' }]);
  T.renderScenes();
  const ps = paragraphs();
  assert.equal(narrationSpans(ps[0]).length, 0);
  const strong = ps[0].childNodes.filter((n) => n.tagName === "STRONG");
  assert.equal(strong.length, 1);
  assert.equal(strong[0].textContent, "Hi.");
  assert.equal(ps[0].textContent, "Hi.");
});

/* --- slice 3: stage background auto-follow --- */
function stageSetup() {
  T.resetStageBackgroundState();
  localStorage.removeItem(T.sceneBackgroundKey());
  T.setScenes([]);
}
const pictured = (n) => ({ text: `Scene ${n}.`, image_file: `s${n}.jpg` });

check("pickStageBackground takes the latest pictured scene's beat 0", () => {
  assert.deepEqual(
    T.pickStageBackground([pictured(0), pictured(1), { text: "C." }]),
    { sceneIndex: 1, beatIndex: 0, key: "1:0" });
});

check("a later unpictured scene leaves the earlier picture in place", () => {
  assert.deepEqual(
    T.pickStageBackground([pictured(0), { text: "B." }]),
    { sceneIndex: 0, beatIndex: 0, key: "0:0" });
});

check("a beat-1-only image does not count; beat 0 does", () => {
  assert.deepEqual(
    T.pickStageBackground([
      { text: "A.", beat_images: { 1: { image_file: "a1.jpg" } } },
      { text: "B.", beat_images: { 0: { image_file: "b0.jpg" } } },
    ]),
    { sceneIndex: 1, beatIndex: 0, key: "1:0" });
});

check("no pictured scene picks nothing", () => {
  assert.equal(T.pickStageBackground([{ text: "A." }]), null);
  assert.equal(T.pickStageBackground([]), null);
  assert.equal(T.pickStageBackground(null), null);
});

check("follow applies the latest pictured scene's cached URL", () => {
  stageSetup();
  T.setScenes([pictured(0), pictured(1)]);
  T.setSceneImageSrc("0:0", "blob:a");
  T.setSceneImageSrc("1:0", "blob:b");
  T.followStageBackground();
  assert.deepEqual(T.getSceneBackground(), { key: "1:0", url: "blob:b" });
  assert.equal(
    document.querySelector(".page-play").style.backgroundImage
      .includes("blob:b"), true);
  // Auto-follow never writes the reader's stored choice.
  assert.equal(localStorage.getItem(T.sceneBackgroundKey()), null);
});

check("follow leaves the backdrop alone with no pictured scene", () => {
  stageSetup();
  T.setScenes([{ text: "A." }]);
  T.followStageBackground();
  assert.equal(T.getSceneBackground(), null);
});

check("follow waits for the image bytes: uncached pick changes nothing", () => {
  stageSetup();
  T.setScenes([pictured(0)]);
  T.followStageBackground();
  assert.equal(T.getSceneBackground(), null);
});

check("a reader-set photo wins over the follow", () => {
  stageSetup();
  T.setScenes([pictured(0), pictured(1)]);
  T.setSceneImageSrc("1:0", "blob:b");
  const readerBg = { key: "0:0", url: "blob:reader" };
  localStorage.setItem(T.sceneBackgroundKey(), "0:0");
  T.setSceneBackground(readerBg);
  T.followStageBackground();
  assert.equal(T.getSceneBackground(), readerBg);
});

check("the book portrait yields to the follow", () => {
  stageSetup();
  T.setScenes([pictured(0), pictured(1)]);
  T.setSceneImageSrc("1:0", "blob:b");
  T.setSceneBackground({ key: "book:main-character", url: "blob:portrait" });
  T.followStageBackground();
  assert.deepEqual(T.getSceneBackground(), { key: "1:0", url: "blob:b" });
});

check("an auto-followed backdrop advances to the newest pictured scene", () => {
  stageSetup();
  T.setScenes([pictured(0), pictured(1)]);
  T.setSceneImageSrc("0:0", "blob:a");
  T.setSceneImageSrc("1:0", "blob:b");
  // No stored choice: this backdrop is the follow's own.
  T.setSceneBackground({ key: "0:0", url: "blob:a" });
  T.followStageBackground();
  assert.deepEqual(T.getSceneBackground(), { key: "1:0", url: "blob:b" });
});

check("a rewind moves the backdrop back to the latest pictured scene left", () => {
  stageSetup();
  T.setScenes([pictured(0), pictured(1)]);
  T.setSceneImageSrc("0:0", "blob:a");
  T.setSceneImageSrc("1:0", "blob:b");
  T.followStageBackground();
  assert.deepEqual(T.getSceneBackground(), { key: "1:0", url: "blob:b" });
  // Retry rewound the tail: scene 1 is gone.
  T.setScenes([pictured(0)]);
  T.followStageBackground();
  assert.deepEqual(T.getSceneBackground(), { key: "0:0", url: "blob:a" });
});

check("an already-current backdrop is not re-applied", () => {
  stageSetup();
  T.setScenes([pictured(0), pictured(1)]);
  T.setSceneImageSrc("1:0", "blob:b");
  const current = { key: "1:0", url: "blob:b" };
  T.setSceneBackground(current);
  T.followStageBackground();
  assert.equal(T.getSceneBackground(), current);
});

check("resetStageBackgroundState clears backdrop and cached URLs", () => {
  stageSetup();
  T.setSceneImageSrc("0:0", "blob:a");
  T.setSceneBackground({ key: "0:0", url: "blob:a" });
  T.resetStageBackgroundState();
  assert.equal(T.getSceneBackground(), null);
  T.setScenes([pictured(0)]);
  T.followStageBackground();
  assert.equal(T.getSceneBackground(), null);
});

/* --- slice 4b: reading-settings panel, font size --- */
function readingSetup() {
  localStorage.removeItem("writer.readingSettings");
  T.loadReadingSettings();
  T.applyReadingSettings();
}

check("no stored size reads standard and marks the prose", () => {
  readingSetup();
  assert.deepEqual(T.getReadingSettings(),
    { fontSize: "standard", mode: "default" });
  assert.equal(
    document.getElementById("prose").getAttribute("data-reading-font"),
    "standard");
  assert.equal(
    document.getElementById("prose").getAttribute("data-reading-mode"),
    "default");
  assert.equal(
    document.getElementById("reading-font-standard")
      .getAttribute("aria-pressed"), "true");
  assert.equal(
    document.getElementById("reading-font-small")
      .getAttribute("aria-pressed"), "false");
  assert.equal(
    document.getElementById("reading-mode-default")
      .getAttribute("aria-pressed"), "true");
  assert.equal(
    document.getElementById("reading-mode-immersion")
      .getAttribute("aria-pressed"), "false");
});

check("choosing Large applies it and persists it", () => {
  readingSetup();
  T.setReadingFontSize("large");
  assert.equal(
    document.getElementById("prose").getAttribute("data-reading-font"),
    "large");
  assert.equal(
    JSON.parse(localStorage.getItem("writer.readingSettings")).fontSize,
    "large");
  assert.equal(
    document.getElementById("reading-font-large")
      .getAttribute("aria-pressed"), "true");
  assert.equal(
    document.getElementById("reading-font-standard")
      .getAttribute("aria-pressed"), "false");
  assert.equal(
    document.getElementById("reading-font-large")
      .classList.contains("is-on"), true);
});

check("a stored XL loads back before first paint", () => {
  localStorage.setItem("writer.readingSettings",
    JSON.stringify({ fontSize: "xl" }));
  T.loadReadingSettings();
  T.applyReadingSettings();
  assert.equal(
    document.getElementById("prose").getAttribute("data-reading-font"),
    "xl");
  assert.equal(
    document.getElementById("reading-font-xl")
      .getAttribute("aria-pressed"), "true");
});

check("an unknown stored size falls back to standard", () => {
  localStorage.setItem("writer.readingSettings",
    JSON.stringify({ fontSize: "huge" }));
  T.loadReadingSettings();
  T.applyReadingSettings();
  assert.deepEqual(T.getReadingSettings(),
    { fontSize: "standard", mode: "default" });
  assert.equal(
    document.getElementById("prose").getAttribute("data-reading-font"),
    "standard");
});

check("corrupt stored settings fall back to standard", () => {
  localStorage.setItem("writer.readingSettings", "{not json");
  T.loadReadingSettings();
  T.applyReadingSettings();
  assert.deepEqual(T.getReadingSettings(),
    { fontSize: "standard", mode: "default" });
});

check("an unknown size choice changes nothing", () => {
  readingSetup();
  T.setReadingFontSize("huge");
  assert.deepEqual(T.getReadingSettings(),
    { fontSize: "standard", mode: "default" });
  assert.equal(localStorage.getItem("writer.readingSettings"), null);
});

/* --- slice 4d: reading-settings panel, mode --- */
check("choosing Immersion applies it and persists it", () => {
  readingSetup();
  T.setReadingMode("immersion");
  assert.equal(
    document.getElementById("prose").getAttribute("data-reading-mode"),
    "immersion");
  assert.equal(
    JSON.parse(localStorage.getItem("writer.readingSettings")).mode,
    "immersion");
  assert.equal(
    document.getElementById("reading-mode-immersion")
      .getAttribute("aria-pressed"), "true");
  assert.equal(
    document.getElementById("reading-mode-default")
      .getAttribute("aria-pressed"), "false");
  assert.equal(
    document.getElementById("reading-mode-immersion")
      .classList.contains("is-on"), true);
});

check("a stored Immersion loads back before first paint", () => {
  localStorage.setItem("writer.readingSettings",
    JSON.stringify({ fontSize: "large", mode: "immersion" }));
  T.loadReadingSettings();
  T.applyReadingSettings();
  assert.equal(
    document.getElementById("prose").getAttribute("data-reading-mode"),
    "immersion");
  assert.equal(
    document.getElementById("prose").getAttribute("data-reading-font"),
    "large");
  assert.equal(
    document.getElementById("reading-mode-immersion")
      .getAttribute("aria-pressed"), "true");
});

check("an unknown stored mode falls back to default, keeping the size", () => {
  localStorage.setItem("writer.readingSettings",
    JSON.stringify({ fontSize: "large", mode: "cinematic" }));
  T.loadReadingSettings();
  T.applyReadingSettings();
  assert.deepEqual(T.getReadingSettings(),
    { fontSize: "large", mode: "default" });
  assert.equal(
    document.getElementById("prose").getAttribute("data-reading-mode"),
    "default");
});

check("stored settings from before mode still load, mode defaults", () => {
  localStorage.setItem("writer.readingSettings",
    JSON.stringify({ fontSize: "xl" }));
  T.loadReadingSettings();
  T.applyReadingSettings();
  assert.deepEqual(T.getReadingSettings(),
    { fontSize: "xl", mode: "default" });
  assert.equal(
    document.getElementById("prose").getAttribute("data-reading-mode"),
    "default");
});

check("an unknown mode choice changes nothing", () => {
  readingSetup();
  T.setReadingMode("cinematic");
  assert.deepEqual(T.getReadingSettings(),
    { fontSize: "standard", mode: "default" });
  assert.equal(localStorage.getItem("writer.readingSettings"), null);
});

/* --- slice 4c: speaker chips + attribution --- */
function chipRows() {
  return document.getElementById("prose").children.filter(
    (c) => c.classList.contains("speaker-chip-row"));
}
function chipParts(row) {
  // Face, name, role - in that order.
  return {
    face: row.children[0],
    name: row.children[1],
    role: row.children[2],
  };
}
const testBook = () => ({
  main_character: { name: "Kim Nguyen" },
  main_character_image: "characters/kim.jpg",
  supporting_cast: [
    { name: "Accad Smith", role: "co-lead" },
    { name: "Rin", role: "friend" },
  ],
});

check("a typed-action block gets a You chip before its marker", () => {
  T.setBook(testBook());
  T.setPlaythroughPersona({ persona_id: null, persona: null });
  T.setScenes([{
    turn: 0, action: "I open the door.", text: "She waits.",
  }]);
  T.renderScenes();
  const rows = chipRows();
  assert.equal(rows.length, 2);
  const you = chipParts(rows[0]);
  assert.equal(rows[0].dataset.testid, "speaker-chip-you-0");
  assert.equal(you.name.textContent, "Accad");
  assert.equal(you.role.textContent, "You");
  // No persona bound: the face is the account avatar disc.
  assert.equal(you.face.children[0].classList.contains("avatar-disc"), true);
  const prose = document.getElementById("prose");
  assert.equal(
    prose.children.indexOf(rows[0]) <
      prose.children.indexOf(prose.children.filter(
        (c) => c.classList.contains("turn-input-marker"))[0]),
    true);
});

check("the AI scene gets a Character chip before its first beat", () => {
  T.setBook(testBook());
  T.setPlaythroughPersona({ persona_id: null, persona: null });
  T.setScenes([{
    turn: 0, action: "I open the door.", text: "She waits.",
  }]);
  T.renderScenes();
  const rows = chipRows();
  const ch = chipParts(rows[1]);
  assert.equal(rows[1].dataset.testid, "speaker-chip-character-0");
  assert.equal(ch.name.textContent, "Kim Nguyen");
  assert.equal(ch.role.textContent, "Character");
  assert.equal(ch.face.children[0].tagName, "IMG");
  assert.equal(ch.face.children[0].src, "characters/kim.jpg");
  const prose = document.getElementById("prose");
  assert.equal(
    prose.children.indexOf(rows[1]) <
      prose.children.indexOf(paragraphs()[0]), true);
});

check("a scene without an action gets only the Character chip", () => {
  T.setBook(testBook());
  T.setPlaythroughPersona({ persona_id: null, persona: null });
  T.setScenes([{ turn: 1, text: "She waits." }]);
  T.renderScenes();
  const rows = chipRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.testid, "speaker-chip-character-1");
});

check("a book without a portrait falls back to the initial, never a bare img", () => {
  const book = testBook();
  book.main_character_image = "";
  T.setBook(book);
  T.setPlaythroughPersona({ persona_id: null, persona: null });
  T.setScenes([{ turn: 2, text: "She waits." }]);
  T.renderScenes();
  const ch = chipParts(chipRows()[0]);
  assert.equal(ch.face.children[0].classList.contains("speaker-chip-initial"), true);
  assert.equal(ch.face.children[0].textContent, "K");
  assert.equal(
    ch.face.children.filter((n) => n.tagName === "IMG").length, 0);
});

check("a book without a main-character name skips the Character chip", () => {
  const book = testBook();
  book.main_character = {};
  T.setBook(book);
  T.setPlaythroughPersona({ persona_id: null, persona: null });
  T.setScenes([{
    turn: 3, action: "I look around.", text: "The room is quiet.",
  }]);
  T.renderScenes();
  const rows = chipRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.testid, "speaker-chip-you-3");
});

check("a bound persona names the You chip and paints its photo", () => {
  T.setBook(testBook());
  T.setPlaythroughPersona({
    persona_id: "p1",
    persona: { id: "p1", name: "Milu Test", image_id: "f1" },
  });
  T.setScenes([{
    turn: 4, action: "I step inside.", text: "She smiles.",
  }]);
  T.renderScenes();
  const you = chipParts(chipRows()[0]);
  assert.equal(you.name.textContent, "Milu");
  assert.equal(you.role.textContent, "You");
  assert.equal(you.face.children[0].tagName, "IMG");
  assert.equal(you.face.children[0].src, "./personas/f1.jpg");
  T.setPlaythroughPersona({ persona_id: null, persona: null });
});

check("a bound persona without a usable image falls back to its initial", () => {
  T.setBook(testBook());
  T.setPlaythroughPersona({
    persona_id: "p2",
    persona: { id: "p2", name: "No Photo", image_id: "nope" },
  });
  T.setScenes([{
    turn: 5, action: "I wait.", text: "Nothing happens.",
  }]);
  T.renderScenes();
  const you = chipParts(chipRows()[0]);
  assert.equal(you.name.textContent, "No");
  assert.equal(
    you.face.children[0].classList.contains("speaker-chip-initial"), true);
  assert.equal(you.face.children[0].textContent, "N");
  assert.equal(
    you.face.children.filter((n) => n.tagName === "IMG").length, 0);
  T.setPlaythroughPersona({ persona_id: null, persona: null });
});

/* --- M5c: scene index drawer --- */
function drawerRows() {
  return document.getElementById("scene-drawer-list").children;
}
function drawerRowText(row) {
  return row.children.map((c) => c.textContent).join(" ");
}

check("scene drawer lists one row per scene in story order", () => {
  T.setScenes([
    { turn: 0, text: "Kim knocks on the cedar door, soaked through." },
    { turn: 1, action: "I step inside.", text: "Candles first, then Accad." },
    { turn: 2, action: "I sit down.", text: "The room settles." },
  ]);
  T.renderScenes();
  const rows = drawerRows();
  assert.equal(rows.length, 3);
  assert.equal(rows[0].getAttribute("data-testid"), "scene-drawer-row-0");
  assert.equal(rows[1].getAttribute("data-testid"), "scene-drawer-row-1");
  assert.equal(rows[2].getAttribute("data-testid"), "scene-drawer-row-2");
  assert.ok(drawerRowText(rows[0]).startsWith("Scene 1"));
  assert.ok(drawerRowText(rows[2]).startsWith("Scene 3"));
  assert.equal(document.getElementById("scene-drawer-empty").hidden, true);
});

check("a scene with an action shows the italic You line", () => {
  const rows = drawerRows();
  const excerpt = rows[1].children[1];
  assert.equal(excerpt.textContent, "You: I step inside.");
  assert.equal(excerpt.classList.contains("scene-drawer-row-you"), true);
});

check("a scene without an action shows its opening line, capped", () => {
  const rows = drawerRows();
  assert.equal(rows[0].children[1].textContent,
    "Kim knocks on the cedar door, soaked through.");
  T.setScenes([{
    turn: 0,
    text: "The rain had been falling since dawn and the whole valley smelled of wet pine and smoke.",
  }]);
  T.renderScenes();
  const capped = drawerRows()[0].children[1].textContent;
  assert.ok(capped.endsWith("…"));
  assert.ok(capped.length <= 61);
  assert.ok(capped.startsWith("The rain had been falling"));
});

check("the last scene's row is marked current", () => {
  T.setScenes([
    { turn: 0, text: "One." },
    { turn: 1, text: "Two." },
    { turn: 2, text: "Three." },
  ]);
  T.renderScenes();
  const rows = drawerRows();
  assert.equal(rows[0].classList.contains("scene-drawer-row-current"), false);
  assert.equal(rows[2].classList.contains("scene-drawer-row-current"), true);
  assert.equal(rows[2].getAttribute("aria-current"), "true");
});

check("scene drawer empty state shows when there are no scenes", () => {
  T.setScenes([]);
  T.renderScenes();
  assert.equal(drawerRows().length, 0);
  assert.equal(document.getElementById("scene-drawer-empty").hidden, false);
});

check("a new turn adds its drawer row on re-render, no reload", () => {
  T.setScenes([
    { turn: 0, text: "One." },
    { turn: 1, text: "Two." },
  ]);
  T.renderScenes();
  assert.equal(drawerRows().length, 2);
  T.setScenes([
    { turn: 0, text: "One." },
    { turn: 1, text: "Two." },
    { turn: 2, text: "Three." },
  ]);
  T.renderScenes();
  assert.equal(drawerRows().length, 3);
  assert.equal(
    drawerRows()[2].classList.contains("scene-drawer-row-current"), true);
});

check("scene drawer opens and closes with its backdrop", () => {
  T.openSceneDrawer();
  assert.equal(document.getElementById("scene-drawer").hidden, false);
  assert.equal(document.getElementById("scene-drawer-backdrop").hidden, false);
  T.closeSceneDrawer();
  assert.equal(document.getElementById("scene-drawer").hidden, true);
  assert.equal(document.getElementById("scene-drawer-backdrop").hidden, true);
});

check("a row tap jumps to that scene and closes the drawer", () => {
  T.setScenes([
    { turn: 0, text: "One." },
    { turn: 1, text: "Two." },
    { turn: 2, text: "Three." },
  ]);
  T.renderScenes();
  T.openSceneDrawer();
  let scrolled = false;
  const target = document.getElementById("scene-1");
  target.scrollIntoView = () => { scrolled = true; };
  const row = drawerRows()[1];
  const click = row._listeners.find((l) => l[0] === "click");
  assert.ok(click, "row carries a click listener");
  click[1]({ target: row });
  assert.equal(scrolled, true);
  assert.equal(target.classList.contains("scene-jump-highlight"), true);
  assert.equal(document.getElementById("scene-drawer").hidden, true);
});

console.log(`\n${passed} checks passed`);
