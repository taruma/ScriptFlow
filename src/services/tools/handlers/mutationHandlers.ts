import {
  AuteurPatchSchema,
  compileAuteurDraft,
  parseAuteurScript,
  toAuteurEnvelope,
  updateExecutionBeat,
  updateStagingBlock,
  validateAuteurReview,
  type AuteurDocument,
  type AuteurPatch,
  type AuteurPatchOp,
  type PatchError,
  type SubStateDraft,
  type SubStateIR,
} from '../../../core/index.ts';
import {buildLineDiff} from '../lineDiff.ts';
import {
  buildPatchSuggestion,
  buildPatchSuggestionFromCandidateText,
  countBySeverity,
  type AuditReviewIssueItem,
  type AuditReviewSuggestion,
  type DraftSuggestion,
  type ScriptToolContext,
  type ScriptToolExecutionResult,
  type TitleSuggestion,
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

const MAX_REPLACE_RULES = 20;
const MAX_FIND_PATTERN_LENGTH = 500;
const MAX_SCENE_TITLE_LENGTH = 120;
const ALLOWED_REGEX_FLAGS_PATTERN = /^[gim]*$/;

function escapeLiteralRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripSubStateId(sub: SubStateIR): SubStateDraft {
  const {id: _ignored, ...rest} = sub;
  return rest as SubStateDraft;
}

function resolveReplaceTargets(
  doc: AuteurDocument,
  targetIds: readonly string[] | undefined
):
  | {ok: true; stagingIndices: number[]; beatIndices: number[]}
  | {ok: false; notFoundIds: string[]} {
  if (!targetIds || targetIds.length === 0) {
    return {
      ok: true,
      stagingIndices: doc.stagingBlocks.map((_, idx) => idx),
      beatIndices: (doc.execution?.beats ?? []).map((_, idx) => idx),
    };
  }

  const stagingSet = new Set<number>();
  const beatSet = new Set<number>();
  const notFoundIds: string[] = [];
  const execHeaderUpper = doc.execution?.headerName.trim().toUpperCase() ?? 'EXECUTION';

  for (const rawId of targetIds) {
    const cleaned = rawId.replace(/^\[|\]$/g, '').trim();
    const upper = cleaned.toUpperCase();

    const mbMatch = /^MB(\d+)(?:\.\d+)?$/.exec(upper);
    if (mbMatch) {
      const idx = Number.parseInt(mbMatch[1], 10);
      if (idx >= 0 && idx < doc.stagingBlocks.length) {
        stagingSet.add(idx);
      } else {
        notFoundIds.push(rawId);
      }
      continue;
    }

    const stateMatch = /^S(\d+)(?:\.\d+)?$/.exec(upper);
    if (stateMatch) {
      const beatNum = Number.parseInt(stateMatch[1], 10);
      const arrIdx = (doc.execution?.beats ?? []).findIndex((b) => b.index === beatNum);
      if (arrIdx !== -1) {
        beatSet.add(arrIdx);
      } else {
        notFoundIds.push(rawId);
      }
      continue;
    }

    if (upper === 'EXECUTION' || upper === execHeaderUpper) {
      if (doc.execution) {
        doc.execution.beats.forEach((_, idx) => beatSet.add(idx));
      } else {
        notFoundIds.push(rawId);
      }
      continue;
    }

    let matchedHeader = false;
    doc.stagingBlocks.forEach((block, idx) => {
      if (
        block.name.trim().toUpperCase() === upper ||
        block.kind.trim().toUpperCase() === upper
      ) {
        stagingSet.add(idx);
        matchedHeader = true;
      }
    });

    if (!matchedHeader) {
      notFoundIds.push(rawId);
    }
  }

  if (notFoundIds.length > 0) {
    return {ok: false, notFoundIds};
  }

  return {
    ok: true,
    stagingIndices: Array.from(stagingSet).sort((a, b) => a - b),
    beatIndices: Array.from(beatSet).sort((a, b) => a - b),
  };
}

export function runProposeTextReplace(
  args: Record<string, unknown>,
  context: ScriptToolContext,
  nextId: () => string
): ScriptToolExecutionResult {
  const baseEnvelope = toAuteurEnvelope(context.rawText, context.ruleOverrides);
  const expectedSnapshotHash =
    typeof args.expectedSnapshotHash === 'string' ? args.expectedSnapshotHash.trim() : '';

  if (expectedSnapshotHash && expectedSnapshotHash !== baseEnvelope.snapshotHash) {
    return {
      ok: false,
      toolName: 'propose_text_replace',
      result: {
        ok: false,
        errors: [
          {
            code: 'SNAPSHOT_MISMATCH',
            message: `Snapshot hash mismatch: expected "${expectedSnapshotHash}", actual "${baseEnvelope.snapshotHash}".`,
          },
        ],
        repairHint: `Update expectedSnapshotHash to "${baseEnvelope.snapshotHash}" (or call get_script_source to inspect the latest text) and retry propose_text_replace.`,
      },
    };
  }

  const rawRules = Array.isArray(args.replacements) ? args.replacements : null;
  if (!rawRules || rawRules.length === 0 || rawRules.length > MAX_REPLACE_RULES) {
    return {
      ok: false,
      toolName: 'propose_text_replace',
      result: {
        ok: false,
        error: `replacements must be an array with 1 to ${MAX_REPLACE_RULES} rules.`,
        repairHint:
          'Provide a non-empty replacements array of { find, replace, isRegex?, caseSensitive?, wholeWord?, targetIds? } items.',
      },
    };
  }

  const doc = parseAuteurScript(context.rawText);
  const stagingBodies = doc.stagingBlocks.map((b) => b.rawBody);
  const beatLines = (doc.execution?.beats ?? []).map((b) => b.raw);
  const modifiedStagingIndices = new Set<number>();
  const modifiedBeatIndices = new Set<number>();
  let totalMatchCount = 0;

  for (let i = 0; i < rawRules.length; i++) {
    const entry = rawRules[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        ok: false,
        toolName: 'propose_text_replace',
        result: {
          ok: false,
          error: `replacements[${i}] must be an object with "find" and "replace" strings.`,
          repairHint: 'Fix the malformed replacement object and retry propose_text_replace.',
        },
      };
    }

    const rule = entry as Record<string, unknown>;
    const find = typeof rule.find === 'string' ? rule.find : '';
    const replace = typeof rule.replace === 'string' ? rule.replace : null;
    const isRegex = rule.isRegex === true;
    const caseSensitive = rule.caseSensitive !== false;
    const wholeWord = rule.wholeWord === true;
    const rawFlags = typeof rule.flags === 'string' ? rule.flags.trim() : '';

    if (find.length === 0 || replace === null) {
      return {
        ok: false,
        toolName: 'propose_text_replace',
        result: {
          ok: false,
          error: `replacements[${i}] requires a non-empty "find" string and a "replace" string.`,
          repairHint: 'Provide both find (non-empty) and replace (string) for every replacement rule.',
        },
      };
    }

    if (find.length > MAX_FIND_PATTERN_LENGTH) {
      return {
        ok: false,
        toolName: 'propose_text_replace',
        result: {
          ok: false,
          error: `replacements[${i}].find exceeds maximum length (${MAX_FIND_PATTERN_LENGTH} chars).`,
          repairHint: 'Use a shorter, focused pattern or use propose_script_patch for full block rewrites.',
        },
      };
    }

    if (rawFlags.length > 0 && !ALLOWED_REGEX_FLAGS_PATTERN.test(rawFlags)) {
      return {
        ok: false,
        toolName: 'propose_text_replace',
        result: {
          ok: false,
          error: `replacements[${i}].flags "${rawFlags}" contains unsupported regex flags. Only g, i, m are allowed.`,
          repairHint: 'Remove unsupported regex flags and keep only g, i, or m.',
        },
      };
    }

    const targetIds = Array.isArray(rule.targetIds)
      ? rule.targetIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : undefined;

    const resolvedTargets = resolveReplaceTargets(doc, targetIds);
    if (!resolvedTargets.ok) {
      return {
        ok: false,
        toolName: 'propose_text_replace',
        result: {
          ok: false,
          error: `replacements[${i}] references unknown targetIds: ${resolvedTargets.notFoundIds.join(', ')}.`,
          notFoundIds: resolvedTargets.notFoundIds,
          repairHint:
            'Inspect valid MB# / S# IDs via get_script_overview or get_script_source and retry with valid targetIds.',
        },
      };
    }

    const patternBody = isRegex ? find : escapeLiteralRegex(find);
    const wrappedPattern = wholeWord ? `\\b(?:${patternBody})\\b` : patternBody;
    const flagSet = new Set<string>(['g']);
    if (!caseSensitive || rawFlags.includes('i')) flagSet.add('i');
    if (rawFlags.includes('m')) flagSet.add('m');
    const finalFlags = Array.from(flagSet).join('');

    let compiledRegex: RegExp;
    try {
      compiledRegex = new RegExp(wrappedPattern, finalFlags);
    } catch (err) {
      return {
        ok: false,
        toolName: 'propose_text_replace',
        result: {
          ok: false,
          error: `Invalid regex in replacements[${i}]: ${err instanceof Error ? err.message : String(err)}`,
          repairHint:
            'Fix the regular expression syntax (escape special characters or set isRegex: false for literal matching) and retry.',
        },
      };
    }

    const applyToText = (text: string): {nextText: string; matches: number} => {
      if (text.length === 0) return {nextText: text, matches: 0};
      const countRegex = new RegExp(compiledRegex.source, compiledRegex.flags);
      let matches = 0;
      for (const _m of text.matchAll(countRegex)) {
        matches++;
      }
      if (matches === 0) return {nextText: text, matches: 0};

      const replaceRegex = new RegExp(compiledRegex.source, compiledRegex.flags);
      const nextText = isRegex
        ? text.replace(replaceRegex, replace)
        : text.replace(replaceRegex, () => replace);
      return {nextText, matches};
    };

    for (const blockIdx of resolvedTargets.stagingIndices) {
      const {nextText, matches} = applyToText(stagingBodies[blockIdx]);
      if (matches > 0) {
        totalMatchCount += matches;
        if (nextText !== stagingBodies[blockIdx]) {
          stagingBodies[blockIdx] = nextText;
          modifiedStagingIndices.add(blockIdx);
        }
      }
    }

    for (const beatArrIdx of resolvedTargets.beatIndices) {
      const {nextText, matches} = applyToText(beatLines[beatArrIdx]);
      if (matches > 0) {
        totalMatchCount += matches;
        if (nextText !== beatLines[beatArrIdx]) {
          beatLines[beatArrIdx] = nextText;
          modifiedBeatIndices.add(beatArrIdx);
        }
      }
    }
  }

  if (totalMatchCount === 0 || (modifiedStagingIndices.size === 0 && modifiedBeatIndices.size === 0)) {
    return {
      ok: false,
      toolName: 'propose_text_replace',
      result: {
        ok: false,
        error:
          totalMatchCount === 0
            ? 'No matches found for the provided replacement rule(s).'
            : 'Replacement matched text but produced no net changes.',
        repairHint:
          'Read the exact current wording via get_script_source (or adjust find, caseSensitive, wholeWord, or targetIds) and retry.',
      },
    };
  }

  let candidateRawText = context.rawText;
  for (const blockIdx of Array.from(modifiedStagingIndices).sort((a, b) => a - b)) {
    candidateRawText = updateStagingBlock(candidateRawText, blockIdx, stagingBodies[blockIdx]);
  }
  // Apply Execution Macro-State updates in descending beat index order so deletions never shift earlier indices
  for (const beatArrIdx of Array.from(modifiedBeatIndices).sort((a, b) => b - a)) {
    const beatNum = doc.execution?.beats[beatArrIdx]?.index ?? beatArrIdx + 1;
    candidateRawText = updateExecutionBeat(candidateRawText, beatNum, beatLines[beatArrIdx]);
  }

  const affectedIds: string[] = [
    ...Array.from(modifiedStagingIndices)
      .sort((a, b) => a - b)
      .map((idx) => `MB${idx}`),
    ...Array.from(modifiedBeatIndices)
      .sort((a, b) => a - b)
      .map((arrIdx) => `S${doc.execution?.beats[arrIdx]?.index ?? arrIdx + 1}`),
  ];

  // Synthesize an equivalent AuteurPatch so Live Mode hover-to-diff margin indicators work seamlessly
  const candidateDoc = parseAuteurScript(candidateRawText);
  const candidateEnvelope = toAuteurEnvelope(candidateRawText, context.ruleOverrides);
  const syntheticOps: AuteurPatchOp[] = [];
  for (const blockIdx of Array.from(modifiedStagingIndices).sort((a, b) => a - b)) {
    syntheticOps.push({
      op: 'set_macro_block',
      macroBlockId: `MB${blockIdx}`,
      body: stagingBodies[blockIdx],
    });
  }
  const survivingBeatMap = new Map<number, SubStateIR[]>();
  let survivingCursor = 0;
  for (let arrIdx = 0; arrIdx < beatLines.length; arrIdx++) {
    const isEmptyAfter = beatLines[arrIdx].trim().length === 0;
    if (!isEmptyAfter) {
      const candidateMs = candidateEnvelope.document.executionMacroBlock?.macroStates[survivingCursor];
      if (candidateMs) {
        survivingBeatMap.set(arrIdx, candidateMs.subStates);
      }
      survivingCursor++;
    }
  }
  for (const beatArrIdx of Array.from(modifiedBeatIndices).sort((a, b) => a - b)) {
    const beatNum = doc.execution?.beats[beatArrIdx]?.index ?? beatArrIdx + 1;
    const macroStateId = `S${beatNum}`;
    if (beatLines[beatArrIdx].trim().length === 0) {
      syntheticOps.push({op: 'delete_macro_state', macroStateId});
    } else {
      const subStates = survivingBeatMap.get(beatArrIdx);
      if (subStates && subStates.length > 0) {
        syntheticOps.push({
          op: 'replace_macro_state',
          macroStateId,
          subStates: subStates.map(stripSubStateId),
        });
      }
    }
  }

  const summary =
    typeof args.summary === 'string' && args.summary.trim().length > 0
      ? args.summary.trim()
      : `Replace text across ${affectedIds.join(', ')} (${totalMatchCount} ${totalMatchCount === 1 ? 'match' : 'matches'})`;

  const candidatePatch: AuteurPatch = {
    expectedSnapshotHash: baseEnvelope.snapshotHash,
    summary,
    ops: syntheticOps,
  };
  const validSyntheticPatch =
    syntheticOps.length > 0 &&
    candidateDoc.stagingBlocks.length === doc.stagingBlocks.length &&
    AuteurPatchSchema.safeParse(candidatePatch).success
      ? candidatePatch
      : undefined;

  const built = buildPatchSuggestionFromCandidateText(
    context.rawText,
    candidateRawText,
    summary,
    affectedIds,
    rawRules.length,
    context.ruleOverrides,
    nextId,
    validSyntheticPatch
  );

  if (!built.ok) {
    return {
      ok: false,
      toolName: 'propose_text_replace',
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
    toolName: 'propose_text_replace',
    stagedSuggestion: suggestion,
    result: {
      ok: true,
      staged: true,
      suggestionId: suggestion.id,
      summary: suggestion.summary,
      matchCount: totalMatchCount,
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

export function runProposeScriptTitle(
  args: Record<string, unknown>,
  context: ScriptToolContext,
  nextId: () => string
): ScriptToolExecutionResult {
  const rawTitle = typeof args.title === 'string' ? args.title : '';
  const cleanedTitle = rawTitle
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanedTitle.length === 0) {
    return {
      ok: false,
      toolName: 'propose_script_title',
      result: {
        ok: false,
        error: 'Scene title must be a non-empty string.',
        repairHint: 'Provide a concise non-empty title string (120 characters or fewer) and retry.',
      },
    };
  }

  if (cleanedTitle.length > MAX_SCENE_TITLE_LENGTH) {
    return {
      ok: false,
      toolName: 'propose_script_title',
      result: {
        ok: false,
        error: `Scene title exceeds ${MAX_SCENE_TITLE_LENGTH} characters (${cleanedTitle.length} chars).`,
        repairHint: `Shorten the proposed title to ${MAX_SCENE_TITLE_LENGTH} characters or fewer and retry.`,
      },
    };
  }

  const previousTitle = context.sceneTitle?.trim();
  if (previousTitle && previousTitle.toLowerCase() === cleanedTitle.toLowerCase()) {
    return {
      ok: false,
      toolName: 'propose_script_title',
      result: {
        ok: false,
        error: `Proposed title "${cleanedTitle}" is identical to the current scene title.`,
        repairHint: 'Propose a distinct scene title that improves on the current title.',
      },
    };
  }

  const rationale =
    typeof args.rationale === 'string' && args.rationale.trim().length > 0
      ? args.rationale.trim()
      : undefined;

  const baseEnvelope = toAuteurEnvelope(context.rawText, context.ruleOverrides);
  const suggestion: TitleSuggestion = {
    id: nextId(),
    kind: 'title',
    title: cleanedTitle,
    ...(previousTitle ? {previousTitle} : {}),
    ...(rationale ? {rationale} : {}),
    baseSnapshotHash: baseEnvelope.snapshotHash,
  };

  context.onStageSuggestion?.(suggestion);

  return {
    ok: true,
    toolName: 'propose_script_title',
    stagedSuggestion: suggestion,
    result: {
      ok: true,
      staged: true,
      suggestionId: suggestion.id,
      title: suggestion.title,
      ...(suggestion.previousTitle ? {previousTitle: suggestion.previousTitle} : {}),
      ...(suggestion.rationale ? {rationale: suggestion.rationale} : {}),
      baseSnapshotHash: suggestion.baseSnapshotHash,
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
