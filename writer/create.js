/* Create a book (F2 T4): describe -> assemble -> review -> confirm.
 *
 * Step 1 posts the plain-words description to POST /api/books/enhance
 * (F2 T3), which returns a bible draft and saves nothing. Step 2
 * shows that draft for review; the reader edits the fields the
 * page names, and the page sends the full definition back, so
 * untouched fields survive by construction (same pattern as the
 * book page). Step 3 confirms with POST /api/books (201), then
 * navigates to play.html?id=<book id>: the play screen starts
 * (or resumes) a playthrough of the saved book, scene 0 being
 * its opening premise. A 409 at confirm means a book with that
 * id already exists - nothing is overwritten; the reader
 * re-assembles with a different description. */

import { apiFetch } from "./js/app-api.js";
import { getToken, clearToken } from "./js/app-auth.js";
import { renderTopbar, friendlyError } from "./js/app-ui.js";

const el = (id) => document.getElementById(id);
let draft = null;

function showError(msg) {
  const box = el("create-error");
  box.textContent = msg;
  box.hidden = !msg;
}

function fill(d) {
  el("f-title").value = d.title || "";
  el("f-genre").textContent = (d.style && d.style.genre) || "";
  el("f-cast").textContent = (d.supporting_cast || [])
    .map((m) => m.name).join(", ");
  el("f-world").value = d.world || "";
  const mc = d.main_character || {};
  const sheet = mc.sheet || {};
  el("f-mc-name").value = mc.name || "";
  el("f-mc-identity").value = sheet.identity || "";
  el("f-mc-traits").value = (sheet.traits || []).join(", ");
  el("f-mc-tone").value = sheet.tone || "";
  el("f-mc-voice").value = sheet.voice || "";
  el("f-opening").value = d.opening_scene || "";
}

function collect() {
  const book = structuredClone(draft);
  book.title = el("f-title").value.trim();
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

function init() {
  renderTopbar({ backHref: "./home.html", backLabel: "Back to library" });
  if (!getToken()) {
    el("create-form").hidden = true;
    el("create-out").hidden = false;
    return;
  }
}

el("create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  el("assemble-status").textContent = "Assembling your bible...";
  el("assemble-btn").disabled = true;
  try {
    const result = await apiFetch("/api/books/enhance", {
      method: "POST",
      body: { description: el("f-description").value },
    });
    draft = result.draft;
    fill(draft);
    el("assemble-status").textContent = "";
    el("create-form").hidden = true;
    el("review-form").hidden = false;
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      el("create-form").hidden = true;
      el("create-out").hidden = false;
      return;
    }
    showError(friendlyError(err));
    el("assemble-status").textContent = "";
  } finally {
    el("assemble-btn").disabled = false;
  }
});

el("review-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  el("confirm-status").textContent = "Saving your book...";
  el("confirm-btn").disabled = true;
  try {
    const saved = await apiFetch("/api/books", {
      method: "POST",
      body: collect(),
    });
    window.location.href = "./play.html?id=" + encodeURIComponent(saved.id);
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      el("review-form").hidden = true;
      el("create-out").hidden = false;
      return;
    }
    if (err.status === 409) {
      showError("A book with that id already exists, so nothing was overwritten. Go back and assemble again with a different description.");
    } else {
      showError(friendlyError(err));
    }
    el("confirm-status").textContent = "";
    el("confirm-btn").disabled = false;
  }
});

el("back-btn").addEventListener("click", () => {
  el("review-form").hidden = true;
  el("create-form").hidden = false;
  showError("");
});

init();
