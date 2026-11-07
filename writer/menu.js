/* Menu page: the account + appearance home for the writer app.
 *
 * The Dark theme toggle and Log out lived in the shared topbar;
 * at Hieu's direction (Nov 7) they moved here, into a Menu tab
 * added to the bottom bar, so Explore can drop its topbar and
 * open with just the search row and the filter row, like the
 * Emochi reference. Other pages still render the topbar for
 * now; this page never did — the Menu is the topbar's job here.
 *
 * Theme uses the same theme.js store as the topbar toggle
 * (localStorage "writer-theme"), so a choice made in either
 * place is the choice everywhere. The button names the CURRENT
 * theme (a settings-row convention, unlike the topbar button,
 * which names the target) and carries aria-pressed for the
 * dark state. NOTE: the button's id is deliberately not
 * "theme-toggle" — theme.js auto-wires an element with that id
 * and a second listener would toggle twice per tap.
 *
 * Log out is app-auth.js logout(): clears the session token and
 * goes to the login page, exactly like the topbar button. */

import { getToken, getMe, clearToken, logout } from "./js/app-auth.js";
import { friendlyError } from "./js/app-ui.js";
import { getTheme, toggleTheme } from "./js/theme.js";
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

function syncThemeButton() {
  const dark = getTheme() === "dark";
  const btn = el("menu-theme");
  btn.textContent = dark ? "Dark" : "Light";
  btn.setAttribute("aria-pressed", String(dark));
}

async function init() {
  renderShell({ active: "menu" });
  syncThemeButton();
  el("menu-theme").addEventListener("click", () => {
    toggleTheme();
    syncThemeButton();
  });
  el("menu-logout").addEventListener("click", () => logout());
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
}

init();
