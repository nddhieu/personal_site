import { state } from './js/state.js';
import { auth } from './js/auth.js';
import * as api from './js/api.js';
import * as ui from './js/ui.js';
import { elements } from './js/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // ── Auth Gate ────────────────────────────────────────────────
    auth.init();

    // DOM references for auth page
    const authPage = document.getElementById('auth-page');
    const appContainer = document.querySelector('.app-container');
    const authTabBtns = document.querySelectorAll('.auth-tab-btn');
    const authForms = {
        login: document.getElementById('login-form'),
        signup: document.getElementById('signup-form'),
    };
    const authError = document.getElementById('auth-error');
    const authLoading = document.getElementById('auth-loading');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authSubmitText = document.getElementById('auth-submit-text');
    const authSubmitSpinner = document.getElementById('auth-submit-spinner');
    const logoutBtn = document.getElementById('logout-btn');
    const userDisplayName = document.getElementById('user-display-name');
    const userAvatar = document.getElementById('user-avatar');

    // Current active auth mode
    let currentAuthMode = 'login'; // 'login' or 'signup'

    function showApp() {
        authPage.classList.remove('active');
        appContainer.classList.remove('auth-hidden');
    }

    function showAuth() {
        authPage.classList.add('active');
        appContainer.classList.add('auth-hidden');
        // Initialize Google Sign-In button (safe to call multiple times)
        auth.initGoogleSignIn('google-signin-btn');
    }

    function setAuthError(msg) {
        authError.textContent = msg;
        authError.style.display = msg ? 'block' : 'none';
    }

    function setAuthLoading(loading) {
        authLoading.style.display = loading ? 'flex' : 'none';
        authSubmitBtn.disabled = loading;
        authSubmitText.textContent = loading ? 'Please wait...' : (currentAuthMode === 'login' ? 'Sign In' : 'Create Account');
        authSubmitSpinner.style.display = loading ? 'block' : 'none';
    }

    function switchAuthMode(mode) {
        currentAuthMode = mode;
        setAuthError('');

        // Toggle tab styling
        authTabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.authTab === mode);
        });

        // Toggle form visibility
        authForms.login.classList.toggle('active', mode === 'login');
        authForms.signup.classList.toggle('active', mode === 'signup');

        // Update submit button text
        authSubmitText.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    }

    // Auth tab switching
    authTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchAuthMode(btn.dataset.authTab);
        });
    });

    // Auth form submission
    async function handleAuthSubmit(e) {
        e.preventDefault();
        setAuthError('');
        setAuthLoading(true);

        try {
            if (currentAuthMode === 'login') {
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;
                await auth.login(email, password);
            } else {
                const email = document.getElementById('signup-email').value;
                const password = document.getElementById('signup-password').value;
                const confirm = document.getElementById('signup-confirm').value;
                const displayName = document.getElementById('signup-display-name').value;

                if (password !== confirm) {
                    throw new Error('Passwords do not match');
                }
                if (password.length < 6) {
                    throw new Error('Password must be at least 6 characters');
                }

                await auth.signup(email, password, displayName);
            }
        } catch (err) {
            setAuthError(err.message);
            setAuthLoading(false);
        }
    }

    authForms.login.addEventListener('submit', handleAuthSubmit);
    authForms.signup.addEventListener('submit', handleAuthSubmit);

    // Logout
    logoutBtn.addEventListener('click', () => {
        auth.logout();
    });

    // Listen for auth state changes
    auth.onAuthChange((isLoggedIn, user) => {
        if (isLoggedIn) {
            showApp();
            // Update user info in header
            if (user) {
                userDisplayName.textContent = user.display_name || user.email;
                if (user.avatar_url) {
                    userAvatar.src = user.avatar_url;
                    userAvatar.style.display = 'inline';
                } else {
                    userAvatar.style.display = 'none';
                }
            }
            // Re-initialize the workbench
            initWorkbench();
        } else {
            showAuth();
            setAuthLoading(false);
            // Reset provider settings to default on logout
            state.saveProviderSettings(state.loadProviderSettings());
            ui.updateProviderIndicator();
        }
    });

    // ── Workbench Initialization ─────────────────────────────────
    async function initWorkbench() {
        // Load stories and set up the workbench
        loadStories();
        selectStory('');
        try {
            const userSettings = await api.fetchUserSettings();
            state.saveProviderSettings(userSettings);
        } catch (err) {
            console.error('Failed to load user settings from database:', err);
        }
        ui.updateProviderIndicator();
    }

    // === App State ===
    // (activeStoryId and isOocMode are housed in `state`)

    // === Fetch & List Stories ===
    async function loadStories() {
        try {
            const stories = await api.fetchStories();

            // Keep the default option
            elements.storySelect.innerHTML = '<option value="">Select a Story...</option>';

            stories.forEach(story => {
                const opt = document.createElement('option');
                opt.value = story.id;
                opt.textContent = story.title;
                elements.storySelect.appendChild(opt);
            });

            if (state.activeStoryId) {
                elements.storySelect.value = state.activeStoryId;
            }
        } catch (err) {
            console.error('Failed to load stories:', err);
        }
    }

    // === Load Selected Story Data ===
    async function selectStory(storyId) {
        if (!storyId) {
            state.activeStoryId = null;
            elements.currentStoryTitle.textContent = 'No Story Selected';
            elements.narrativeDisplay.innerHTML = `
                <div class="narrative-placeholder">
                    <div class="placeholder-icon">✦</div>
                    <h3>Welcome to the Co-Author Workbench</h3>
                    <p>Select an existing story or create a new one to begin your interactive co-authoring journey.</p>
                </div>`;
            ui.setInputsEnabled(false);
            ui.clearSidebar();
            return;
        }

        state.activeStoryId = storyId;
        const selectedOption = elements.storySelect.querySelector(`option[value="${storyId}"]`);
        elements.currentStoryTitle.textContent = selectedOption ? selectedOption.textContent : 'Active Story';
        elements.deleteStoryBtn.disabled = false;

        ui.setInputsEnabled(true);

        // Load state sidebar
        await refreshStoryState(storyId);

        // Auto-begin or load messages
        await autoBeginStory(storyId);
    }

    async function loadMessages(storyId) {
        try {
            elements.narrativeDisplay.innerHTML = '<div class="narrative-placeholder"><p>Loading chronicle...</p></div>';

            const messages = await api.fetchStoryMessages(storyId);

            elements.narrativeDisplay.innerHTML = '';

            if (messages.length === 0) {
                elements.narrativeDisplay.innerHTML = `
                    <div class="narrative-placeholder">
                        <p>The pages are empty. Write your first prompt to start the journey.</p>
                    </div>`;
                return;
            }

            messages.forEach(msg => {
                ui.renderMessage(msg.role, msg.content);
            });

            ui.scrollToBottom();
        } catch (err) {
            console.error('Failed to load messages:', err);
            elements.narrativeDisplay.innerHTML = '<div class="narrative-placeholder"><p>Error loading story history.</p></div>';
        }
    }

    // === Refresh Story State (Sidebar) ===
    async function refreshStoryState(storyId) {
        try {
            const storyState = await api.fetchStoryState(storyId);
            if (!storyState) return null;

            // Populate raw memory block (debug display)
            if (storyState.memory_block) {
                elements.valMemoryBlock.innerHTML = `<code>${ui.escapeHtml(storyState.memory_block)}</code>`;
            } else {
                elements.valMemoryBlock.innerHTML = '<code>No memory block available</code>';
            }

            return storyState;
        } catch (err) {
            console.error('Failed to refresh state:', err);
            return null;
        }
    }

    // === Settings Modal Controls ===
    function openSettingsModal() {
        ui.populateSettingsForm(state.providerSettings);
        elements.settingsModal.classList.add('open');
    }

    elements.settingsBtn.addEventListener('click', openSettingsModal);
    elements.providerBadge.addEventListener('click', openSettingsModal);

    function closeSettingsModal() {
        elements.settingsModal.classList.remove('open');
    }

    elements.settingsModalClose.addEventListener('click', closeSettingsModal);
    elements.settingsCancel.addEventListener('click', closeSettingsModal);
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) closeSettingsModal();
    });

    // Toggle provider-specific fields
    elements.settingsProvider.addEventListener('change', ui.updateSettingsVisibility);

    // Toggle API key visibility
    elements.toggleApiKeyBtn.addEventListener('click', () => {
        const isPassword = elements.settingsApiKey.type === 'password';
        elements.settingsApiKey.type = isPassword ? 'text' : 'password';
        elements.toggleApiKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
    });

    // Save settings
    elements.settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const settings = {
            provider: elements.settingsProvider.value,
            apiKey: elements.settingsApiKey.value.trim(),
            baseUrl: elements.settingsBaseUrl.value.trim(),
            model: elements.settingsModel.value.trim(),
            ollamaModel: elements.settingsOllamaModel.value.trim(),
            ollamaUrl: elements.settingsOllamaUrl.value.trim(),
        };
        try {
            await api.saveUserSettings(settings);
            state.saveProviderSettings(settings);
            ui.updateProviderIndicator();
            closeSettingsModal();
        } catch (err) {
            alert('Failed to save settings: ' + err.message);
        }
    });

    // Test connection button
    elements.settingsTestBtn.addEventListener('click', async () => {
        elements.settingsTestBtn.disabled = true;
        elements.settingsTestBtn.textContent = 'Testing...';

        try {
            const testSettings = {
                provider: elements.settingsProvider.value,
                apiKey: elements.settingsApiKey.value.trim(),
                baseUrl: elements.settingsBaseUrl.value.trim(),
                model: elements.settingsModel.value.trim(),
                ollamaModel: elements.settingsOllamaModel.value.trim(),
                ollamaUrl: elements.settingsOllamaUrl.value.trim(),
            };

            const testState = {
                providerSettings: testSettings,
                buildProviderApiPayload: state.buildProviderApiPayload
            };
            const payload = { message: 'Hello' };
            payload.provider = state.buildProviderApiPayload.call(testState);

            const res = await api.testConnection(payload);

            if (res.ok) {
                elements.settingsTestBtn.textContent = '✓ Connected!';
                elements.settingsTestBtn.style.borderColor = '#3fb950';
                elements.settingsTestBtn.style.color = '#3fb950';
            } else {
                const errData = await res.json();
                elements.settingsTestBtn.textContent = `✗ Failed: ${errData.detail || res.status}`;
                elements.settingsTestBtn.style.borderColor = '#f85149';
                elements.settingsTestBtn.style.color = '#f85149';
            }
        } catch (err) {
            elements.settingsTestBtn.textContent = `✗ Error: ${err.message}`;
            elements.settingsTestBtn.style.borderColor = '#f85149';
            elements.settingsTestBtn.style.color = '#f85149';
        }

        setTimeout(() => {
            elements.settingsTestBtn.disabled = false;
            elements.settingsTestBtn.textContent = 'Test Connection';
            elements.settingsTestBtn.style.borderColor = '';
            elements.settingsTestBtn.style.color = '';
        }, 3000);
    });

    // === Delete Story ===
    async function deleteActiveStory() {
        if (!state.activeStoryId) return;

        const selectedOption = elements.storySelect.querySelector(`option[value="${state.activeStoryId}"]`);
        const storyTitle = selectedOption ? selectedOption.textContent : 'this story';

        const confirmed = confirm(`Are you sure you want to delete "${storyTitle}"?\n\nAll messages and story state will be permanently removed. This action cannot be undone.`);
        if (!confirmed) return;

        try {
            elements.deleteStoryBtn.disabled = true;
            await api.deleteStory(state.activeStoryId);

            // Clear local state and reload
            state.activeStoryId = null;
            await loadStories();
            await selectStory('');
        } catch (err) {
            console.error('Failed to delete story:', err);
            alert('Error deleting story: ' + err.message);
            elements.deleteStoryBtn.disabled = false;
        }
    }

    // === Simple Markdown to HTML renderer (client-side for SSE results) ===
    function markdownToHtml(text) {
        if (!text) return '';
        let html = text;
        // Scene breaks
        html = html.replace(/^[\s]*([-*_]){3,}\s*$/gm, '<hr class="scene-break">');
        // Bold + Italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Paragraphs
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        if (!html.startsWith('<p>')) html = '<p>' + html + '</p>';
        html = html.replace(/<p>\s*<\/p>/g, '');
        return html;
    }

    // === Send User Action & Stream AI Co-Author (SSE Protocol) ===
    async function submitAction(messageText) {
        if (!state.activeStoryId || !messageText.trim()) return;
        const storyId = state.activeStoryId;

        // Disable UI
        ui.setInputsEnabled(false);

        // Remove placeholders if empty list
        const placeholders = elements.narrativeDisplay.querySelectorAll('.narrative-placeholder');
        placeholders.forEach(p => p.remove());

        // Render user prompt in UI
        ui.renderMessage('user', messageText);
        ui.scrollToBottom();

        // Track the streaming paragraphs dynamically to format on the fly
        const activeParagraphs = [];
        let storyTextAccumulated = '';
        let memoryBlock = '';

        try {
            const body = { message: messageText };
            // Attach provider config so the backend knows which LLM to use
            const providerPayload = state.buildProviderApiPayload();
            if (providerPayload) {
                body.provider = providerPayload;
            }

            const res = await api.sendChatMessage(storyId, body);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE events from buffer
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    try {
                        const event = JSON.parse(trimmed.substring(6));

                        switch (event.type) {
                            case 'status':
                                // Show/hide agent status indicators
                                if (event.label) {
                                    ui.hideAgentStatus();
                                    ui.showAgentStatus(event.label);
                                }
                                break;

                            case 'stream':
                                // Hide agent status on first stream chunk
                                if (storyTextAccumulated.length === 0) {
                                    ui.hideAgentStatus();
                                }
                                // Accumulate and render with Markdown formatting
                                storyTextAccumulated += event.chunk;
                                let displayText = ui.cleanNarrativeText(storyTextAccumulated);
                                ui.updateStreamParagraphs(activeParagraphs, displayText);
                                ui.scrollToBottom();
                                break;

                            case 'stream_complete':
                                // Streaming done — remove cursor class
                                if (activeParagraphs.length > 0) {
                                    activeParagraphs[activeParagraphs.length - 1].classList.remove('stream-chunk-active');
                                    // Mark as rendered
                                    activeParagraphs[activeParagraphs.length - 1].classList.add('rendered');
                                }
                                break;

                            case 'complete':
                                // Final result: memory block + auto-scroll
                                memoryBlock = event.memory_block || '';
                                const firstSentence = event.first_sentence || '';

                                // Update sidebar with memory block
                                if (memoryBlock) {
                                    elements.valMemoryBlock.innerHTML = `<code>${ui.escapeHtml(memoryBlock)}</code>`;
                                }

                                // Auto-scroll to first sentence of the new scene
                                if (firstSentence) {
                                    // Find the paragraph containing the first sentence
                                    const paras = elements.narrativeDisplay.querySelectorAll('.narrative-paragraph');
                                    for (const para of paras) {
                                        if (para.textContent.includes(firstSentence.substring(0, 30))) {
                                            para.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            // Brief highlight
                                            para.style.transition = 'background-color 1s ease';
                                            para.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                                            setTimeout(() => { para.style.backgroundColor = ''; }, 1500);
                                            break;
                                        }
                                    }
                                } else {
                                    // Fallback: scroll to bottom
                                    ui.scrollToBottom();
                                }
                                break;

                            case 'error':
                                console.error('Backend error:', event.message);
                                ui.hideAgentStatus();
                                if (activeParagraphs.length > 0) {
                                    activeParagraphs[activeParagraphs.length - 1].innerHTML +=
                                        ` <span style="color:var(--color-secondary)">[Error: ${event.message}]</span>`;
                                }
                                break;
                        }
                    } catch (parseErr) {
                        // Skip malformed SSE events
                        console.warn('SSE parse error:', parseErr, 'line:', trimmed);
                    }
                }
            }

            // Final cleanup: mark last paragraph as rendered
            if (activeParagraphs.length > 0) {
                activeParagraphs[activeParagraphs.length - 1].classList.remove('stream-chunk-active');
                activeParagraphs[activeParagraphs.length - 1].classList.add('rendered');
            }

            // Reload full story state if memory wasn't in SSE
            if (!memoryBlock) {
                await refreshStoryState(storyId);
            }

        } catch (err) {
            ui.hideAgentStatus();
            console.error('Streaming error:', err);
            if (activeParagraphs.length > 0) {
                const lastP = activeParagraphs[activeParagraphs.length - 1];
                lastP.classList.remove('stream-chunk-active');
                lastP.innerHTML += ` <span style="color:var(--color-secondary)">[Generation interrupted: ${err.message}]</span>`;
            } else {
                const errP = document.createElement('p');
                errP.style.color = 'var(--color-secondary)';
                errP.textContent = `[Generation interrupted: ${err.message}]`;
                elements.narrativeDisplay.appendChild(errP);
            }
        } finally {
            ui.setInputsEnabled(true);
        }
    }

    // === Auto-send "Begin" for new/fresh stories ===
    async function autoBeginStory(storyId) {
        try {
            // Check if story has messages
            const messages = await api.fetchStoryMessages(storyId);
            if (messages.length === 0) {
                // No messages — auto-send "Begin" to trigger first scene
                console.log('New story detected — auto-sending "Begin"');
                await submitAction('Begin');
            } else {
                // Load existing messages
                await loadMessages(storyId);
            }
        } catch (err) {
            console.error('autoBeginStory error:', err);
            await loadMessages(storyId);
        }
    }

    // === Event Listeners ===

    // Story Dropdown Select
    elements.storySelect.addEventListener('change', (e) => {
        selectStory(e.target.value);
    });

    // Form submission
    elements.promptForm.addEventListener('submit', (e) => {
        e.preventDefault();
        let val = elements.promptInput.value;
        if (!val.trim()) return;

        if (state.isOocMode) {
            val = `*OOC: ${val}*`;
            // Turn off OOC mode after sending
            toggleOocMode(false);
        }

        elements.promptInput.value = '';
        submitAction(val);
    });

    // TextArea Enter submit key bindings
    elements.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            elements.promptForm.dispatchEvent(new Event('submit'));
        }
    });

    // Modal Controls
    elements.newStoryBtn.addEventListener('click', () => {
        elements.newStoryModal.classList.add('open');
    });

    elements.deleteStoryBtn.addEventListener('click', deleteActiveStory);

    function closeModal() {
        elements.newStoryModal.classList.remove('open');
        elements.createStoryForm.reset();
    }

    elements.modalClose.addEventListener('click', closeModal);
    elements.modalCancel.addEventListener('click', closeModal);
    elements.newStoryModal.addEventListener('click', (e) => {
        if (e.target === elements.newStoryModal) closeModal();
    });

    // Create new story form submission
    elements.createStoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('story-title-input').value;
        const protoName = document.getElementById('proto-name-input').value.trim() || 'Protagonist';
        const compName = document.getElementById('comp-name-input').value.trim() || 'Main Character';
        const protoDesc = document.getElementById('proto-desc-input').value;
        const compDesc = document.getElementById('comp-desc-input').value;
        const storyPremise = document.getElementById('story-premise-input').value.trim();

        try {
            const story = await api.createStory({
                title: title,
                protagonist_name: protoName,
                protagonist_description: protoDesc,
                main_character_name: compName,
                main_character_description: compDesc,
                story_premise: storyPremise
            });

            closeModal();

            // Reload and select new story (auto-begin will trigger if fresh)
            await loadStories();
            await selectStory(story.id);

        } catch (err) {
            console.error('Failed to create story:', err);
            alert('Error initializing story: ' + err.message);
        }
    });

    // Continue Scene Button
    elements.btnContinue.addEventListener('click', () => {
        submitAction('continue');
    });

    // OOC Mode Button Toggle
    function toggleOocMode(forceState) {
        state.isOocMode = forceState !== undefined ? forceState : !state.isOocMode;

        if (state.isOocMode) {
            elements.btnOoc.classList.add('active');
            elements.btnOoc.style.backgroundColor = 'var(--color-border)';
            elements.promptInput.placeholder = 'Speak to the AI Co-Author out-of-character (e.g., "*Change lighting to stormy*")...';
            elements.promptInput.classList.add('ooc-mode');
        } else {
            elements.btnOoc.classList.remove('active');
            elements.btnOoc.style.backgroundColor = '';
            elements.promptInput.placeholder = "Type your action in first person (e.g., 'I pull my coat closer and step into the wind...')";
            elements.promptInput.classList.remove('ooc-mode');
        }
    }

    elements.btnOoc.addEventListener('click', () => {
        toggleOocMode();
    });

    // Sidebar Toggle
    const workspace = document.querySelector('.workspace');

    function toggleSidebar() {
        if (elements.storyBible) {
            elements.storyBible.classList.toggle('collapsed');
        }
        if (workspace) {
            workspace.classList.toggle('sidebar-open');
        }
    }

    if (elements.sidebarToggle) {
        elements.sidebarToggle.addEventListener('click', toggleSidebar);
    }
    if (elements.sidebarOverlay) {
        elements.sidebarOverlay.addEventListener('click', toggleSidebar);
    }

    // Initial auth-based initialization is handled by auth.onAuthChange above.
    // The workbench is only initialized after successful authentication.
});
