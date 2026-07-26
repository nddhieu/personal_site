const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const API_BASE = isLocal ? 'http://127.0.0.1:8001/api' : 'https://curse-passivism-omnivore.ngrok-free.dev/api';

export const PROVIDER_STORAGE_KEY = 'coauthor_llm_provider';

export const ARCHIVIST_REFRESH_DELAY_MS = 2500;
