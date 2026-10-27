/**
 * Signup page controller & API integration for F1-T1 ("Create new account").
 * Uses existing POST /api/auth/signup endpoint and persists session token + user_id.
 * Never logs or persists plaintext passwords.
 */

import { SIGNUP_ENDPOINT, STORAGE_KEYS, ROUTES } from './signup-config.js';
import { validateSignupInput } from './signup-validate.js';

/**
 * Persist the authenticated session returned by POST /api/auth/signup.
 * @param {{ access_token: string, user: { id: string, email: string, display_name?: string, avatar_url?: string } }} data
 * @param {Storage} [storage]
 */
export function saveSignupSession(data, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    if (!data || !data.access_token || !data.user || !data.user.id) {
        throw new Error('Invalid signup response: missing token or user_id');
    }
    const sessionUser = {
        id: String(data.user.id),
        user_id: String(data.user.id),
        email: data.user.email,
        display_name: data.user.display_name || data.user.email.split('@')[0],
        avatar_url: data.user.avatar_url || null,
    };

    if (storage) {
        storage.setItem(STORAGE_KEYS.TOKEN, data.access_token);
        storage.setItem(STORAGE_KEYS.USER, JSON.stringify(sessionUser));
        storage.setItem(STORAGE_KEYS.USER_ID, sessionUser.id);
    }

    return {
        token: data.access_token,
        user_id: sessionUser.id,
        user: sessionUser,
        isLoggedIn: true,
    };
}

/**
 * Read current session state from storage.
 * @param {Storage} [storage]
 */
export function getSignupSession(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    if (!storage) return { token: null, user_id: null, user: null, isLoggedIn: false };
    try {
        const token = storage.getItem(STORAGE_KEYS.TOKEN);
        const rawUser = storage.getItem(STORAGE_KEYS.USER);
        const user = rawUser ? JSON.parse(rawUser) : null;
        const userId = (user && user.id) || storage.getItem(STORAGE_KEYS.USER_ID) || null;
        return {
            token: token || null,
            user_id: userId,
            user,
            isLoggedIn: Boolean(token && userId),
        };
    } catch {
        return { token: null, user_id: null, user: null, isLoggedIn: false };
    }
}

/**
 * Clear stored auth session.
 * @param {Storage} [storage]
 */
export function clearSignupSession(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    if (!storage) return;
    storage.removeItem(STORAGE_KEYS.TOKEN);
    storage.removeItem(STORAGE_KEYS.USER);
    storage.removeItem(STORAGE_KEYS.USER_ID);
}

/**
 * Call POST /api/auth/signup with validated credentials.
 * @param {{ email: string, password: string, displayName?: string }} payload
 * @param {typeof fetch} [fetchImpl]
 */
export async function submitSignupRequest({ email, password, displayName }, fetchImpl = fetch) {
    const body = {
        email: email.trim().toLowerCase(),
        password,
    };
    if (displayName && displayName.trim()) {
        body.display_name = displayName.trim();
    }

    const response = await fetchImpl(SIGNUP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    let data = {};
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        const detail = typeof data.detail === 'string'
            ? data.detail
            : 'Unable to create account. Please check your details and try again.';
        const err = new Error(detail);
        err.status = response.status;
        throw err;
    }

    return data;
}

/**
 * Wire DOM events for signup.html.
 * @param {Document} [doc]
 */
export function initSignupPage(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return;

    const form = doc.getElementById('signup-form');
    const emailInput = doc.getElementById('signup-email');
    const displayNameInput = doc.getElementById('signup-display-name');
    const passwordInput = doc.getElementById('signup-password');
    const confirmInput = doc.getElementById('signup-confirm');
    const submitBtn = doc.getElementById('signup-submit');
    const submitLabel = doc.getElementById('signup-submit-label');
    const submitSpinner = doc.getElementById('signup-submit-spinner');
    const errorBanner = doc.getElementById('signup-error');
    const emailError = doc.getElementById('signup-email-error');
    const passwordError = doc.getElementById('signup-password-error');
    const confirmError = doc.getElementById('signup-confirm-error');
    const successPanel = doc.getElementById('signup-success');
    const successName = doc.getElementById('signup-user-name');
    const successEmail = doc.getElementById('signup-user-email');
    const successUserId = doc.getElementById('signup-user-id');
    const signoutBtn = doc.getElementById('signup-signout-btn');
    const themeToggle = doc.getElementById('theme-toggle');

    if (!form) return;

    function clearErrors() {
        if (errorBanner) {
            errorBanner.textContent = '';
            errorBanner.hidden = true;
        }
        const pairs = [
            [emailInput, emailError],
            [passwordInput, passwordError],
            [confirmInput, confirmError],
        ];
        for (const [input, errEl] of pairs) {
            if (input) input.classList.remove('input-error');
            if (errEl) {
                errEl.textContent = '';
                errEl.hidden = true;
            }
        }
    }

    function showErrors(message, fieldErrors = {}) {
        if (errorBanner && message) {
            errorBanner.textContent = message;
            errorBanner.hidden = false;
        }
        if (fieldErrors.email && emailInput && emailError) {
            emailInput.classList.add('input-error');
            emailError.textContent = fieldErrors.email;
            emailError.hidden = false;
        }
        if (fieldErrors.password && passwordInput && passwordError) {
            passwordInput.classList.add('input-error');
            passwordError.textContent = fieldErrors.password;
            passwordError.hidden = false;
        }
        if (fieldErrors.confirmPassword && confirmInput && confirmError) {
            confirmInput.classList.add('input-error');
            confirmError.textContent = fieldErrors.confirmPassword;
            confirmError.hidden = false;
        }
    }

    function setLoading(isLoading) {
        if (submitBtn) submitBtn.disabled = isLoading;
        if (submitLabel) submitLabel.textContent = isLoading ? 'Creating account...' : 'Create account';
        if (submitSpinner) submitSpinner.hidden = !isLoading;
    }

    function renderLoggedInState(session) {
        form.hidden = true;
        if (successPanel) {
            successPanel.hidden = false;
            if (successName) successName.textContent = session.user.display_name || session.user.email;
            if (successEmail) successEmail.textContent = session.user.email;
            if (successUserId) successUserId.textContent = session.user_id;
        }
    }

    [emailInput, displayNameInput, passwordInput, confirmInput].forEach((input) => {
        if (input) input.addEventListener('input', clearErrors);
    });

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            doc.body.classList.toggle('light-theme');
        });
    }

    if (signoutBtn) {
        signoutBtn.addEventListener('click', () => {
            clearSignupSession();
            if (successPanel) successPanel.hidden = true;
            form.hidden = false;
            form.reset();
            clearErrors();
        });
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearErrors();

        const rawInput = {
            email: emailInput ? emailInput.value : '',
            displayName: displayNameInput ? displayNameInput.value : '',
            password: passwordInput ? passwordInput.value : '',
            confirmPassword: confirmInput ? confirmInput.value : undefined,
        };

        const validation = validateSignupInput(rawInput);
        if (!validation.valid) {
            showErrors(validation.error, validation.fieldErrors);
            return;
        }

        setLoading(true);
        try {
            const responseData = await submitSignupRequest({
                email: validation.normalized.email,
                password: rawInput.password,
                displayName: validation.normalized.displayName,
            });

            // Immediately wipe password fields from DOM memory
            if (passwordInput) passwordInput.value = '';
            if (confirmInput) confirmInput.value = '';

            const session = saveSignupSession(responseData);
            renderLoggedInState(session);

            if (typeof window !== 'undefined' && window.location.search.includes('redirect=1')) {
                window.location.assign(ROUTES.WORKBENCH);
            }
        } catch (err) {
            showErrors(err.message || 'Signup failed. Please try again.');
        } finally {
            setLoading(false);
        }
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initSignupPage(document));
    } else {
        initSignupPage(document);
    }
}
