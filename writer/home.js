/* Home page: Explore — the reader's library as a discovery feed
 * (mobile-app-navigation-design.md §3.2, slice M2b, client-only).
 * Lists the books from GET /api/books as a 2-col card grid with a
 * sticky search bar, sort tabs (Explore / Trending / New / Top),
 * genre chips and a language filter. Search covers title, genre,
 * subgenre and tone — the only fields /api/books returns today
 * (no opening hook, tags, character names, covers, counts or
 * dates yet). The ranked sorts need that backend data (M2c), so
 * until it lands they show an honest empty state instead of a
 * fake ordering; M2d adds the ranking sections + Continue strip.
 * No internal identifiers or session debug data reach the UI.
 * Signed-out users see the sign-in state, never a wrong user. */

import { apiFetch } from "./js/app-api.js";
import { getToken, getMe, clearToken } from "./js/app-auth.js";
import { renderTopbar, friendlyError } from "./js/app-ui.js";
import { renderShell } from "./js/shell.js";

const el = (id) => document.getElementById(id);

const SORTS = ["explore", "trending", "new", "top"];
const RECENT_KEY = "explore_recent_searches";
const MAX_RECENT = 5;
/* Rankings need fields /api/books does not return yet (M2c):
 * playthroughs + saves for Trending/Top, created_at for New. */
const RANKED_COPY = {
  trending: {
    title: "Trending is coming soon",
    text: "Trending ranks books by recent playthroughs, and the library API doesn't return playthrough counts yet. The backend slice (M2c) adds them — until then, Explore shows every book.",
  },
  new: {
    title: "New is coming soon",
    text: "New sorts books by the date they were added, and the library API doesn't return dates yet. The backend slice (M2c) adds them — until then, Explore shows every book.",
  },
  top: {
    title: "Top is coming soon",
    text: "Top ranks books by saves and total playthroughs, and the library API doesn't return those counts yet. The backend slice (M2c) adds them — until then, Explore shows every book.",
  },
};
const LANGUAGE_NAMES = { en: "English" };

let allBooks = [];
let activeSort = "explore";
let activeGenre = "";
let activeLanguage = "";
let query = "";

function show(state, note) {
  el("state-loading").hidden = state !== "loading";
  el("state-in").hidden = state !== "in";
  el("state-out").hidden = state !== "out";
  if (state === "out" && note) {
    el("out-note").textContent = note;
    el("out-note").hidden = false;
  }
}

function premiseOf(book) {
  const text = (book.opening_scene || "").trim();
  if (!text) return (book.style && book.style.tone) || "";
  return text.length > 160 ? text.slice(0, 157).trimEnd() + "..." : text;
}

function tagsOf(book) {
  const tags = [];
  if (book.style && book.style.genre) tags.push(book.style.genre);
  if (book.style && book.style.subgenre) tags.push(book.style.subgenre);
  return tags.slice(0, 2);
}

function bookSearchText(book) {
  return [
    book.title,
    book.style && book.style.genre,
    book.style && book.style.subgenre,
    book.style && book.style.tone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filteredBooks() {
  const q = query.trim().toLowerCase();
  return allBooks.filter((book) => {
    if (activeGenre) {
      const genre = (book.style && book.style.genre) || "";
      if (genre.toLowerCase() !== activeGenre.toLowerCase()) return false;
    }
    if (activeLanguage && book.language !== activeLanguage) return false;
    if (q && !bookSearchText(book).includes(q)) return false;
    return true;
  });
}

function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(term) {
  const clean = term.trim();
  if (!clean) return;
  try {
    const list = loadRecent().filter(
      (s) => s.toLowerCase() !== clean.toLowerCase(),
    );
    list.unshift(clean);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* Private mode or blocked storage: recents just don't persist. */
  }
}

function renderRecent() {
  const box = el("explore-recent");
  const chips = el("explore-recent-chips");
  chips.innerHTML = "";
  const recents = loadRecent();
  if (query.trim() || recents.length === 0) {
    box.hidden = true;
    return;
  }
  for (const term of recents) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "explore-chip";
    chip.textContent = term;
    chip.addEventListener("click", () => {
      el("explore-search").value = term;
      query = term;
      renderExplore();
      el("explore-search").focus();
    });
    chips.append(chip);
  }
  box.hidden = false;
}

function renderGenres() {
  const box = el("explore-genres");
  box.innerHTML = "";
  const genres = [...new Set(
    allBooks.map((b) => (b.style && b.style.genre) || "").filter(Boolean),
  )].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const all = document.createElement("button");
  all.type = "button";
  all.className = "explore-chip" + (activeGenre === "" ? " explore-chip-active" : "");
  all.textContent = "All";
  all.setAttribute("aria-pressed", activeGenre === "" ? "true" : "false");
  all.addEventListener("click", () => {
    activeGenre = "";
    renderExplore();
  });
  box.append(all);
  for (const genre of genres) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "explore-chip" + (activeGenre === genre ? " explore-chip-active" : "");
    chip.textContent = genre;
    chip.setAttribute("aria-pressed", activeGenre === genre ? "true" : "false");
    chip.addEventListener("click", () => {
      activeGenre = activeGenre === genre ? "" : genre;
      renderExplore();
    });
    box.append(chip);
  }
}

function renderLanguages() {
  const select = el("explore-language");
  const current = select.querySelectorAll("option");
  current.forEach((opt) => {
    if (opt.value !== "") opt.remove();
  });
  const langs = [...new Set(allBooks.map((b) => b.language).filter(Boolean))].sort();
  for (const lang of langs) {
    const opt = document.createElement("option");
    opt.value = lang;
    opt.textContent = LANGUAGE_NAMES[lang] || lang;
    select.append(opt);
  }
  select.value = activeLanguage;
}

function renderTabs() {
  const tabs = el("explore-tabs").querySelectorAll("[role='tab']");
  tabs.forEach((tab) => {
    const isActive = tab.dataset.sort === activeSort;
    tab.classList.toggle("explore-tab-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.tabIndex = isActive ? 0 : -1;
  });
}

function renderCard(book) {
  const card = document.createElement("article");
  card.className = "card explore-card";
  /* Cover placeholder: no cover/beat image comes back from
   * /api/books yet (M2c/M2d). A neutral tile with the title
   * initial, never a fake cover. */
  const cover = document.createElement("div");
  cover.className = "explore-cover";
  cover.setAttribute("aria-hidden", "true");
  const initial = document.createElement("span");
  initial.textContent = (book.title || "?").trim().charAt(0).toUpperCase() || "?";
  cover.append(initial);
  card.append(cover);
  const body = document.createElement("div");
  body.className = "card-body explore-card-body";
  const title = document.createElement("h2");
  title.className = "card-title explore-card-title";
  title.textContent = book.title || "Untitled book";
  body.append(title);
  const tags = tagsOf(book);
  if (tags.length > 0) {
    const tagRow = document.createElement("p");
    tagRow.className = "explore-tags";
    for (const tag of tags) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = tag;
      tagRow.append(badge);
    }
    body.append(tagRow);
  }
  const premise = document.createElement("p");
  premise.className = "book-premise explore-hook";
  premise.textContent = premiseOf(book);
  body.append(premise);
  const actions = document.createElement("div");
  actions.className = "book-card-actions explore-card-actions";
  const play = document.createElement("a");
  play.className = "btn btn-primary btn-block";
  play.href = "./play.html?id=" + encodeURIComponent(book.id);
  play.textContent = "Play";
  const open = document.createElement("a");
  open.className = "btn btn-secondary btn-block";
  open.href = "./book.html?id=" + encodeURIComponent(book.id);
  open.textContent = "Open book";
  actions.append(play, open);
  body.append(actions);
  card.append(body);
  return card;
}

function renderExplore() {
  renderTabs();
  renderGenres();
  renderLanguages();
  renderRecent();
  const grid = el("library-grid");
  const ranked = el("explore-ranked-empty");
  const noResults = el("explore-no-results");
  const empty = el("library-empty");
  const count = el("explore-count");
  const clearBtn = el("explore-search-clear");
  clearBtn.hidden = query.trim() === "";
  grid.innerHTML = "";
  ranked.hidden = true;
  noResults.hidden = true;
  empty.hidden = true;
  if (activeSort !== "explore") {
    /* No ranking data exists yet: say so, don't fake an order. */
    const copy = RANKED_COPY[activeSort];
    el("explore-ranked-title").textContent = copy.title;
    el("explore-ranked-text").textContent = copy.text;
    ranked.hidden = false;
    count.textContent = "";
    return;
  }
  const books = filteredBooks();
  const total = allBooks.length;
  empty.hidden = total > 0;
  if (total === 0) {
    count.textContent = "";
    return;
  }
  if (books.length === 0) {
    const q = query.trim();
    noResults.textContent = q
      ? `No books match "${q}". Try a title, a genre, or a tone word — or clear the search to see all ${total} books.`
      : "No books match the selected filters. Clear a filter to see all books.";
    noResults.hidden = false;
    count.textContent = `0 of ${total} book${total === 1 ? "" : "s"}`;
    return;
  }
  for (const book of books) grid.append(renderCard(book));
  count.textContent =
    books.length === total
      ? `${total} book${total === 1 ? "" : "s"}`
      : `${books.length} of ${total} book${total === 1 ? "" : "s"}`;
}

function setSort(sort) {
  if (!SORTS.includes(sort) || sort === activeSort) return;
  activeSort = sort;
  renderExplore();
}

function bindExplore() {
  const search = el("explore-search");
  search.addEventListener("input", () => {
    query = search.value;
    renderExplore();
  });
  search.addEventListener("change", () => saveRecent(search.value));
  search.addEventListener("focus", () => renderRecent());
  search.addEventListener("blur", () => {
    /* Let a recent-chip tap land before hiding the row. */
    setTimeout(() => renderRecent(), 150);
  });
  el("explore-search-clear").addEventListener("click", () => {
    search.value = "";
    query = "";
    renderExplore();
    search.focus();
  });
  el("explore-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[role='tab']");
    if (tab) setSort(tab.dataset.sort);
  });
  el("explore-tabs").addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const tabs = [...el("explore-tabs").querySelectorAll("[role='tab']")];
    const i = tabs.findIndex((t) => t.dataset.sort === activeSort);
    const next = event.key === "ArrowRight"
      ? tabs[(i + 1) % tabs.length]
      : tabs[(i - 1 + tabs.length) % tabs.length];
    event.preventDefault();
    setSort(next.dataset.sort);
    next.focus();
  });
  el("explore-language").addEventListener("change", (event) => {
    activeLanguage = event.target.value;
    renderExplore();
  });
  el("explore-ranked-back").addEventListener("click", () => {
    setSort("explore");
    el("explore-search").focus();
  });
}

async function init() {
  renderTopbar();
  renderShell({ active: "explore" });
  if (!getToken()) {
    show("out");
    return;
  }
  let me;
  try {
    me = await getMe();
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      show("out");
    } else {
      show("out", friendlyError(err));
    }
    return;
  }
  if (me && me.email) {
    el("welcome").textContent = "Signed in as " + me.email;
    el("welcome").hidden = false;
  }
  show("in");
  bindExplore();
  try {
    const data = await apiFetch("/api/books");
    allBooks = Array.isArray(data) ? data : (data && data.books) || [];
    renderExplore();
  } catch (err) {
    el("library-error").textContent = friendlyError(err);
    el("library-error").hidden = false;
  }
}

init();
