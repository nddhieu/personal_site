/* Play screen: live turns against the F3 turn pipeline.
 *
 * WIRING SECTION (separable): everything in this file is the live
 * play wiring - start a playthrough, Enter/Continue as real turns,
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
 * voice. Suggestions (F3 suggest, built on top of T1): the
 * turn response carries suggestions[] for the new scene; this
 * file renders them into the cards, opens the panel, and a
 * tap plays the turn by suggestion id. The starter actions
 * below only cover the time before the first turn lands. */

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
let currentSuggestions = [];
let loadedSuggestions = [];

function sceneText(scene) {
  return typeof scene === "string" ? scene : (scene && scene.text) || "";
}

function diaryText(entry) {
  return typeof entry === "string" ? entry : (entry && entry.text) || "";
}

/* User-input markers (Hieu, Oct 28): a scene that came from a turn
 * carries the action the reader typed or picked. A small marker
 * sits in the book just before that scene; clicking it expands
 * or collapses the input text. Markers + input text are app-only:
 * play.css hides them in print, and the book page never renders
 * them, so printed/exported prose stays clean. Expanded markers
 * survive re-renders (a landing scene rebuilds the list) via
 * expandedInputs. The marker precedes its scene paragraph, so
 * scrollToLatestScene's lastElementChild is still the scene. */
let expandedInputs = new Set();

function renderScenes() {
  const prose = el("prose");
  prose.innerHTML = "";
  scenes.forEach((scene, i) => {
    const action = scene && scene.action ? String(scene.action) : "";
    if (action) {
      const key = scene.turn ?? i;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "turn-input-marker";
      marker.dataset.testid = "input-marker-" + key;
      const expanded = expandedInputs.has(key);
      marker.setAttribute("aria-expanded", String(expanded));
      marker.setAttribute("aria-label",
        "Your input for this scene: " + action);
      marker.textContent = "\u270e";
      const input = document.createElement("div");
      input.className = "turn-input";
      input.dataset.testid = "input-text-" + key;
      input.hidden = !expanded;
      input.textContent = action;
      marker.addEventListener("click", () => {
        const open = input.hidden;
        input.hidden = !open;
        marker.setAttribute("aria-expanded", String(open));
        if (open) expandedInputs.add(key);
        else expandedInputs.delete(key);
      });
      prose.append(marker, input);
    }
    const p = document.createElement("p");
    // Diary jump target (F3 T3): the opening premise is turn 0.
    if (typeof scene !== "string" && Number.isInteger(scene && scene.turn)) {
      p.id = "scene-" + scene.turn;
    }
    p.textContent = sceneText(scene);
    prose.append(p);
  });
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

/* Diary jump (F3 T3): tapping a diary entry is read-only
 * navigation - it closes the diary panel, scrolls to that
 * entry's scene, and briefly highlights it. It changes no
 * story state; rewind is the separate f3-t4 item. An entry
 * with no matching rendered scene leaves everything as-is. */
function jumpToScene(turn) {
  const scene = document.getElementById("scene-" + turn);
  if (!scene) return;
  el("diary-panel").hidden = true;
  scene.scrollIntoView({ block: "start", behavior: "smooth" });
  scene.classList.add("scene-jump-highlight");
  setTimeout(() => scene.classList.remove("scene-jump-highlight"), 2000);
}

function renderDiary(entries) {
  const list = el("diary-list");
  list.innerHTML = "";
  const items = (entries || []).filter((entry) => diaryText(entry));
  el("diary-empty").hidden = items.length > 0;
  for (const entry of items) {
    const li = document.createElement("li");
    const turn = typeof entry === "object" && entry !== null
      ? entry.turn
      : null;
    if (Number.isInteger(turn)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "diary-entry";
      btn.setAttribute("data-testid", "diary-entry-" + turn);
      btn.textContent = diaryText(entry);
      btn.addEventListener("click", () => jumpToScene(turn));
      li.append(btn);
    } else {
      // Legacy string entry (no turn): plain text, as before.
      li.textContent = diaryText(entry);
    }
    list.append(li);
  }
}

/* Suggestion cards (F3 suggest): generated cards carry a
 * server id and PLAY the turn when tapped (design-v2);
 * starter cards (before the first turn, no id) keep the old
 * behaviour of staging their text into the input. */
function renderSuggestions(list) {
  (list || []).slice(0, 3).forEach((s, i) => {
    const card = document.querySelector(
      '[data-testid="suggestion-' + (i + 1) + '"]',
    );
    if (!card) return;
    card.textContent = s.text;
    card.dataset.suggestionId = s.id;
    card.setAttribute(
      "aria-label",
      "Suggestion: " + s.text + (s.hint ? " - " + s.hint : ""),
    );
  });
}

function renderStarterCards() {
  const actions = STARTER_ACTIONS[BOOK_ID] || DEFAULT_ACTIONS;
  actions.forEach((text, i) => {
    const card = document.querySelector(
      '[data-testid="suggestion-' + (i + 1) + '"]',
    );
    if (!card) return;
    card.textContent = text;
    delete card.dataset.suggestionId;
    card.setAttribute("aria-label", "Suggestion: " + text);
  });
}

function openSuggestPanel() {
  el("suggest-panel").hidden = false;
  el("suggest-toggle").setAttribute("aria-expanded", "true");
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
  el("continue-btn").disabled = b;
  el("action-input").disabled = b;
  el("suggest-toggle").disabled = b;
  el("reset-btn").disabled = b;
  document
    .querySelectorAll(".suggestion-card")
    .forEach((card) => { card.disabled = b; });
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

/* After a turn lands, bring the reader to the START of the new
 * scene (Hieu, Oct 27) - they read it from its first line, not
 * from wherever the page happened to be sitting. */
function scrollToLatestScene() {
  const last = el("prose").lastElementChild;
  if (last) last.scrollIntoView({ block: "start", behavior: "smooth" });
}

/* One turn, however it was played: a typed action, a tapped
 * suggestion ({suggestion_id}), or Continue ({continue: true}).
 * On success the response's suggestions (when the backend
 * generated a set) replace the cards and the panel opens -
 * that is the moment the reader looks for them (Hieu, Oct 27).
 * When generation failed open (empty set), the current cards
 * and panel state are left exactly as they were. */
async function runTurnBody(body, actionText) {
  if (busy || !playthroughId) return;
  setBusy(true);
  showLoading(el("play-note"), "Writing the next scene...");
  try {
    const result = await apiFetch(
      "/api/playthroughs/" + encodeURIComponent(playthroughId) + "/turns",
      { method: "POST", body },
    );
    const scene = result.scene || result.text || "";
    if (scene) {
      scenes.push({
        turn: result.turn,
        action: actionText || sceneActionText(result),
        text: scene,
      });
    }
    renderScenes();
    if (scene) scrollToLatestScene();
    el("action-input").value = "";
    growInput();
    if (result.continued_with) {
      showPlayNote(
        'Continuing with: "' + result.continued_with.text + '" - ' +
          result.continued_with.hint,
      );
    } else {
      showNote(el("play-note"), "");
    }
    if (result.suggestions && result.suggestions.length === 3) {
      currentSuggestions = result.suggestions;
      renderSuggestions(currentSuggestions);
      openSuggestPanel();
    }
    const state = await refreshDiary();
    if (state && state.bible) renderBible(state.bible);
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      showSignedOut();
      return;
    }
    if (err.status === 422 && (body.suggestion_id || body.continue)) {
      // Stale pick (Milo's review condition): the scene and
      // the current cards stay; just say the pick expired.
      showPlayNote("That suggestion expired - pick another one.");
      if (currentSuggestions.length === 3) {
        renderSuggestions(currentSuggestions);
      }
      return;
    }
    showPlayError(friendlyError(err));
  } finally {
    setBusy(false);
  }
}

function sceneActionText(result) {
  return result.continued_with ? result.continued_with.text : "";
}

async function runTurn(action) {
  const text = (action || "").trim();
  if (!text) {
    showPlayNote("Write what you do next, or pick a suggestion.");
    el("action-input").focus();
    return;
  }
  await runTurnBody({ action: text }, text);
}

/* The input starts at one row and grows with the text, up
 * to the five-line cap in play.css (Hieu, Oct 27). */
function growInput() {
  const input = el("action-input");
  input.style.height = "auto";
  input.style.height = input.scrollHeight + "px";
}
el("action-input").addEventListener("input", growInput);

/* No Send button (Hieu, Oct 27): Enter sends the turn,
 * Shift+Enter makes a new line. */
el("action-input").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    runTurn(el("action-input").value);
  }
});

el("suggest-toggle").addEventListener("click", () => {
  const panel = el("suggest-panel");
  panel.hidden = !panel.hidden;
  el("suggest-toggle").setAttribute(
    "aria-expanded",
    String(!panel.hidden),
  );
});

el("continue-btn").addEventListener("click", () => {
  const staged = el("action-input").value.trim();
  if (staged) {
    runTurn(staged);
    return;
  }
  if (currentSuggestions.length === 3) {
    // Let the backend pick its best trait-fit suggestion; the
    // response names the pick and why (continued_with).
    runTurnBody({ continue: true }, "");
    return;
  }
  const actions = STARTER_ACTIONS[BOOK_ID] || DEFAULT_ACTIONS;
  runTurn(actions[0]);
});

el("diary-btn").addEventListener("click", async () => {
  const panel = el("diary-panel");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) await refreshDiary();
});

/* Reset (Hieu's Oct 28 book test): wipes the current
 * playthrough and starts again from the beginning. Two-step
 * confirmation on the button itself: the first tap arms it
 * ("Reset story? Tap again to confirm") for 5 seconds; only
 * the second tap wipes anything, so a stray tap can never
 * destroy progress. The wipe deletes the run server-side
 * (not just locally): the resume listing surfaces the most
 * progressed run, so a local-only reset would be resurrected
 * on the next visit. After the delete, a fresh run is created
 * from the book's opening scene and rendered in place. */
let resetArmed = false;
let resetTimer = null;

function disarmReset() {
  resetArmed = false;
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  const btn = el("reset-btn");
  btn.textContent = "Reset";
  btn.setAttribute("aria-label", "Reset the story and start over");
  btn.classList.remove("confirming");
}

async function resetPlaythrough() {
  if (busy || !playthroughId) return;
  const oldId = playthroughId;
  setBusy(true);
  showLoading(el("play-note"), "Starting over...");
  try {
    try {
      await apiFetch(
        "/api/playthroughs/" + encodeURIComponent(oldId),
        { method: "DELETE" },
      );
    } catch (err) {
      // Already gone (another tab reset it, or a stale id):
      // the wipe is done, just start fresh. Anything else -
      // including a signed-out 401 - aborts the reset.
      if (err.status === 401) {
        clearToken();
        showSignedOut();
        return;
      }
      if (err.status !== 404) throw err;
    }
    let state = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 2 && !state; attempt++) {
      try {
        state = await apiFetch(
          "/api/books/" + encodeURIComponent(BOOK_ID) + "/playthroughs",
          { method: "POST" },
        );
      } catch (err) {
        lastErr = err;
      }
    }
    if (!state) throw lastErr;
    playthroughId = state.id;
    sessionStorage.setItem(PLAYTHROUGH_KEY, playthroughId);
    scenes = state.scenes && state.scenes.length
      ? state.scenes
      : [{ turn: 0, text: book.opening_scene || "" }];
    expandedInputs.clear();
    currentSuggestions = [];
    loadedSuggestions = [];
    renderScenes();
    renderDiary(state.diary);
    if (state.bible) renderBible(state.bible);
    renderStarterCards();
    el("suggest-panel").hidden = true;
    el("suggest-toggle").setAttribute("aria-expanded", "false");
    el("action-input").value = "";
    showPlayNote("Started over from the beginning.");
    el("prose").scrollIntoView({ block: "start", behavior: "smooth" });
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      showSignedOut();
      return;
    }
    // The old run is already deleted at this point, so the
    // page must not keep pointing at it: clear the stored id
    // so the next visit starts fresh instead of 404ing.
    playthroughId = "";
    sessionStorage.removeItem(PLAYTHROUGH_KEY);
    scenes = [{ turn: 0, text: (book && book.opening_scene) || "" }];
    renderScenes();
    showPlayError(friendlyError(err));
  } finally {
    setBusy(false);
    disarmReset();
  }
}

el("reset-btn").addEventListener("click", () => {
  if (busy) return;
  if (!playthroughId) {
    showPlayNote("No story in progress to reset.");
    return;
  }
  if (!resetArmed) {
    resetArmed = true;
    const btn = el("reset-btn");
    btn.textContent = "Reset story? Tap again to confirm";
    btn.setAttribute(
      "aria-label", "Tap again to confirm resetting the story");
    btn.classList.add("confirming");
    resetTimer = setTimeout(disarmReset, 5000);
    return;
  }
  resetPlaythrough();
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
    // Reload resumes the same playthrough (its scenes and
    // its current suggestions come back with it); only a
    // first visit - or a playthrough that is gone - starts
    // a new one.
    let state = null;
    if (playthroughId) {
      try {
        state = await apiFetch(
          "/api/playthroughs/" + encodeURIComponent(playthroughId),
        );
      } catch (err) {
        if (err.status !== 404) throw err;
        state = null;
      }
    }
    if (!state) {
      // Returning reader, fresh tab or browser: sessionStorage
      // is gone, but the account's runs live server-side. Resume
      // the latest one instead of starting fresh while the work
      // sits on the server. A 4xx here means an older backend
      // without the list endpoint (404/405) - fall through to a
      // new playthrough, as before; a 5xx is a real server
      // problem and surfaces instead of silently duplicating
      // the reader's run.
      try {
        const mine = await apiFetch(
          "/api/books/" + encodeURIComponent(BOOK_ID) + "/playthroughs",
        );
        const latest = (mine.playthroughs || [])[0];
        if (latest) {
          state = await apiFetch(
            "/api/playthroughs/" + encodeURIComponent(latest.id),
          );
          playthroughId = state.id;
          sessionStorage.setItem(PLAYTHROUGH_KEY, playthroughId);
        }
      } catch (err) {
        if (err.status >= 500) throw err;
      }
    }
    if (!state) {
      state = await apiFetch(
        "/api/books/" + encodeURIComponent(BOOK_ID) + "/playthroughs",
        { method: "POST" },
      );
      playthroughId = state.id;
      sessionStorage.setItem(PLAYTHROUGH_KEY, playthroughId);
    }
    scenes = state.scenes && state.scenes.length
      ? state.scenes
      : [{ turn: 0, text: book.opening_scene || "" }];
    renderScenes();
    renderDiary(state.diary);
    loadedSuggestions = state.suggestions || [];
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
  document.querySelectorAll(".suggestion-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (card.dataset.suggestionId) {
        runTurnBody(
          { suggestion_id: card.dataset.suggestionId },
          card.textContent,
        );
      } else {
        el("action-input").value = card.textContent;
        growInput();
        el("action-input").focus();
      }
    });
  });
  if (loadedSuggestions.length === 3) {
    // Reload case: the persisted set is still the current one
    // (panel stays collapsed on load, per the redesign).
    currentSuggestions = loadedSuggestions;
    renderSuggestions(currentSuggestions);
  } else {
    renderStarterCards();
  }
  el("play-status").hidden = true;
  el("play-layout").hidden = false;
}

init();
