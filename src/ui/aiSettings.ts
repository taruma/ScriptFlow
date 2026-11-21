import {useCallback, useState} from 'react';

export type GeminiModelId = 'gemini-4-hydrogen' | 'gemini-4-neon' | 'gemini-4-carbon';
export type ReasoningLevel = 'low' | 'medium' | 'high';

export interface GeminiModelOption {
  id: GeminiModelId;
  label: string;
  shortLabel: string;
  compactDesc: string;
  description: string;
  tier: 'fast' | 'balanced' | 'deep';
}

export interface ReasoningLevelOption {
  id: ReasoningLevel;
  label: string;
  description: string;
}

export const DEFAULT_GEMINI_MODEL: GeminiModelId = 'gemini-4-hydrogen';
export const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'medium';

export const GEMINI_MODEL_OPTIONS: readonly GeminiModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    shortLabel: 'Hydrogen',
    compactDesc: 'Fast everyday edits & multimodal briefs',
    description:
      '1M context · Fast, balanced performance for everyday agentic edits and multimodal briefs',
    tier: 'fast',
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    shortLabel: 'Neon',
    compactDesc: 'Frontier intelligence with fast completion',
    description:
      '1M context · Frontier-level intelligence with fast end-to-end completion for rewrites and coverage',
    tier: 'balanced',
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    shortLabel: 'Carbon',
    compactDesc: 'Strongest reasoning for complex audits',
    description:
      '1M context · Strongest frontier reasoning for complex multi-lens audits and dense drafts',
    tier: 'deep',
  },
] as const;

export const REASONING_LEVEL_OPTIONS: readonly ReasoningLevelOption[] = [
  {
    id: 'low',
    label: 'Low',
    description: 'Lowest latency for quick iterations',
  },
  {
    id: 'medium',
    label: 'Medium',
    description: 'Balanced reasoning depth and speed',
  },
  {
    id: 'high',
    label: 'High',
    description: 'Thorough spatial, temporal, and continuity reasoning',
  },
] as const;

const VALID_MODELS = new Set<string>(GEMINI_MODEL_OPTIONS.map((m) => m.id));
const VALID_REASONING_LEVELS = new Set<string>(REASONING_LEVEL_OPTIONS.map((r) => r.id));

export const AI_SETTINGS_STORAGE_KEY = 'auteur-editor-ai-settings-v1';
export const AI_API_KEY_STORAGE_KEY = 'auteur-editor-ai-api-key-v1';

export interface AiSettings {
  model: GeminiModelId;
  reasoningLevel: ReasoningLevel;
  apiKey: string;
  sessionOnly: boolean;
  showThinkingSummary: boolean;
  showEstimatedCost: boolean;
  showDebugTrace: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  model: DEFAULT_GEMINI_MODEL,
  reasoningLevel: DEFAULT_REASONING_LEVEL,
  apiKey: '',
  sessionOnly: false,
  showThinkingSummary: true,
  showEstimatedCost: true,
  showDebugTrace: false,
};

export interface KeyValueStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AiSettingsStorageAdapters {
  local?: KeyValueStorageLike | null;
  session?: KeyValueStorageLike | null;
}

function getDefaultStores(): {
  local: KeyValueStorageLike | null;
  session: KeyValueStorageLike | null;
} {
  if (typeof window === 'undefined') {
    return {local: null, session: null};
  }
  let local: KeyValueStorageLike | null = null;
  let session: KeyValueStorageLike | null = null;
  try {
    local = window.localStorage;
  } catch {
    local = null;
  }
  try {
    session = window.sessionStorage;
  } catch {
    session = null;
  }
  return {local, session};
}

function resolveStores(adapters?: AiSettingsStorageAdapters): {
  local: KeyValueStorageLike | null;
  session: KeyValueStorageLike | null;
} {
  if (!adapters) {
    return getDefaultStores();
  }
  const defaults = getDefaultStores();
  return {
    local: adapters.local === undefined ? defaults.local : adapters.local,
    session: adapters.session === undefined ? defaults.session : adapters.session,
  };
}

function safeGet(storage: KeyValueStorageLike | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: KeyValueStorageLike | null, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage quota or restricted-environment errors
  }
}

function safeRemove(storage: KeyValueStorageLike | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore restricted-environment errors
  }
}

export function isGeminiModelId(value: unknown): value is GeminiModelId {
  return typeof value === 'string' && VALID_MODELS.has(value);
}

export function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return typeof value === 'string' && VALID_REASONING_LEVELS.has(value);
}

export function getGeminiModelOption(model: GeminiModelId): GeminiModelOption {
  return (
    GEMINI_MODEL_OPTIONS.find((option) => option.id === model) ?? GEMINI_MODEL_OPTIONS[0]
  );
}

export function hasConfiguredApiKey(settings: Pick<AiSettings, 'apiKey'>): boolean {
  return settings.apiKey.trim().length > 0;
}

interface PersistedAiPrefs {
  model: GeminiModelId;
  reasoningLevel: ReasoningLevel;
  sessionOnly: boolean;
  showThinkingSummary: boolean;
  showEstimatedCost: boolean;
  showDebugTrace: boolean;
}

function sanitizePersistedPrefs(input: unknown): PersistedAiPrefs {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      model: DEFAULT_AI_SETTINGS.model,
      reasoningLevel: DEFAULT_AI_SETTINGS.reasoningLevel,
      sessionOnly: DEFAULT_AI_SETTINGS.sessionOnly,
      showThinkingSummary: DEFAULT_AI_SETTINGS.showThinkingSummary,
      showEstimatedCost: DEFAULT_AI_SETTINGS.showEstimatedCost,
      showDebugTrace: DEFAULT_AI_SETTINGS.showDebugTrace,
    };
  }
  const record = input as Record<string, unknown>;
  const resolvedModel: GeminiModelId = isGeminiModelId(record.model)
    ? record.model
    : record.model === 'gemini-4-argon'
      ? 'gemini-4-neon'
      : DEFAULT_AI_SETTINGS.model;
  return {
    model: resolvedModel,
    reasoningLevel: isReasoningLevel(record.reasoningLevel)
      ? record.reasoningLevel
      : DEFAULT_AI_SETTINGS.reasoningLevel,
    sessionOnly:
      typeof record.sessionOnly === 'boolean'
        ? record.sessionOnly
        : DEFAULT_AI_SETTINGS.sessionOnly,
    showThinkingSummary:
      typeof record.showThinkingSummary === 'boolean'
        ? record.showThinkingSummary
        : DEFAULT_AI_SETTINGS.showThinkingSummary,
    showEstimatedCost:
      typeof record.showEstimatedCost === 'boolean'
        ? record.showEstimatedCost
        : DEFAULT_AI_SETTINGS.showEstimatedCost,
    showDebugTrace:
      typeof record.showDebugTrace === 'boolean'
        ? record.showDebugTrace
        : DEFAULT_AI_SETTINGS.showDebugTrace,
  };
}

export function sanitizeAiSettings(input: unknown): AiSettings {
  const prefs = sanitizePersistedPrefs(input);
  const rawKey =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>).apiKey
      : '';
  return {
    ...prefs,
    apiKey: typeof rawKey === 'string' ? rawKey.trim() : '',
  };
}

/**
 * Loads persisted AI preferences from localStorage and reads the BYOK API key from
 * either sessionStorage (`sessionOnly: true`) or localStorage (`sessionOnly: false`).
 */
export function loadStoredAiSettings(adapters?: AiSettingsStorageAdapters): AiSettings {
  const {local, session} = resolveStores(adapters);
  let prefs: PersistedAiPrefs = {
    model: DEFAULT_AI_SETTINGS.model,
    reasoningLevel: DEFAULT_AI_SETTINGS.reasoningLevel,
    sessionOnly: DEFAULT_AI_SETTINGS.sessionOnly,
    showThinkingSummary: DEFAULT_AI_SETTINGS.showThinkingSummary,
    showEstimatedCost: DEFAULT_AI_SETTINGS.showEstimatedCost,
    showDebugTrace: DEFAULT_AI_SETTINGS.showDebugTrace,
  };

  const rawPrefs = safeGet(local, AI_SETTINGS_STORAGE_KEY);
  if (rawPrefs) {
    try {
      prefs = sanitizePersistedPrefs(JSON.parse(rawPrefs));
    } catch {
      // Fallback cleanly to defaults on corrupt JSON
    }
  }

  const keyStore = prefs.sessionOnly ? session : local;
  const storedKey = safeGet(keyStore, AI_API_KEY_STORAGE_KEY);

  return {
    ...prefs,
    apiKey: storedKey ? storedKey.trim() : '',
  };
}

/**
 * Persists non-secret AI preferences in localStorage and stores the BYOK API key
 * strictly in the selected store (`sessionStorage` when `sessionOnly` is true,
 * `localStorage` when false), purging any stale copy from the inactive store.
 */
export function saveStoredAiSettings(
  settings: AiSettings,
  adapters?: AiSettingsStorageAdapters
): AiSettings {
  const {local, session} = resolveStores(adapters);
  const normalized = sanitizeAiSettings(settings);

  const prefs: PersistedAiPrefs = {
    model: normalized.model,
    reasoningLevel: normalized.reasoningLevel,
    sessionOnly: normalized.sessionOnly,
    showThinkingSummary: normalized.showThinkingSummary,
    showEstimatedCost: normalized.showEstimatedCost,
    showDebugTrace: normalized.showDebugTrace,
  };

  safeSet(local, AI_SETTINGS_STORAGE_KEY, JSON.stringify(prefs));

  const targetKeyStore = normalized.sessionOnly ? session : local;
  const inactiveKeyStore = normalized.sessionOnly ? local : session;

  // Always remove from the inactive store so switching sessionOnly moves the key cleanly
  safeRemove(inactiveKeyStore, AI_API_KEY_STORAGE_KEY);

  if (normalized.apiKey.length > 0) {
    safeSet(targetKeyStore, AI_API_KEY_STORAGE_KEY, normalized.apiKey);
  } else {
    safeRemove(targetKeyStore, AI_API_KEY_STORAGE_KEY);
  }

  return normalized;
}

/**
 * Clears the stored BYOK API key from both localStorage and sessionStorage.
 */
export function clearApiKey(adapters?: AiSettingsStorageAdapters): void {
  const {local, session} = resolveStores(adapters);
  safeRemove(local, AI_API_KEY_STORAGE_KEY);
  safeRemove(session, AI_API_KEY_STORAGE_KEY);
}

/**
 * Switches between persistent localStorage and tab-scoped sessionStorage,
 * migrating any existing key cleanly between stores.
 */
export function switchApiKeyStorageMode(
  current: AiSettings,
  sessionOnly: boolean,
  adapters?: AiSettingsStorageAdapters
): AiSettings {
  const next: AiSettings = {
    ...current,
    sessionOnly,
  };
  return saveStoredAiSettings(next, adapters);
}

/**
 * Returns true when non-credential AI preferences (model, reasoning level, and
 * display toggles) already match `DEFAULT_AI_SETTINGS`.
 */
export function isDefaultAiPreferences(
  settings: Pick<
    AiSettings,
    'model' | 'reasoningLevel' | 'showThinkingSummary' | 'showEstimatedCost' | 'showDebugTrace'
  >
): boolean {
  return (
    settings.model === DEFAULT_AI_SETTINGS.model &&
    settings.reasoningLevel === DEFAULT_AI_SETTINGS.reasoningLevel &&
    settings.showThinkingSummary === DEFAULT_AI_SETTINGS.showThinkingSummary &&
    settings.showEstimatedCost === DEFAULT_AI_SETTINGS.showEstimatedCost &&
    settings.showDebugTrace === DEFAULT_AI_SETTINGS.showDebugTrace
  );
}

/**
 * Restores default model, reasoning level, and display toggles while preserving
 * the user's BYOK API key and `sessionOnly` storage preference intact.
 */
export function resetAiPreferencesToDefault(
  current: AiSettings,
  adapters?: AiSettingsStorageAdapters
): AiSettings {
  const next: AiSettings = {
    ...DEFAULT_AI_SETTINGS,
    apiKey: current.apiKey,
    sessionOnly: current.sessionOnly,
  };
  return saveStoredAiSettings(next, adapters);
}

export function useAiSettings(): {
  settings: AiSettings;
  hasApiKey: boolean;
  updateSettings: (patch: Partial<AiSettings>) => void;
  setApiKey: (apiKey: string) => void;
  setSessionOnly: (sessionOnly: boolean) => void;
  clearStoredApiKey: () => void;
  resetPreferencesToDefault: () => void;
} {
  const [settings, setSettings] = useState<AiSettings>(() => loadStoredAiSettings());

  const updateSettings = useCallback((patch: Partial<AiSettings>) => {
    setSettings((prev) => saveStoredAiSettings({...prev, ...patch}));
  }, []);

  const setApiKey = useCallback((apiKey: string) => {
    setSettings((prev) => saveStoredAiSettings({...prev, apiKey}));
  }, []);

  const setSessionOnly = useCallback((sessionOnly: boolean) => {
    setSettings((prev) => switchApiKeyStorageMode(prev, sessionOnly));
  }, []);

  const clearStoredApiKey = useCallback(() => {
    clearApiKey();
    setSettings((prev) => ({...prev, apiKey: ''}));
  }, []);

  const resetPreferencesToDefault = useCallback(() => {
    setSettings((prev) => resetAiPreferencesToDefault(prev));
  }, []);

  return {
    settings,
    hasApiKey: hasConfiguredApiKey(settings),
    updateSettings,
    setApiKey,
    setSessionOnly,
    clearStoredApiKey,
    resetPreferencesToDefault,
  };
}
