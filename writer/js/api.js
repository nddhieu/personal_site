import { API_BASE } from './config.js';

export async function fetchStories() {
    const res = await fetch(`${API_BASE}/stories`);
    if (!res.ok) {
        throw new Error(`Failed to load stories: ${res.statusText}`);
    }
    return res.json();
}

export async function fetchStoryMessages(storyId) {
    const res = await fetch(`${API_BASE}/stories/${storyId}/messages`);
    if (!res.ok) {
        throw new Error(`Failed to load messages: ${res.statusText}`);
    }
    return res.json();
}

export async function fetchStoryState(storyId) {
    const res = await fetch(`${API_BASE}/stories/${storyId}/state`);
    if (res.status === 404) {
        return null;
    }
    if (!res.ok) {
        throw new Error(`Failed to load story state: ${res.statusText}`);
    }
    return res.json();
}

export async function createStory(payload) {
    const res = await fetch(`${API_BASE}/stories`, {
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
    const res = await fetch(`${API_BASE}/stories/${storyId}`, {
        method: 'DELETE'
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || `Failed to delete story: ${res.statusText}`);
    }
    return res.json();
}

export async function testConnection(payload) {
    const res = await fetch(`${API_BASE}/stories/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res;
}

export async function sendChatMessage(storyId, payload) {
    const res = await fetch(`${API_BASE}/stories/${storyId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
    }
    return res;
}
