/* Shared light/dark theme for the writer app (theme-toggle).
 * The brand tokens already carry both themes: dark is the :root
 * default and body.light-theme flips them to light. This module
 * only flips that class and persists the choice; it never touches
 * the shared brand files.
 *
 * Loaded two ways, both for the same side effect (apply the saved
 * theme as soon as the module evaluates; module scripts are
 * deferred, so document.body exists):
 *  - imported by app-ui.js, so every topbar page (home, book,
 *    play, create) applies the saved theme with no page edits;
 *  - loaded as a module script on login/signup, which have no
 *    topbar. It also wires a page own #theme-toggle button when
 *    one exists there; the topbar button is created later by
 *    renderTopbar and wired there instead.
 *
 * Known limit: a stored dark theme flashes light first, because
 * the pages ship class="light-theme" in HTML. Removing that flash
 * needs a tiny inline script in every page head; left as a
 * follow-up, not done here so no page markup changes are needed.
 */

const STORAGE_KEY = "writer-theme";
export const LIGHT = "light";
export const DARK = "dark";

function readSaved() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === DARK ? DARK : LIGHT;
  } catch {
    return LIGHT; // storage unavailable (e.g. private mode): light default
  }
}

/* Effective theme. Kept in memory as well as storage so toggling
 * still works on a page when storage throws. */
let current = readSaved();

export function getTheme() {
  return current;
}

export function applyTheme(theme) {
  current = theme === DARK ? DARK : LIGHT;
  document.body.classList.toggle("light-theme", current !== DARK);
  return current;
}

export function toggleTheme() {
  const next = current === DARK ? LIGHT : DARK;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Theme still applies for this page; it just will not persist.
  }
  return applyTheme(next);
}

applyTheme(current);

const ownButton = document.getElementById("theme-toggle");
if (ownButton) {
  ownButton.addEventListener("click", () => {
    toggleTheme();
  });
}
