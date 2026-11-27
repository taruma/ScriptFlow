import {
  compileAuteurDraft,
  fromAuteurIR,
  normalizeLineEndings,
  toAuteurEnvelope,
  validateAuteurReview,
  type AuteurPatch,
  type DerivedDiagnosticIR,
  type LintRuleOverrides,
  type PatchError,
} from '../../../core/index.ts';
import {
  compileAiPatchToAuteurPatch,
  detectLeakedSourceAnnotation,
  stripOuterMarkdownFence,
} from '../aiPatchCompiler.ts';
import {buildLineDiff} from '../lineDiff.ts';
import {
  buildPatchSuggestion,
  countBySeverity,
  type AuditReviewIssueItem,
  type AuditReviewSuggestion,
  type DraftSuggestion,
  type ScriptToolContext,
  type ScriptToolExecutionResult,
  type TitleSuggestion,
} from '../suggestions.ts';

const MAX_SCENE_TITLE_LENGTH = 120;

function shouldEnforceLinterGate(context: ScriptToolContext): boolean {
  return context.enforceToolLinterGate ?? context.composedContext?.enforceToolLinterGate ?? true;
}

function cleanSceneTitle(rawTitle: string): string {
  return rawTitle
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function runProposeScriptPatch(
  args: Record<string, unknown>,
  context: ScriptToolContext,
  nextId: () => string
): ScriptToolExecutionResult {
  const patchPayload =
    args.patch && typeof args.patch === 'object' && !Array.isArray(args.patch)
      ? (args.patch as Record<string, unknown>)
      : args;

  const baseEnvelope = toAuteurEnvelope(context.rawText, context.ruleOverrides);
  const expectedSnapshotHash =
    typeof patchPayload.expectedSnapshotHash === 'string'
      ? patchPayload.expectedSnapshotHash.trim()
      : '';

  if (expectedSnapshotHash && expectedSnapshotHash !== baseEnvelope.snapshotHash) {
    return {
      ok: false,
      toolName: 'propose_script_patch',
      result: {
        ok: false,
        errors: [
          {
            code: 'SNAPSHOT_MISMATCH',
            message: `Snapshot hash mismatch: expected "${expectedSnapshotHash}", actual "${baseEnvelope.snapshotHash}".`,
          },
        ],
        repairHint: `Update expectedSnapshotHash to "${baseEnvelope.snapshotHash}" (or call get_script_source to inspect the latest text) and retry propose_script_patch.`,
      },
    };
  }

  const hasTitleArg = typeof args.title === 'string';
  const cleanedTitle = hasTitleArg ? cleanSceneTitle(args.title as string) : undefined;
  if (hasTitleArg) {
    if (!cleanedTitle) {
      return {
        ok: false,
        toolName: 'propose_script_patch',
        result: {
          ok: false,
          errors: [{code: 'VALIDATION_ERROR', path: 'title', message: 'Scene title must be non-empty.'}],
          repairHint: 'Provide a concise non-empty title string (120 characters or fewer) or omit title.',
        },
      };
    }
    if (cleanedTitle.length > MAX_SCENE_TITLE_LENGTH) {
      return {
        ok: false,
        toolName: 'propose_script_patch',
        result: {
          ok: false,
          errors: [
            {
              code: 'VALIDATION_ERROR',
              path: 'title',
              message: `Scene title exceeds ${MAX_SCENE_TITLE_LENGTH} characters (${cleanedTitle.length} chars).`,
            },
          ],
          repairHint: `Shorten the proposed title to ${MAX_SCENE_TITLE_LENGTH} characters or fewer and retry.`,
        },
      };
    }
  }

  const rawOps = Array.isArray(patchPayload.ops) ? patchPayload.ops : [];

  // Title-only path: omit/empty ops + valid title -> stage TitleSuggestion card
  if (rawOps.length === 0) {
    if (!cleanedTitle) {
      return {
        ok: false,
        toolName: 'propose_script_patch',
        result: {
          ok: false,
          errors: [
            {
              code: 'VALIDATION_ERROR',
              path: 'ops',
              message: 'propose_script_patch requires non-empty ops and/or a title.',
            },
          ],
          repairHint: 'Provide one or more patch ops (set_block, replace_state, insert_states, replace_text, etc.) or pass title to rename the scene.',
        },
      };
    }

    const previousTitle = context.sceneTitle?.trim();
    if (previousTitle && previousTitle.toLowerCase() === cleanedTitle.toLowerCase()) {
      return {
        ok: false,
        toolName: 'propose_script_patch',
        result: {
          ok: false,
          errors: [
            {
              code: 'VALIDATION_ERROR',
              path: 'title',
              message: `Proposed title "${cleanedTitle}" is identical to the current scene title.`,
            },
          ],
          repairHint: 'Propose a distinct scene title that improves on the current title.',
        },
      };
    }

    const rationaleRaw =
      typeof args.rationale === 'string' && args.rationale.trim().length > 0
        ? args.rationale.trim()
        : typeof args.summary === 'string' && args.summary.trim().length > 0
          ? args.summary.trim()
          : undefined;

    const titleSuggestion: TitleSuggestion = {
      id: nextId(),
      kind: 'title',
      title: cleanedTitle,
      ...(previousTitle ? {previousTitle} : {}),
      ...(rationaleRaw ? {rationale: rationaleRaw} : {}),
      baseSnapshotHash: baseEnvelope.snapshotHash,
    };

    context.onStageSuggestion?.(titleSuggestion);

    return {
      ok: true,
      toolName: 'propose_script_patch',
      stagedSuggestion: titleSuggestion,
      result: {
        ok: true,
        staged: true,
        suggestionId: titleSuggestion.id,
        title: titleSuggestion.title,
        ...(titleSuggestion.previousTitle ? {previousTitle: titleSuggestion.previousTitle} : {}),
        ...(titleSuggestion.rationale ? {rationale: titleSuggestion.rationale} : {}),
        baseSnapshotHash: titleSuggestion.baseSnapshotHash,
      },
    };
  }

  const compiled = compileAiPatchToAuteurPatch(
    context.rawText,
    patchPayload,
    context.ruleOverrides
  );
  if (!compiled.ok) {
    return {
      ok: false,
      toolName: 'propose_script_patch',
      result: {
        ok: false,
        errors: compiled.errors,
        introducedErrors: [],
        repairHint: compiled.repairHint,
      },
    };
  }

  const built = buildPatchSuggestion(
    context.rawText,
    compiled.patch,
    context.ruleOverrides,
    nextId,
    {
      rejectOnNewErrors: shouldEnforceLinterGate(context),
      ...(cleanedTitle ? {title: cleanedTitle} : {}),
    }
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
      ...(suggestion.title ? {title: suggestion.title} : {}),
      summary: suggestion.summary,
      ...(compiled.matchCount ? {matchCount: compiled.matchCount} : {}),
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

function buildCompiledDraftResult(params: {
  rawText: string;
  candidateRawText: string;
  candidateEnvelope: ReturnType<typeof toAuteurEnvelope>;
  diagnostics: DerivedDiagnosticIR[];
  title?: string;
  summaryInput?: string;
  context: ScriptToolContext;
  nextId: () => string;
}): ScriptToolExecutionResult {
  const {
    rawText,
    candidateRawText,
    candidateEnvelope,
    diagnostics,
    title,
    summaryInput,
    context,
    nextId,
  } = params;

  const diagCounts = countBySeverity(diagnostics);
  if (shouldEnforceLinterGate(context) && diagCounts.errors > 0) {
    const errorHints = diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => `[${d.ruleId} at ${d.targetId}] ${d.repairHint}`);

    return {
      ok: false,
      toolName: 'propose_script_draft',
      result: {
        ok: false,
        staged: false,
        diagnosticsSummary: {
          total: diagnostics.length,
          errors: diagCounts.errors,
          warnings: diagCounts.warnings,
        },
        diagnostics: diagnostics.map((d) => ({
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

  const baseEnvelope = toAuteurEnvelope(rawText, context.ruleOverrides);
  const diff = buildLineDiff(rawText, candidateRawText);
  const beatCount = candidateEnvelope.document.executionMacroBlock?.macroStates.length ?? 0;
  const stagingBlockCount = candidateEnvelope.document.stagingMacroBlocks.length;

  const suggestion: DraftSuggestion = {
    id: nextId(),
    kind: 'draft',
    ...(title ? {title} : {}),
    summary:
      summaryInput ??
      `Drafted ${stagingBlockCount} Staging Macro-Block(s) and ${beatCount} Execution Macro-State(s)`,
    baseSnapshotHash: baseEnvelope.snapshotHash,
    nextSnapshotHash: candidateEnvelope.snapshotHash,
    sceneTopology: candidateEnvelope.derived.sceneTopology,
    stagingBlockCount,
    beatCount,
    candidateRawText,
    diff,
    diagnostics,
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

export function runProposeScriptDraft(
  args: Record<string, unknown>,
  context: ScriptToolContext,
  nextId: () => string
): ScriptToolExecutionResult {
  const rawTitle = typeof args.title === 'string' ? cleanSceneTitle(args.title) : '';
  const title = rawTitle.length > 0 ? rawTitle.slice(0, MAX_SCENE_TITLE_LENGTH) : undefined;
  const summaryInput =
    typeof args.summary === 'string' && args.summary.trim().length > 0
      ? args.summary.trim()
      : undefined;

  if (typeof args.scriptText === 'string') {
    const cleanedScript = stripOuterMarkdownFence(normalizeLineEndings(args.scriptText)).trim();
    if (cleanedScript.length === 0) {
      return {
        ok: false,
        toolName: 'propose_script_draft',
        result: {
          ok: false,
          errors: [{path: 'scriptText', message: 'scriptText cannot be empty.'}],
          repairHint:
            'Provide complete canonical v0.4.0 plain text ([INTENT], [LOGIC], [AESTHETIC], [OPENING], [EXECUTION]) in scriptText.',
        },
      };
    }

    const leaked = detectLeakedSourceAnnotation(cleanedScript);
    if (leaked) {
      return {
        ok: false,
        toolName: 'propose_script_draft',
        result: {
          ok: false,
          errors: [{path: 'scriptText', message: leaked}],
          repairHint: leaked,
        },
      };
    }

    const parsedEnv = toAuteurEnvelope(cleanedScript, context.ruleOverrides);
    const stagingCount = parsedEnv.document.stagingMacroBlocks.length;
    const beatCount = parsedEnv.document.executionMacroBlock?.macroStates.length ?? 0;

    if (stagingCount === 0 && beatCount === 0) {
      return {
        ok: false,
        toolName: 'propose_script_draft',
        result: {
          ok: false,
          errors: [
            {
              path: 'scriptText',
              message:
                'scriptText must contain valid Auteur Script v0.4.0 Macro-Blocks ([INTENT], [LOGIC], [AESTHETIC], [OPENING], [EXECUTION]).',
            },
          ],
          repairHint:
            'Include uppercase [HEADER] sections ([INTENT], [LOGIC], [AESTHETIC], [OPENING], and [EXECUTION] with `->` Sub-States) and call propose_script_draft again.',
        },
      };
    }

    const canonicalText = fromAuteurIR(parsedEnv.document);
    const canonicalEnvelope = toAuteurEnvelope(canonicalText, context.ruleOverrides);

    return buildCompiledDraftResult({
      rawText: context.rawText,
      candidateRawText: canonicalText,
      candidateEnvelope: canonicalEnvelope,
      diagnostics: canonicalEnvelope.derived.diagnostics,
      title,
      summaryInput,
      context,
      nextId,
    });
  }

  // Backward-compatible fallback for legacy JSON AuteurScriptDraft payloads
  const hasWrappedDraft =
    args.draft !== undefined && typeof args.draft === 'object' && args.draft !== null;
  const draftPayload = hasWrappedDraft ? args.draft : args;

  const compiled = compileAuteurDraft(draftPayload, context.ruleOverrides);
  if (!compiled.ok) {
    return {
      ok: false,
      toolName: 'propose_script_draft',
      result: {
        ok: false,
        errors: compiled.errors,
        repairHint:
          'Provide complete canonical v0.4.0 plain text in `scriptText` (without Markdown fences or # MB# / S#: prefixes) and call propose_script_draft again.',
      },
    };
  }

  return buildCompiledDraftResult({
    rawText: context.rawText,
    candidateRawText: compiled.rawText,
    candidateEnvelope: compiled.envelope,
    diagnostics: compiled.diagnostics,
    title,
    summaryInput,
    context,
    nextId,
  });
}

function preprocessAuditReviewPatches(
  rawReview: unknown,
  rawText: string,
  ruleOverrides: LintRuleOverrides | undefined
): {
  normalizedReview: unknown;
  preCompileErrorsByIssueIndex: Map<number, {errors: PatchError[]; repairHint: string}>;
} {
  const preCompileErrorsByIssueIndex = new Map<
    number,
    {errors: PatchError[]; repairHint: string}
  >();

  if (!rawReview || typeof rawReview !== 'object' || Array.isArray(rawReview)) {
    return {normalizedReview: rawReview, preCompileErrorsByIssueIndex};
  }

  const record = rawReview as Record<string, unknown>;
  if (!Array.isArray(record.issues)) {
    return {normalizedReview: rawReview, preCompileErrorsByIssueIndex};
  }

  const nextIssues = record.issues.map((rawIssue, idx) => {
    if (!rawIssue || typeof rawIssue !== 'object' || Array.isArray(rawIssue)) {
      return rawIssue;
    }
    const issue = rawIssue as Record<string, unknown>;
    if (!issue.suggestedPatch) {
      return rawIssue;
    }

    const compiled = compileAiPatchToAuteurPatch(rawText, issue.suggestedPatch, ruleOverrides);
    if (compiled.ok) {
      return {
        ...issue,
        suggestedPatch: compiled.patch,
      };
    }

    preCompileErrorsByIssueIndex.set(idx, {
      errors: compiled.errors,
      repairHint: compiled.repairHint,
    });
    const {suggestedPatch: _omitted, ...withoutPatch} = issue;
    return withoutPatch;
  });

  return {
    normalizedReview: {
      ...record,
      issues: nextIssues,
    },
    preCompileErrorsByIssueIndex,
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

  const {normalizedReview, preCompileErrorsByIssueIndex} = preprocessAuditReviewPatches(
    reviewPayload,
    context.rawText,
    context.ruleOverrides
  );

  const validated = validateAuteurReview(normalizedReview);
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

    const preCompileFailure = preCompileErrorsByIssueIndex.get(idx);
    if (preCompileFailure) {
      baseItem.patchValidationErrors = preCompileFailure.errors;
      invalidSuggestedPatches.push({
        issueId: itemId,
        targetId: issue.targetId,
        errors: preCompileFailure.errors,
        repairHint: preCompileFailure.repairHint,
      });
      return baseItem;
    }

    if (issue.suggestedPatch) {
      const built = buildPatchSuggestion(
        context.rawText,
        issue.suggestedPatch as AuteurPatch,
        context.ruleOverrides,
        nextId,
        {rejectOnNewErrors: shouldEnforceLinterGate(context)}
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
