import {useCallback, useEffect, useState} from 'react';
import {
  applyClauseGuides,
  DEFAULT_CLAUSE_GUIDES,
  loadStoredClauseGuides,
  saveStoredClauseGuides,
} from './clauseGuides.ts';
import {
  applyTextSize,
  DEFAULT_TEXT_SIZE,
  loadStoredTextSize,
  saveStoredTextSize,
  type TextSizePreset,
} from './textSize.ts';
import {
  applyThemeMode,
  loadStoredTheme,
  saveStoredTheme,
  type ThemeMode,
} from './theme.ts';

export interface EditorSettings {
  themeMode: ThemeMode;
  textSize: TextSizePreset;
  clauseGuides: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  themeMode: 'dark',
  textSize: DEFAULT_TEXT_SIZE,
  clauseGuides: DEFAULT_CLAUSE_GUIDES,
};

export function loadEditorSettings(): EditorSettings {
  return {
    themeMode: loadStoredTheme(),
    textSize: loadStoredTextSize(),
    clauseGuides: loadStoredClauseGuides(),
  };
}

export function applyEditorSettings(
  settings: EditorSettings,
  disableThemeTransitions = false
): void {
  applyThemeMode(settings.themeMode, disableThemeTransitions);
  applyTextSize(settings.textSize);
  applyClauseGuides(settings.clauseGuides);
}

/**
 * Unified persisted display & editor preferences hook.
 * Add new settings here so storage, DOM synchronization, and SettingsPopover stay in sync.
 */
export function useEditorSettings(): {
  settings: EditorSettings;
  updateSettings: (patch: Partial<EditorSettings>) => void;
} {
  const [settings, setSettings] = useState<EditorSettings>(loadEditorSettings);

  useEffect(() => {
    applyEditorSettings(settings, false);
    // Initial mount hydration only; subsequent updates apply immediately in updateSettings
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = useCallback((patch: Partial<EditorSettings>) => {
    setSettings((prev) => {
      const next: EditorSettings = {...prev, ...patch};

      if (patch.themeMode !== undefined && patch.themeMode !== prev.themeMode) {
        saveStoredTheme(patch.themeMode);
        applyThemeMode(patch.themeMode, true);
      }
      if (patch.textSize !== undefined && patch.textSize !== prev.textSize) {
        saveStoredTextSize(patch.textSize);
        applyTextSize(patch.textSize);
      }
      if (patch.clauseGuides !== undefined && patch.clauseGuides !== prev.clauseGuides) {
        saveStoredClauseGuides(patch.clauseGuides);
        applyClauseGuides(patch.clauseGuides);
      }

      return next;
    });
  }, []);

  return {settings, updateSettings};
}
