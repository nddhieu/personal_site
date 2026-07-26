/**
 * Auth Manager — handles JWT token storage, auth API calls,
 * and Google Sign-In integration for the Co-Author Workbench.
 */

import { API_BASE } from './config.js';

const AUTH_TOKEN_KEY = 'coauthor_auth_token';
const AUTH_USER_KEY = 'coauthor_auth_user';

class AuthManager {
    constructor() {
        this._token = null;
        this._user = null;
        this._onChangeCallbacks = [];
        this._googleInitialized = false;
    }

    // ── Initialization ──────────────────────────────────────────

    /** Restore session from localStorage on page load. */
    init() {
        try {
            const savedToken = localStorage.getItem(AUTH_TOKEN_KEY);
            const savedUser = localStorage.getItem(AUTH_USER_KEY);

            if (savedToken && savedUser) {
                this._token = savedToken;
                this._user = JSON.parse(savedUser);

                // Validate the token by fetching the profile
                this._validateSession();
            }
        } catch (e) {
            console.warn('Failed to restore auth session:', e);
            this._clearSession();
        }
    }

    /** Check if the stored token is still valid against the backend. */
    async _validateSession() {
        try {
            const res = await fetch(`${API_BASE}/auth/me`, {
                headers: this.getAuthHeaders(),
            });

            if (res.ok) {
                const user = await res.json();
                this._user = user;
                localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
                this._notify(true);
            } else {
                // Token expired or invalid
                console.warn('Session validation failed, clearing auth');
                this._clearSession();
                this._notify(false);
            }
        } catch (e) {
            // Network error — keep the session for now, will revalidate later
            console.warn('Session validation network error:', e);
            if (this._token) {
                this._notify(true);
            }
        }
    }

    // ── Session Management ──────────────────────────────────────

    isLoggedIn() {
        return !!this._token;
    }

    getToken() {
        return this._token;
    }

    getUser() {
        return this._user;
    }

    getAuthHeaders() {
        if (!this._token) return {};
        return { Authorization: `Bearer ${this._token}` };
    }

    /** Attach auth headers to any fetch options object. */
    withAuth(fetchOptions = {}) {
        const headers = { ...(fetchOptions.headers || {}), ...this.getAuthHeaders() };
        return { ...fetchOptions, headers };
    }

    _setSession(token, user) {
        this._token = token;
        this._user = user;
        try {
            localStorage.setItem(AUTH_TOKEN_KEY, token);
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        } catch (e) {
            console.warn('Failed to persist auth session:', e);
        }
        this._notify(true);
    }

    _clearSession() {
        this._token = null;
        this._user = null;
        try {
            localStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem(AUTH_USER_KEY);
        } catch (e) {
            // Silently fail
        }
    }

    logout() {
        this._clearSession();
        this._notify(false);
    }

    // ── Auth Change Callbacks ───────────────────────────────────

    onAuthChange(callback) {
        this._onChangeCallbacks.push(callback);
        // Immediately notify with current state
        callback(this.isLoggedIn(), this._user);
    }

    _notify(isLoggedIn) {
        for (const cb of this._onChangeCallbacks) {
            try {
                cb(isLoggedIn, this._user);
            } catch (e) {
                console.error('Auth change callback error:', e);
            }
        }
    }

    // ── API Calls ───────────────────────────────────────────────

    async signup(email, password, displayName) {
        const res = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email.trim(),
                password: password,
                display_name: displayName || undefined,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || 'Signup failed');
        }

        this._setSession(data.access_token, data.user);
        return data;
    }

    async login(email, password) {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email.trim(),
                password: password,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || 'Login failed');
        }

        this._setSession(data.access_token, data.user);
        return data;
    }

    async googleLogin(idToken) {
        const res = await fetch(`${API_BASE}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: idToken }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || 'Google login failed');
        }

        this._setSession(data.access_token, data.user);
        return data;
    }

    async fetchProfile() {
        const res = await fetch(`${API_BASE}/auth/me`, {
            headers: this.getAuthHeaders(),
        });

        if (!res.ok) {
            throw new Error('Failed to fetch profile');
        }

        return res.json();
    }

    // ── Google Sign-In Integration ──────────────────────────────

    /**
     * Initialize the Google Sign-In button.
     * Fetches the Client ID from the backend API (single source of truth in .env),
     * then initializes the Google Identity Services library with it.
     * The `parentId` is the DOM ID of the element where the button should render.
     */
    async initGoogleSignIn(parentId) {
        if (typeof google === 'undefined' || !google.accounts) {
            console.warn('Google Identity Services library not loaded');
            return;
        }

        if (this._googleInitialized) return;

        try {
            // Fetch the Client ID from the backend (single source of truth)
            const res = await fetch(`${API_BASE}/auth/google-client-id`);
            if (!res.ok) {
                console.warn('Google OAuth not configured on backend (set GOOGLE_CLIENT_ID in .env)');
                return;
            }
            const data = await res.json();
            const clientId = data.client_id;
            if (!clientId) {
                console.warn('No Google Client ID returned from backend');
                return;
            }

            this._googleInitialized = true;

            google.accounts.id.initialize({
                client_id: clientId,
                callback: (response) => this._handleGoogleCredential(response),
                auto_prompt: false,
            });

            const btnContainer = document.getElementById(parentId);
            if (btnContainer) {
                google.accounts.id.renderButton(btnContainer, {
                    type: 'standard',
                    size: 'large',
                    theme: 'outline',
                    text: 'sign_in_with',
                    shape: 'rectangular',
                    width: 320,
                });
            }
        } catch (err) {
            console.warn('Failed to initialize Google Sign-In:', err);
        }
    }

    async _handleGoogleCredential(response) {
        try {
            const data = await this.googleLogin(response.credential);
            console.log('Google login successful:', data.user.email);
        } catch (err) {
            console.error('Google login failed:', err);
            alert('Google Sign-In failed: ' + err.message);
        }
    }
}

/** Singleton instance. */
export const auth = new AuthManager();
