import {
  compileAuteurDraft,
  toAuteurEnvelope,
  validateAuteurReview,
  type AuteurPatch,
  type PatchError,
} from '../../../core/index.ts';
import {buildLineDiff} from '../lineDiff.ts';
import {
  buildPatchSuggestion,
  countBySeverity,
  type AuditReviewIssueItem,
  type AuditReviewSuggestion,
  type DraftSuggestion,
  type ScriptToolContext,
  type ScriptToolExecutionResult,
} from '../suggestions.ts';

export function runProposeScriptPatch(
  args: Record<string, unknown>,
  context: ScriptToolContext,
  nextId: () => string
): ScriptToolExecutionResult {
  const patchPayload =
    args.patch && typeof args.patch === 'object' && !Array.isArray(args.patch)
      ? (args.patch as Record<string, unknown>)
      : args;

  const built = buildPatchSuggestion(
    context.rawText,
    patchPayload as AuteurPatch,
    context.ruleOverrides,
    nextId
  );

  if (!built.ok) {
    return {
      ok: false,
      toolName: 'propose_script_patch',
      result: {
        ok: false,
        errors: built.errors,
        introducedErrors: built.introducedErrors.map((d) => ({
          ruleId: d.ruleId,
          lens: d.lens,
          targetId: d.targetId,
          message: d.message,
          repairHint: d.repairHint,
        })),
        repairHint: built.repairHint,
      },
    };
  }

  const {suggestion} = built;
  context.onStageSuggestion?.(suggestion);

  return {
    ok: true,
    toolName: 'propose_script_patch',
    stagedSuggestion: suggestion,
    result: {
      ok: true,
      staged: true,
      suggestionId: suggestion.id,
      summary: suggestion.summary,
      baseSnapshotHash: suggestion.baseSnapshotHash,
      nextSnapshotHash: suggestion.nextSnapshotHash,
      affectedIds: suggestion.affectedIds,
      opsCount: suggestion.opsCount,
      diffStats: {
        addedLines: suggestion.diff.addedCount,
        removedLines: suggestion.diff.removedCount,
        hasChanges: suggestion.diff.hasChanges,
      },
      lintDelta: {
        beforeErrors: suggestion.lintDelta.beforeErrors,
        afterErrors: suggestion.lintDelta.afterErrors,
        beforeWarnings: suggestion.lintDelta.beforeWarnings,
        afterWarnings: suggestion.lintDelta.afterWarnings,
        resolvedCount: suggestion.lintDelta.resolvedDiagnostics.length,
        introducedWarningsCount: suggestion.lintDelta.introducedWarnings.length,
      },
    },
  };
}

export function runProposeScriptDraft(
  args: Record<string, unknown>,
  context: ScriptToolContext,
  nextId: () => string
): ScriptToolExecutionResult {
  const hasWrappedDraft =
    args.draft !== undefined && typeof args.draft === 'object' && args.draft !== null;
  const draftPayload = hasWrappedDraft ? args.draft : args;
  const title =
    typeof args.title === 'string' && args.title.trim().length > 0
      ? args.title.trim()
      : undefined;
  const summaryInput =
    typeof args.summary === 'string' && args.summary.trim().length > 0
      ? args.summary.trim()
      : undefined;

  const compiled = compileAuteurDraft(draftPayload, context.ruleOverrides);
  if (!compiled.ok) {
    return {
      ok: false,
      toolName: 'propose_script_draft',
      result: {
        ok: false,
        errors: compiled.errors,
        repairHint:
          'Fix the AuteurScriptDraft schema errors (ensure uppercase Staging headers, format: "prose" | "key_value", and valid v0.4.0 Sub-States) and call propose_script_draft again.',
      },
    };
  }

  const diagCounts = countBySeverity(compiled.diagnostics);
  if (diagCounts.errors > 0) {
    const errorHints = compiled.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => `[${d.ruleId} at ${d.targetId}] ${d.repairHint}`);

    return {
      ok: false,
      toolName: 'propose_script_draft',
      result: {
        ok: false,
        staged: false,
        diagnosticsSummary: {
          total: compiled.diagnostics.length,
          errors: diagCounts.errors,
          warnings: diagCounts.warnings,
        },
        diagnostics: compiled.diagnostics.map((d) => ({
          ruleId: d.ruleId,
          lens: d.lens,
          severity: d.severity,
          targetId: d.targetId,
          message: d.message,
          repairHint: d.repairHint,
        })),
        repairHint:
          errorHints.length > 0
            ? `${errorHints.join(' ')} Repair these Script Supervisor errors and call propose_script_draft again.`
            : 'Fix the deterministic Script Supervisor lint errors in the draft and call propose_script_draft again.',
      },
    };
  }

  const baseEnvelope = toAuteurEnvelope(context.rawText, context.ruleOverrides);
  const diff = buildLineDiff(context.rawText, compiled.rawText);
  const beatCount = compiled.ir.executionMacroBlock?.macroStates.length ?? 0;

  const suggestion: DraftSuggestion = {
    id: nextId(),
    kind: 'draft',
    ...(title ? {title} : {}),
    summary:
      summaryInput ??
      `Drafted ${compiled.ir.stagingMacroBlocks.length} Staging Macro-Block(s) and ${beatCount} Execution Macro-State(s)`,
    baseSnapshotHash: baseEnvelope.snapshotHash,
    nextSnapshotHash: compiled.envelope.snapshotHash,
    sceneTopology: compiled.envelope.derived.sceneTopology,
    stagingBlockCount: compiled.ir.stagingMacroBlocks.length,
    beatCount,
    candidateRawText: compiled.rawText,
    diff,
    diagnostics: compiled.diagnostics,
    errorCount: diagCounts.errors,
    warningCount: diagCounts.warnings,
  };

  context.onStageSuggestion?.(suggestion);

  return {
    ok: true,
    toolName: 'propose_script_draft',
    stagedSuggestion: suggestion,
    result: {
      ok: true,
      staged: true,
      suggestionId: suggestion.id,
      ...(suggestion.title ? {title: suggestion.title} : {}),
      summary: suggestion.summary,
      nextSnapshotHash: suggestion.nextSnapshotHash,
      sceneTopology: suggestion.sceneTopology,
      stagingBlockCount: suggestion.stagingBlockCount,
      macroStateCount: suggestion.beatCount,
      diagnosticsSummary: {
        total: suggestion.diagnostics.length,
        errors: suggestion.errorCount,
        warnings: suggestion.warningCount,
      },
      diagnostics: suggestion.diagnostics.map((d) => ({
        ruleId: d.ruleId,
        lens: d.lens,
        severity: d.severity,
        targetId: d.targetId,
        message: d.message,
        repairHint: d.repairHint,
      })),
    },
  };
}

export function runReportAuditReview(
  args: Record<string, unknown>,
  context: ScriptToolContext,
  nextId: () => string
): ScriptToolExecutionResult {
  const reviewPayload =
    args.review !== undefined && typeof args.review === 'object' && args.review !== null
      ? args.review
      : args;

  const validated = validateAuteurReview(reviewPayload);
  if (!validated.ok) {
    return {
      ok: false,
      toolName: 'report_audit_review',
      result: {
        ok: false,
        errors: validated.errors,
        repairHint:
          'Ensure each audit issue includes a valid AuditLens name, severity ("error" | "warning"), targetLevel, targetId, message, rationale, and repairHint.',
      },
    };
  }

  const baseEnvelope = toAuteurEnvelope(context.rawText, context.ruleOverrides);
  const invalidSuggestedPatches: Array<{
    issueId: string;
    targetId: string;
    errors: PatchError[];
    repairHint: string;
  }> = [];

  const issueItems: AuditReviewIssueItem[] = validated.review.issues.map((issue, idx) => {
    const itemId = issue.id?.trim() || `${nextId()}-issue-${idx + 1}`;
    const baseItem: AuditReviewIssueItem = {
      id: itemId,
      lens: issue.lens,
      severity: issue.severity,
      targetLevel: issue.targetLevel,
      targetId: issue.targetId,
      message: issue.message,
      rationale: issue.rationale,
      repairHint: issue.repairHint,
    };

    if (issue.suggestedPatch) {
      const built = buildPatchSuggestion(
        context.rawText,
        issue.suggestedPatch,
        context.ruleOverrides,
        nextId
      );
      if (built.ok) {
        baseItem.patchSuggestion = built.suggestion;
      } else {
        baseItem.patchValidationErrors = built.errors;
        invalidSuggestedPatches.push({
          issueId: itemId,
          targetId: issue.targetId,
          errors: built.errors,
          repairHint: built.repairHint,
        });
      }
    }

    return baseItem;
  });

  let errorCount = 0;
  let warningCount = 0;
  for (const item of issueItems) {
    if (item.severity === 'error') errorCount++;
    else warningCount++;
  }

  const suggestion: AuditReviewSuggestion = {
    id: nextId(),
    kind: 'audit_review',
    baseSnapshotHash: baseEnvelope.snapshotHash,
    overallSummary:
      validated.review.overallSummary?.trim() ||
      (issueItems.length === 0
        ? 'No Script Supervisor issues found.'
        : `Found ${issueItems.length} issue(s) (${errorCount} error(s), ${warningCount} warning(s)).`),
    issues: issueItems,
    errorCount,
    warningCount,
  };

  context.onStageSuggestion?.(suggestion);

  return {
    ok: true,
    toolName: 'report_audit_review',
    stagedSuggestion: suggestion,
    result: {
      ok: true,
      staged: true,
      suggestionId: suggestion.id,
      baseSnapshotHash: suggestion.baseSnapshotHash,
      overallSummary: suggestion.overallSummary,
      issueCount: issueItems.length,
      errorCount,
      warningCount,
      validSuggestedPatchesCount: issueItems.filter((i) => i.patchSuggestion !== undefined).length,
      invalidSuggestedPatches,
      ...(invalidSuggestedPatches.length > 0
        ? {
            repairHint:
              'One or more embedded suggestedPatch payloads failed validation or introduced lint errors and were withheld from staging. Review invalidSuggestedPatches and re-submit repaired patches if needed.',
          }
        : {}),
    },
  };
}
