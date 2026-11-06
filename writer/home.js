/* Home page: Explore — the reader's library as a discovery feed
 * (mobile-app-navigation-design.md §3.2, slices M2b + M2d).
 * Lists the books from GET /api/books as a 2-col card grid with a
 * sticky search bar, sort tabs (Explore / Trending / New / Top),
 * genre chips and a language filter. M2d adds, over the M2c fields
 * (created_at, playthrough_count, latest_playthrough_at,
 * character_names, tags, cover_image): real rankings on the three
 * sort tabs, ranking sections on Explore (top 5 + See all), a
 * Continue strip from the reader's own per-book playthroughs
 * (GET /api/books/{id}/playthroughs — scene_count + preview),
 * real covers when cover_image is set (initial tile otherwise),
 * and playthrough counts as the cards' social proof. Search covers
 * title, genre, subgenre, tone, tags and character names.
 * Feed polish (Nov 6, Hieu's Emochi reference): no panel wrapper,
 * portrait covers with an overlaid plays-count badge, typographic
 * covers for coverless books, and the whole card as one tap target
 * (stretched title link to play; Book details a separate link).
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
/* Section order on Explore follows the sort tabs; the design's
 * "Popular this week" waits on weekly counts the API does not
 * return yet (only latest_playthrough_at + total), so Trending
 * (recently played) is the honest stand-in. Per-genre sections
 * wait until the library is bigger — 4 books over 4 genres today
 * would be one row each. */
const RANKED_LABELS = {
  trending: "Trending",
  new: "New",
  top: "Top",
};
const LANGUAGE_NAMES = { en: "English" };

let allBooks = [];
let continueItems = []; /* [{ book, run }] — run: { id, scene_count, preview, updated_at } */
let continueLoaded = false;
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

function parseDate(value) {
  const t = Date.parse(value || "");
  return Number.isNaN(t) ? null : t;
}

/* Short relative time for "played …" / "added …" meta. Older than
 * a week falls back to a plain date ("Nov 5"). */
function relTime(iso) {
  const t = parseDate(iso);
  if (t === null) return "";
  const diff = Date.now() - t;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d ago";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function dateLabel(iso) {
  const t = parseDate(iso);
  if (t === null) return "";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function playsLabel(count) {
  const n = count || 0;
  return n === 1 ? "1 playthrough" : n + " playthroughs";
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
    (book.tags || []).join(" "),
    (book.character_names || []).join(" "),
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

/* Rankings over the M2c fields. Missing values sort last on every
 * sort (a book with no playthroughs yet is never first). */
function rankedBooks(sort, books) {
  const list = [...books];
  const time = (book, field) => parseDate(book[field]) ?? -Infinity;
  const plays = (book) => book.playthrough_count || 0;
  if (sort === "trending") {
    /* Most recently played first; ties break on total plays. */
    list.sort(
      (a, b) =>
        time(b, "latest_playthrough_at") - time(a, "latest_playthrough_at") ||
        plays(b) - plays(a),
    );
  } else if (sort === "new") {
    list.sort((a, b) => time(b, "created_at") - time(a, "created_at"));
  } else if (sort === "top") {
    /* Most played first; ties break on most recently played. */
    list.sort(
      (a, b) =>
        plays(b) - plays(a) ||
        time(b, "latest_playthrough_at") - time(a, "latest_playthrough_at"),
    );
  }
  return list;
}

/* Discovery mode: Explore tab with no search or filter active.
 * The Continue strip and the ranking sections are discovery, not
 * search results — they hide while the reader is filtering. */
function discoveryMode() {
  return (
    activeSort === "explore" &&
    query.trim() === "" &&
    activeGenre === "" &&
    activeLanguage === ""
  );
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

/* Compact count for the cover plays badge: 32, 1.2K, 12.2M —
 * the discovery-feed convention (Emochi shows raw chat counts). */
function fmtCount(n) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n || 0);
}

/* "New" means added within the last 7 days. */
function isNewBook(book) {
  const t = parseDate(book.created_at);
  return t !== null && Date.now() - t < 7 * 24 * 3600 * 1000;
}

/* Cover: the real cover_image when the API returns one. Without
 * one (every book today), the grid card gets a designed typographic
 * cover — genre in small caps, the title set in the heading font,
 * a "with <characters>" line — instead of a bare letter tile; the
 * small thumbs (Continue strip, ranking rows) keep the initial. */
function coverThumb(book, className, variant) {
  const cover = document.createElement("div");
  cover.className = className;
  if (book.cover_image) {
    const img = document.createElement("img");
    img.className = "explore-cover-img";
    img.src = book.cover_image;
    img.alt = "";
    cover.append(img);
    return cover;
  }
  cover.setAttribute("aria-hidden", "true");
  if (variant === "art") {
    const art = document.createElement("div");
    art.className = "explore-cover-art";
    const genre = (book.style && book.style.genre) || "";
    if (genre) {
      const g = document.createElement("span");
      g.className = "explore-cover-art-genre";
      g.textContent = genre;
      art.append(g);
    }
    const t = document.createElement("span");
    t.className = "explore-cover-art-title";
    t.textContent = book.title || "Untitled book";
    art.append(t);
    const names = book.character_names || [];
    if (names.length > 0) {
      const w = document.createElement("span");
      w.className = "explore-cover-art-with";
      w.textContent = "with " + names.slice(0, 2).join(" & ");
      art.append(w);
    }
    cover.append(art);
    return cover;
  }
  const initial = document.createElement("span");
  initial.className = "explore-cover-initial";
  initial.textContent = (book.title || "?").trim().charAt(0).toUpperCase() || "?";
  cover.append(initial);
  return cover;
}

/* Chat-bubble glyph for the plays badge (their count pill). */
function playsBadge(book) {
  const badge = document.createElement("span");
  badge.className = "explore-plays";
  badge.setAttribute("aria-label", playsLabel(book.playthrough_count));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  const count = document.createElement("span");
  count.textContent = fmtCount(book.playthrough_count);
  badge.append(svg, count);
  return badge;
}

function renderCard(book) {
  const card = document.createElement("article");
  card.className = "explore-card";
  const cover = coverThumb(book, "explore-cover", "art");
  if (isNewBook(book)) {
    const pill = document.createElement("span");
    pill.className = "explore-new";
    pill.textContent = "New";
    cover.append(pill);
  }
  /* Social proof rides on the cover as a count badge (saves do
   * not exist yet — M3), not as a text line in the body. */
  if ((book.playthrough_count || 0) > 0) cover.append(playsBadge(book));
  card.append(cover);
  const body = document.createElement("div");
  body.className = "explore-card-body";
  const title = document.createElement("h2");
  title.className = "card-title explore-card-title";
  /* The title link stretches over the whole card (::after), so
   * the cover, title and description are one tap target that
   * opens the story; Book details stays a separate small link. */
  const link = document.createElement("a");
  link.className = "explore-card-link";
  link.href = "./play.html?id=" + encodeURIComponent(book.id);
  link.textContent = book.title || "Untitled book";
  title.append(link);
  body.append(title);
  const premise = document.createElement("p");
  premise.className = "book-premise explore-hook";
  premise.textContent = premiseOf(book);
  body.append(premise);
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
  const detailsRow = document.createElement("p");
  detailsRow.className = "explore-details-row";
  const details = document.createElement("a");
  details.className = "explore-details";
  details.href = "./book.html?id=" + encodeURIComponent(book.id);
  details.textContent = "Book details ›";
  detailsRow.append(details);
  body.append(detailsRow);
  card.append(body);
  return card;
}

function renderContinue() {
  const box = el("explore-continue");
  const cards = el("explore-continue-cards");
  cards.innerHTML = "";
  if (!discoveryMode() || !continueLoaded || continueItems.length === 0) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  for (const { book, run } of continueItems) {
    const card = document.createElement("article");
    card.className = "explore-continue-card";
    card.append(coverThumb(book, "explore-continue-thumb"));
    const body = document.createElement("div");
    body.className = "explore-continue-body";
    const title = document.createElement("h3");
    title.className = "explore-continue-title";
    title.textContent = book.title || "Untitled book";
    const scene = document.createElement("p");
    scene.className = "explore-continue-scene";
    scene.textContent = "Continue — Scene " + run.scene_count;
    body.append(title, scene);
    /* Preview is the last scene's text (the summary has no diary
     * line); labelled as the scene, never as a diary entry. */
    if (run.preview) {
      const preview = document.createElement("p");
      preview.className = "explore-continue-preview";
      preview.textContent = run.preview;
      body.append(preview);
    }
    const button = document.createElement("a");
    button.className = "btn btn-primary explore-continue-btn";
    /* play.html resumes the reader's latest run for this book
     * (GET /api/books/{id}/playthroughs), so no new URL scheme. */
    button.href = "./play.html?id=" + encodeURIComponent(book.id);
    button.textContent = "Continue";
    body.append(button);
    card.append(body);
    cards.append(card);
  }
}

function rankMeta(book, sort) {
  if (sort === "trending") {
    const played = relTime(book.latest_playthrough_at);
    return playsLabel(book.playthrough_count) +
      (played ? " · played " + played : "");
  }
  if (sort === "new") {
    const added = dateLabel(book.created_at);
    return added ? "Added " + added : "";
  }
  const played = relTime(book.latest_playthrough_at);
  return playsLabel(book.playthrough_count) +
    (played ? " · last played " + played : "");
}

function rankRow(book, rank, sort) {
  const row = document.createElement("article");
  row.className = "explore-rank-row";
  const num = document.createElement("span");
  num.className = "explore-rank-num";
  num.textContent = String(rank);
  row.append(num);
  row.append(coverThumb(book, "explore-rank-thumb"));
  const body = document.createElement("div");
  body.className = "explore-rank-body";
  const title = document.createElement("a");
  title.className = "explore-rank-title";
  title.href = "./play.html?id=" + encodeURIComponent(book.id);
  title.textContent = book.title || "Untitled book";
  const meta = document.createElement("p");
  meta.className = "explore-meta explore-rank-meta";
  meta.textContent = rankMeta(book, sort);
  const hook = document.createElement("p");
  hook.className = "book-premise explore-rank-hook";
  hook.textContent = premiseOf(book);
  body.append(title, meta, hook);
  row.append(body);
  return row;
}

function renderSections() {
  const box = el("explore-sections");
  const heading = el("explore-all-heading");
  box.innerHTML = "";
  if (!discoveryMode() || allBooks.length === 0) {
    box.hidden = true;
    heading.hidden = true;
    return;
  }
  box.hidden = false;
  heading.hidden = false;
  for (const sort of ["trending", "new", "top"]) {
    const ranked = rankedBooks(sort, allBooks).slice(0, 5);
    if (ranked.length === 0) continue;
    const section = document.createElement("section");
    section.className = "explore-section";
    section.setAttribute("aria-label", RANKED_LABELS[sort]);
    const head = document.createElement("div");
    head.className = "explore-section-head";
    const title = document.createElement("h2");
    title.className = "explore-section-title";
    title.textContent = RANKED_LABELS[sort];
    const see = document.createElement("button");
    see.type = "button";
    see.className = "btn btn-ghost explore-see-all";
    see.textContent = "See all";
    see.addEventListener("click", () => {
      setSort(sort);
      el("explore-search").focus();
    });
    head.append(title, see);
    section.append(head);
    ranked.forEach((book, i) => section.append(rankRow(book, i + 1, sort)));
    box.append(section);
  }
}

function renderExplore() {
  renderTabs();
  renderGenres();
  renderLanguages();
  renderRecent();
  const grid = el("library-grid");
  const noResults = el("explore-no-results");
  const empty = el("library-empty");
  const count = el("explore-count");
  const clearBtn = el("explore-search-clear");
  clearBtn.hidden = query.trim() === "";
  grid.innerHTML = "";
  noResults.hidden = true;
  empty.hidden = true;
  const books =
    activeSort === "explore"
      ? filteredBooks()
      : rankedBooks(activeSort, filteredBooks());
  const total = allBooks.length;
  empty.hidden = total > 0;
  if (total === 0) {
    count.textContent = "";
    renderContinue();
    renderSections();
    return;
  }
  if (books.length === 0) {
    const q = query.trim();
    noResults.textContent = q
      ? `No books match "${q}". Try a title, a genre, a character name, or a tone word — or clear the search to see all ${total} books.`
      : "No books match the selected filters. Clear a filter to see all books.";
    noResults.hidden = false;
    count.textContent = `0 of ${total} book${total === 1 ? "" : "s"}`;
    renderContinue();
    renderSections();
    return;
  }
  for (const book of books) grid.append(renderCard(book));
  count.textContent =
    books.length === total
      ? `${total} book${total === 1 ? "" : "s"}`
      : `${books.length} of ${total} book${total === 1 ? "" : "s"}`;
  renderContinue();
  renderSections();
}

function setSort(sort) {
  if (!SORTS.includes(sort) || sort === activeSort) return;
  activeSort = sort;
  renderExplore();
}

/* Continue strip: the reader's own in-progress runs, one list call
 * per book. Any failure (401, 404, network) just hides the strip —
 * the grid never waits on it. Runs with no scenes are not
 * in-progress and are skipped. */
async function loadContinue() {
  const jobs = allBooks.map(async (book) => {
    try {
      const data = await apiFetch(
        "/api/books/" + encodeURIComponent(book.id) + "/playthroughs",
      );
      const runs = (data && data.playthroughs) || [];
      const run = runs.find((r) => (r.scene_count || 0) >= 1);
      return run ? { book, run } : null;
    } catch {
      return null;
    }
  });
  const found = (await Promise.all(jobs)).filter(Boolean);
  found.sort(
    (a, b) =>
      (parseDate(b.run.updated_at) ?? -Infinity) -
      (parseDate(a.run.updated_at) ?? -Infinity),
  );
  continueItems = found;
  continueLoaded = true;
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
    loadContinue();
  } catch (err) {
    el("library-error").textContent = friendlyError(err);
    el("library-error").hidden = false;
  }
}

init();
