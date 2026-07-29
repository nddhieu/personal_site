import { API_BASE } from './config.js';
import { auth } from './auth.js';

/**
 * Wrapper around fetch that attaches auth headers automatically.
 * Also handles 401 responses by logging the user out.
 */
async function fetchWithAuth(url, options = {}) {
    const opts = auth.withAuth(options);

    try {
        const res = await fetch(url, opts);

        // If we get a 401 and have a token, the session expired
        if (res.status === 401 && auth.getToken()) {
            console.warn('Session expired — logging out');
            auth.logout();
            // The auth change callback will handle showing the login page
        }

        return res;
    } catch (err) {
        // Network errors will propagate
        throw err;
    }
}

export async function fetchStories() {
    const res = await fetchWithAuth(`${API_BASE}/stories`);
    if (!res.ok) {
        throw new Error(`Failed to load stories: ${res.statusText}`);
    }
    return res.json();
}

export async function fetchStoryMessages(storyId) {
    const res = await fetchWithAuth(`${API_BASE}/stories/${storyId}/messages`);
    if (!res.ok) {
        throw new Error(`Failed to load messages: ${res.statusText}`);
    }
    return res.json();
}

export async function fetchStoryState(storyId) {
    const res = await fetchWithAuth(`${API_BASE}/stories/${storyId}/state`);
    if (res.status === 404) {
        return null;
    }
    if (!res.ok) {
        throw new Error(`Failed to load story state: ${res.statusText}`);
    }
    return res.json();
}

export async function createStory(payload) {
    const res = await fetchWithAuth(`${API_BASE}/stories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || `Failed to create story: ${res.statusText}`);
    }
    return res.json();
}

export async function deleteStory(storyId) {
    const res = await fetchWithAuth(`${API_BASE}/stories/${storyId}`, {
        method: 'DELETE'
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || `Failed to delete story: ${res.statusText}`);
    }
    return res.json();
}

export async function testConnection(payload) {
    // Test-connection is public (no auth needed)
    const res = await fetch(`${API_BASE}/stories/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res;
}

export async function sendChatMessage(storyId, payload) {
    const res = await fetchWithAuth(`${API_BASE}/stories/${storyId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
    }
    return res;
}

export async function fetchUserSettings() {
    const res = await fetchWithAuth(`${API_BASE}/user/settings`);
    if (!res.ok) {
        throw new Error(`Failed to load user settings: ${res.statusText}`);
    }
    return res.json();
}

export async function saveUserSettings(settings) {
    const res = await fetchWithAuth(`${API_BASE}/user/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || `Failed to save settings: ${res.statusText}`);
    }
    return res.json();
}
