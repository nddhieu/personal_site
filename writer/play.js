/* Play screen: live turns against the F3 turn pipeline.
 *
 * WIRING SECTION (separable): everything in this file is the live
 * play wiring - start a playthrough, Send/Continue as real turns,
 * diary from live state, Retry/Correct parked as "Soon". The
 * styling fixes (fonts, cards, tokens, prose width, mobile bar)
 * live in play.html/play.css and do not depend on this file's
 * turn logic; this file could be reverted to the T0 shell
 * independently of those fixes.
 *
 * Flow: book (GET /api/books/{id}) -> playthrough
 * (POST /api/books/{id}/playthroughs) -> turns
 * (POST /api/playthroughs/{id}/turns {action}) -> scene +
 * diary entry. State shapes: scenes [{turn, action, text}],
 * diary entries are one sentence each in the main character's
 * voice. Suggestion generation (real suggestions[]) is the
 * separate story-f3-suggest work; until it lands, the three
 * starter actions below stage text into the input, exactly as
 * the T0 shell did. */

import { apiFetch } from "./js/app-api.js";
import { getToken, clearToken } from "./js/app-auth.js";
import {
  renderTopbar,
  showLoading,
  showNote,
  friendlyError,
} from "./js/app-ui.js";

const BOOK_ID = new URLSearchParams(location.search).get("id") || "accad-kim";
const PLAYTHROUGH_KEY = "st_playthrough_" + BOOK_ID;

/* Starter actions shown before the pipeline generates its own
 * (story-f3-suggest). Keyed by book; a generic set covers any
 * other book. These stage text into the input; they are not
 * presented as generated suggestions. */
const STARTER_ACTIONS = {
  "accad-kim": [
    "I open the door and look at her properly.",
    "I ask who she is, and what happened out there.",
    "I step aside and invite her in, out of the rain.",
  ],
};
const DEFAULT_ACTIONS = [
  "I look around and take in the scene.",
  "I speak first.",
  "I wait, and watch what happens.",
];

const el = (id) => document.getElementById(id);
let book = null;
let playthroughId = sessionStorage.getItem(PLAYTHROUGH_KEY) || "";
let scenes = [];
let busy = false;

function sceneText(scene) {
  return typeof scene === "string" ? scene : (scene && scene.text) || "";
}

function diaryText(entry) {
  return typeof entry === "string" ? entry : (entry && entry.text) || "";
}

function renderScenes() {
  const prose = el("prose");
  prose.innerHTML = "";
  for (const scene of scenes) {
    const p = document.createElement("p");
    p.textContent = sceneText(scene);
    prose.append(p);
  }
}

function renderBible(stateBible) {
  const mc = (book && book.main_character) || {};
  const cast = ((book && book.supporting_cast) || [])
    .map((m) => m.name).join(", ");
  const traits = ((mc.sheet || {}).traits || []).join(", ");
  const rows = [
    ["World", (book && book.world) || ""],
    ["Main character", (mc.name || "") + (traits ? " - " + traits : "")],
    ["Cast", cast],
    ["Style", ((book && book.style && book.style.genre) || "") +
      " / " + ((book && book.language) || "")],
  ];
  if (stateBible) {
    if (stateBible.facts && stateBible.facts.length) {
      rows.push(["Story facts", stateBible.facts.join(" ")]);
    }
    if (stateBible.objects && stateBible.objects.length) {
      rows.push(["Objects", stateBible.objects.join(", ")]);
    }
  }
  const box = el("bible-summary");
  box.innerHTML = "";
  const dl = document.createElement("dl");
  dl.className = "bible-list";
  for (const [label, value] of rows) {
    if (!value) continue;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  box.append(dl);
}

function renderDiary(entries) {
  const list = el("diary-list");
  list.innerHTML = "";
  const items = (entries || []).map(diaryText).filter(Boolean);
  el("diary-empty").hidden = items.length > 0;
  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  }
}

async function refreshDiary() {
  if (!playthroughId) return null;
  try {
    const state = await apiFetch(
      "/api/playthroughs/" + encodeURIComponent(playthroughId),
    );
    renderDiary(state.diary);
    return state;
  } catch {
    return null;
  }
}

function showSignedOut() {
  el("play-status").hidden = true;
  el("play-layout").hidden = true;
  el("play-out").hidden = false;
}

function setBusy(b) {
  busy = b;
  el("send-btn").disabled = b;
  el("continue-btn").disabled = b;
  el("action-input").disabled = b;
  el("send-btn").textContent = b ? "Writing..." : "Send";
}

function showPlayNote(text) {
  const n = el("play-note");
  n.className = "play-note";
  n.removeAttribute("role");
  showNote(n, text);
}

function showPlayError(text) {
  const n = el("play-note");
  n.className = "form-error";
  n.setAttribute("role", "alert");
  showNote(n, text);
}

async function runTurn(action) {
  const text = (action || "").trim();
  if (!text) {
    showPlayNote("Write what you do next, or pick a suggestion.");
    el("action-input").focus();
    return;
  }
  if (busy || !playthroughId) return;
  setBusy(true);
  showLoading(el("play-note"), "Writing the next scene...");
  try {
    const result = await apiFetch(
      "/api/playthroughs/" + encodeURIComponent(playthroughId) + "/turns",
      { method: "POST", body: { action: text } },
    );
    const scene = result.scene || result.text || "";
    if (scene) scenes.push({ turn: result.turn, action: text, text: scene });
    renderScenes();
    el("action-input").value = "";
    showNote(el("play-note"), "");
    const state = await refreshDiary();
    if (state && state.bible) renderBible(state.bible);
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      showSignedOut();
      return;
    }
    showPlayError(friendlyError(err));
  } finally {
    setBusy(false);
  }
}

el("send-btn").addEventListener("click", () => {
  runTurn(el("action-input").value);
});

el("continue-btn").addEventListener("click", () => {
  const staged = el("action-input").value.trim();
  const actions = STARTER_ACTIONS[BOOK_ID] || DEFAULT_ACTIONS;
  runTurn(staged || actions[0]);
});

el("diary-btn").addEventListener("click", async () => {
  const panel = el("diary-panel");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) await refreshDiary();
});

async function init() {
  renderTopbar({
    backHref: "./book.html?id=" + encodeURIComponent(BOOK_ID),
    backLabel: "Back to book",
  });
  if (!getToken()) {
    showSignedOut();
    return;
  }
  try {
    book = await apiFetch("/api/books/" + encodeURIComponent(BOOK_ID));
  } catch (err) {
    if (err.status === 401) {
      showSignedOut();
      return;
    }
    const status = el("play-status");
    status.className = "form-error";
    status.setAttribute("role", "alert");
    status.textContent = friendlyError(err);
    return;
  }
  el("book-title").textContent = book.title;
  document.title = book.title + " - AI Storytelling Co-Author";
  renderBible(null);
  try {
    const state = await apiFetch(
      "/api/books/" + encodeURIComponent(BOOK_ID) + "/playthroughs",
      { method: "POST" },
    );
    playthroughId = state.id;
    sessionStorage.setItem(PLAYTHROUGH_KEY, playthroughId);
    scenes = state.scenes && state.scenes.length
      ? state.scenes
      : [{ turn: 0, text: book.opening_scene || "" }];
    renderScenes();
    renderDiary(state.diary);
    if (state.bible) renderBible(state.bible);
  } catch (err) {
    if (err.status === 401) {
      showSignedOut();
      return;
    }
    showPlayError(friendlyError(err));
    scenes = [{ turn: 0, text: book.opening_scene || "" }];
    renderScenes();
  }
  const actions = STARTER_ACTIONS[BOOK_ID] || DEFAULT_ACTIONS;
  actions.forEach((text, i) => {
    const card = document.querySelector(
      '[data-testid="suggestion-' + (i + 1) + '"]',
    );
    card.textContent = text;
    card.setAttribute("aria-label", "Suggestion: " + text);
    card.addEventListener("click", () => {
      el("action-input").value = text;
      el("action-input").focus();
    });
  });
  el("play-status").hidden = true;
  el("play-layout").hidden = false;
}

init();
