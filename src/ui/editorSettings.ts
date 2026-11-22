import {useCallback, useEffect, useState} from 'react';
import type {LintRuleOverrides} from '../core/types.ts';
import {
  applyClauseGuides,
  DEFAULT_CLAUSE_GUIDES,
  loadStoredClauseGuides,
  saveStoredClauseGuides,
} from './clauseGuides.ts';
import {
  areLintRuleOverridesEqual,
  DEFAULT_LINT_RULE_OVERRIDES,
  loadStoredLintRuleOverrides,
  saveStoredLintRuleOverrides,
} from './lintRules.ts';
import {
  applySubStateIds,
  DEFAULT_SUBSTATE_IDS,
  loadStoredSubStateIds,
  saveStoredSubStateIds,
} from './subStateIds.ts';
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
import {
  applyLiveSplit,
  clampLiveSplitPercent,
  DEFAULT_LIVE_SPLIT_PERCENT,
  loadStoredLiveSplit,
  saveStoredLiveSplit,
} from './workspaceSplit.ts';

export interface EditorSettings {
  themeMode: ThemeMode;
  textSize: TextSizePreset;
  clauseGuides: boolean;
  subStateIds: boolean;
  liveSplitPercent: number;
  lintRuleOverrides: LintRuleOverrides;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  themeMode: 'dark',
  textSize: DEFAULT_TEXT_SIZE,
  clauseGuides: DEFAULT_CLAUSE_GUIDES,
  subStateIds: DEFAULT_SUBSTATE_IDS,
  liveSplitPercent: DEFAULT_LIVE_SPLIT_PERCENT,
  lintRuleOverrides: DEFAULT_LINT_RULE_OVERRIDES,
};

export function loadEditorSettings(): EditorSettings {
  return {
    themeMode: loadStoredTheme(),
    textSize: loadStoredTextSize(),
    clauseGuides: loadStoredClauseGuides(),
    subStateIds: loadStoredSubStateIds(),
    liveSplitPercent: loadStoredLiveSplit(),
    lintRuleOverrides: loadStoredLintRuleOverrides(),
  };
}

export function applyEditorSettings(
  settings: EditorSettings,
  disableThemeTransitions = false
): void {
  applyThemeMode(settings.themeMode, disableThemeTransitions);
  applyTextSize(settings.textSize);
  applyClauseGuides(settings.clauseGuides);
  applySubStateIds(settings.subStateIds);
  applyLiveSplit(settings.liveSplitPercent);
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
      const normalizedLiveSplit =
        patch.liveSplitPercent !== undefined
          ? clampLiveSplitPercent(patch.liveSplitPercent)
          : prev.liveSplitPercent;
      const next: EditorSettings = {
        ...prev,
        ...patch,
        liveSplitPercent: normalizedLiveSplit,
      };

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
      if (patch.subStateIds !== undefined && patch.subStateIds !== prev.subStateIds) {
        saveStoredSubStateIds(patch.subStateIds);
        applySubStateIds(patch.subStateIds);
      }
      if (patch.liveSplitPercent !== undefined) {
        saveStoredLiveSplit(normalizedLiveSplit);
        applyLiveSplit(normalizedLiveSplit);
      }
      if (
        patch.lintRuleOverrides !== undefined &&
        !areLintRuleOverridesEqual(patch.lintRuleOverrides, prev.lintRuleOverrides)
      ) {
        saveStoredLintRuleOverrides(patch.lintRuleOverrides);
      }

      return next;
    });
  }, []);

  return {settings, updateSettings};
}
