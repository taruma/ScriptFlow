import {describe, expect, it} from 'vitest';
import {
  AI_API_KEY_STORAGE_KEY,
  AI_SETTINGS_STORAGE_KEY,
  clearApiKey,
  DEFAULT_AI_SETTINGS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_REASONING_LEVEL,
  GEMINI_MODEL_OPTIONS,
  hasConfiguredApiKey,
  isDefaultAiPreferences,
  loadStoredAiSettings,
  REASONING_LEVEL_OPTIONS,
  resetAiPreferencesToDefault,
  sanitizeAiSettings,
  saveStoredAiSettings,
  switchApiKeyStorageMode,
} from '../../src/ui/aiSettings.ts';
import {createMemoryStorage} from './aiTestFixtures.ts';
describe('aiSettings BYOK persistence and Gemini model catalog', () => {
  it('exposes the supported Gemini model catalog and default settings', () => {
    expect(GEMINI_MODEL_OPTIONS.map((m) => m.id)).toEqual([
      'gemini-4-hydrogen',
      'gemini-4-neon',
      'gemini-4-carbon',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
    ]);
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-4-hydrogen');
    expect(REASONING_LEVEL_OPTIONS.map((r) => r.id)).toEqual(['low', 'medium', 'high']);
    expect(DEFAULT_REASONING_LEVEL).toBe('low');
    expect(DEFAULT_AI_SETTINGS).toEqual({
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      quickScanSensitivity: 'balanced',
      apiKey: '',
      sessionOnly: false,
      showThinkingSummary: true,
      showEstimatedCost: true,
      showDebugTrace: false,
    });
  });

  it('stores API key in localStorage by default and moves it cleanly when toggling sessionOnly', () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const adapters = {local, session};

    const saved = saveStoredAiSettings(
      {
        model: 'gemini-4-neon',
        reasoningLevel: 'high',
        quickScanSensitivity: 'strict',
        apiKey: '  AIza-test-key-123  ',
        sessionOnly: false,
        showThinkingSummary: false,
        showEstimatedCost: false,
        showDebugTrace: true,
      },
      adapters
    );

    expect(saved.apiKey).toBe('AIza-test-key-123');
    expect(saved.showEstimatedCost).toBe(false);
    expect(saved.showDebugTrace).toBe(true);
    expect(hasConfiguredApiKey(saved)).toBe(true);
    expect(local.getItem(AI_API_KEY_STORAGE_KEY)).toBe('AIza-test-key-123');
    expect(session.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(loadStoredAiSettings(adapters)).toEqual(saved);

    // Toggle to sessionOnly = true: moves key from localStorage to sessionStorage
    const sessionMode = switchApiKeyStorageMode(saved, true, adapters);
    expect(sessionMode.sessionOnly).toBe(true);
    expect(sessionMode.apiKey).toBe('AIza-test-key-123');
    expect(local.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(session.getItem(AI_API_KEY_STORAGE_KEY)).toBe('AIza-test-key-123');
    expect(loadStoredAiSettings(adapters)).toEqual(sessionMode);

    // Toggle back to sessionOnly = false: moves key back to localStorage
    const persistentMode = switchApiKeyStorageMode(sessionMode, false, adapters);
    expect(persistentMode.sessionOnly).toBe(false);
    expect(local.getItem(AI_API_KEY_STORAGE_KEY)).toBe('AIza-test-key-123');
    expect(session.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(loadStoredAiSettings(adapters)).toEqual(persistentMode);
  });

  it('clears API key from both localStorage and sessionStorage via clearApiKey', () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const adapters = {local, session};

    local.setItem(AI_API_KEY_STORAGE_KEY, 'key-local');
    session.setItem(AI_API_KEY_STORAGE_KEY, 'key-session');

    clearApiKey(adapters);
    expect(local.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(session.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
  });

  it('sanitizes unknown model IDs, invalid reasoning levels, and corrupt persisted JSON safely', () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const adapters = {local, session};

    expect(
      sanitizeAiSettings({
        model: 'gemini-1.5-pro',
        reasoningLevel: 'ultra',
        apiKey: '  secret ',
        sessionOnly: 'yes',
        showThinkingSummary: 123,
        showEstimatedCost: 'nope',
        showDebugTrace: 'true',
      })
    ).toEqual({
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      quickScanSensitivity: 'balanced',
      apiKey: 'secret',
      sessionOnly: false,
      showThinkingSummary: true,
      showEstimatedCost: true,
      showDebugTrace: false,
    });

    // Legacy gemini-4-argon preference migrates cleanly to the middle tier (gemini-4-neon)
    expect(sanitizeAiSettings({model: 'gemini-4-argon', reasoningLevel: 'high'}).model).toBe(
      'gemini-4-neon'
    );

    // Gemini 3.8 Flash is accepted as a valid persisted model selection
    expect(sanitizeAiSettings({model: 'gemini-3.8-flash', reasoningLevel: 'medium'}).model).toBe(
      'gemini-3.8-flash'
    );

    expect(
      sanitizeAiSettings({
        model: 'gemini-4-carbon',
        reasoningLevel: 'high',
        apiKey: '',
        sessionOnly: true,
        showThinkingSummary: false,
        showDebugTrace: true,
      }).showDebugTrace
    ).toBe(true);

    local.setItem(AI_SETTINGS_STORAGE_KEY, '{broken json');
    expect(loadStoredAiSettings(adapters)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('resets model, reasoning level, and display toggles to defaults without clearing API key or sessionOnly', () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const adapters = {local, session};

    expect(isDefaultAiPreferences(DEFAULT_AI_SETTINGS)).toBe(true);

    const customized = saveStoredAiSettings(
      {
        model: 'gemini-4-carbon',
        reasoningLevel: 'high',
        quickScanSensitivity: 'lenient',
        apiKey: 'AIza-keep-me-intact',
        sessionOnly: true,
        showThinkingSummary: false,
        showEstimatedCost: false,
        showDebugTrace: true,
      },
      adapters
    );

    expect(isDefaultAiPreferences(customized)).toBe(false);

    const reset = resetAiPreferencesToDefault(customized, adapters);
    expect(isDefaultAiPreferences(reset)).toBe(true);
    expect(reset).toEqual({
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      quickScanSensitivity: 'balanced',
      apiKey: 'AIza-keep-me-intact',
      sessionOnly: true,
      showThinkingSummary: true,
      showEstimatedCost: true,
      showDebugTrace: false,
    });
    expect(session.getItem(AI_API_KEY_STORAGE_KEY)).toBe('AIza-keep-me-intact');
    expect(local.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(loadStoredAiSettings(adapters)).toEqual(reset);
  });
});
