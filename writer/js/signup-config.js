/**
 * Configuration for the Writer Signup page (F1-T1).
 * Separated from validation and UI logic per repo standards.
 * No secrets, keys, or tokens live in this file.
 */

const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';

const isLocalEnv =
    !isBrowser ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.protocol === 'file:';

const customBase =
    isBrowser && window.__COAUTHOR_API_BASE__
        ? window.__COAUTHOR_API_BASE__
        : null;

export const API_BASE = customBase || (isLocalEnv ? 'http://127.0.0.1:8001/api' : '/api');

export const SIGNUP_ENDPOINT = `${API_BASE}/auth/signup`;

export const STORAGE_KEYS = Object.freeze({
    TOKEN: 'coauthor_auth_token',
    USER: 'coauthor_auth_user',
    USER_ID: 'coauthor_auth_user_id',
});

export const VALIDATION_RULES = Object.freeze({
    MIN_PASSWORD_LENGTH: 6,
    MAX_PASSWORD_BYTES: 72,
});

export const ROUTES = Object.freeze({
    LOGIN: './',
    WORKBENCH: './',
});
