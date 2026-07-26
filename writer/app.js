const API_BASE = 'http://127.0.0.1:8001/api';

document.addEventListener('DOMContentLoaded', () => {
    // === DOM Elements ===
    const storySelect = document.getElementById('story-select');
    const newStoryBtn = document.getElementById('new-story-btn');
    const currentStoryTitle = document.getElementById('current-story-title');
    const narrativeDisplay = document.getElementById('narrative-display');
    
    // Inputs
    const promptForm = document.getElementById('prompt-form');
    const promptInput = document.getElementById('prompt-input');
    const sendBtn = document.getElementById('send-btn');
    const btnContinue = document.getElementById('btn-continue');
    const btnOoc = document.getElementById('btn-ooc');
    
    // Modals
    const newStoryModal = document.getElementById('new-story-modal');
    const createStoryForm = document.getElementById('create-story-form');
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');
    
    // Sidebar State Fields
    const valTimeline = document.getElementById('val-timeline');
    const valLocation = document.getElementById('val-location');
    const valAtmosphere = document.getElementById('val-atmosphere');
    const valRelationship = document.getElementById('val-relationship');
    const valClothing = document.getElementById('val-clothing');
    const valVisualBg = document.getElementById('val-visual-bg');
    
    const rosterOnscreen = document.getElementById('roster-onscreen');
    const rosterOffscreen = document.getElementById('roster-offscreen');
    const rosterPartitioned = document.getElementById('roster-partitioned');
    
    const ledgerShortterm = document.getElementById('ledger-shortterm');
    const ledgerLongterm = document.getElementById('ledger-longterm');
    const openThreads = document.getElementById('open-threads');
    const blueprintsList = document.getElementById('blueprints-list');

    // === App State ===
    let activeStoryId = null;
    let isOocMode = false;

    // === Fetch & List Stories ===
    async function loadStories() {
        try {
            const res = await fetch(`${API_BASE}/stories`);
            const stories = await res.json();
            
            // Keep the default option
            storySelect.innerHTML = '<option value="">Select a Story...</option>';
            
            stories.forEach(story => {
                const opt = document.createElement('option');
                opt.value = story.id;
                opt.textContent = story.title;
                storySelect.appendChild(opt);
            });
            
            if (activeStoryId) {
                storySelect.value = activeStoryId;
            }
        } catch (err) {
            console.error('Failed to load stories:', err);
        }
    }

    // === Load Selected Story Data ===
    async function selectStory(storyId) {
        if (!storyId) {
            activeStoryId = null;
            currentStoryTitle.textContent = 'No Story Selected';
            narrativeDisplay.innerHTML = `
                <div class="narrative-placeholder">
                    <div class="placeholder-icon">✦</div>
                    <h3>Welcome to the Co-Author Workbench</h3>
                    <p>Select an existing story or create a new one to begin your interactive co-authoring journey.</p>
                </div>`;
            setInputsEnabled(false);
            clearSidebar();
            return;
        }
        
        activeStoryId = storyId;
        const selectedOption = storySelect.querySelector(`option[value="${storyId}"]`);
        currentStoryTitle.textContent = selectedOption ? selectedOption.textContent : 'Active Story';
        
        setInputsEnabled(true);
        
        // Load messages & state
        await loadMessages(storyId);
        await refreshStoryState(storyId);
    }

    async function loadMessages(storyId) {
        try {
            narrativeDisplay.innerHTML = '<div class="narrative-placeholder"><p>Loading chronicle...</p></div>';
            
            const res = await fetch(`${API_BASE}/stories/${storyId}/messages`);
            const messages = await res.json();
            
            narrativeDisplay.innerHTML = '';
            
            if (messages.length === 0) {
                narrativeDisplay.innerHTML = `
                    <div class="narrative-placeholder">
                        <p>The pages are empty. Write your first prompt to start the journey.</p>
                    </div>`;
                return;
            }
            
            messages.forEach(msg => {
                renderMessage(msg.role, msg.content);
            });
            
            scrollToBottom();
        } catch (err) {
            console.error('Failed to load messages:', err);
            narrativeDisplay.innerHTML = '<div class="narrative-placeholder"><p>Error loading story history.</p></div>';
        }
    }

    // === Render Message Blocks ===
    function renderMessage(role, content) {
        const p = document.createElement('p');
        
        if (role === 'user') {
            if (content.startsWith('*') && content.endsWith('*')) {
                p.className = 'ooc-action-block';
                p.textContent = content;
            } else {
                p.className = 'user-action-block';
                p.textContent = content;
            }
        } else {
            // Narrative co-author response
            p.textContent = content;
        }
        
        narrativeDisplay.appendChild(p);
    }

    // === Refresh Story State (Sidebar) ===
    async function refreshStoryState(storyId) {
        try {
            const res = await fetch(`${API_BASE}/stories/${storyId}/state`);
            if (res.status === 404) return;
            
            const state = await res.json();
            
            // Populate basic states
            valTimeline.textContent = state.timeline || '-';
            valLocation.textContent = state.location || '-';
            valAtmosphere.textContent = state.atmosphere || '-';
            valRelationship.textContent = state.relationship_phase || '-';
            
            // Populate scene visuals
            valClothing.textContent = state.visuals.clothing || '-';
            
            let visBg = state.visuals.lighting || '';
            if (state.visuals.background) {
                visBg += visBg ? ` / ${state.visuals.background}` : state.visuals.background;
            }
            valVisualBg.textContent = visBg || '-';
            
            // Populate Roster lists
            populateList(rosterOnscreen, state.roster.onscreen, char => {
                const li = document.createElement('li');
                li.className = 'onscreen-char';
                li.textContent = char.description ? `${char.name} (${char.description})` : char.name;
                return li;
            }, 'No characters in scene');
            
            populateList(rosterOffscreen, state.roster.offscreen, char => {
                const li = document.createElement('li');
                li.textContent = char.description ? `${char.name} (${char.description})` : char.name;
                return li;
            }, 'No active off-screen characters');
            
            populateList(rosterPartitioned, state.roster.partitioned, char => {
                const li = document.createElement('li');
                li.className = 'partitioned-char';
                li.textContent = char.belief ? `${char.name} (Believes: "${char.belief}")` : char.name;
                return li;
            }, 'No partitioned characters');
            
            // Populate Ledger lists
            populateList(ledgerShortterm, state.ledger.short_term, item => {
                const li = document.createElement('li');
                li.textContent = item;
                return li;
            }, 'No recent beats');
            
            populateList(ledgerLongterm, state.ledger.long_term, item => {
                const li = document.createElement('li');
                li.textContent = item;
                return li;
            }, 'No historical records');
            
            populateList(openThreads, state.open_threads, item => {
                const li = document.createElement('li');
                li.textContent = item;
                return li;
            }, 'No active threads');
            
            // Populate blueprints
            if (state.blueprints.length === 0) {
                blueprintsList.innerHTML = '<p class="empty-list">No blueprints established yet</p>';
            } else {
                blueprintsList.innerHTML = '';
                state.blueprints.forEach(bp => {
                    const div = document.createElement('div');
                    div.className = 'blueprint-item';
                    
                    const name = document.createElement('div');
                    name.className = 'blueprint-name';
                    name.textContent = bp.name;
                    
                    const desc = document.createElement('div');
                    desc.className = 'blueprint-desc';
                    desc.textContent = bp.description;
                    
                    div.appendChild(name);
                    div.appendChild(desc);
                    blueprintsList.appendChild(div);
                });
            }
        } catch (err) {
            console.error('Failed to refresh state:', err);
        }
    }

    function populateList(element, list, createLiFunc, emptyText) {
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

    function clearSidebar() {
        valTimeline.textContent = '-';
        valLocation.textContent = '-';
        valAtmosphere.textContent = '-';
        valRelationship.textContent = '-';
        valClothing.textContent = '-';
        valVisualBg.textContent = '-';
        
        rosterOnscreen.innerHTML = '<li class="empty-list">No characters in scene</li>';
        rosterOffscreen.innerHTML = '<li class="empty-list">No active off-screen characters</li>';
        rosterPartitioned.innerHTML = '<li class="empty-list">No partitioned characters</li>';
        ledgerShortterm.innerHTML = '<li class="empty-list">No recent beats</li>';
        ledgerLongterm.innerHTML = '<li class="empty-list">No historical records</li>';
        openThreads.innerHTML = '<li class="empty-list">No active threads</li>';
        blueprintsList.innerHTML = '<p class="empty-list">No blueprints established yet</p>';
    }

    // === Enable/Disable Inputs ===
    function setInputsEnabled(enabled) {
        promptInput.disabled = !enabled;
        sendBtn.disabled = !enabled;
        btnContinue.disabled = !enabled;
        btnOoc.disabled = !enabled;
        
        if (enabled) {
            promptInput.focus();
        }
    }

    // === Send User Action & Stream AI Co-Author ===
    async function submitAction(messageText) {
        if (!activeStoryId || !messageText.trim()) return;
        
        // Disable UI
        setInputsEnabled(false);
        
        // Remove placeholders if empty list
        const placeholders = narrativeDisplay.querySelectorAll('.narrative-placeholder');
        placeholders.forEach(p => p.remove());
        
        // Render user prompt in UI
        renderMessage('user', messageText);
        scrollToBottom();
        
        // Render placeholder paragraph for AI streaming response
        const aiParagraph = document.createElement('p');
        aiParagraph.className = 'stream-chunk-active';
        narrativeDisplay.appendChild(aiParagraph);
        scrollToBottom();
        
        try {
            const res = await fetch(`${API_BASE}/stories/${activeStoryId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: messageText })
            });
            
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;
                
                // Render streaming chunk text
                aiParagraph.textContent = accumulatedText;
                scrollToBottom();
            }
            
            // Streaming finished, remove cursor
            aiParagraph.classList.remove('stream-chunk-active');
            
            // Reload the Story Bible State
            await refreshStoryState(activeStoryId);
            
        } catch (err) {
            console.error('Streaming error:', err);
            aiParagraph.classList.remove('stream-chunk-active');
            aiParagraph.innerHTML += ` <span style="color:var(--color-secondary)">[Generation interrupted: ${err.message}]</span>`;
        } finally {
            setInputsEnabled(true);
        }
    }

    // === Event Listeners ===
    
    // Story Dropdown Select
    storySelect.addEventListener('change', (e) => {
        selectStory(e.target.value);
    });
    
    // Form submission
    promptForm.addEventListener('submit', (e) => {
        e.preventDefault();
        let val = promptInput.value;
        if (!val.trim()) return;
        
        if (isOocMode) {
            val = `*OOC: ${val}*`;
            // Turn off OOC mode after sending
            toggleOocMode(false);
        }
        
        promptInput.value = '';
        submitAction(val);
    });
    
    // TextArea Enter submit key bindings
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            promptForm.dispatchEvent(new Event('submit'));
        }
    });

    // Modal Controls
    newStoryBtn.addEventListener('click', () => {
        newStoryModal.classList.add('open');
    });
    
    function closeModal() {
        newStoryModal.classList.remove('open');
        createStoryForm.reset();
    }
    
    modalClose.addEventListener('click', closeModal);
    modalCancel.addEventListener('click', closeModal);
    newStoryModal.addEventListener('click', (e) => {
        if (e.target === newStoryModal) closeModal();
    });
    
    // Create new story form submission
    createStoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('story-title-input').value;
        const protoName = document.getElementById('proto-name-input').value;
        const compName = document.getElementById('comp-name-input').value;
        const protoDesc = document.getElementById('proto-desc-input').value;
        const compDesc = document.getElementById('comp-desc-input').value;
        
        try {
            const res = await fetch(`${API_BASE}/stories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    protagonist_name: protoName,
                    protagonist_description: protoDesc,
                    co_author_name: compName,
                    co_author_description: compDesc
                })
            });
            
            const story = await res.json();
            closeModal();
            
            // Reload and select new story
            await loadStories();
            await selectStory(story.id);
            
        } catch (err) {
            console.error('Failed to create story:', err);
            alert('Error initializing story: ' + err.message);
        }
    });

    // Continue Scene Button
    btnContinue.addEventListener('click', () => {
        submitAction('continue');
    });
    
    // OOC Mode Button Toggle
    function toggleOocMode(forceState) {
        isOocMode = forceState !== undefined ? forceState : !isOocMode;
        
        if (isOocMode) {
            btnOoc.classList.add('active');
            btnOoc.style.backgroundColor = 'var(--color-border)';
            promptInput.placeholder = 'Speak to the AI Co-Author out-of-character (e.g., "*Change lighting to stormy*")...';
            promptInput.classList.add('ooc-mode');
        } else {
            btnOoc.classList.remove('active');
            btnOoc.style.backgroundColor = '';
            promptInput.placeholder = "Type your action in first person (e.g., 'I pull my coat closer and step into the wind...')";
            promptInput.classList.remove('ooc-mode');
        }
    }
    
    btnOoc.addEventListener('click', () => {
        toggleOocMode();
    });

    // Tabs switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // === Helpers ===
    function scrollToBottom() {
        narrativeDisplay.scrollTop = narrativeDisplay.scrollHeight;
    }
    
    // Initial load
    loadStories();
});
