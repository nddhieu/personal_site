/* Shared API client for the NEW writer pages (login, home, book,
 * play). Separate from the legacy writer/js/api.js, which serves
 * the old coauthor workbench (different token key, different
 * endpoints). Import this, never the legacy module, from the new
 * pages.
 *
 * API base rule (same as the old pages): ?api= override wins;
 * localhost pages use http://localhost:8001; any other host uses
 * the Tailscale Serve address. The API container is localhost-only
 * by design, so off-PC traffic must go through Serve. */

export const TOKEN_KEY = "st_session_token";

export function resolveApiBase() {
  const override = new URLSearchParams(location.search).get("api");
  if (override) return override;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return "http://localhost:8001";
  }
  // serverPC dev GUI: same-origin
  // /api, proxied by the GUI server to the dev API on 127.0.0.1:8002.
  if (
    location.hostname === "100.66.24.109" ||
    location.hostname === "serverpc" ||
    location.hostname === "serverpc.tailf1523e.ts.net"
  ) {
    return "";
  }
  return "https://hieupc.tailf1523e.ts.net";
}

export const API_BASE = resolveApiBase();

/* Errors users see are friendly sentences, never HTTP status codes
 * or API-shaped detail strings. Callers treat status 401 specially
 * (the session is gone -> show the signed-out state). */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(path, options = {}) {
  const method = options.method || "GET";
  const headers = { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = "Bearer " + token;
  }
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      "We couldn't reach the server. Check your connection and try again.",
      0,
    );
  }
  if (res.status === 401) {
    throw new ApiError("unauthorized", 401);
  }
  if (!res.ok) {
    if (res.status === 404) {
      throw new ApiError(
        "We couldn't find that. It may have been moved or removed.",
        404,
      );
    }
    if (res.status === 502 || res.status === 503) {
      throw new ApiError(
        "The story engine is busy right now. Please try again in a moment.",
        res.status,
      );
    }
    throw new ApiError("Something went wrong. Please try again.", res.status);
  }
  /* Binary endpoints (scene images) opt in with
   * { response: "blob" } and get the raw bytes; every other
   * caller keeps the parsed-JSON behaviour below. */
  if (options.response === "blob") return res.blob();
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response; data stays null */
  }
  return data;
}
