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
  querySelector() { return null; },
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

console.log(`\n${passed} checks passed`);
