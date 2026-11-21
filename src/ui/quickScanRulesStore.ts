import {useCallback, useState} from 'react';
import {
  BUNDLED_QUICK_SCAN_RULES,
  QUICK_SCAN_RULE_LENSES,
  QUICK_SCAN_RULE_PREDICATES,
  QUICK_SCAN_RULE_SCOPES,
  QUICK_SCAN_RULES_VERSION,
  type QuickScanRuleLens,
  type QuickScanRulePredicate,
  type QuickScanRuleScope,
} from '../data/knowledge/index.ts';
import type {
  CustomQuickScanRule,
  QuickScanRuleOverride,
} from '../services/geminiDecisions.ts';
import type {KeyValueStorageLike} from './aiSettings.ts';

export const QUICK_SCAN_RULES_STORAGE_KEY = 'auteur-editor-quick-scan-rules-v1';

const BUILTIN_RULE_BY_ID = new Map(BUNDLED_QUICK_SCAN_RULES.map((rule) => [rule.id, rule]));
const VALID_LENSES = new Set<string>(QUICK_SCAN_RULE_LENSES);
const VALID_SCOPES = new Set<string>(QUICK_SCAN_RULE_SCOPES);
const VALID_PREDICATES = new Set<string>(QUICK_SCAN_RULE_PREDICATES);
const CUSTOM_RULE_ID_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export interface QuickScanRulesState {
  rulesVersion: string;
  ruleOverrides: Record<string, QuickScanRuleOverride>;
  customRules: CustomQuickScanRule[];
}

export const DEFAULT_QUICK_SCAN_RULES_STATE: QuickScanRulesState = {
  rulesVersion: QUICK_SCAN_RULES_VERSION,
  ruleOverrides: {},
  customRules: [],
};

export interface CustomQuickScanRuleValidationResult {
  ok: boolean;
  errors: Partial<
    Record<'id' | 'label' | 'instructions' | 'trueDescription' | 'falseDescription', string>
  >;
  normalized?: CustomQuickScanRule;
}

function getDefaultLocalStorage(): KeyValueStorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(storage?: KeyValueStorageLike | null): KeyValueStorageLike | null {
  return storage === undefined ? getDefaultLocalStorage() : storage;
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
    // Ignore quota or restricted-environment errors
  }
}

export function isBuiltinQuickScanRuleId(id: string): boolean {
  return BUILTIN_RULE_BY_ID.has(id.trim().toLowerCase());
}

export function slugifyCustomQuickScanRuleId(
  nameOrId: string,
  existingIds: ReadonlySet<string> = new Set()
): string {
  const normalizedBase = nameOrId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const base = normalizedBase.length > 0 ? normalizedBase : 'custom_rule';
  const normalizedExisting = new Set<string>();
  for (const id of existingIds) {
    normalizedExisting.add(id.trim().toLowerCase());
  }

  let candidate = BUILTIN_RULE_BY_ID.has(base) ? `${base}_custom` : base;
  if (!BUILTIN_RULE_BY_ID.has(candidate) && !normalizedExisting.has(candidate)) {
    return candidate;
  }

  let suffix = 2;
  const stem = candidate;
  while (BUILTIN_RULE_BY_ID.has(candidate) || normalizedExisting.has(candidate)) {
    candidate = `${stem}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function validateCustomQuickScanRuleInput(
  input: CustomQuickScanRule,
  existingCustomRules: readonly CustomQuickScanRule[],
  editingId?: string
): CustomQuickScanRuleValidationResult {
  const errors: CustomQuickScanRuleValidationResult['errors'] = {};
  const id = input.id.trim().toLowerCase();
  const label = input.label.trim();
  const instructions = input.instructions.trim();
  const trueDescription = input.trueDescription.trim();
  const falseDescription = input.falseDescription.trim();
  const escalationHint = input.escalationHint?.trim();
  const normalizedEditingId = editingId?.trim().toLowerCase();

  if (label.length === 0) {
    errors.label = 'Rule label is required.';
  }

  if (id.length === 0) {
    errors.id = 'Rule ID is required.';
  } else if (!CUSTOM_RULE_ID_PATTERN.test(id)) {
    errors.id = 'Use lowercase letters, numbers, and underscores only (snake_case).';
  } else if (BUILTIN_RULE_BY_ID.has(id)) {
    errors.id = 'This ID is reserved by a built-in rule. Choose a distinct ID.';
  } else {
    const duplicate = existingCustomRules.some(
      (rule) => rule.id.toLowerCase() === id && rule.id.toLowerCase() !== normalizedEditingId
    );
    if (duplicate) {
      errors.id = 'Another custom rule already uses this ID.';
    }
  }

  if (instructions.length === 0) {
    errors.instructions = 'Binary check question cannot be empty.';
  }

  if (trueDescription.length === 0) {
    errors.trueDescription = 'Violation condition (True) cannot be empty.';
  }

  if (falseDescription.length === 0) {
    errors.falseDescription = 'Clean condition (False) cannot be empty.';
  }

  if (Object.keys(errors).length > 0) {
    return {ok: false, errors};
  }

  const lens: QuickScanRuleLens = VALID_LENSES.has(input.lens)
    ? input.lens
    : 'lens5_blocks_grammar';
  const scope: QuickScanRuleScope = VALID_SCOPES.has(input.scope) ? input.scope : 'document';
  const filteredWhen = (Array.isArray(input.when) ? input.when : ['all']).filter((p) =>
    VALID_PREDICATES.has(p)
  ) as QuickScanRulePredicate[];
  const when: QuickScanRulePredicate[] = filteredWhen.length > 0 ? filteredWhen : ['all'];

  return {
    ok: true,
    errors: {},
    normalized: {
      id,
      lens,
      scope,
      label,
      when,
      instructions,
      trueDescription,
      falseDescription,
      ...(escalationHint ? {escalationHint} : {}),
    },
  };
}

function normalizeRuleOverride(
  ruleId: string,
  raw: unknown,
  isKnownCustom: boolean
): QuickScanRuleOverride | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const builtIn = BUILTIN_RULE_BY_ID.get(ruleId);
  if (!builtIn && !isKnownCustom) return null;

  const defaultEnabled = builtIn ? (builtIn.defaultEnabled ?? true) : true;
  const enabled =
    typeof record.enabled === 'boolean' && record.enabled !== defaultEnabled
      ? record.enabled
      : undefined;

  let instructionsOverride: string | undefined;
  let trueDescriptionOverride: string | undefined;
  let falseDescriptionOverride: string | undefined;

  if (builtIn) {
    if (
      typeof record.instructionsOverride === 'string' &&
      record.instructionsOverride.trim().length > 0 &&
      record.instructionsOverride.trim() !== builtIn.instructions.trim()
    ) {
      instructionsOverride = record.instructionsOverride;
    }
    if (
      typeof record.trueDescriptionOverride === 'string' &&
      record.trueDescriptionOverride.trim().length > 0 &&
      record.trueDescriptionOverride.trim() !== builtIn.trueDescription.trim()
    ) {
      trueDescriptionOverride = record.trueDescriptionOverride;
    }
    if (
      typeof record.falseDescriptionOverride === 'string' &&
      record.falseDescriptionOverride.trim().length > 0 &&
      record.falseDescriptionOverride.trim() !== builtIn.falseDescription.trim()
    ) {
      falseDescriptionOverride = record.falseDescriptionOverride;
    }
  }

  if (
    enabled === undefined &&
    !instructionsOverride &&
    !trueDescriptionOverride &&
    !falseDescriptionOverride
  ) {
    return null;
  }

  return {
    ...(enabled !== undefined ? {enabled} : {}),
    ...(instructionsOverride ? {instructionsOverride} : {}),
    ...(trueDescriptionOverride ? {trueDescriptionOverride} : {}),
    ...(falseDescriptionOverride ? {falseDescriptionOverride} : {}),
  };
}

export function sanitizeQuickScanRulesState(input: unknown): QuickScanRulesState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ...DEFAULT_QUICK_SCAN_RULES_STATE,
      ruleOverrides: {},
      customRules: [],
    };
  }

  const record = input as Record<string, unknown>;
  const rulesVersion =
    typeof record.rulesVersion === 'string' && record.rulesVersion.trim().length > 0
      ? record.rulesVersion.trim()
      : QUICK_SCAN_RULES_VERSION;

  const customRules: CustomQuickScanRule[] = [];
  const seenCustomIds = new Set<string>();
  if (Array.isArray(record.customRules)) {
    for (const item of record.customRules) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const cand = item as Record<string, unknown>;
      if (
        typeof cand.id !== 'string' ||
        typeof cand.label !== 'string' ||
        typeof cand.instructions !== 'string' ||
        typeof cand.trueDescription !== 'string' ||
        typeof cand.falseDescription !== 'string'
      ) {
        continue;
      }
      const id = cand.id.trim().toLowerCase();
      const label = cand.label.trim();
      const instructions = cand.instructions.trim();
      const trueDescription = cand.trueDescription.trim();
      const falseDescription = cand.falseDescription.trim();
      if (
        !id ||
        !CUSTOM_RULE_ID_PATTERN.test(id) ||
        !label ||
        !instructions ||
        !trueDescription ||
        !falseDescription ||
        BUILTIN_RULE_BY_ID.has(id) ||
        seenCustomIds.has(id)
      ) {
        continue;
      }

      const lens: QuickScanRuleLens =
        typeof cand.lens === 'string' && VALID_LENSES.has(cand.lens)
          ? (cand.lens as QuickScanRuleLens)
          : 'lens5_blocks_grammar';
      const scope: QuickScanRuleScope =
        typeof cand.scope === 'string' && VALID_SCOPES.has(cand.scope)
          ? (cand.scope as QuickScanRuleScope)
          : 'document';
      const rawWhen = Array.isArray(cand.when) ? cand.when : ['all'];
      const validWhen = rawWhen.filter(
        (p): p is QuickScanRulePredicate => typeof p === 'string' && VALID_PREDICATES.has(p)
      );
      const when: QuickScanRulePredicate[] = validWhen.length > 0 ? validWhen : ['all'];
      const escalationHint =
        typeof cand.escalationHint === 'string' && cand.escalationHint.trim().length > 0
          ? cand.escalationHint.trim()
          : undefined;

      seenCustomIds.add(id);
      customRules.push({
        id,
        lens,
        scope,
        label,
        when,
        instructions,
        trueDescription,
        falseDescription,
        ...(escalationHint ? {escalationHint} : {}),
      });
    }
  }

  const ruleOverrides: Record<string, QuickScanRuleOverride> = {};
  if (
    record.ruleOverrides &&
    typeof record.ruleOverrides === 'object' &&
    !Array.isArray(record.ruleOverrides)
  ) {
    for (const [rawId, rawOv] of Object.entries(
      record.ruleOverrides as Record<string, unknown>
    )) {
      const id = rawId.trim().toLowerCase();
      if (!id) continue;
      const normalized = normalizeRuleOverride(id, rawOv, seenCustomIds.has(id));
      if (normalized) {
        ruleOverrides[id] = normalized;
      }
    }
  }

  return {
    rulesVersion,
    ruleOverrides,
    customRules,
  };
}

export function loadStoredQuickScanRulesState(
  storage?: KeyValueStorageLike | null
): QuickScanRulesState {
  const store = resolveStorage(storage);
  const raw = safeGet(store, QUICK_SCAN_RULES_STORAGE_KEY);
  if (!raw) {
    return {
      ...DEFAULT_QUICK_SCAN_RULES_STATE,
      ruleOverrides: {},
      customRules: [],
    };
  }
  try {
    return sanitizeQuickScanRulesState(JSON.parse(raw));
  } catch {
    return {
      ...DEFAULT_QUICK_SCAN_RULES_STATE,
      ruleOverrides: {},
      customRules: [],
    };
  }
}

export function saveStoredQuickScanRulesState(
  state: QuickScanRulesState,
  storage?: KeyValueStorageLike | null
): QuickScanRulesState {
  const normalized = sanitizeQuickScanRulesState(state);
  const store = resolveStorage(storage);
  safeSet(store, QUICK_SCAN_RULES_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function countQuickScanCustomizations(state: QuickScanRulesState): number {
  return Object.keys(state.ruleOverrides).length + state.customRules.length;
}

export function hasUpstreamQuickScanRulesUpdate(state: QuickScanRulesState): boolean {
  return (
    state.rulesVersion !== QUICK_SCAN_RULES_VERSION && countQuickScanCustomizations(state) > 0
  );
}

export function setQuickScanRuleEnabledInState(
  state: QuickScanRulesState,
  ruleId: string,
  enabled: boolean
): QuickScanRulesState {
  const id = ruleId.trim().toLowerCase();
  const prev = state.ruleOverrides[id] ?? {};
  const nextOverrides: Record<string, QuickScanRuleOverride> = {
    ...state.ruleOverrides,
    [id]: {
      ...prev,
      enabled,
    },
  };
  return sanitizeQuickScanRulesState({
    ...state,
    ruleOverrides: nextOverrides,
  });
}

/**
 * Bulk-enables or bulk-disables every built-in and custom Quick Scan rule while
 * preserving all custom rule definitions and built-in criteria text overrides.
 */
export function setAllQuickScanRulesEnabledInState(
  state: QuickScanRulesState,
  enabled: boolean
): QuickScanRulesState {
  const nextOverrides: Record<string, QuickScanRuleOverride> = {...state.ruleOverrides};

  for (const builtIn of BUNDLED_QUICK_SCAN_RULES) {
    const prev = nextOverrides[builtIn.id] ?? {};
    nextOverrides[builtIn.id] = {
      ...prev,
      enabled,
    };
  }

  for (const custom of state.customRules) {
    const id = custom.id.trim().toLowerCase();
    const prev = nextOverrides[id] ?? {};
    nextOverrides[id] = {
      ...prev,
      enabled,
    };
  }

  return sanitizeQuickScanRulesState({
    ...state,
    ruleOverrides: nextOverrides,
  });
}

export function setQuickScanRuleTextOverrideInState(
  state: QuickScanRulesState,
  ruleId: string,
  patch: {
    instructionsOverride?: string | null;
    trueDescriptionOverride?: string | null;
    falseDescriptionOverride?: string | null;
  }
): QuickScanRulesState {
  const id = ruleId.trim().toLowerCase();
  const prev = state.ruleOverrides[id] ?? {};
  const nextEntry: QuickScanRuleOverride = {...prev};

  if (patch.instructionsOverride !== undefined) {
    if (patch.instructionsOverride === null) delete nextEntry.instructionsOverride;
    else nextEntry.instructionsOverride = patch.instructionsOverride;
  }
  if (patch.trueDescriptionOverride !== undefined) {
    if (patch.trueDescriptionOverride === null) delete nextEntry.trueDescriptionOverride;
    else nextEntry.trueDescriptionOverride = patch.trueDescriptionOverride;
  }
  if (patch.falseDescriptionOverride !== undefined) {
    if (patch.falseDescriptionOverride === null) delete nextEntry.falseDescriptionOverride;
    else nextEntry.falseDescriptionOverride = patch.falseDescriptionOverride;
  }

  return sanitizeQuickScanRulesState({
    ...state,
    ruleOverrides: {
      ...state.ruleOverrides,
      [id]: nextEntry,
    },
  });
}

export function resetQuickScanRuleInState(
  state: QuickScanRulesState,
  ruleId: string
): QuickScanRulesState {
  const id = ruleId.trim().toLowerCase();
  if (!(id in state.ruleOverrides)) return state;
  const nextOverrides = {...state.ruleOverrides};
  delete nextOverrides[id];
  return sanitizeQuickScanRulesState({
    ...state,
    ruleOverrides: nextOverrides,
  });
}

export function upsertCustomQuickScanRuleInState(
  state: QuickScanRulesState,
  rule: CustomQuickScanRule,
  editingId?: string
): QuickScanRulesState {
  const validation = validateCustomQuickScanRuleInput(rule, state.customRules, editingId);
  if (!validation.ok || !validation.normalized) return state;

  const normalized = validation.normalized;
  const oldId = editingId?.trim().toLowerCase();
  const nextCustomRules = oldId
    ? state.customRules.map((item) => (item.id.toLowerCase() === oldId ? normalized : item))
    : [...state.customRules, normalized];

  const nextOverrides = {...state.ruleOverrides};
  if (oldId && oldId !== normalized.id && oldId in nextOverrides) {
    nextOverrides[normalized.id] = nextOverrides[oldId];
    delete nextOverrides[oldId];
  }

  return sanitizeQuickScanRulesState({
    ...state,
    customRules: nextCustomRules,
    ruleOverrides: nextOverrides,
  });
}

export function deleteCustomQuickScanRuleInState(
  state: QuickScanRulesState,
  ruleId: string
): QuickScanRulesState {
  const id = ruleId.trim().toLowerCase();
  const nextCustomRules = state.customRules.filter((item) => item.id.toLowerCase() !== id);
  const nextOverrides = {...state.ruleOverrides};
  delete nextOverrides[id];
  return sanitizeQuickScanRulesState({
    ...state,
    customRules: nextCustomRules,
    ruleOverrides: nextOverrides,
  });
}

export function acknowledgeQuickScanRulesUpdateInState(
  state: QuickScanRulesState
): QuickScanRulesState {
  if (state.rulesVersion === QUICK_SCAN_RULES_VERSION) return state;
  return {
    ...state,
    rulesVersion: QUICK_SCAN_RULES_VERSION,
  };
}

export function resetAllQuickScanRulesInState(): QuickScanRulesState {
  return {
    rulesVersion: QUICK_SCAN_RULES_VERSION,
    ruleOverrides: {},
    customRules: [],
  };
}

export function useQuickScanRulesStore(): {
  rulesState: QuickScanRulesState;
  customizationCount: number;
  hasUpstreamUpdate: boolean;
  setRuleEnabled: (ruleId: string, enabled: boolean) => void;
  setAllRulesEnabled: (enabled: boolean) => void;
  setRuleTextOverride: (
    ruleId: string,
    patch: {
      instructionsOverride?: string | null;
      trueDescriptionOverride?: string | null;
      falseDescriptionOverride?: string | null;
    }
  ) => void;
  resetRule: (ruleId: string) => void;
  saveCustomRule: (rule: CustomQuickScanRule, editingId?: string) => void;
  deleteCustomRule: (ruleId: string) => void;
  replaceRulesState: (nextState: QuickScanRulesState) => void;
  resetAllRules: () => void;
  acknowledgeRulesUpdate: () => void;
} {
  const [rulesState, setRulesState] = useState<QuickScanRulesState>(() =>
    loadStoredQuickScanRulesState()
  );

  const commit = useCallback((updater: (prev: QuickScanRulesState) => QuickScanRulesState) => {
    setRulesState((prev) => saveStoredQuickScanRulesState(updater(prev)));
  }, []);

  const setRuleEnabled = useCallback(
    (ruleId: string, enabled: boolean) => {
      commit((prev) => setQuickScanRuleEnabledInState(prev, ruleId, enabled));
    },
    [commit]
  );

  const setAllRulesEnabled = useCallback(
    (enabled: boolean) => {
      commit((prev) => setAllQuickScanRulesEnabledInState(prev, enabled));
    },
    [commit]
  );

  const setRuleTextOverride = useCallback(
    (
      ruleId: string,
      patch: {
        instructionsOverride?: string | null;
        trueDescriptionOverride?: string | null;
        falseDescriptionOverride?: string | null;
      }
    ) => {
      commit((prev) => setQuickScanRuleTextOverrideInState(prev, ruleId, patch));
    },
    [commit]
  );

  const resetRule = useCallback(
    (ruleId: string) => {
      commit((prev) => resetQuickScanRuleInState(prev, ruleId));
    },
    [commit]
  );

  const saveCustomRule = useCallback(
    (rule: CustomQuickScanRule, editingId?: string) => {
      commit((prev) => upsertCustomQuickScanRuleInState(prev, rule, editingId));
    },
    [commit]
  );

  const deleteCustomRule = useCallback(
    (ruleId: string) => {
      commit((prev) => deleteCustomQuickScanRuleInState(prev, ruleId));
    },
    [commit]
  );

  const replaceRulesState = useCallback(
    (nextState: QuickScanRulesState) => {
      commit(() => nextState);
    },
    [commit]
  );

  const resetAllRules = useCallback(() => {
    commit(() => resetAllQuickScanRulesInState());
  }, [commit]);

  const acknowledgeRulesUpdate = useCallback(() => {
    commit((prev) => acknowledgeQuickScanRulesUpdateInState(prev));
  }, [commit]);

  return {
    rulesState,
    customizationCount: countQuickScanCustomizations(rulesState),
    hasUpstreamUpdate: hasUpstreamQuickScanRulesUpdate(rulesState),
    setRuleEnabled,
    setAllRulesEnabled,
    setRuleTextOverride,
    resetRule,
    saveCustomRule,
    deleteCustomRule,
    replaceRulesState,
    resetAllRules,
    acknowledgeRulesUpdate,
  };
}
