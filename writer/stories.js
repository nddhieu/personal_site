/* My Stories page: the reader's in-progress runs as a chat-style
 * list (Hieu's Emochi Chats reference, Nov 6): one row per book
 * with a run to resume — cover avatar, book title, the last
 * scene's preview, and a short timestamp. Tapping a row opens
 * the play page, which resumes the reader's run for that book.
 *
 * This is where "pick up where you left off" lives now; the
 * Explore page no longer carries the Continue strip.
 *
 * Data: GET /api/books, then one GET /api/books/{id}/playthroughs
 * per book (scene_count + preview + updated_at), the same calls
 * the old Explore strip made. A book whose call fails is simply
 * skipped; runs with no scenes are not in progress. Rows sort
 * most recently played first. Signed-out users see the sign-in
 * state, never a wrong user. */

import { apiFetch } from "./js/app-api.js";
import { getToken, getMe, clearToken } from "./js/app-auth.js";
import { renderTopbar, friendlyError } from "./js/app-ui.js";
import { renderShell } from "./js/shell.js";

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

function parseDate(value) {
  const t = Date.parse(value || "");
  return Number.isNaN(t) ? null : t;
}

/* Emochi-style short timestamp: "7h", "12h", then a plain
 * month/day ("10/27") once a week has passed. */
function fmtTime(iso) {
  const t = parseDate(iso);
  if (t === null) return "";
  const diff = Date.now() - t;
  if (diff < 0) return "now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return "now";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d";
  const d = new Date(t);
  return d.getMonth() + 1 + "/" + d.getDate();
}

/* Round cover avatar: the book's cover photo when it has one,
 * else its initial on the secondary background. */
function avatar(book) {
  const wrap = document.createElement("span");
  wrap.className = "story-avatar";
  wrap.setAttribute("aria-hidden", "true");
  if (book.cover_image) {
    const img = document.createElement("img");
    img.className = "story-avatar-img";
    img.src = book.cover_image;
    img.alt = "";
    wrap.append(img);
    return wrap;
  }
  const initial = document.createElement("span");
  initial.className = "story-avatar-initial";
  initial.textContent =
    (book.title || "?").trim().charAt(0).toUpperCase() || "?";
  wrap.append(initial);
  return wrap;
}

function renderRow(book, run) {
  const li = document.createElement("li");
  const row = document.createElement("a");
  row.className = "story-row";
  row.href = "./play.html?id=" + encodeURIComponent(book.id);
  row.append(avatar(book));
  const body = document.createElement("span");
  body.className = "story-row-body";
  const head = document.createElement("span");
  head.className = "story-row-head";
  const title = document.createElement("span");
  title.className = "story-row-title";
  title.textContent = book.title || "Untitled book";
  const time = document.createElement("span");
  time.className = "story-row-time";
  time.textContent = fmtTime(run.updated_at);
  head.append(title, time);
  body.append(head);
  /* Preview line: the last scene, prefixed with its scene
   * number so the row also says how far in the reader is. */
  const preview = document.createElement("span");
  preview.className = "story-row-preview";
  const sceneText = "Scene " + (run.scene_count || 0);
  preview.textContent = run.preview
    ? sceneText + " · " + run.preview
    : sceneText;
  body.append(preview);
  row.append(body);
  li.append(row);
  return li;
}

async function loadStories() {
  const data = await apiFetch("/api/books");
  const books = Array.isArray(data) ? data : (data && data.books) || [];
  const jobs = books.map(async (book) => {
    try {
      const runsData = await apiFetch(
        "/api/books/" + encodeURIComponent(book.id) + "/playthroughs",
      );
      const runs = (runsData && runsData.playthroughs) || [];
      const run = runs.find((r) => (r.scene_count || 0) >= 1);
      return run ? { book, run } : null;
    } catch {
      return null;
    }
  });
  const items = (await Promise.all(jobs)).filter(Boolean);
  items.sort(
    (a, b) =>
      (parseDate(b.run.updated_at) ?? -Infinity) -
      (parseDate(a.run.updated_at) ?? -Infinity),
  );
  const list = el("story-list");
  list.innerHTML = "";
  for (const { book, run } of items) {
    list.append(renderRow(book, run));
  }
  el("stories-empty").hidden = items.length > 0;
}

async function init() {
  renderTopbar();
  renderShell({ active: "my-stories" });
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
    await loadStories();
  } catch (err) {
    el("stories-error").textContent = friendlyError(err);
    el("stories-error").hidden = false;
  }
}

init();
