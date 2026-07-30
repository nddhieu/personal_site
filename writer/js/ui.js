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

    // Collapsible Sidebar Elements
    sidebarToggle: document.getElementById('sidebar-toggle'),
    storyBible: document.getElementById('story-bible'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),

    // Debug: Memory Block
    valMemoryBlock: document.getElementById('val-memory-block'),
};

// === Helper: Escape HTML to safely display raw text ===
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === Helper: Simple Markdown to HTML renderer ===
export function markdownToHtml(text) {
    if (!text) return '';

    let html = text;

    // Escape HTML first to prevent injection
    html = escapeHtml(html);

    // Scene breaks (---, ***, ___)
    html = html.replace(/^[\s]*([-*_]){3,}\s*$/gm, '<hr class="scene-break">');

    // Bold + Italic (***text***)
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

    // Bold (**text**)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Paragraphs: double newlines
    html = html.replace(/\n\n/g, '</p><p>');

    // Single newlines within paragraphs (for line breaks in dialogue)
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph tags if not already
    if (!html.startsWith('<p>')) {
        html = '<p>' + html + '</p>';
    }

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
}

// === Helper: Clean narrative text of any remaining artifacts ===
export function cleanNarrativeText(text) {
    // If the text contains the start of a code block, strip it and everything after it
    const codeBlockIndex = text.indexOf('```');
    if (codeBlockIndex !== -1) {
        text = text.substring(0, codeBlockIndex);
    }

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
        // Strip leaked POV directive variants
        .replace(/Continue from the protagonist's perspective[,]?\s*/g, '')
        .replace(/from the protagonist's perspective[,]?\s*/g, '')
        .replace(/, I remind myself[^.]*\.\s*/g, '')
        .replace(/"I remind myself[^"]*"/g, '')
        // Strip asterisk-command meta-narration
        .replace(/In response to your command:[^.]*\.\s*/g, '')
        .replace(/As for your query about[^.]*\.\s*/g, '')
        // Strip transition commentary
        .replace(/\[Adjusting the story\.\.\.\]/g, '')
        .replace(/\[Reconnecting to story engine\.\.\.\]/g, '')
        .replace(/\[The story engine needs a moment to reframe the story\.\.\.\]/g, '')
        .replace(/\[RESET_STREAM\]/g, '')
        .trim();
}

// === Helper: Update paragraphs dynamically during streaming ===
export function updateStreamParagraphs(activeParagraphs, text) {
    // Split by double newlines into paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

    // Add extra paragraphs if needed
    while (activeParagraphs.length < paragraphs.length) {
        const div = document.createElement('div');
        div.className = 'narrative-paragraph';
        elements.narrativeDisplay.appendChild(div);
        activeParagraphs.push(div);
    }

    // Remove extra paragraphs if text shrunk
    while (activeParagraphs.length > paragraphs.length) {
        const p = activeParagraphs.pop();
        p.remove();
    }

    // Update contents with Markdown rendering
    for (let i = 0; i < paragraphs.length; i++) {
        const trimmed = paragraphs[i].trim();
        const p = activeParagraphs[i];

        // Detect scene transition markers (short **bolded** text used as headers)
        if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
            p.className = 'narrative-transition';
            p.innerHTML = `<h3 class="transition-header">${trimmed.replace(/\*\*/g, '')}</h3>`;
        } else {
            p.className = 'narrative-paragraph';
            p.innerHTML = markdownToHtml(trimmed);
        }

        // Add blinking cursor to the last active paragraph being streamed
        if (i === paragraphs.length - 1) {
            p.classList.add('stream-chunk-active');
        }
    }
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

    // Narrative: render as Markdown
    const container = document.createElement('div');
    container.className = 'narrative-paragraph rendered';
    container.innerHTML = markdownToHtml(content);
    elements.narrativeDisplay.appendChild(container);
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
    if (elements.valMemoryBlock) {
        elements.valMemoryBlock.innerHTML = '<code>No memory block available</code>';
    }
}

// === Enable/Disable Inputs ===
export function setInputsEnabled(enabled, placeholder = null) {
    elements.promptInput.disabled = !enabled;
    elements.sendBtn.disabled = !enabled;
    elements.btnContinue.disabled = !enabled;
    elements.btnOoc.disabled = !enabled;

    if (placeholder !== null) {
        elements.promptInput.placeholder = placeholder;
    } else if (enabled) {
        elements.promptInput.placeholder = "Type your action in first person (e.g., 'I pull my coat closer and step into the wind...')";
    }

    if (enabled) {
        elements.promptInput.focus();
    }
}

// === Scroll container to bottom ===
export function scrollToBottom() {
    elements.narrativeDisplay.scrollTop = elements.narrativeDisplay.scrollHeight;
}

// === Scroll to first sentence of latest scene ===
export function scrollToFirstSentence() {
    const paragraphs = elements.narrativeDisplay.querySelectorAll('.narrative-paragraph.rendered, .narrative-paragraph.stream-chunk-active');
    if (paragraphs.length > 0) {
        // Find the last rendered story block (skip user messages)
        let target = null;
        for (let i = paragraphs.length - 1; i >= 0; i--) {
            const p = paragraphs[i];
            if (p.classList.contains('rendered') || p.classList.contains('stream-chunk-active')) {
                target = p;
                break;
            }
        }
        if (target) {
            // If we have a first sentence from the backend event, find and scroll to it
            const firstPara = target;
            firstPara.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Brief highlight
            firstPara.style.transition = 'background-color 1s ease';
            firstPara.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
            setTimeout(() => {
                firstPara.style.backgroundColor = '';
            }, 1500);
        }
    }
}

// === Agent Status Indicator ===
let statusIndicator = null;

export function showAgentStatus(label) {
    hideAgentStatus();
    statusIndicator = document.createElement('div');
    statusIndicator.className = 'agent-status-indicator';
    statusIndicator.id = 'agent-status-indicator';

    // Icon based on label
    let icon = '✦';
    if (label.toLowerCase().includes('think')) icon = '🤔';
    else if (label.toLowerCase().includes('write')) icon = '✍️';
    else if (label.toLowerCase().includes('final')) icon = '🔄';

    statusIndicator.innerHTML = `
        <span class="agent-status-icon">${icon}</span>
        <span class="agent-status-text">${label}</span>
        <span class="agent-status-dots"></span>
    `;
    elements.narrativeDisplay.appendChild(statusIndicator);
    scrollToBottom();
}

export function hideAgentStatus() {
    const existing = document.getElementById('agent-status-indicator');
    if (existing) {
        existing.remove();
    }
    statusIndicator = null;
}

// === Thinking/Writing Loading Indicator (legacy - kept for backward compat) ===
export function showThinkingIndicator() {
    showAgentStatus('Thinking...');
}

export function hideThinkingIndicator() {
    hideAgentStatus();
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

// === Image Lightbox Controls ===
export function showImageLightbox(src, caption = '') {
    if (!elements.imageLightbox || !elements.lightboxImg) return;
    elements.lightboxImg.src = src;
    elements.lightboxCaption.textContent = caption;
    elements.imageLightbox.style.display = 'flex';
}

export function hideImageLightbox() {
    if (!elements.imageLightbox) return;
    elements.imageLightbox.style.display = 'none';
}
