/* Create a book, wizard edition (mobile-nav M4b): four steps,
 * design §3.4 (Emochi's 4-step shape, our approved content).
 *
 * Step 1: main character (pick-or-write chips + free text).
 * Step 2: location + what happens in the first scene.
 * Step 3: style/genre + language.
 * Steps 1-3 compose into the plain-words description sent to
 * POST /api/books/enhance (F2 T3), which returns a bible draft
 * and saves nothing. Step 4 reuses the review form: the reader
 * edits the fields, confirms with POST /api/books (201), then
 * navigates to play.html?id=<book id>: the play screen starts
 * (or resumes) a playthrough of the saved book, scene 0 being
 * its opening premise. A 409 at confirm means a book with that
 * id already exists - nothing is overwritten; the reader
 * re-assembles with a different description.
 *
 * Back never wipes a step: every step stays in the DOM and only
 * its `hidden` flips, so chips + free text survive the whole
 * round trip. Chips are help, not a limit: picking one never
 * removes free text, and free text is never overwritten.
 * No waiting screen / Explore While Waiting here - that is M4c,
 * which needs the async-enhance decision first. */

import { apiFetch } from "./js/app-api.js";
import { getToken, clearToken } from "./js/app-auth.js";
import { renderTopbar, friendlyError } from "./js/app-ui.js";
import { renderShell } from "./js/shell.js";

const el = (id) => document.getElementById(id);
const STEP_TITLES = ["Main character", "First scene", "Style and language", "Review your bible"];
let step = 1;
let draft = null;
/* One selected chip per group (single pick); null = none picked. */
const chips = { character: null, setting: null, genre: null, language: null };

function showWizardError(msg) {
  const box = el("wizard-error");
  box.textContent = msg;
  box.hidden = !msg;
}

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

/* The four step inputs, composed into the plain-words description
 * the enhance endpoint already accepts. Empty parts are omitted,
 * so an all-blank wizard sends "" and the AI invents a book -
 * the old single-textarea behaviour, preserved. */
function composeDescription() {
  const parts = [];
  const character = [chips.character, el("f-character").value.trim()]
    .filter(Boolean).join(" ");
  if (character) parts.push("Main character: " + character + ".");
  const place = [chips.setting, el("f-first-scene").value.trim()]
    .filter(Boolean).join(" ");
  if (place) parts.push("Setting and first scene: " + place + ".");
  const style = [chips.genre, el("f-style-notes").value.trim()]
    .filter(Boolean).join("; ");
  if (style) parts.push("Style: " + style + ".");
  if (chips.language) parts.push("Language: " + chips.language + ".");
  return parts.join(" ");
}

function showStep(n) {
  step = n;
  el("wizard-form").hidden = n === 4;
  el("review-form").hidden = n !== 4;
  for (let i = 1; i <= 3; i++) {
    el("step-" + i).hidden = i !== n;
  }
  el("wizard-step-label").textContent =
    "Step " + n + " of 4 — " + STEP_TITLES[n - 1];
  el("wizard-bar-fill").style.width = (n * 25) + "%";
  el("wizard-back").disabled = n === 1;
  el("wizard-next").textContent = n === 3 ? "Assemble my bible" : "Next";
  showWizardError("");
  const heading = n === 4
    ? el("review-title")
    : el("step-" + n + "-title");
  if (heading) heading.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function assemble() {
  showWizardError("");
  el("assemble-status").textContent = "Assembling your bible...";
  el("wizard-next").disabled = true;
  el("wizard-back").disabled = true;
  try {
    const result = await apiFetch("/api/books/enhance", {
      method: "POST",
      body: { description: composeDescription() },
    });
    draft = result.draft;
    fill(draft);
    el("assemble-status").textContent = "";
    showStep(4);
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      el("wizard-form").hidden = true;
      el("wizard-progress").hidden = true;
      el("create-out").hidden = false;
      return;
    }
    showWizardError(friendlyError(err));
    el("assemble-status").textContent = "";
  } finally {
    el("wizard-next").disabled = false;
    el("wizard-back").disabled = step === 1;
  }
}

function init() {
  renderTopbar({ backHref: "./home.html", backLabel: "Back to library" });
  renderShell({ active: "create" });
  if (!getToken()) {
    el("wizard-form").hidden = true;
    el("wizard-progress").hidden = true;
    el("create-out").hidden = false;
    return;
  }
  el("wizard-progress").hidden = false;
  showStep(1);
}

/* Chips: single pick per group; tapping the picked chip again
 * clears it. The group container delegates so the handler is
 * one listener, not one per chip. */
document.querySelectorAll(".wizard-chips").forEach((group) => {
  group.addEventListener("click", (event) => {
    const chip = event.target.closest(".wizard-chip");
    if (!chip) return;
    const name = group.dataset.chipGroup;
    const picked = chips[name] === chip.dataset.chipValue;
    group.querySelectorAll(".wizard-chip").forEach((c) => {
      c.setAttribute("aria-pressed", "false");
      c.classList.remove("wizard-chip-active");
    });
    chips[name] = picked ? null : chip.dataset.chipValue;
    if (!picked) {
      chip.setAttribute("aria-pressed", "true");
      chip.classList.add("wizard-chip-active");
    }
  });
});

el("wizard-back").addEventListener("click", () => {
  if (step > 1) showStep(step - 1);
});

el("wizard-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (step < 3) {
    showStep(step + 1);
    return;
  }
  await assemble();
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
      el("wizard-progress").hidden = true;
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
  showStep(3);
  showError("");
});

init();
