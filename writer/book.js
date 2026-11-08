/* Book page: display + update one book definition.
 *
 * Loads GET /api/books/{id}, renders the fields the card names
 * (world, main character, style, language), and saves edits with
 * PUT /api/books/{id} - the page sends the full definition back
 * with the edited fields in place, so untouched fields survive
 * by construction. Join navigates to the play screen. */

import { apiFetch, API_BASE } from "./js/app-api.js";
import { getToken, clearToken } from "./js/app-auth.js";
import { renderTopbar, friendlyError } from "./js/app-ui.js";
import { renderShell } from "./js/shell.js";

const BOOK_ID = new URLSearchParams(location.search).get("id") || "accad-kim";

const el = (id) => document.getElementById(id);
let current = null;

function setStatusError(msg) {
  const status = el("book-status");
  status.innerHTML = "";
  status.className = "form-error";
  status.setAttribute("role", "alert");
  status.textContent = msg;
  status.hidden = false;
}

/* Book-image fields resolve in two shapes (same rule as
 * play.js): writer-relative paths for statically hosted art
 * ("characters/<id>.jpg") and API-relative paths for the
 * portraits the backend generates at book-creation time
 * ("api/books/<id>/main-character-image"). */
function resolveBookImageUrl(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  return v.startsWith("api/") ? API_BASE + "/" + v : v;
}

/* One locked character's presentation row: round avatar
 * (the portrait when one is attached, the name's initial
 * until then), name, and a one-line trait from the sheet.
 * The .char-avatar markup + class is the seam the reading
 * view's Character rows reuse (Milu) - keep it standalone. */
function fillCharRow(prefix, entry, imageValue) {
  const avatar = el(prefix + "-avatar");
  avatar.innerHTML = "";
  const url = resolveBookImageUrl(imageValue);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    avatar.appendChild(img);
  } else {
    avatar.textContent = (entry.name || "?").trim().charAt(0) || "?";
  }
  el(prefix + "-name").textContent = entry.name || "";
  const sheet = entry.sheet || {};
  const traits = (sheet.traits || []).filter(Boolean);
  el(prefix + "-trait").textContent =
    traits.length ? traits.slice(0, 2).join(" · ")
      : (sheet.identity || "");
}

function fill(book) {
  el("book-heading").textContent = book.title;
  fillCharRow("mc", book.main_character || {},
    book.main_character_image);
  const antagonist = book.antagonist;
  el("ant-row").hidden = !antagonist;
  if (antagonist) {
    fillCharRow("ant", antagonist, book.antagonist_image);
  }
  el("char-rows").hidden = false;
  document.title = book.title + " - Story Realm";
  el("f-title").value = book.title || "";
  el("f-language").value = book.language || "";
  el("f-genre").value = (book.style && book.style.genre) || "";
  el("f-tone").value = (book.style && book.style.tone) || "";
  el("f-world").value = book.world || "";
  const mc = book.main_character || {};
  const sheet = mc.sheet || {};
  el("f-mc-name").value = mc.name || "";
  el("f-mc-identity").value = sheet.identity || "";
  el("f-mc-traits").value = (sheet.traits || []).join(", ");
  el("f-mc-tone").value = sheet.tone || "";
  el("f-mc-voice").value = sheet.voice || "";
  el("f-opening").value = book.opening_scene || "";
}

function collect() {
  const book = structuredClone(current);
  book.title = el("f-title").value.trim();
  book.language = el("f-language").value.trim();
  book.style = book.style || {};
  book.style.genre = el("f-genre").value.trim();
  book.style.tone = el("f-tone").value.trim();
  book.world = el("f-world").value.trim();
  book.main_character = book.main_character || {};
  book.main_character.name = el("f-mc-name").value.trim();
  book.main_character.sheet = book.main_character.sheet || {};
  const sheet = book.main_character.sheet;
  sheet.identity = el("f-mc-identity").value.trim();
  sheet.traits = el("f-mc-traits").value
    .split(",").map((t) => t.trim()).filter(Boolean);
  sheet.tone = el("f-mc-tone").value.trim();
  sheet.voice = el("f-mc-voice").value.trim();
  book.opening_scene = el("f-opening").value.trim();
  return book;
}

async function init() {
  renderTopbar({ backHref: "./home.html", backLabel: "Back to library" });
  renderShell({ active: "explore" });
  if (!getToken()) {
    el("book-status").hidden = true;
    el("book-out").hidden = false;
    return;
  }
  try {
    current = await apiFetch("/api/books/" + encodeURIComponent(BOOK_ID));
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      el("book-status").hidden = true;
      el("book-out").hidden = false;
    } else {
      setStatusError(friendlyError(err));
    }
    return;
  }
  el("book-status").hidden = true;
  fill(current);
  el("book-form").hidden = false;
}

el("book-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  el("save-status").textContent = "Saving...";
  try {
    current = await apiFetch("/api/books/" + encodeURIComponent(BOOK_ID), {
      method: "PUT",
      body: collect(),
    });
    fill(current);
    el("save-status").textContent = "Saved - the update is persisted.";
  } catch (err) {
    el("save-status").textContent = "Save failed: " + friendlyError(err);
  }
});

el("join-btn").addEventListener("click", () => {
  window.location.href = "./play.html?id=" + encodeURIComponent(BOOK_ID);
});

init();
