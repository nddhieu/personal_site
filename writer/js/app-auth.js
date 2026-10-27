/* Shared session helpers for the NEW writer pages. Token key
 * st_session_token, same as the login page has always used. */

import { TOKEN_KEY, apiFetch } from "./app-api.js";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getMe() {
  return apiFetch("/api/auth/me");
}

export function logout(redirect = "./login.html") {
  clearToken();
  window.location.href = redirect;
}

/* Returns the token, or sends the user to the login page when there
 * is none. Callers that render a signed-out state instead should use
 * getToken() directly. */
export function requireToken(redirect = "./login.html") {
  const token = getToken();
  if (!token) window.location.href = redirect;
  return token;
}
