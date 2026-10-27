/* Login page logic - AI Storytelling Co-Author (T0, GUI fix pass).
 * Talks to the backend auth routes as-is:
 *   POST /api/auth/login   {email, password}  -> {access_token}
 *   POST /api/auth/google  {id_token}         -> {access_token}
 *   GET  /api/auth/google-client-id           -> {client_id}
 *   POST /api/auth/guest                      -> {access_token}
 * No credential, key, or token value is stored in this file.
 * Google sign-in is parked: the Google button is disabled with a
 * "Coming soon" badge in login.html until the backend is
 * configured. Re-enabling it is one HTML change (remove disabled
 * + the badge); the flow below stays intact. */

import { apiFetch } from "./js/app-api.js";
import { setToken } from "./js/app-auth.js";

const AFTER_LOGIN = "./home.html";

const $ = (id) => document.getElementById(id);
const form = $("loginForm");
const errorBox = $("formError");
const noteBox = $("statusNote");
const loginBtn = $("loginBtn");
const googleBtn = $("googleBtn");

function showError(msg) {
  errorBox.textContent = msg || "";
  errorBox.hidden = !msg;
}

function showNote(msg) {
  noteBox.textContent = msg || "";
  noteBox.hidden = !msg;
}

function setBusy(busy) {
  loginBtn.disabled = busy;
  loginBtn.textContent = busy ? "Signing in..." : "Sign in";
}

function finishLogin(data) {
  if (data && data.access_token) {
    setToken(data.access_token);
  }
  window.location.href = AFTER_LOGIN;
}

/* --- Email + password --- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  showNote("");
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) {
    showError("Enter your email and password.");
    return;
  }
  setBusy(true);
  try {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    finishLogin(data);
  } catch (err) {
    showError(err.message || "Sign-in failed. Check your email and password.");
  } finally {
    setBusy(false);
  }
});

/* --- Google (Identity Services -> backend google route) ---
 * Parked: the button is disabled in the HTML, so this never runs
 * until Google is configured and the button is re-enabled. */
async function startGoogle() {
  if (googleBtn.disabled) return;
  showError("");
  showNote("");
  let clientId = "";
  try {
    const data = await apiFetch("/api/auth/google-client-id", { auth: false });
    clientId = data.client_id || data.google_client_id || data.clientId || "";
  } catch {
    showError("Could not reach the server to start Google sign-in.");
    return;
  }
  if (!clientId) {
    showError("Google sign-in is not configured on this server yet.");
    return;
  }
  if (!window.google || !google.accounts || !google.accounts.id) {
    showError("Google sign-in is still loading - try again in a moment.");
    return;
  }
  google.accounts.id.initialize({
    client_id: clientId,
    callback: async (resp) => {
      try {
        const data = await apiFetch("/api/auth/google", {
          method: "POST",
          auth: false,
          body: { id_token: resp.credential },
        });
        finishLogin(data);
      } catch (err) {
        showError(err.message || "Google sign-in failed.");
      }
    },
  });
  google.accounts.id.prompt();
}
googleBtn.addEventListener("click", startGoogle);

/* --- Guest (shared demo account; the backend resolves it) --- */
$("guestBtn").addEventListener("click", async () => {
  showError("");
  showNote("Signing in as the shared demo guest...");
  try {
    // No credentials from the GUI: the backend loads the guest
    // account from the DB and issues the token (F1 T6).
    const data = await apiFetch("/api/auth/guest", {
      method: "POST",
      auth: false,
    });
    finishLogin(data);
  } catch (err) {
    showNote(err.message || "Guest sign-in is not available on this server.");
  }
});
