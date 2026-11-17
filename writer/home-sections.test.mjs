/* Fake-DOM harness for the Explore thin-catalog slice (todo L51,
 * guest review 2026-11-16), run on the REAL writer/home.js
 * (node writer/home-sections.test.mjs).
 *
 * While the catalog has one book, Trending / New / Top collapse
 * into a single section instead of repeating the same book in
 * all three; the three titled sections return when the catalog
 * grows. No browser, no network: init() takes the signed-out
 * path (no token in the stubbed storage) and the tests drive
 * renderSections through the __homeTest handle.
 *
 * The dev backend catalog holds 12 books (1 real + 11 smoke
 * tests), so the collapse cannot be seen live on dev — the
 * harness is the proof for the one-book case, and the live
 * render check covers the multi-book case (no regression).
 *
 * Fake DOM copied from writer/play-thought.test.mjs (same
 * minimal model: only what home.js + its imports touch). */

import assert from "node:assert/strict";

/* --- Minimal fake DOM --- */
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
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(...args) { this._listeners.push(args); }
  focus() {}
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
globalThis.location = { search: "", hostname: "localhost" };
globalThis.window = globalThis;
globalThis.fetch = () => Promise.reject(new Error("no network in harness"));
globalThis.document = {
  body: new FakeNode("body"),
  documentElement: new FakeNode("html"),
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
  createElementNS(_ns, tag) { return new FakeNode(tag); },
  createTextNode(text) { return new FakeText(text); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
};

const home = await import("./home.js");
// init() runs on import and takes the signed-out path (no token);
// let its microtasks settle before driving renders.
await new Promise((r) => setTimeout(r, 20));
const T = home.__homeTest;

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log("ok - " + name);
}

function book(id, overrides = {}) {
  return {
    id,
    title: "Book " + id,
    language: "en",
    style: { genre: "Romance", tone: "warm" },
    character_names: ["Kim"],
    tags: ["romance"],
    cover_image: null,
    main_character_image: null,
    hook_line: "A hook for " + id + ".",
    playthrough_count: 3,
    latest_playthrough_at: "2026-11-16T10:00:00.000Z",
    created_at: "2026-11-10T04:04:24.000Z",
    ...overrides,
  };
}

/* Walk a fake node tree, collecting elements whose class list
 * contains `name`. */
function findAll(root, name) {
  const out = [];
  (function walk(node) {
    if (node.nodeType === 1 && node.classList.contains(name)) out.push(node);
    for (const child of node.childNodes || []) walk(child);
  })(root);
  return out;
}

function sections() {
  return T.sectionsBox().children.filter(
    (c) => c.classList.contains("explore-section"));
}

/* --- one book: a single headless section --- */
check("one book renders exactly one section", () => {
  T.setCatalog([book("accad-kim")]);
  T.renderSections();
  assert.equal(T.sectionsBox().hidden, false);
  assert.equal(T.sectionsHeading().hidden, false);
  assert.equal(sections().length, 1);
});

check("one-book section has no title head and no See all", () => {
  T.setCatalog([book("accad-kim")]);
  T.renderSections();
  const [section] = sections();
  assert.equal(findAll(section, "explore-section-head").length, 0);
  assert.equal(findAll(section, "explore-section-title").length, 0);
  assert.equal(findAll(section, "explore-see-all").length, 0);
});

check("one-book section still shows the book once", () => {
  T.setCatalog([book("accad-kim")]);
  T.renderSections();
  const [section] = sections();
  const rows = findAll(section, "explore-rank-row");
  assert.equal(rows.length, 1);
  assert.equal(findAll(section, "explore-rank-title")[0].textContent,
    "Book accad-kim");
  assert.equal(section.getAttribute("aria-label"), "Trending");
});

/* --- two books: the three titled sections return --- */
check("two books restore Trending / New / Top sections", () => {
  T.setCatalog([book("a"), book("b", { playthrough_count: 9 })]);
  T.renderSections();
  assert.equal(sections().length, 3);
  const titles = sections().map(
    (s) => findAll(s, "explore-section-title")[0].textContent);
  assert.deepEqual(titles, ["Trending", "New", "Top"]);
});

check("restored sections each carry See all and both books", () => {
  T.setCatalog([book("a"), book("b", { playthrough_count: 9 })]);
  T.renderSections();
  for (const section of sections()) {
    assert.equal(findAll(section, "explore-see-all").length, 1);
    assert.equal(findAll(section, "explore-rank-row").length, 2);
  }
});

/* --- empty + filtered: sections stay hidden --- */
check("empty catalog hides the sections", () => {
  T.setCatalog([]);
  T.renderSections();
  assert.equal(T.sectionsBox().hidden, true);
  assert.equal(T.sectionsHeading().hidden, true);
  assert.equal(sections().length, 0);
});

check("one book with a search active hides the sections", () => {
  T.setCatalog([book("accad-kim")]);
  T.setQuery("kim");
  T.renderSections();
  assert.equal(T.sectionsBox().hidden, true);
  assert.equal(sections().length, 0);
});

console.log(`${passed} passed`);
