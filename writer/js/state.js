class AppState {
    constructor() {
        this.activeStoryId = null;
        this.isOocMode = false;
        this.providerSettings = this.loadProviderSettings();
    }

    loadProviderSettings() {
        return {
            provider: 'ollama',
            apiKey: '',
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-chat',
            ollamaModel: 'magnum:12b',
            ollamaUrl: 'http://[::1]:11434',
        };
    }

    saveProviderSettings(settings) {
        this.providerSettings = { ...settings };
    }

    getProviderSummary() {
        const settings = this.providerSettings;
        if (settings.provider === 'openai') {
            const name = settings.model || 'unknown';
            return `OpenAI-Compatible (${name})`;
        }
        return `Ollama (${settings.ollamaModel || 'dolphin-llama3:8b'})`;
    }

    buildProviderApiPayload() {
        const settings = this.providerSettings;
        if (settings.provider === 'openai') {
            return {
                provider: 'openai',
                api_key: settings.apiKey || '',
                base_url: settings.baseUrl || 'https://api.deepseek.com',
                model: settings.model || 'deepseek-chat',
            };
        }
        
        const payload = { provider: 'ollama' };
        if (settings.ollamaModel) {
            payload.model = settings.ollamaModel;
        }
        if (settings.ollamaUrl) {
            payload.base_url = settings.ollamaUrl;
        }
        return payload;
    }
}

export const state = new AppState();
