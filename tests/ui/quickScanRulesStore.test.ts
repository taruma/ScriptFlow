import {describe, expect, it} from 'vitest';
import {
  BUNDLED_QUICK_SCAN_RULES,
  QUICK_SCAN_RULES_VERSION,
} from '../../src/data/knowledge/index.ts';
import {resolveQuickScanRules} from '../../src/services/geminiDecisions.ts';
import type {KeyValueStorageLike} from '../../src/ui/aiSettings.ts';
import {
  acknowledgeQuickScanRulesUpdateInState,
  countQuickScanCustomizations,
  DEFAULT_QUICK_SCAN_RULES_STATE,
  deleteCustomQuickScanRuleInState,
  hasUpstreamQuickScanRulesUpdate,
  loadStoredQuickScanRulesState,
  QUICK_SCAN_RULES_STORAGE_KEY,
  resetAllQuickScanRulesInState,
  resetQuickScanRuleInState,
  sanitizeQuickScanRulesState,
  saveStoredQuickScanRulesState,
  setAllQuickScanRulesEnabledInState,
  setQuickScanRuleEnabledInState,
  setQuickScanRuleTextOverrideInState,
  slugifyCustomQuickScanRuleId,
  upsertCustomQuickScanRuleInState,
  validateCustomQuickScanRuleInput,
} from '../../src/ui/quickScanRulesStore.ts';

function createMemoryStorage(): KeyValueStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('quickScanRulesStore persistence, validation & customization helpers', () => {
  it('slugifies custom rule IDs cleanly and avoids collisions with built-in or existing custom IDs', () => {
    expect(slugifyCustomQuickScanRuleId('Avoid Slow Motion!')).toBe('avoid_slow_motion');
    // Collides with built-in `doc_opening_motion` -> suffixes `_custom`
    expect(slugifyCustomQuickScanRuleId('doc_opening_motion')).toBe('doc_opening_motion_custom');
    // Collides with existing custom ID -> increments suffix
    expect(
      slugifyCustomQuickScanRuleId('My Rule', new Set(['my_rule', 'my_rule_2']))
    ).toBe('my_rule_3');
  });

  it('validates custom rule fields and blocks reserved built-in IDs and duplicates', () => {
    const reserved = validateCustomQuickScanRuleInput(
      {
        id: BUNDLED_QUICK_SCAN_RULES[0].id,
        label: 'Conflict',
        lens: 'lens5_blocks_grammar',
        scope: 'document',
        when: ['all'],
        instructions: 'Q?',
        trueDescription: 'Bad',
        falseDescription: 'Good',
      },
      []
    );
    expect(reserved.ok).toBe(false);
    expect(reserved.errors.id).toContain('reserved');

    const valid = validateCustomQuickScanRuleInput(
      {
        id: 'no_voiceover_spam',
        label: 'No Unmotivated V.O.',
        lens: 'lens4_acoustics_voice',
        scope: 'macro_state',
        when: ['has_dialogue'],
        instructions: 'Does {{STATE_ID}} add unmotivated (V.O.)?',
        trueDescription: 'Unmotivated V.O. present.',
        falseDescription: 'No unmotivated V.O.',
      },
      []
    );
    expect(valid.ok).toBe(true);
    expect(valid.normalized?.id).toBe('no_voiceover_spam');
  });

  it('persists rule enable/disable, text overrides, custom rules, resets, and upstream version notices', () => {
    const store = createMemoryStorage();
    expect(loadStoredQuickScanRulesState(store)).toEqual(DEFAULT_QUICK_SCAN_RULES_STATE);

    let state = setQuickScanRuleEnabledInState(
      DEFAULT_QUICK_SCAN_RULES_STATE,
      'doc_opening_audio',
      false
    );
    state = setQuickScanRuleTextOverrideInState(state, 'state_lookbook_bleed', {
      instructionsOverride: 'Custom bleed check on {{STATE_ID}}?',
    });
    state = upsertCustomQuickScanRuleInState(state, {
      id: 'studio_noir_rule',
      label: 'Studio Noir Rule',
      lens: 'lens1_spatial_optics',
      scope: 'document',
      when: ['continuous'],
      instructions: 'Does the scene lose noir shadow discipline?',
      trueDescription: 'Flat high-key lighting introduced.',
      falseDescription: 'Maintains noir contrast.',
    });

    const saved = saveStoredQuickScanRulesState(state, store);
    expect(countQuickScanCustomizations(saved)).toBe(3);
    expect(loadStoredQuickScanRulesState(store)).toEqual(saved);

    const resolved = resolveQuickScanRules(saved.ruleOverrides, saved.customRules);
    expect(resolved.find((r) => r.id === 'doc_opening_audio')?.enabled).toBe(false);
    expect(resolved.find((r) => r.id === 'state_lookbook_bleed')?.isTextOverridden).toBe(true);
    expect(resolved.find((r) => r.id === 'studio_noir_rule')?.builtIn).toBe(false);

    // Upstream catalog version mismatch triggers notice when customizations exist
    const staleVersionState = {...saved, rulesVersion: '0.3.0-old'};
    expect(hasUpstreamQuickScanRulesUpdate(staleVersionState)).toBe(true);
    const acked = acknowledgeQuickScanRulesUpdateInState(staleVersionState);
    expect(acked.rulesVersion).toBe(QUICK_SCAN_RULES_VERSION);
    expect(hasUpstreamQuickScanRulesUpdate(acked)).toBe(false);

    // Reset single built-in rule & delete custom rule
    const afterResetOne = resetQuickScanRuleInState(saved, 'state_lookbook_bleed');
    expect(afterResetOne.ruleOverrides.state_lookbook_bleed).toBeUndefined();
    const afterDeleteCustom = deleteCustomQuickScanRuleInState(afterResetOne, 'studio_noir_rule');
    expect(afterDeleteCustom.customRules).toHaveLength(0);

    // Reset all restores clean defaults
    expect(resetAllQuickScanRulesInState()).toEqual(DEFAULT_QUICK_SCAN_RULES_STATE);

    // Corrupt storage falls back safely
    store.setItem(QUICK_SCAN_RULES_STORAGE_KEY, '{corrupt');
    expect(loadStoredQuickScanRulesState(store)).toEqual(DEFAULT_QUICK_SCAN_RULES_STATE);
    expect(sanitizeQuickScanRulesState(null)).toEqual(DEFAULT_QUICK_SCAN_RULES_STATE);
  });

  it('bulk-disables and bulk-enables all built-in and custom Quick Scan rules while preserving text overrides and custom rules', () => {
    let state = setQuickScanRuleTextOverrideInState(
      DEFAULT_QUICK_SCAN_RULES_STATE,
      'state_lookbook_bleed',
      {instructionsOverride: 'Custom bleed prompt on {{STATE_ID}}?'}
    );
    state = upsertCustomQuickScanRuleInState(state, {
      id: 'studio_custom_rule',
      label: 'Studio Custom Rule',
      lens: 'lens1_spatial_optics',
      scope: 'document',
      when: ['all'],
      instructions: 'Custom check?',
      trueDescription: 'Violated',
      falseDescription: 'Clean',
    });

    const allDisabled = setAllQuickScanRulesEnabledInState(state, false);
    const resolvedDisabled = resolveQuickScanRules(
      allDisabled.ruleOverrides,
      allDisabled.customRules
    );
    expect(resolvedDisabled.every((r) => !r.enabled)).toBe(true);
    expect(allDisabled.customRules).toHaveLength(1);
    expect(allDisabled.ruleOverrides.state_lookbook_bleed?.instructionsOverride).toBe(
      'Custom bleed prompt on {{STATE_ID}}?'
    );

    const allEnabled = setAllQuickScanRulesEnabledInState(allDisabled, true);
    const resolvedEnabled = resolveQuickScanRules(
      allEnabled.ruleOverrides,
      allEnabled.customRules
    );
    expect(resolvedEnabled.every((r) => r.enabled)).toBe(true);
    expect(allEnabled.customRules).toHaveLength(1);
    expect(allEnabled.ruleOverrides.state_lookbook_bleed?.instructionsOverride).toBe(
      'Custom bleed prompt on {{STATE_ID}}?'
    );
    expect(allEnabled.ruleOverrides.studio_custom_rule).toBeUndefined();
  });
});
