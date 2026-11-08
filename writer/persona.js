/* Persona page: the characters you play as (Emochi's
 * Persona screen, our library + server).
 *
 * Showcase: the selected persona's portrait large, name +
 * gender mark, "In Use" chip, age, and the characteristics
 * the reader wrote; a thumbnail strip switches the showcase;
 * Select makes the shown persona the In Use one (POST
 * /api/personas/{id}/activate) - new playthroughs bind it by
 * default, and each book's composer can still switch per
 * book. Create / edit uses the portrait library grid
 * (js/personas.js) plus name / gender / age / characteristics.
 * Delete is two-tap (arm, then confirm), the app's reset
 * pattern; deleting the In Use persona clears the pick
 * server-side.
 *
 * Server truth throughout: every mutation re-renders from
 * the server's response, so what is shown In Use is what the
 * next playthrough will actually bind. */

import { apiFetch } from "./js/app-api.js";
import { getToken, clearToken } from "./js/app-auth.js";
import { renderTopbar, friendlyError } from "./js/app-ui.js";
import { renderShell } from "./js/shell.js";
import {
  PERSONA_IMAGES,
  getPersonaImage,
  personaImageLabel,
  personaImageSrc,
} from "./js/personas.js";

const el = (id) => document.getElementById(id);

let personas = [];
let activeId = null;
let showcaseId = null;
let deleteArmed = false;
let busy = false;

/* Form state: which persona is being edited (null = create),
 * the picked portrait, and the picked gender. */
let formPersonaId = null;
let formImageId = PERSONA_IMAGES[0].id;
let formGender = "female";

const GENDER_MARKS = { male: "♂", female: "♀", other: "" };

function show(state, note) {
  el("state-loading").hidden = state !== "loading";
  el("state-main").hidden = state !== "main";
  el("state-out").hidden = state !== "out";
  if (state === "out" && note) {
    el("out-note").textContent = note;
    el("out-note").hidden = false;
  }
}

function showError(message) {
  const box = el("persona-error");
  box.textContent = message || "";
  box.hidden = !message;
}

function showFormError(message) {
  const box = el("persona-form-error");
  box.textContent = message || "";
  box.hidden = !message;
}

function currentShowcase() {
  return personas.find((p) => p.id === showcaseId) || personas[0] || null;
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

/* ---------- showcase ---------- */

function disarmDelete() {
  deleteArmed = false;
  const btn = el("persona-delete");
  btn.textContent = "Delete";
  btn.classList.remove("is-armed");
}

function renderShowcase() {
  const persona = currentShowcase();
  el("persona-showcase").hidden = !persona;
  el("persona-empty").hidden = !!persona;
  el("persona-add").hidden = false;
  if (!persona) return;
  showcaseId = persona.id;
  const img = el("persona-hero-img");
  img.src = personaImageSrc(persona.image_id);
  img.alt = "Portrait of " + persona.name;
  el("persona-name").textContent = persona.name;
  el("persona-gender").textContent = GENDER_MARKS[persona.gender] || "";
  el("persona-inuse").hidden = persona.id !== activeId;
  el("persona-age").textContent = "Age: " + persona.age;
  el("persona-desc").textContent = persona.description || "";
  el("persona-desc").hidden = !persona.description;
  const select = el("persona-select");
  select.hidden = persona.id === activeId;
  disarmDelete();
  renderThumbs();
}

function renderThumbs() {
  const host = el("persona-thumbs");
  host.innerHTML = "";
  for (const persona of personas) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "persona-thumb";
    btn.dataset.personaId = persona.id;
    btn.setAttribute("aria-label", "Show " + persona.name);
    btn.setAttribute("aria-pressed",
      persona.id === showcaseId ? "true" : "false");
    if (persona.id === showcaseId) btn.classList.add("is-selected");
    const img = document.createElement("img");
    img.src = personaImageSrc(persona.image_id);
    img.alt = "";
    btn.append(img);
    if (persona.id === activeId) {
      const dot = document.createElement("span");
      dot.className = "persona-thumb-inuse";
      dot.textContent = "✓";
      dot.setAttribute("aria-hidden", "true");
      btn.append(dot);
    }
    btn.addEventListener("click", () => {
      showcaseId = persona.id;
      showError("");
      renderShowcase();
    });
    host.append(btn);
  }
}

/* ---------- data ---------- */

async function refresh() {
  const data = await apiFetch("/api/personas");
  personas = (data && data.personas) || [];
  activeId = (data && data.active_persona_id) || null;
  if (!personas.some((p) => p.id === showcaseId)) {
    showcaseId = activeId || (personas[0] && personas[0].id) || null;
  }
}

async function loadAndRender() {
  try {
    await refresh();
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      show("out");
    } else {
      show("out", friendlyError(err));
    }
    return;
  }
  renderShowcase();
  show("main");
}

/* ---------- actions ---------- */

async function selectShowcase() {
  const persona = currentShowcase();
  if (!persona || busy || persona.id === activeId) return;
  busy = true;
  showError("");
  try {
    const data = await apiFetch(
      "/api/personas/" + encodeURIComponent(persona.id) + "/activate",
      { method: "POST" });
    personas = (data && data.personas) || personas;
    activeId = (data && data.active_persona_id) || null;
    renderShowcase();
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      show("out");
      return;
    }
    showError(friendlyError(err));
  } finally {
    busy = false;
  }
}

async function deleteShowcase() {
  const persona = currentShowcase();
  if (!persona || busy) return;
  if (!deleteArmed) {
    deleteArmed = true;
    const btn = el("persona-delete");
    btn.textContent = "Delete " + firstName(persona.name) +
      "? Tap again to confirm";
    btn.classList.add("is-armed");
    return;
  }
  busy = true;
  showError("");
  try {
    await apiFetch("/api/personas/" + encodeURIComponent(persona.id),
      { method: "DELETE" });
    showcaseId = null;
    await refresh();
    renderShowcase();
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      show("out");
      return;
    }
    showError(friendlyError(err));
    disarmDelete();
  } finally {
    busy = false;
  }
}

/* ---------- create / edit form ---------- */

function renderImageGrid() {
  const grid = el("persona-image-grid");
  grid.innerHTML = "";
  for (const image of PERSONA_IMAGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "persona-image-option";
    btn.dataset.imageId = image.id;
    btn.setAttribute("aria-pressed",
      image.id === formImageId ? "true" : "false");
    if (image.id === formImageId) btn.classList.add("is-selected");
    const img = document.createElement("img");
    img.src = image.src;
    img.alt = "";
    btn.append(img);
    const label = document.createElement("span");
    label.className = "persona-image-label";
    label.textContent = personaImageLabel(image.id);
    btn.append(label);
    btn.addEventListener("click", () => {
      formImageId = image.id;
      // Creating: a portrait tap also proposes the gender -
      // one less field to set; the reader can still override
      // with the segmented control. Editing keeps the
      // persona's own gender untouched.
      if (!formPersonaId) setFormGender(image.gender);
      renderImageGrid();
    });
    grid.append(btn);
  }
}

function setFormGender(gender) {
  formGender = gender;
  for (const btn of document.querySelectorAll(".persona-gender-btn")) {
    const on = btn.dataset.gender === gender;
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function openForm(persona) {
  formPersonaId = persona ? persona.id : null;
  el("persona-form-title").textContent =
    persona ? "Edit persona" : "New persona";
  formImageId = persona ? persona.image_id : PERSONA_IMAGES[0].id;
  el("pf-name").value = persona ? persona.name : "";
  el("pf-age").value = persona ? String(persona.age) : "";
  el("pf-desc").value = persona ? persona.description || "" : "";
  setFormGender(persona ? persona.gender : "female");
  renderImageGrid();
  showFormError("");
  el("persona-showcase").hidden = true;
  el("persona-empty").hidden = true;
  el("persona-add").hidden = true;
  el("persona-form").hidden = false;
  el("pf-name").focus();
}

function closeForm() {
  el("persona-form").hidden = true;
  renderShowcase();
}

async function saveForm(event) {
  event.preventDefault();
  if (busy) return;
  const name = el("pf-name").value.trim();
  const age = Number(el("pf-age").value);
  const description = el("pf-desc").value;
  // Light client checks mirror the server's rules so the
  // common mistakes answer instantly; the server stays the
  // authority and its word is what renders.
  if (!name) {
    showFormError("Give your persona a name.");
    return;
  }
  if (!Number.isInteger(age) || age < 18 || age > 99) {
    showFormError("Age must be between 18 and 99.");
    return;
  }
  const body = {
    name, gender: formGender, age,
    description, image_id: formImageId,
  };
  busy = true;
  showFormError("");
  try {
    const saved = formPersonaId
      ? await apiFetch(
          "/api/personas/" + encodeURIComponent(formPersonaId),
          { method: "PATCH", body })
      : await apiFetch("/api/personas", { method: "POST", body });
    showcaseId = saved.id;
    await refresh();
    closeForm();
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      show("out");
      return;
    }
    showFormError(friendlyError(err));
  } finally {
    busy = false;
  }
}

/* ---------- init ---------- */

function init() {
  renderTopbar({ backHref: "./profile.html", backLabel: "Back to profile" });
  renderShell({ active: "profile" });
  if (!getToken()) {
    show("out");
    return;
  }
  el("persona-select").addEventListener("click", selectShowcase);
  el("persona-delete").addEventListener("click", deleteShowcase);
  el("persona-edit").addEventListener("click", () => {
    const persona = currentShowcase();
    if (persona) openForm(persona);
  });
  el("persona-add").addEventListener("click", () => openForm(null));
  el("persona-create-first").addEventListener("click",
    () => openForm(null));
  el("persona-form").addEventListener("submit", saveForm);
  el("persona-form-cancel").addEventListener("click", closeForm);
  for (const btn of document.querySelectorAll(".persona-gender-btn")) {
    btn.addEventListener("click", () => setFormGender(btn.dataset.gender));
  }
  loadAndRender();
}

init();
