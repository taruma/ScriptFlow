import type {MacroStateIR, SceneTopology, SubStateIR} from '../../core/index.ts';
import {
  BUNDLED_QUICK_SCAN_RULES,
  type QuickScanRulePredicate,
} from '../../data/knowledge/index.ts';
import {
  QUICK_SCAN_THRESHOLDS,
  type CustomQuickScanRule,
  type QuickScanRuleOverride,
  type QuickScanSensitivity,
  type QuickScanStatus,
  type ResolvedQuickScanRule,
} from './types.ts';

export interface DocumentPredicateContext {
  topology: SceneTopology;
  hasOpening: boolean;
  hasIntent: boolean;
  hasAesthetic: boolean;
  hasDialogue: boolean;
  hasBriefText: boolean;
  hasBriefMedia: boolean;
}

/**
 * Resolves built-in rules + user overrides + custom rules into a flat ordered list.
 */
export function resolveQuickScanRules(
  ruleOverrides?: Record<string, QuickScanRuleOverride>,
  customRules?: readonly CustomQuickScanRule[]
): ResolvedQuickScanRule[] {
  const seen = new Set<string>();
  const resolved: ResolvedQuickScanRule[] = [];

  for (const builtIn of BUNDLED_QUICK_SCAN_RULES) {
    const id = builtIn.id;
    seen.add(id);
    const ov = ruleOverrides?.[id];
    const enabled = ov?.enabled !== undefined ? ov.enabled : (builtIn.defaultEnabled ?? true);
    const instructionsOverride = ov?.instructionsOverride?.trim();
    const trueOverride = ov?.trueDescriptionOverride?.trim();
    const falseOverride = ov?.falseDescriptionOverride?.trim();

    const instructions =
      instructionsOverride && instructionsOverride.length > 0
        ? instructionsOverride
        : builtIn.instructions;
    const trueDescription =
      trueOverride && trueOverride.length > 0 ? trueOverride : builtIn.trueDescription;
    const falseDescription =
      falseOverride && falseOverride.length > 0 ? falseOverride : builtIn.falseDescription;

    const isTextOverridden =
      instructions.trim() !== builtIn.instructions.trim() ||
      trueDescription.trim() !== builtIn.trueDescription.trim() ||
      falseDescription.trim() !== builtIn.falseDescription.trim();

    resolved.push({
      id,
      lens: builtIn.lens,
      scope: builtIn.scope,
      label: builtIn.label,
      when: [...builtIn.when],
      instructions,
      trueDescription,
      falseDescription,
      ...(builtIn.escalationHint ? {escalationHint: builtIn.escalationHint} : {}),
      builtIn: true,
      enabled,
      isTextOverridden,
    });
  }

  for (const custom of customRules ?? []) {
    const id = custom.id.trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const ov = ruleOverrides?.[id];
    const enabled = ov?.enabled !== undefined ? ov.enabled : true;

    resolved.push({
      id,
      lens: custom.lens,
      scope: custom.scope,
      label: custom.label.trim() || id,
      when: custom.when.length > 0 ? [...custom.when] : ['all'],
      instructions: custom.instructions.trim(),
      trueDescription: custom.trueDescription.trim(),
      falseDescription: custom.falseDescription.trim(),
      ...(custom.escalationHint?.trim() ? {escalationHint: custom.escalationHint.trim()} : {}),
      builtIn: false,
      enabled,
      isTextOverridden: false,
    });
  }

  return resolved;
}

export function interpolateTokens(template: string, stateId: string, subStateId?: string): string {
  let out = template.replace(/\{\{STATE_ID\}\}/g, stateId);
  if (subStateId) {
    out = out.replace(/\{\{SUB_STATE_ID\}\}/g, subStateId);
  }
  return out;
}

export function evaluatePredicate(
  predicate: QuickScanRulePredicate,
  docCtx: DocumentPredicateContext,
  macroState?: MacroStateIR,
  subState?: SubStateIR
): boolean {
  switch (predicate) {
    case 'all':
      return true;
    case 'continuous':
      return docCtx.topology !== 'discontinuous_montage' && docCtx.topology !== 'empty';
    case 'oner':
      return docCtx.topology === 'continuous_oner';
    case 'montage':
      return docCtx.topology === 'discontinuous_montage';
    case 'has_opening':
      return docCtx.hasOpening;
    case 'has_intent':
      return docCtx.hasIntent;
    case 'has_aesthetic':
      return docCtx.hasAesthetic;
    case 'has_dialogue':
      return docCtx.hasDialogue;
    case 'has_brief_text':
      return docCtx.hasBriefText;
    case 'has_brief_media':
      return docCtx.hasBriefMedia;
    case 'has_foley':
      if (!macroState) return false;
      return macroState.subStates.some((sub) => sub.dimension === 'foley');
    case 'has_action':
      if (!macroState) return false;
      return macroState.subStates.some((sub) => sub.dimension === 'action');
    case 'has_action_or_prop':
      if (!macroState) return false;
      return macroState.subStates.some(
        (sub) =>
          sub.dimension === 'action' ||
          ('subStateTag' in sub && sub.subStateTag.trim().toUpperCase() === 'PROP')
      );
    case 'sub_is_action':
      return Boolean(subState && subState.dimension === 'action');
    case 'sub_is_camera':
      return Boolean(subState && subState.dimension === 'camera');
    case 'sub_is_foley':
      return Boolean(subState && subState.dimension === 'foley');
    case 'sub_is_dialogue':
      return Boolean(subState && subState.dimension === 'dialogue');
    case 'sub_is_action_or_prop':
      return Boolean(
        subState &&
          (subState.dimension === 'action' ||
            ('subStateTag' in subState && subState.subStateTag.trim().toUpperCase() === 'PROP'))
      );
  }
}

export function matchesAllPredicates(
  predicates: readonly QuickScanRulePredicate[],
  docCtx: DocumentPredicateContext,
  macroState?: MacroStateIR,
  subState?: SubStateIR
): boolean {
  for (const pred of predicates) {
    if (!evaluatePredicate(pred, docCtx, macroState, subState)) {
      return false;
    }
  }
  return true;
}

export function parseBeatIndex(targetId: string): number | undefined {
  const match = /^S(\d+)(?:\.\d+)?$/i.exec(targetId.trim());
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function classifyQuickScanProbability(
  probability: number,
  sensitivity: QuickScanSensitivity
): QuickScanStatus {
  const thresholds = QUICK_SCAN_THRESHOLDS[sensitivity];
  if (probability >= thresholds.flagged) return 'flagged';
  if (probability >= thresholds.borderline) return 'borderline';
  return 'clean';
}

export function statusSeverityRank(status: QuickScanStatus): number {
  switch (status) {
    case 'flagged':
      return 2;
    case 'borderline':
      return 1;
    case 'clean':
      return 0;
  }
}
