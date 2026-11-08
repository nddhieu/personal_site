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
  applyPersonaImage,
  getPersonaImage,
  invalidatePersonaImage,
  personaHasCustomImage,
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
let formPersona = null;
let formImageId = PERSONA_IMAGES[0].id;
let formGender = "female";

/* Upload state: the reader can give the persona their own
 * photo instead of a library portrait. formUseUpload says the
 * photo is the picked source; formPhotoFile is a newly chosen
 * file still to POST on save (null when the persona's
 * already-uploaded photo is simply being kept). */
let formUseUpload = false;
let formPhotoFile = null;
let formPhotoPreviewURL = "";

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
  applyPersonaImage(img, persona);
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
    applyPersonaImage(img, persona);
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

/* The upload tile: first in the grid. With no photo staged
 * or stored it is the invitation ("Upload your photo") and
 * tapping opens the file picker. Once a photo exists for
 * this form (staged, or the edited persona's own upload) the
 * tile shows it: tapping selects it as the source, and
 * tapping again while selected opens the picker to change
 * it. Picking any library portrait deselects the upload -
 * the two sources are exclusive, like the portraits among
 * themselves. */
function renderUploadTile(grid) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "persona-image-option persona-upload-option";
  btn.dataset.testid = "pf-upload-tile";
  btn.setAttribute("aria-pressed", formUseUpload ? "true" : "false");
  if (formUseUpload) btn.classList.add("is-selected");
  const hasPhoto = !!formPhotoFile ||
    !!(formPersona && personaHasCustomImage(formPersona));
  if (hasPhoto) {
    const img = document.createElement("img");
    img.alt = "";
    if (formPhotoPreviewURL) {
      img.src = formPhotoPreviewURL;
    } else if (formPersona) {
      img.src = personaImageSrc(formPersona.image_id);
      applyPersonaImage(img, formPersona);
    }
    btn.append(img);
    const label = document.createElement("span");
    label.className = "persona-image-label";
    label.textContent = "Your photo";
    btn.append(label);
  } else {
    const icon = document.createElement("span");
    icon.className = "persona-upload-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "📷";
    btn.append(icon);
    const label = document.createElement("span");
    label.className = "persona-upload-label";
    label.textContent = "Upload your photo";
    btn.append(label);
  }
  btn.addEventListener("click", () => {
    const havePhoto = !!formPhotoFile ||
      !!(formPersona && personaHasCustomImage(formPersona));
    if (havePhoto && !formUseUpload) {
      formUseUpload = true;
      renderImageGrid();
      return;
    }
    el("pf-file").click();
  });
  grid.append(btn);
}

function onPhotoFileChosen() {
  const input = el("pf-file");
  const file = input.files && input.files[0];
  if (!file) return;
  if (formPhotoPreviewURL) URL.revokeObjectURL(formPhotoPreviewURL);
  formPhotoFile = file;
  formPhotoPreviewURL = URL.createObjectURL(file);
  formUseUpload = true;
  renderImageGrid();
}

function renderImageGrid() {
  const grid = el("persona-image-grid");
  grid.innerHTML = "";
  renderUploadTile(grid);
  for (const [index, image] of PERSONA_IMAGES.entries()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "persona-image-option";
    btn.dataset.imageId = image.id;
    btn.setAttribute("aria-label", "Portrait " + (index + 1));
    btn.setAttribute("aria-pressed",
      !formUseUpload && image.id === formImageId ? "true" : "false");
    if (!formUseUpload && image.id === formImageId) {
      btn.classList.add("is-selected");
    }
    const img = document.createElement("img");
    img.src = image.src;
    img.alt = "";
    btn.append(img);
    btn.addEventListener("click", () => {
      formUseUpload = false;
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
  formPersona = persona || null;
  // An edited persona with its own photo opens with the
  // upload as the picked source; a fresh form starts on the
  // library.
  formUseUpload = !!(persona && personaHasCustomImage(persona));
  formPhotoFile = null;
  if (formPhotoPreviewURL) URL.revokeObjectURL(formPhotoPreviewURL);
  formPhotoPreviewURL = "";
  el("pf-file").value = "";
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
  // Saving with a library portrait picked, over a persona
  // that has an uploaded photo, is the switch back to the
  // library: the server drops the photo with the PATCH.
  if (!formUseUpload && formPersona &&
      personaHasCustomImage(formPersona)) {
    body.clear_custom_image = true;
  }
  busy = true;
  showFormError("");
  try {
    let saved = formPersonaId
      ? await apiFetch(
          "/api/personas/" + encodeURIComponent(formPersonaId),
          { method: "PATCH", body })
      : await apiFetch("/api/personas", { method: "POST", body });
    formPersonaId = saved.id;
    formPersona = saved;
    if (formUseUpload && formPhotoFile) {
      // The persona is saved first (with its library
      // portrait as the standing fallback), then the photo
      // attaches. If the photo fails, the form stays open
      // with the error and the persona keeps the image it
      // had - never a broken state - and Save can retry.
      try {
        const form = new FormData();
        form.append("file", formPhotoFile);
        saved = await apiFetch(
          "/api/personas/" + encodeURIComponent(saved.id) + "/image",
          { method: "POST", formData: form });
        formPersona = saved;
        formPhotoFile = null;
      } catch (err) {
        if (err.status === 401) {
          clearToken();
          show("out");
          return;
        }
        showFormError(
          "Your persona was saved, but the photo could not " +
          "be uploaded. It keeps its previous portrait - " +
          "tap Save to try the photo again.");
        await refresh();
        return;
      }
    }
    invalidatePersonaImage(saved.id);
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
  el("pf-file").addEventListener("change", onPhotoFileChosen);
  el("persona-form-cancel").addEventListener("click", closeForm);
  for (const btn of document.querySelectorAll(".persona-gender-btn")) {
    btn.addEventListener("click", () => setFormGender(btn.dataset.gender));
  }
  loadAndRender();
}

init();
