import {
  getLintRuleDefinition,
  LINT_RULE_REGISTRY,
  type LintRuleId,
  type LintRuleOverrides,
  type LintRuleSeveritySetting,
} from '../core/index.ts';

export const DEFAULT_LINT_RULE_OVERRIDES: LintRuleOverrides = {};

export const LINT_RULE_SEVERITY_OPTIONS: readonly LintRuleSeveritySetting[] = [
  'off',
  'warning',
  'error',
] as const;

const LINT_RULES_STORAGE_KEY = 'auteur-editor-lint-rules-v1';

const VALID_RULE_IDS = new Set<string>(LINT_RULE_REGISTRY.map((rule) => rule.id));
const VALID_SEVERITY_SETTINGS = new Set<string>(LINT_RULE_SEVERITY_OPTIONS);

/**
 * Validates and normalizes an untrusted persisted overrides payload, keeping only
 * known rule IDs with valid `'off' | 'warning' | 'error'` settings.
 */
export function sanitizeLintRuleOverrides(input: unknown): LintRuleOverrides {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return DEFAULT_LINT_RULE_OVERRIDES;
  }

  const sanitized: LintRuleOverrides = {};
  let hasEntries = false;

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (
      VALID_RULE_IDS.has(key) &&
      typeof value === 'string' &&
      VALID_SEVERITY_SETTINGS.has(value)
    ) {
      sanitized[key as LintRuleId] = value as LintRuleSeveritySetting;
      hasEntries = true;
    }
  }

  return hasEntries ? sanitized : DEFAULT_LINT_RULE_OVERRIDES;
}

/**
 * Resolves the active UI severity setting for a given rule ID, falling back to
 * the rule's declared `defaultSeverity` when no override is present.
 */
export function getEffectiveLintRuleSeverity(
  ruleId: LintRuleId,
  overrides: LintRuleOverrides
): LintRuleSeveritySetting {
  const override = overrides[ruleId];
  if (override !== undefined) {
    return override;
  }
  return getLintRuleDefinition(ruleId)?.defaultSeverity ?? 'warning';
}

/**
 * Pure immutable update for a single rule's severity override.
 * Selecting the rule's built-in `defaultSeverity` removes the override so the rule
 * returns to its canonical default behavior (including phase-contextual defaults).
 */
export function setLintRuleOverride(
  overrides: LintRuleOverrides,
  ruleId: LintRuleId,
  nextSeverity: LintRuleSeveritySetting
): LintRuleOverrides {
  const rule = getLintRuleDefinition(ruleId);
  if (!rule) return overrides;

  const isReturningToDefault = nextSeverity === rule.defaultSeverity;
  if (isReturningToDefault) {
    if (overrides[ruleId] === undefined) return overrides;
    const next: LintRuleOverrides = {...overrides};
    delete next[ruleId];
    return Object.keys(next).length === 0 ? DEFAULT_LINT_RULE_OVERRIDES : next;
  }

  if (overrides[ruleId] === nextSeverity) return overrides;
  return {
    ...overrides,
    [ruleId]: nextSeverity,
  };
}

/**
 * Counts how many registered rules currently differ from their built-in default severity.
 */
export function countCustomLintRules(overrides: LintRuleOverrides): number {
  let count = 0;
  for (const rule of LINT_RULE_REGISTRY) {
    const override = overrides[rule.id];
    if (override !== undefined && override !== rule.defaultSeverity) {
      count++;
    }
  }
  return count;
}

/**
 * Structural equality helper for LintRuleOverrides maps.
 */
export function areLintRuleOverridesEqual(
  a: LintRuleOverrides,
  b: LintRuleOverrides
): boolean {
  if (a === b) return true;
  for (const rule of LINT_RULE_REGISTRY) {
    if (a[rule.id] !== b[rule.id]) {
      return false;
    }
  }
  return true;
}

export function loadStoredLintRuleOverrides(): LintRuleOverrides {
  try {
    const raw = window.localStorage.getItem(LINT_RULES_STORAGE_KEY);
    if (!raw) return DEFAULT_LINT_RULE_OVERRIDES;
    return sanitizeLintRuleOverrides(JSON.parse(raw));
  } catch {
    // Ignore storage or JSON parse errors in restricted environments
    return DEFAULT_LINT_RULE_OVERRIDES;
  }
}

export function saveStoredLintRuleOverrides(overrides: LintRuleOverrides): void {
  try {
    const normalized = sanitizeLintRuleOverrides(overrides);
    if (Object.keys(normalized).length === 0) {
      window.localStorage.removeItem(LINT_RULES_STORAGE_KEY);
    } else {
      window.localStorage.setItem(LINT_RULES_STORAGE_KEY, JSON.stringify(normalized));
    }
  } catch {
    // Ignore storage access errors
  }
}
