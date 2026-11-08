/* Profile page: who you are, and the avatar you show as.
 *
 * Header: the reader's current avatar (the library default when
 * they have not picked one yet), their display name, and email.
 * Below, the avatar library as a tappable grid: tapping an avatar
 * PATCHes /api/auth/me/avatar and, on success, the header and the
 * selection ring move in place. A failed save shows an error line
 * and keeps the old selection — the stored pick never changes
 * without the server's word.
 *
 * Data: GET /api/auth/me via getMe() (same session helpers as My
 * Stories). Signed-out users see the sign-in state; guests are
 * ordinary accounts here and pick avatars exactly the same way.
 * The art itself lives in js/avatars.js — the single library the
 * reading view will import for the player's rows. */

import { apiFetch } from "./js/app-api.js";
import { getToken, getMe, clearToken } from "./js/app-auth.js";
import { renderTopbar, friendlyError } from "./js/app-ui.js";
import { renderShell } from "./js/shell.js";
import {
  AVATARS,
  DEFAULT_AVATAR_ID,
  getAvatar,
  avatarNode,
} from "./js/avatars.js";
import { applyPersonaImage, personaImageSrc } from "./js/personas.js";

const el = (id) => document.getElementById(id);

/* The pick currently shown as selected: the stored avatar_id
 * when it names a library avatar, else the default. */
let currentId = DEFAULT_AVATAR_ID;
let saving = false;

function show(state, note) {
  el("state-loading").hidden = state !== "loading";
  el("state-in").hidden = state !== "in";
  el("state-out").hidden = state !== "out";
  if (state === "out" && note) {
    el("out-note").textContent = note;
    el("out-note").hidden = false;
  }
}

function showError(message) {
  const box = el("profile-error");
  box.textContent = message || "";
  box.hidden = !message;
}

function renderHeader(me) {
  const host = el("profile-avatar");
  host.innerHTML = "";
  host.append(avatarNode(currentId, "avatar-lg"));
  const name =
    (me.display_name || "").trim() ||
    (me.email || "").split("@")[0] ||
    "Reader";
  el("profile-name").textContent = name;
  el("profile-email").textContent = me.email || "";
}

/* Mark exactly the current pick in the grid: ring + check +
 * aria-pressed move together, so what the reader sees selected
 * is always the last pick the server confirmed. */
function markSelected() {
  for (const btn of el("avatar-grid").children) {
    const selected = btn.dataset.avatarId === currentId;
    btn.classList.toggle("is-selected", selected);
    btn.setAttribute("aria-pressed", selected ? "true" : "false");
  }
}

function renderGrid() {
  const grid = el("avatar-grid");
  grid.innerHTML = "";
  for (const avatar of AVATARS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "avatar-option";
    btn.dataset.avatarId = avatar.id;
    btn.append(avatarNode(avatar.id, "avatar-md"));
    const label = document.createElement("span");
    label.className = "avatar-option-label";
    label.textContent = avatar.label;
    btn.append(label);
    const check = document.createElement("span");
    check.className = "avatar-option-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    btn.append(check);
    btn.addEventListener("click", () => choose(avatar.id));
    grid.append(btn);
  }
  markSelected();
}

async function choose(id) {
  if (saving || id === currentId) return;
  saving = true;
  const grid = el("avatar-grid");
  grid.classList.add("is-saving");
  showError("");
  try {
    const me = await apiFetch("/api/auth/me/avatar", {
      method: "PATCH",
      body: { avatar_id: id },
    });
    /* Trust the server's echo over the tap: the stored pick is
     * what the next page load will render. */
    currentId = getAvatar(me && me.avatar_id).id;
    renderHeader(me || {});
    markSelected();
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      show("out");
      return;
    }
    showError(friendlyError(err));
  } finally {
    saving = false;
    grid.classList.remove("is-saving");
  }
}

/* The Persona entry row: the In Use persona's portrait +
 * name when there is one; otherwise an invitation that still
 * says how many personas exist. Persona data is best-effort
 * here - the entry always links to the persona page, and a
 * failed fetch just leaves the generic label (an older
 * backend without the personas routes must not break the
 * profile page). */
async function renderPersonaEntry() {
  const nameEl = el("persona-entry-name");
  const subEl = el("persona-entry-sub");
  const thumbEl = el("persona-entry-thumb");
  const chipEl = el("persona-entry-chip");
  let data;
  try {
    data = await apiFetch("/api/personas");
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      show("out");
    }
    return;
  }
  const personas = (data && data.personas) || [];
  const active = personas.find((p) => p.id === data.active_persona_id);
  thumbEl.innerHTML = "";
  if (active) {
    const src = personaImageSrc(active.image_id);
    if (src || active.has_custom_image) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      applyPersonaImage(img, active);
      thumbEl.append(img);
    }
    nameEl.textContent = active.name;
    subEl.textContent =
      "Age " + active.age + " · the character you play as";
    chipEl.hidden = false;
  } else if (personas.length) {
    nameEl.textContent = "No persona in use";
    subEl.textContent =
      personas.length + (personas.length === 1 ? " persona" : " personas") +
      " · tap to choose who you play as";
    chipEl.hidden = true;
  } else {
    nameEl.textContent = "Create your persona";
    subEl.textContent = "The character you play as in every story";
    chipEl.hidden = true;
  }
}

async function init() {
  renderTopbar();
  renderShell({ active: "profile" });
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
  currentId = getAvatar(me && me.avatar_id).id;
  renderHeader(me);
  renderGrid();
  show("in");
  renderPersonaEntry();
}

init();
