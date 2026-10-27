/**
 * Pure input validation for "Create new account" (F1-T1).
 * Matches backend POST /api/auth/signup rules without leaking passwords.
 */

import { VALIDATION_RULES } from './signup-config.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check whether an email string is syntactically valid.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
    if (typeof email !== 'string') return false;
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) return false;
    return EMAIL_PATTERN.test(trimmed);
}

/**
 * Validate signup form fields before submitting to POST /api/auth/signup.
 * @param {object} input
 * @param {string} input.email
 * @param {string} input.password
 * @param {string} [input.confirmPassword]
 * @param {string} [input.displayName]
 * @returns {{ valid: boolean, error: string, fieldErrors: Record<string, string>, normalized: { email: string, displayName: string } }}
 */
export function validateSignupInput({ email = '', password = '', confirmPassword, displayName = '' } = {}) {
    const fieldErrors = {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
    const rawPassword = typeof password === 'string' ? password : '';

    if (!isValidEmail(normalizedEmail)) {
        fieldErrors.email = 'Please enter a valid email address.';
    }

    if (rawPassword.length < VALIDATION_RULES.MIN_PASSWORD_LENGTH) {
        fieldErrors.password = `Password must be at least ${VALIDATION_RULES.MIN_PASSWORD_LENGTH} characters.`;
    }

    if (confirmPassword !== undefined && rawPassword !== confirmPassword) {
        fieldErrors.confirmPassword = 'Passwords do not match.';
    }

    const firstError =
        fieldErrors.email ||
        fieldErrors.password ||
        fieldErrors.confirmPassword ||
        '';

    return {
        valid: Object.keys(fieldErrors).length === 0,
        error: firstError,
        fieldErrors,
        normalized: {
            email: normalizedEmail,
            displayName: normalizedDisplayName,
        },
    };
}
