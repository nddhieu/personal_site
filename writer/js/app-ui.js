/* Shared UI helpers for the NEW writer pages: the topbar, loading
 * rows, and friendly notes. Page code stays thin; anything two
 * pages share lives here. */

import { logout } from "./app-auth.js";
// Side effect: applying the saved theme on import puts the theme
// toggle on every topbar page (home, book, play, create) with no
// per-page edits; see theme.js.
import { getTheme, toggleTheme } from "./theme.js";

/* Renders the shared topbar into <div id="app-topbar">: product
 * name (links home), optional Back link, theme toggle + Log out
 * on the right. The toggle flips the saved light/dark theme (see
 * theme.js) and its label names the theme it switches to.
 * Call with { backHref: "./book.html?id=..." } on book/play. */
export function renderTopbar(options = {}) {
  const host = document.getElementById("app-topbar");
  if (!host) return;
  host.className = "app-topbar";
  host.innerHTML = "";
  const brand = document.createElement("a");
  brand.className = "app-topbar-brand";
  brand.href = "./home.html";
  brand.textContent = "AI Storytelling Co-Author";
  host.append(brand);
  if (options.backHref) {
    const back = document.createElement("a");
    back.className = "app-topbar-back";
    back.href = options.backHref;
    back.textContent = options.backLabel || "Back";
    host.append(back);
  }
  const spacer = document.createElement("span");
  spacer.className = "app-topbar-spacer";
  host.append(spacer);
  const theme = document.createElement("button");
  theme.type = "button";
  theme.className = "btn btn-ghost btn-sm app-topbar-theme";
  theme.setAttribute("data-testid", "theme-toggle");
  theme.setAttribute("aria-label", "Switch color theme");
  theme.textContent = getTheme() === "dark" ? "Light" : "Dark";
  theme.addEventListener("click", () => {
    const next = toggleTheme();
    theme.textContent = next === "dark" ? "Light" : "Dark";
  });
  host.append(theme);
  const out = document.createElement("button");
  out.type = "button";
  out.className = "btn btn-ghost btn-sm app-topbar-logout";
  out.textContent = "Log out";
  out.addEventListener("click", () => logout());
  host.append(out);
}

/* Shows a brand spinner + text inside an element (loading states). */
export function showLoading(el, text) {
  el.innerHTML = "";
  const spin = document.createElement("span");
  spin.className = "spinner";
  spin.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = text;
  el.append(spin, label);
  el.hidden = false;
}

/* Sets a note/status element's text; hides it when empty. */
export function showNote(el, text) {
  el.textContent = text || "";
  el.hidden = !text;
}

/* Friendly fallback for an unexpected error object. */
export function friendlyError(err) {
  if (err && err.message && err.message !== "unauthorized") return err.message;
  return "Something went wrong. Please try again.";
}
