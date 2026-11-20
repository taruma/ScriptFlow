import {
  applyAuteurPatch,
  AUDIT_LENS_PRESETS,
  AuteurLensPresetIdSchema,
  compileAuteurDraft,
  getAuteurJsonSchemas,
  LensSliceSpecSchema,
  normalizeLineEndings,
  sliceAuteurScript,
  toAuteurEnvelope,
  validateAuteurReview,
  type AuditLens,
  type AuteurLensPresetId,
  type AuteurPatch,
  type AuteurPatchOp,
  type AuteurReviewIssue,
  type DerivedDiagnosticIR,
  type LensSliceSpec,
  type LintRuleOverrides,
  type LintSeverity,
  type PatchError,
  type SceneTopology,
} from '../core/index.ts';

export type AssistantMode = 'refine' | 'check' | 'draft';

export type ScriptToolName =
  | 'get_script_overview'
  | 'inspect_lens_slice'
  | 'propose_script_patch'
  | 'propose_script_draft'
  | 'report_audit_review';

export const MODE_TOOL_NAMES: Record<AssistantMode, readonly ScriptToolName[]> = {
  refine: ['get_script_overview', 'inspect_lens_slice', 'propose_script_patch'],
  check: ['get_script_overview', 'inspect_lens_slice', 'report_audit_review'],
  draft: ['get_script_overview', 'propose_script_draft'],
};

export interface GeminiFunctionToolDeclaration {
  type: 'function';
  name: ScriptToolName;
  description: string;
  parameters: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Deterministic Line Diff (Before / After Preview)
// ---------------------------------------------------------------------------

export interface DiffLine {
  type: 'context' | 'added' | 'removed';
  text: string;
  beforeLineNumber?: number;
  afterLineNumber?: number;
}

export interface ScriptLineDiff {
  lines: DiffLine[];
  addedCount: number;
  removedCount: number;
  hasChanges: boolean;
}

const MAX_LCS_CELLS = 250_000;

function splitNormalizedLines(text: string): string[] {
  const normalized = normalizeLineEndings(text);
  return normalized.length === 0 ? [] : normalized.split('\n');
}

/**
 * Computes a deterministic line-level diff between two canonical script strings.
 * Uses Myers-free DP LCS for normal scripts and falls back to prefix/suffix diffing
 * for very large documents so browser execution stays instant.
 */
export function buildLineDiff(beforeRaw: string, afterRaw: string): ScriptLineDiff {
  const beforeLines = splitNormalizedLines(beforeRaw);
  const afterLines = splitNormalizedLines(afterRaw);

  let prefixLen = 0;
  const minLen = Math.min(beforeLines.length, afterLines.length);
  while (prefixLen < minLen && beforeLines[prefixLen] === afterLines[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    beforeLines[beforeLines.length - 1 - suffixLen] ===
      afterLines[afterLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const midBefore = beforeLines.slice(prefixLen, beforeLines.length - suffixLen);
  const midAfter = afterLines.slice(prefixLen, afterLines.length - suffixLen);

  const lines: DiffLine[] = [];
  let addedCount = 0;
  let removedCount = 0;

  for (let i = 0; i < prefixLen; i++) {
    lines.push({
      type: 'context',
      text: beforeLines[i],
      beforeLineNumber: i + 1,
      afterLineNumber: i + 1,
    });
  }

  const m = midBefore.length;
  const n = midAfter.length;

  if (m === 0 && n === 0) {
    // No middle differences
  } else if (m * n <= MAX_LCS_CELLS) {
    const dp: Uint32Array[] = Array.from({length: m + 1}, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (midBefore[i] === midAfter[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m || j < n) {
      if (i < m && j < n && midBefore[i] === midAfter[j]) {
        lines.push({
          type: 'context',
          text: midBefore[i],
          beforeLineNumber: prefixLen + i + 1,
          afterLineNumber: prefixLen + j + 1,
        });
        i++;
        j++;
      } else if (i < m && (j === n || dp[i + 1][j] >= dp[i][j + 1])) {
        lines.push({
          type: 'removed',
          text: midBefore[i],
          beforeLineNumber: prefixLen + i + 1,
        });
        removedCount++;
        i++;
      } else {
        lines.push({
          type: 'added',
          text: midAfter[j],
          afterLineNumber: prefixLen + j + 1,
        });
        addedCount++;
        j++;
      }
    }
  } else {
    for (let i = 0; i < m; i++) {
      lines.push({
        type: 'removed',
        text: midBefore[i],
        beforeLineNumber: prefixLen + i + 1,
      });
      removedCount++;
    }
    for (let j = 0; j < n; j++) {
      lines.push({
        type: 'added',
        text: midAfter[j],
        afterLineNumber: prefixLen + j + 1,
      });
      addedCount++;
    }
  }

  for (let k = 0; k < suffixLen; k++) {
    const bIdx = beforeLines.length - suffixLen + k;
    const aIdx = afterLines.length - suffixLen + k;
    lines.push({
      type: 'context',
      text: beforeLines[bIdx],
      beforeLineNumber: bIdx + 1,
      afterLineNumber: aIdx + 1,
    });
  }

  return {
    lines,
    addedCount,
    removedCount,
    hasChanges: addedCount > 0 || removedCount > 0,
  };
}

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

export type StagedSuggestion = PatchSuggestion | DraftSuggestion | AuditReviewSuggestion;

// ---------------------------------------------------------------------------
// Tool Execution Context & Result
// ---------------------------------------------------------------------------

export interface ScriptToolContext {
  mode: AssistantMode;
  rawText: string;
  ruleOverrides?: LintRuleOverrides;
  createSuggestionId?: () => string;
  onStageSuggestion?: (suggestion: StagedSuggestion) => void;
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
// JSON Schema Sanitizer & Mode-Scoped Tool Declarations
// ---------------------------------------------------------------------------

const UNSUPPORTED_TOOL_SCHEMA_KEYS = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'minProperties',
  'maxProperties',
  'uniqueItems',
  'propertyNames',
  'contains',
  'minContains',
  'maxContains',
]);

function sanitizeJsonSchemaForTool(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonSchemaForTool);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (UNSUPPORTED_TOOL_SCHEMA_KEYS.has(key)) continue;
    result[key] = sanitizeJsonSchemaForTool(entry);
  }
  return result;
}

function buildToolDeclarationsMap(): Record<ScriptToolName, GeminiFunctionToolDeclaration> {
  const schemas = getAuteurJsonSchemas();
  const patchSchema = sanitizeJsonSchemaForTool(schemas.patch) as Record<string, unknown>;
  const draftSchema = sanitizeJsonSchemaForTool(schemas.draft) as Record<string, unknown>;
  const reviewSchema = sanitizeJsonSchemaForTool(schemas.review) as Record<string, unknown>;
  const lensPresetIds = Object.keys(AUDIT_LENS_PRESETS) as AuteurLensPresetId[];

  return {
    get_script_overview: {
      type: 'function',
      name: 'get_script_overview',
      description:
        'Returns a compact read-only overview of the current Auteur Script: snapshotHash, sceneTopology, staging Macro-Blocks (MB#), beat count, camera slots, reference/token counts, and active Script Supervisor diagnostics.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    inspect_lens_slice: {
      type: 'function',
      name: 'inspect_lens_slice',
      description:
        'Extracts a focused read-only JSON slice of the current script using one of the 5 built-in Script Supervisor audit presets or a custom composable LensSliceSpec with resolved camera framing.',
      parameters: {
        type: 'object',
        properties: {
          preset: {
            type: 'string',
            enum: lensPresetIds,
            description:
              'Built-in audit lens preset (lens1_spatial_optics, lens2_temporal_pacing_wear, lens3_props_inventory, lens4_acoustics_voice, lens5_blocks_grammar).',
          },
          spec: {
            type: 'object',
            description:
              'Optional custom LensSliceSpec (macroBlocks, aestheticKeys, dimensions, subStateTags, includeAllSubStates, includeResolvedCamera, includeTokenMappings, includeReferenceBindings, includeSceneTopology, includeTrailingResolution, diagnosticLenses, includeAllDiagnostics).',
            properties: {
              preset: {type: 'string', enum: lensPresetIds},
              macroBlocks: {type: 'array', items: {type: 'string'}},
              aestheticKeys: {type: 'array', items: {type: 'string'}},
              dimensions: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [
                    'camera',
                    'action',
                    'block',
                    'light',
                    'state_boundary',
                    'tier2',
                    'dialogue',
                    'foley',
                    'score',
                    'onscreen_text',
                    'plain',
                  ],
                },
              },
              subStateTags: {type: 'array', items: {type: 'string'}},
              includeAllSubStates: {type: 'boolean'},
              includeResolvedCamera: {type: 'boolean'},
              includeTokenMappings: {
                anyOf: [{type: 'boolean'}, {type: 'string', enum: ['all', 'referenced']}],
              },
              includeReferenceBindings: {type: 'boolean'},
              includeSceneTopology: {type: 'boolean'},
              includeTrailingResolution: {type: 'boolean'},
              includeAllDiagnostics: {type: 'boolean'},
            },
          },
        },
      },
    },
    propose_script_patch: {
      type: 'function',
      name: 'propose_script_patch',
      description:
        'Dry-runs a transactional, ID-addressed AuteurPatch against the current script with rejectOnNewErrors=true. If valid and lint-clean, stages a reviewable PatchSuggestion without mutating the editor; if invalid or lint-rejected, returns structured errors and repairHint for self-repair.',
      parameters: patchSchema,
    },
    propose_script_draft: {
      type: 'function',
      name: 'propose_script_draft',
      description:
        'Validates and compiles a full AuteurScriptDraft JSON into canonical v0.4.0 plain text and stages a reviewable DraftSuggestion without overwriting the editor.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Optional short scene title for the drafted script.',
          },
          summary: {
            type: 'string',
            description: 'One-sentence summary of the drafted scene and topology.',
          },
          draft: draftSchema,
        },
        required: ['draft'],
      },
    },
    report_audit_review: {
      type: 'function',
      name: 'report_audit_review',
      description:
        'Validates a structured Script Supervisor AuteurReview (including dry-running any embedded suggestedPatch payloads against active lint rules) and stages clickable AuditReviewSuggestion items.',
      parameters: reviewSchema,
    },
  };
}

let cachedToolDeclarations: Record<ScriptToolName, GeminiFunctionToolDeclaration> | null = null;

function getAllToolDeclarations(): Record<ScriptToolName, GeminiFunctionToolDeclaration> {
  if (!cachedToolDeclarations) {
    cachedToolDeclarations = buildToolDeclarationsMap();
  }
  return cachedToolDeclarations;
}

/**
 * Returns the Gemini Interactions API function tool declarations allowed for a mode.
 */
export function getToolDeclarationsForMode(mode: AssistantMode): GeminiFunctionToolDeclaration[] {
  const all = getAllToolDeclarations();
  return MODE_TOOL_NAMES[mode].map((name) => all[name]);
}

// ---------------------------------------------------------------------------
// Concise Mode-Scoped System Instructions (Pure Auteur Script v0.4.0)
// ---------------------------------------------------------------------------

const CORE_AUTEUR_RULES_BLOCK = [
  'You are an expert Pure Auteur Script (v0.4.0) directorial assistant. Keep scripts 100% platform- and model-agnostic (never mention generative video vendors or model names in script text).',
  'Core v0.4.0 syntax invariants:',
  '- Phase 1 STAGING ([INTENT], [LOGIC], [AESTHETIC], [OPENING], etc.) is static pre-roll setup; Phase 2 EXECUTION ([EXECUTION]) is one Macro-State beat (S1, S2, ...) per line chained with `->`.',
  '- [OPENING] is frozen t=0 plain prose with zero `[TAG]` tokens, zero motion verbs, and zero audio cues.',
  '- Keep `@ref` bindings (`@image1 as Name`) inside [INTENT]/[CHARACTERS]/[REFERENCES]/[CONTINUITY PROTOCOL]; never put `@ref` in [EXECUTION].',
  '- Use camera viewport coordinates (`frame-left`, `frame-right`, `screen-left`, `screen-right`, `facing screen-*`); never use `stage-left` or `stage-right`.',
  '- Dialogue uses curly braces `Speaker says (delivery) {line}` (never quotes), foley uses `<sound>`, opt-in score uses `(score)`, opt-in on-screen text uses `【text】`. Never end a beat on dialogue—chain a physical `[ACT]` follow-through or `<foley>` trigger.',
  '- In continuous oners/coverage, hold established numbered cameras via `[CAM 01] ->` or operator motion verbs (`PAN`, `TRACKING`, `CRANING`), not repeated static shot scales.',
].join('\n');

const MODE_INSTRUCTIONS: Record<AssistantMode, string> = {
  refine: [
    CORE_AUTEUR_RULES_BLOCK,
    '',
    'Mode: REFINE (Targeted Editing).',
    '- Call `get_script_overview` and `inspect_lens_slice` first to inspect current IDs (`MB#`, `MB#.#`, `S#`, `S#.#`) and `snapshotHash`.',
    '- Propose concrete edits exclusively via `propose_script_patch` with `expectedSnapshotHash` and concise `summary`.',
    '- If `propose_script_patch` returns validation or lint errors, read `errors` and `repairHint`, repair the patch, and retry before answering.',
    '- After staging a clean patch, summarize the change briefly in plain English.',
  ].join('\n'),
  check: [
    CORE_AUTEUR_RULES_BLOCK,
    '',
    'Mode: CHECK (Script Supervisor Audit).',
    '- Call `get_script_overview` and relevant `inspect_lens_slice` presets (`lens1_spatial_optics` through `lens5_blocks_grammar`) before judging.',
    '- Respect the script `sceneTopology` (continuous oner vs. multi-camera coverage vs. discontinuous montage).',
    '- Report structured findings via `report_audit_review` referencing exact `targetId` (`MB#`, `S#`, `S#.#`) and, when helpful, an executable `suggestedPatch` with `expectedSnapshotHash`.',
    '- If any embedded `suggestedPatch` is rejected by validation or lint rules, repair and re-report so every suggested fix is clean.',
  ].join('\n'),
  draft: [
    CORE_AUTEUR_RULES_BLOCK,
    '',
    'Mode: DRAFT (New Scene Generation).',
    '- Call `get_script_overview` if you need context about the current open script before drafting.',
    '- Build a complete, well-structured `AuteurScriptDraft` ([INTENT], [LOGIC], [AESTHETIC] as key_value, [OPENING], and [EXECUTION] beats) and stage it via `propose_script_draft`.',
    '- If `propose_script_draft` returns schema validation errors or lint errors, repair them and call `propose_script_draft` again so the staged draft is clean.',
    '- Keep your response concise once the draft is staged.',
  ].join('\n'),
};

export function getSystemInstructionForMode(mode: AssistantMode): string {
  return MODE_INSTRUCTIONS[mode];
}

// ---------------------------------------------------------------------------
// Internal Helpers for Tool Execution
// ---------------------------------------------------------------------------

function createDefaultIdGenerator(): () => string {
  let counter = 0;
  return () => `sug-${Date.now().toString(36)}-${++counter}`;
}

function countBySeverity(diagnostics: DerivedDiagnosticIR[]): {errors: number; warnings: number} {
  let errors = 0;
  let warnings = 0;
  for (const diag of diagnostics) {
    if (diag.severity === 'error') errors++;
    else warnings++;
  }
  return {errors, warnings};
}

function collectAffectedIds(ops: AuteurPatchOp[]): string[] {
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

function buildPatchRepairHint(
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

function buildPatchSuggestion(
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

// ---------------------------------------------------------------------------
// Individual Local Tool Handlers
// ---------------------------------------------------------------------------

function runGetScriptOverview(
  rawText: string,
  ruleOverrides?: LintRuleOverrides
): ScriptToolExecutionResult {
  const envelope = toAuteurEnvelope(rawText, ruleOverrides);
  const {document, derived} = envelope;
  const diagCounts = countBySeverity(derived.diagnostics);
  const beats = document.executionMacroBlock?.macroStates ?? [];
  const continuityById = new Map(
    derived.macroStateContinuity.map((item) => [item.macroStateId, item])
  );

  return {
    ok: true,
    toolName: 'get_script_overview',
    result: {
      ok: true,
      snapshotHash: envelope.snapshotHash,
      schemaVersion: document.schemaVersion,
      sceneTopology: derived.sceneTopology,
      hasContinuationContext: derived.hasContinuationContext,
      stagingMacroBlocks: document.stagingMacroBlocks.map((block) =>
        block.format === 'key_value'
          ? {
              id: block.id,
              header: block.header,
              kind: block.kind,
              format: block.format,
              entryCount: block.entries.length,
              keys: block.entries
                .map((e) => e.key)
                .filter((k): k is string => k !== null),
            }
          : {
              id: block.id,
              header: block.header,
              kind: block.kind,
              format: block.format,
              charCount: block.body.length,
            }
      ),
      executionHeader: document.executionMacroBlock?.header ?? null,
      beatCount: beats.length,
      beats: beats.map((ms) => {
        const cont = continuityById.get(ms.id);
        return {
          id: ms.id,
          subStateCount: ms.subStates.length,
          activeCameraIdentifier: cont?.activeCameraIdentifier ?? null,
          cameraTransition: cont?.cameraTransition ?? 'NONE',
        };
      }),
      cameraSlots: derived.cameraSlots,
      referenceBindingCount: derived.referenceBindings.length,
      tokenMappingCount: derived.tokenMappings.length,
      diagnosticsSummary: {
        total: derived.diagnostics.length,
        errors: diagCounts.errors,
        warnings: diagCounts.warnings,
      },
      diagnostics: derived.diagnostics.map((d) => ({
        id: d.id,
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

function runInspectLensSlice(
  args: Record<string, unknown>,
  rawText: string,
  ruleOverrides?: LintRuleOverrides
): ScriptToolExecutionResult {
  const hasPreset = typeof args.preset === 'string' && args.preset.trim().length > 0;
  const hasSpecObject =
    args.spec !== undefined && typeof args.spec === 'object' && args.spec !== null;

  let specOrPreset: LensSliceSpec | AuteurLensPresetId;

  if (hasPreset && !hasSpecObject) {
    const parsedPreset = AuteurLensPresetIdSchema.safeParse(args.preset);
    if (!parsedPreset.success) {
      return {
        ok: false,
        toolName: 'inspect_lens_slice',
        result: {
          ok: false,
          errors: parsedPreset.error.issues.map((issue) => ({
            path: issue.path.join('.') || 'preset',
            message: issue.message,
          })),
          repairHint: `Use one of the valid presets: ${Object.keys(AUDIT_LENS_PRESETS).join(', ')}, or pass a custom spec object.`,
        },
      };
    }
    specOrPreset = parsedPreset.data;
  } else {
    const candidateSpec: Record<string, unknown> = hasSpecObject
      ? {...(args.spec as Record<string, unknown>)}
      : {...args};
    if (hasPreset && candidateSpec.preset === undefined) {
      candidateSpec.preset = args.preset;
    }

    const parsedSpec = LensSliceSpecSchema.safeParse(candidateSpec);
    if (!parsedSpec.success) {
      return {
        ok: false,
        toolName: 'inspect_lens_slice',
        result: {
          ok: false,
          errors: parsedSpec.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          repairHint:
            'Provide a valid preset ID or valid LensSliceSpec fields (macroBlocks, dimensions, subStateTags, includeResolvedCamera, etc.).',
        },
      };
    }

    // If caller combined preset with custom overrides, merge base preset with overrides
    if (parsedSpec.data.preset) {
      specOrPreset = {
        ...AUDIT_LENS_PRESETS[parsedSpec.data.preset],
        ...parsedSpec.data,
      };
    } else {
      specOrPreset = parsedSpec.data;
    }
  }

  const slice = sliceAuteurScript(rawText, specOrPreset, ruleOverrides);
  return {
    ok: true,
    toolName: 'inspect_lens_slice',
    result: {
      ok: true,
      slice,
    },
  };
}

function runProposeScriptPatch(
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

function runProposeScriptDraft(
  args: Record<string, unknown>,
  context: ScriptToolContext,
  nextId: () => string
): ScriptToolExecutionResult {
  const hasWrappedDraft =
    args.draft !== undefined && typeof args.draft === 'object' && args.draft !== null;
  const draftPayload = hasWrappedDraft ? args.draft : args;
  const title = typeof args.title === 'string' && args.title.trim().length > 0
    ? args.title.trim()
    : undefined;
  const summaryInput = typeof args.summary === 'string' && args.summary.trim().length > 0
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

  const baseEnvelope = toAuteurEnvelope(context.rawText, context.ruleOverrides);
  const diagCounts = countBySeverity(compiled.diagnostics);
  const diff = buildLineDiff(context.rawText, compiled.rawText);
  const beatCount = compiled.ir.executionMacroBlock?.macroStates.length ?? 0;

  const suggestion: DraftSuggestion = {
    id: nextId(),
    kind: 'draft',
    ...(title ? {title} : {}),
    summary:
      summaryInput ??
      `Drafted ${compiled.ir.stagingMacroBlocks.length} Staging block(s) and ${beatCount} Execution beat(s)`,
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
      beatCount: suggestion.beatCount,
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
      ...(suggestion.errorCount > 0
        ? {
            repairHint:
              'The draft compiled and staged, but has Script Supervisor lint errors. Consider repairing those diagnostics and calling propose_script_draft again.',
          }
        : {}),
    },
  };
}

function runReportAuditReview(
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

// ---------------------------------------------------------------------------
// Public Mode-Scoped Tool Dispatcher
// ---------------------------------------------------------------------------

/**
 * Executes a single local read-only/staging tool call strictly scoped to `context.mode`.
 * Never mutates `context.rawText`.
 */
export function executeScriptToolCall(
  call: ToolCallInput,
  context: ScriptToolContext
): ScriptToolExecutionResult {
  const allowedTools = MODE_TOOL_NAMES[context.mode];
  if (!allowedTools.includes(call.name as ScriptToolName)) {
    return {
      ok: false,
      toolName: call.name,
      result: {
        ok: false,
        error: `Tool "${call.name}" is not available in "${context.mode}" mode.`,
        allowedTools,
        repairHint: `Use only the tools available in "${context.mode}" mode: ${allowedTools.join(', ')}.`,
      },
    };
  }

  const nextId = context.createSuggestionId ?? createDefaultIdGenerator();
  const args =
    call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)
      ? call.arguments
      : {};

  switch (call.name as ScriptToolName) {
    case 'get_script_overview':
      return runGetScriptOverview(context.rawText, context.ruleOverrides);
    case 'inspect_lens_slice':
      return runInspectLensSlice(args, context.rawText, context.ruleOverrides);
    case 'propose_script_patch':
      return runProposeScriptPatch(args, context, nextId);
    case 'propose_script_draft':
      return runProposeScriptDraft(args, context, nextId);
    case 'report_audit_review':
      return runReportAuditReview(args, context, nextId);
  }
}
