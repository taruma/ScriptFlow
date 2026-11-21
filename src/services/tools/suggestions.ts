import {
  applyAuteurPatch,
  toAuteurEnvelope,
  type AuditLens,
  type AuteurPatch,
  type AuteurPatchOp,
  type AuteurReviewIssue,
  type DerivedDiagnosticIR,
  type LintRuleOverrides,
  type LintSeverity,
  type PatchError,
  type SceneTopology,
} from '../../core/index.ts';
import type {
  AssistantMode,
  ComposedAgentContext,
  ScriptToolName,
} from '../auteurKnowledge.ts';
import {buildLineDiff, type ScriptLineDiff} from './lineDiff.ts';

// ---------------------------------------------------------------------------
// Staged Reviewable Suggestions (Zero Direct rawText Mutation)
// ---------------------------------------------------------------------------

export interface LintDelta {
  beforeErrors: number;
  beforeWarnings: number;
  afterErrors: number;
  afterWarnings: number;
  introducedErrors: DerivedDiagnosticIR[];
  introducedWarnings: DerivedDiagnosticIR[];
  resolvedDiagnostics: DerivedDiagnosticIR[];
}

export interface PatchSuggestion {
  id: string;
  kind: 'patch';
  summary: string;
  baseSnapshotHash: string;
  nextSnapshotHash: string;
  affectedIds: string[];
  opsCount: number;
  patch: AuteurPatch;
  beforeRawText: string;
  candidateRawText: string;
  diff: ScriptLineDiff;
  lintDelta: LintDelta;
}

export interface DraftSuggestion {
  id: string;
  kind: 'draft';
  title?: string;
  summary: string;
  baseSnapshotHash: string;
  nextSnapshotHash: string;
  sceneTopology: SceneTopology;
  stagingBlockCount: number;
  beatCount: number;
  candidateRawText: string;
  diff: ScriptLineDiff;
  diagnostics: DerivedDiagnosticIR[];
  errorCount: number;
  warningCount: number;
}

export interface AuditReviewIssueItem {
  id: string;
  lens: AuditLens;
  severity: LintSeverity;
  targetLevel: AuteurReviewIssue['targetLevel'];
  targetId: string;
  message: string;
  rationale: string;
  repairHint: string;
  patchSuggestion?: PatchSuggestion;
  patchValidationErrors?: PatchError[];
}

export interface AuditReviewSuggestion {
  id: string;
  kind: 'audit_review';
  baseSnapshotHash: string;
  overallSummary: string;
  issues: AuditReviewIssueItem[];
  errorCount: number;
  warningCount: number;
}

export interface ClarifyingQuestionItem {
  id: string;
  question: string;
  options: string[];
}

export interface QuestionSuggestion {
  id: string;
  kind: 'question';
  intro?: string;
  questions: ClarifyingQuestionItem[];
}

export type StagedSuggestion =
  | PatchSuggestion
  | DraftSuggestion
  | AuditReviewSuggestion
  | QuestionSuggestion;

/**
 * Merges a newly staged suggestion into the active turn's staged list, replacing
 * superseded earlier drafts, audit reviews, question cards, or same-target patches produced
 * during multi-round self-repair in the same turn.
 */
export function upsertStagedSuggestion(
  existing: readonly StagedSuggestion[],
  incoming: StagedSuggestion
): StagedSuggestion[] {
  if (
    incoming.kind === 'draft' ||
    incoming.kind === 'audit_review' ||
    incoming.kind === 'question'
  ) {
    const idx = existing.findIndex((item) => item.kind === incoming.kind);
    if (idx !== -1) {
      return existing.map((item, i) => (i === idx ? incoming : item));
    }
    return [...existing, incoming];
  }

  const incomingKey = [...incoming.affectedIds].sort().join('|');
  if (incomingKey.length > 0) {
    const idx = existing.findIndex(
      (item) =>
        item.kind === 'patch' && [...item.affectedIds].sort().join('|') === incomingKey
    );
    if (idx !== -1) {
      return existing.map((item, i) => (i === idx ? incoming : item));
    }
  }
  return [...existing, incoming];
}

// ---------------------------------------------------------------------------
// Tool Execution Context & Result
// ---------------------------------------------------------------------------

export interface ScriptToolContext {
  mode: AssistantMode;
  rawText: string;
  ruleOverrides?: LintRuleOverrides;
  composedContext?: ComposedAgentContext;
  allowedTools?: readonly ScriptToolName[];
  createSuggestionId?: () => string;
  onStageSuggestion?: (suggestion: StagedSuggestion) => void;
  onSkillLoaded?: (event: {id: string; name: string; source: 'tool'}) => void;
}

export interface ToolCallInput {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ScriptToolExecutionResult {
  ok: boolean;
  toolName: string;
  result: Record<string, unknown>;
  stagedSuggestion?: StagedSuggestion;
}

// ---------------------------------------------------------------------------
// Internal Helpers for Tool Execution
// ---------------------------------------------------------------------------

export function createDefaultIdGenerator(): () => string {
  let counter = 0;
  return () => `sug-${Date.now().toString(36)}-${++counter}`;
}

export function countBySeverity(diagnostics: DerivedDiagnosticIR[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const diag of diagnostics) {
    if (diag.severity === 'error') errors++;
    else warnings++;
  }
  return {errors, warnings};
}

export function collectAffectedIds(ops: AuteurPatchOp[]): string[] {
  const ids = new Set<string>();
  for (const op of ops) {
    switch (op.op) {
      case 'set_macro_block':
      case 'delete_macro_block':
        if (op.macroBlockId) ids.add(op.macroBlockId);
        else if (op.header) ids.add(`[${op.header.trim().toUpperCase()}]`);
        break;
      case 'insert_macro_block':
        ids.add(`[${op.macroBlock.header.trim().toUpperCase()}]`);
        if (op.afterMacroBlockId) ids.add(op.afterMacroBlockId);
        break;
      case 'set_aesthetic_entry':
      case 'delete_aesthetic_entry':
        if (op.entryId) ids.add(op.entryId);
        else if (op.key) ids.add(`AESTHETIC:${op.key.trim()}`);
        break;
      case 'upsert_token_mapping':
      case 'delete_token_mapping':
        ids.add(`TOKEN:${op.token.trim()}`);
        break;
      case 'replace_macro_state':
      case 'delete_macro_state':
      case 'reorder_macro_states':
        ids.add(op.macroStateId);
        break;
      case 'insert_macro_state':
        ids.add(op.afterMacroStateId ? `after:${op.afterMacroStateId}` : 'EXECUTION:start');
        break;
      case 'replace_sub_state':
      case 'delete_sub_state':
        ids.add(op.subStateId);
        break;
      case 'insert_sub_state':
        ids.add(op.macroStateId);
        break;
    }
  }
  return Array.from(ids);
}

export function buildPatchRepairHint(
  errors: PatchError[],
  introducedErrors: DerivedDiagnosticIR[],
  currentSnapshotHash: string
): string {
  const hints: string[] = [];

  if (errors.some((e) => e.code === 'SNAPSHOT_MISMATCH')) {
    hints.push(
      `Call get_script_overview or update expectedSnapshotHash to "${currentSnapshotHash}".`
    );
  }
  if (errors.some((e) => e.code === 'TARGET_NOT_FOUND')) {
    hints.push(
      'Inspect current IDs (MB#, MB#.#, S#, S#.#) via get_script_overview or inspect_lens_slice and target valid existing IDs.'
    );
  }
  if (errors.some((e) => e.code === 'VALIDATION_ERROR')) {
    hints.push(
      'Fix the invalid patch schema fields listed in errors and retry propose_script_patch.'
    );
  }
  for (const diag of introducedErrors) {
    hints.push(`[${diag.ruleId} at ${diag.targetId}] ${diag.repairHint}`);
  }

  return hints.length > 0
    ? hints.join(' ')
    : 'Review the returned errors and submit a corrected AuteurPatch.';
}

export function buildPatchSuggestion(
  rawText: string,
  patch: AuteurPatch,
  ruleOverrides: LintRuleOverrides | undefined,
  nextId: () => string
):
  | {ok: true; suggestion: PatchSuggestion}
  | {
      ok: false;
      errors: PatchError[];
      introducedErrors: DerivedDiagnosticIR[];
      repairHint: string;
    } {
  const beforeEnvelope = toAuteurEnvelope(rawText, ruleOverrides);
  const applied = applyAuteurPatch(rawText, patch, {
    rejectOnNewErrors: true,
    ruleOverrides,
  });

  if (!applied.ok || !applied.nextEnvelope) {
    return {
      ok: false,
      errors: applied.errors,
      introducedErrors: applied.introducedErrors,
      repairHint: buildPatchRepairHint(
        applied.errors,
        applied.introducedErrors,
        beforeEnvelope.snapshotHash
      ),
    };
  }

  const beforeCounts = countBySeverity(applied.diagnosticsBefore);
  const afterCounts = countBySeverity(applied.diagnosticsAfter);
  const diff = buildLineDiff(rawText, applied.nextRawText);
  const affectedIds = collectAffectedIds(patch.ops);
  const summary =
    patch.summary?.trim() ||
    `Update ${affectedIds.length > 0 ? affectedIds.join(', ') : `${patch.ops.length} operation(s)`}`;

  const suggestion: PatchSuggestion = {
    id: nextId(),
    kind: 'patch',
    summary,
    baseSnapshotHash: beforeEnvelope.snapshotHash,
    nextSnapshotHash: applied.nextEnvelope.snapshotHash,
    affectedIds,
    opsCount: applied.appliedOpsCount,
    patch,
    beforeRawText: rawText,
    candidateRawText: applied.nextRawText,
    diff,
    lintDelta: {
      beforeErrors: beforeCounts.errors,
      beforeWarnings: beforeCounts.warnings,
      afterErrors: afterCounts.errors,
      afterWarnings: afterCounts.warnings,
      introducedErrors: applied.introducedErrors,
      introducedWarnings: applied.introducedWarnings,
      resolvedDiagnostics: applied.resolvedDiagnostics,
    },
  };

  return {ok: true, suggestion};
}
