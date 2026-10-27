/* Home page: the reader's library. Lists the books from
 * GET /api/books as cards (title, genre, premise, Play / Open
 * book). No internal identifiers or session debug data reach the
 * UI. Signed-out users see the sign-in state, never a wrong user. */

import { apiFetch } from "./js/app-api.js";
import { getToken, getMe, clearToken } from "./js/app-auth.js";
import { renderTopbar, friendlyError } from "./js/app-ui.js";

const el = (id) => document.getElementById(id);

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

function renderBooks(books) {
  const grid = el("library-grid");
  grid.innerHTML = "";
  el("library-empty").hidden = books.length > 0;
  for (const book of books) {
    const card = document.createElement("article");
    card.className = "card book-card-item";
    const body = document.createElement("div");
    body.className = "card-body";
    const title = document.createElement("h2");
    title.className = "card-title";
    title.textContent = book.title || "Untitled book";
    body.append(title);
    const genre = (book.style && book.style.genre) || book.language || "";
    if (genre) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = genre;
      body.append(badge);
    }
    const premise = document.createElement("p");
    premise.className = "book-premise";
    premise.textContent = premiseOf(book);
    body.append(premise);
    const actions = document.createElement("div");
    actions.className = "book-card-actions";
    const play = document.createElement("a");
    play.className = "btn btn-primary";
    play.href = "./play.html?id=" + encodeURIComponent(book.id);
    play.textContent = "Play";
    const open = document.createElement("a");
    open.className = "btn btn-secondary";
    open.href = "./book.html?id=" + encodeURIComponent(book.id);
    open.textContent = "Open book";
    actions.append(play, open);
    body.append(actions);
    card.append(body);
    grid.append(card);
  }
}

async function init() {
  renderTopbar();
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
  try {
    const books = await apiFetch("/api/books");
    renderBooks(Array.isArray(books) ? books : []);
  } catch (err) {
    el("library-error").textContent = friendlyError(err);
    el("library-error").hidden = false;
  }
}

init();
