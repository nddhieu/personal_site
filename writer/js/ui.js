import { state } from './state.js';

export const elements = {
    storySelect: document.getElementById('story-select'),
    newStoryBtn: document.getElementById('new-story-btn'),
    deleteStoryBtn: document.getElementById('delete-story-btn'),
    currentStoryTitle: document.getElementById('current-story-title'),
    narrativeDisplay: document.getElementById('narrative-display'),

    // Inputs
    promptForm: document.getElementById('prompt-form'),
    promptInput: document.getElementById('prompt-input'),
    sendBtn: document.getElementById('send-btn'),
    btnContinue: document.getElementById('btn-continue'),
    btnOoc: document.getElementById('btn-ooc'),

    // Modals
    newStoryModal: document.getElementById('new-story-modal'),
    createStoryForm: document.getElementById('create-story-form'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),

    // Settings Modal
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    settingsForm: document.getElementById('settings-form'),
    settingsModalClose: document.getElementById('settings-modal-close'),
    settingsCancel: document.getElementById('settings-cancel'),
    settingsProvider: document.getElementById('settings-provider'),
    settingsApiKey: document.getElementById('settings-api-key'),
    settingsBaseUrl: document.getElementById('settings-base-url'),
    settingsModel: document.getElementById('settings-model'),
    settingsOllamaModel: document.getElementById('settings-ollama-model'),
    settingsOllamaUrl: document.getElementById('settings-ollama-url'),
    openaiFields: document.getElementById('settings-openai-fields'),
    ollamaFields: document.getElementById('settings-ollama-fields'),
    settingsSummary: document.getElementById('settings-summary'),
    providerIndicator: document.getElementById('provider-indicator'),
    toggleApiKeyBtn: document.getElementById('toggle-api-key-visibility'),
    settingsTestBtn: document.getElementById('settings-test-btn'),

    // Provider Badge
    providerBadge: document.getElementById('provider-badge'),
    providerDot: document.getElementById('provider-dot'),
    providerName: document.getElementById('provider-name'),

    // Sidebar State Fields
    valTimeline: document.getElementById('val-timeline'),
    valLocation: document.getElementById('val-location'),
    valAtmosphere: document.getElementById('val-atmosphere'),
    valRelationship: document.getElementById('val-relationship'),
    valClothing: document.getElementById('val-clothing'),
    valVisualBg: document.getElementById('val-visual-bg'),

    rosterOnscreen: document.getElementById('roster-onscreen'),
    rosterOffscreen: document.getElementById('roster-offscreen'),
    rosterPartitioned: document.getElementById('roster-partitioned'),

    ledgerShortterm: document.getElementById('ledger-shortterm'),
    ledgerLongterm: document.getElementById('ledger-longterm'),
    openThreads: document.getElementById('open-threads'),
    blueprintsList: document.getElementById('blueprints-list'),
};

// === Helper: Clean narrative text of any remaining artifacts ===
export function cleanNarrativeText(text) {
    return text
        .replace(/\*\*Memory Anchor Updated\*\*/g, '')
        .replace(/\*\*The Scene Unfolds\*\*/g, '')
        .replace(/CURRENT MEMORY ANCHOR STATE:/g, '')
        .replace(/```[\s\S]*?```/g, '') // strip any raw code blocks
        // Strip LLM meta-commentary prefixes
        .replace(/The narrative continues:\s*/g, '')
        .replace(/The story continues:\s*/g, '')
        .replace(/The memory anchor now reads:\s*/g, '')
        .replace(/Continuing from the protagonist's perspective:\s*/g, '')
        // Strip leaked POV directive variants (model sometimes echoes instruction as internal monologue)
        .replace(/Continue from the protagonist's perspective[,]?\s*/g, '')
        .replace(/from the protagonist's perspective[,]?\s*/g, '')
        .replace(/, I remind myself[^.]*\.\s*/g, '')
        .replace(/"I remind myself[^"]*"/g, '')
        // Strip asterisk-command meta-narration (e.g. "In response to your command: *switch to third person*, the narrative shifts...")
        .replace(/In response to your command:[^.]*\.\s*/g, '')
        // Strip budget/query meta-responses (e.g. "As for your query about budget mode: *budget economy*, it has been set...")
        .replace(/As for your query about[^.]*\.\s*/g, '')
        .trim();
}

// === Render Message Blocks ===
export function renderMessage(role, content) {
    if (role === 'user') {
        const p = document.createElement('p');
        if (content.startsWith('*') && content.endsWith('*')) {
            p.className = 'ooc-action-block';
            p.textContent = content;
        } else {
            p.className = 'user-action-block';
            p.textContent = content;
        }
        elements.narrativeDisplay.appendChild(p);
        return;
    }

    // Narrative: split on double newlines into separate paragraphs
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
    paragraphs.forEach((paraText) => {
        const trimmed = paraText.trim();
        if (!trimmed) return;

        const p = document.createElement('p');

        // Detect scene transition markers (short **bolded** text used as headers)
        if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
            p.className = 'narrative-transition';
            p.textContent = trimmed.replace(/\*\*/g, '');
        } else {
            p.textContent = trimmed;
        }

        elements.narrativeDisplay.appendChild(p);
    });
}

// === Render Lists helper ===
export function populateList(element, list, createLiFunc, emptyText) {
    if (!list || list.length === 0) {
        element.innerHTML = `<li class="empty-list">${emptyText}</li>`;
        return;
    }

    element.innerHTML = '';
    list.forEach(item => {
        const li = createLiFunc(item);
        element.appendChild(li);
    });
}

// === Clear Sidebar details ===
export function clearSidebar() {
    elements.valTimeline.textContent = '-';
    elements.valLocation.textContent = '-';
    elements.valAtmosphere.textContent = '-';
    elements.valRelationship.textContent = '-';
    elements.valClothing.textContent = '-';
    elements.valVisualBg.textContent = '-';

    elements.rosterOnscreen.innerHTML = '<li class="empty-list">No characters in scene</li>';
    elements.rosterOffscreen.innerHTML = '<li class="empty-list">No active off-screen characters</li>';
    elements.rosterPartitioned.innerHTML = '<li class="empty-list">No partitioned characters</li>';
    elements.ledgerShortterm.innerHTML = '<li class="empty-list">No recent beats</li>';
    elements.ledgerLongterm.innerHTML = '<li class="empty-list">No historical records</li>';
    elements.openThreads.innerHTML = '<li class="empty-list">No active threads</li>';
    elements.blueprintsList.innerHTML = '<p class="empty-list">No blueprints established yet</p>';
}

// === Enable/Disable Inputs ===
export function setInputsEnabled(enabled) {
    elements.promptInput.disabled = !enabled;
    elements.sendBtn.disabled = !enabled;
    elements.btnContinue.disabled = !enabled;
    elements.btnOoc.disabled = !enabled;

    if (enabled) {
        elements.promptInput.focus();
    }
}

// === Scroll container to bottom ===
export function scrollToBottom() {
    elements.narrativeDisplay.scrollTop = elements.narrativeDisplay.scrollHeight;
}

// === Provider Settings UI Helpers ===
export function updateSettingsVisibility() {
    const isOpenai = elements.settingsProvider.value === 'openai';
    elements.openaiFields.style.display = isOpenai ? 'block' : 'none';
    elements.ollamaFields.style.display = isOpenai ? 'none' : 'block';
}

export function populateSettingsForm(settings) {
    elements.settingsProvider.value = settings.provider || 'ollama';
    elements.settingsApiKey.value = settings.apiKey || '';
    elements.settingsBaseUrl.value = settings.baseUrl || 'https://api.deepseek.com';
    elements.settingsModel.value = settings.model || 'deepseek-chat';
    elements.settingsOllamaModel.value = settings.ollamaModel || 'dolphin-llama3:8b';
    elements.settingsOllamaUrl.value = settings.ollamaUrl || 'http://[::1]:11434';
    updateSettingsVisibility();
}

export function updateProviderIndicator() {
    const summary = state.getProviderSummary();
    elements.settingsSummary.textContent = summary;
    const isOnline = state.providerSettings.provider === 'openai';
    elements.providerIndicator.style.color = isOnline ? 'var(--color-accent)' : '#58a6ff';
    elements.providerIndicator.title = isOnline ? 'Cloud Provider' : 'Local Provider (Ollama)';

    // Update header badge
    elements.providerDot.style.color = isOnline ? 'var(--color-accent)' : '#58a6ff';
    elements.providerName.textContent = isOnline
        ? (state.providerSettings.model || 'DeepSeek')
        : (state.providerSettings.ollamaModel || 'Ollama');
}
