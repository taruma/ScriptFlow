import type {AuditLens, AuteurDocument, SceneTopology} from '../../core/index.ts';
import type {QuickScanResult} from '../../services/geminiDecisions.ts';
import type {GeminiErrorCode} from '../../services/geminiInteractions.ts';
import type {QuestionSuggestion} from '../../services/scriptTools.ts';
import {
  MAX_COMPOSER_HEIGHT,
  MIN_COMPOSER_HEIGHT,
  STREAM_STICKY_BOTTOM_THRESHOLD_PX,
  type AiChatMessage,
  type AiLoadedSkillItem,
  type AiTargetScope,
  type AiToolCallItem,
  type AuditQuickCheckId,
  type EditorJumpTarget,
  type FormattedQuestionAnswers,
  type QuestionAnswerDraft,
  type ToolCallTooltipInfo,
} from './types.ts';

/**
 * Inserts or updates a loaded skill pill for an assistant turn, deduplicating by `id`
 * so repeated `load_auteur_skill` calls never render duplicate pills.
 */
export function upsertLoadedSkill(
  list: readonly AiLoadedSkillItem[],
  item: AiLoadedSkillItem
): AiLoadedSkillItem[] {
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index === -1) {
    return [...list, item];
  }
  const existing = list[index];
  const nextSource: AiLoadedSkillItem['source'] =
    existing.source === 'tool' || item.source === 'tool' ? 'tool' : item.source;
  const nextName = item.name.trim() || existing.name;
  if (existing.source === nextSource && existing.name === nextName) {
    return [...list];
  }
  return list.map((entry, idx) =>
    idx === index ? {id: existing.id, name: nextName, source: nextSource} : entry
  );
}

function truncatePreview(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Builds the Refine mode target scope catalog (`Whole Script`, `MB#`, `S#`)
 * from the parsed AuteurDocument without mutating any script text.
 */
export function buildAiTargetOptions(
  doc: AuteurDocument,
  wholeScriptLabel = 'Whole Script'
): AiTargetScope[] {
  const options: AiTargetScope[] = [
    {
      kind: 'whole',
      key: 'whole',
      label: wholeScriptLabel,
    },
  ];

  for (let i = 0; i < doc.stagingBlocks.length; i++) {
    const block = doc.stagingBlocks[i];
    const id = `MB${i}`;
    const header = block.name.trim().toUpperCase();
    options.push({
      kind: 'macro_block',
      key: id,
      id,
      blockIndex: i,
      header,
      label: `${id} · [${header}]`,
    });
  }

  const beats = doc.execution?.beats ?? [];
  for (const beat of beats) {
    const id = `S${beat.index}`;
    const preview = truncatePreview(beat.raw, 40);
    options.push({
      kind: 'macro_state',
      key: id,
      id,
      beatIndex: beat.index,
      preview,
      label: preview ? `${id} · ${preview}` : id,
    });
  }

  return options;
}

/**
 * Reconciles a previously selected target key against the current target list,
 * falling back cleanly to `Whole Script` if the block or beat was removed.
 */
export function reconcileTargetScope(
  selectedKey: string,
  options: readonly AiTargetScope[]
): AiTargetScope {
  const match = options.find((opt) => opt.key === selectedKey);
  return match ?? options[0] ?? {kind: 'whole', key: 'whole', label: 'Whole Script'};
}

/**
 * Wraps a Refine-mode user prompt with explicit read-only target scope guidance
 * when a specific Macro-Block (`MB#`) or Execution beat (`S#`) is selected.
 */
export function buildScopedRefinePrompt(userPrompt: string, scope: AiTargetScope): string {
  const trimmed = userPrompt.trim();
  if (!trimmed) return '';

  if (scope.kind === 'macro_block') {
    return `[Target Scope: Staging Macro-Block ${scope.id} ([${scope.header}]) — focus edits on ${scope.id} unless adjacent context requires minimal continuity alignment.]\n\n${trimmed}`;
  }

  if (scope.kind === 'macro_state') {
    return `[Target Scope: Execution Macro-State ${scope.id} — focus edits on ${scope.id} unless adjacent Macro-States require minimal continuity alignment.]\n\n${trimmed}`;
  }

  return trimmed;
}

const AUDIT_QUICK_PROMPTS: Record<AuditQuickCheckId, string> = {
  all: 'Run a full Script Supervisor audit across all 5 lenses (Spatial & Optics, Temporal Pacing & Wear, Props & Inventory, Acoustics & Voice, Blocks & Grammar). Inspect relevant lens slices first, respect the scene topology, and call report_audit_review with exact target IDs and clean suggestedPatch fixes where helpful.',
  lens1_spatial_optics:
    'Run a focused Script Supervisor audit on Lens 1: Spatial & Optics (camera framing, viewport coordinate purity, blocking sightlines, and continuity). Inspect the lens1_spatial_optics slice first and call report_audit_review with clickable target IDs and clean suggestedPatch fixes where appropriate.',
  lens2_temporal_pacing_wear:
    'Run a focused Script Supervisor audit on Lens 2: Temporal, Pacing & Wear (physical continuity, state evolution, Macro-State pacing, and scene topology compliance). Inspect the lens2_temporal_pacing_wear slice first and call report_audit_review with clickable target IDs and clean suggestedPatch fixes where appropriate.',
  lens3_props_inventory:
    'Run a focused Script Supervisor audit on Lens 3: Props & Inventory (prop persistence, object handoffs, aesthetic token usage, and reference bindings). Inspect the lens3_props_inventory slice first and call report_audit_review with clickable target IDs and clean suggestedPatch fixes where appropriate.',
  lens4_acoustics_voice:
    'Run a focused Script Supervisor audit on Lens 4: Acoustics & Voice (curly-brace dialogue craft, trailing dialogue resolution, foley triggers, and score cues). Inspect the lens4_acoustics_voice slice first and call report_audit_review with clickable target IDs and clean suggestedPatch fixes where appropriate.',
  lens5_blocks_grammar:
    'Run a focused Script Supervisor audit on Lens 5: Blocks & Grammar (v0.4.0 canonical syntax, frozen [OPENING] purity, @ref scope, and Macro-Block hygiene). Inspect the lens5_blocks_grammar slice first and call report_audit_review with clickable target IDs and clean suggestedPatch fixes where appropriate.',
};

export function buildAuditQuickPrompt(checkId: AuditQuickCheckId): string {
  return AUDIT_QUICK_PROMPTS[checkId];
}

/**
 * Resolves an Auteur IR targetId (`MB0`, `MB2.1`, `S1`, `S2.3`, or `[INTENT]`)
 * to the corresponding Live Mode DOM element ID so clicking an audit issue jumps directly to it.
 */
export function resolveEditorJumpTarget(
  targetId: string,
  doc: AuteurDocument
): EditorJumpTarget | null {
  const trimmed = targetId.trim();
  if (!trimmed) return null;

  const mbMatch = trimmed.match(/^MB(\d+)(?:\.\d+)?$/i);
  if (mbMatch) {
    const blockIndex = Number.parseInt(mbMatch[1], 10);
    if (blockIndex >= 0 && blockIndex < doc.stagingBlocks.length) {
      return {
        phase: 'staging',
        blockIndex,
        domId: `staging-block-${blockIndex}`,
      };
    }
    return null;
  }

  const beatMatch = trimmed.match(/^S(\d+)(?:\.(\d+))?$/i);
  if (beatMatch) {
    const beatIndex = Number.parseInt(beatMatch[1], 10);
    const beat = doc.execution?.beats.find((b) => b.index === beatIndex);
    if (beat) {
      const beatDomId = `execution-beat-${beatIndex}`;
      if (beatMatch[2] !== undefined) {
        const subStateNumber = Number.parseInt(beatMatch[2], 10);
        const subStateIndex = subStateNumber - 1;
        if (subStateNumber >= 1 && subStateIndex < beat.subStates.length) {
          return {
            phase: 'execution',
            beatIndex,
            subStateIndex,
            domId: `execution-beat-${beatIndex}-substate-${subStateIndex}`,
            fallbackDomId: beatDomId,
          };
        }
      }
      return {
        phase: 'execution',
        beatIndex,
        domId: beatDomId,
      };
    }
    return null;
  }

  // Fallback: header name such as `[OPENING]` or `OPENING`
  const headerName = trimmed.replace(/^\[|\]$/g, '').trim().toUpperCase();
  if (headerName.length > 0) {
    const blockIndex = doc.stagingBlocks.findIndex(
      (block) => block.name.trim().toUpperCase() === headerName
    );
    if (blockIndex >= 0) {
      return {
        phase: 'staging',
        blockIndex,
        domId: `staging-block-${blockIndex}`,
      };
    }
  }

  return null;
}

/**
 * Returns true if the script's snapshot hash has diverged since a patch suggestion was staged.
 */
export function isSuggestionStale(baseSnapshotHash: string, currentSnapshotHash: string): boolean {
  return baseSnapshotHash !== currentSnapshotHash;
}

export function formatLensShort(lens: AuditLens | string): string {
  return lens.split(':')[0]?.trim() || lens;
}

export function formatTopologyLabel(topology: SceneTopology): string {
  switch (topology) {
    case 'continuous_oner':
      return 'Continuous Oner';
    case 'multi_camera_coverage':
      return 'Multi-Camera Coverage';
    case 'discontinuous_montage':
      return 'Montage';
    case 'mixed':
      return 'Mixed Topology';
    case 'empty':
      return 'Empty';
  }
}

export function formatToolDisplayName(toolName: string): string {
  switch (toolName) {
    case 'get_script_overview':
      return 'Inspect overview';
    case 'get_script_source':
      return 'Read script source';
    case 'inspect_lens_slice':
      return 'Inspect lens slice';
    case 'propose_script_patch':
      return 'Stage patch';
    case 'propose_text_replace':
      return 'Stage text replace';
    case 'propose_script_title':
      return 'Suggest scene title';
    case 'propose_script_draft':
      return 'Compile draft';
    case 'report_audit_review':
      return 'Stage audit review';
    case 'load_auteur_skill':
      return 'Load skill';
    case 'ask_question':
      return 'Clarifying questions';
    default:
      return toolName;
  }
}

export function shouldShowSettingsLinkForError(code: GeminiErrorCode): boolean {
  return code === 'missing_api_key' || code === 'invalid_api_key' || code === 'model_not_found';
}

/**
 * Returns true when a scrollable container is within `thresholdPx` of its bottom edge,
 * used by sticky-bottom streaming auto-scroll so manual upward scrolling is never overridden.
 */
export function isNearScrollBottom(metrics: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  thresholdPx?: number;
}): boolean {
  const threshold = metrics.thresholdPx ?? STREAM_STICKY_BOTTOM_THRESHOLD_PX;
  const distanceFromBottom = metrics.scrollHeight - (metrics.scrollTop + metrics.clientHeight);
  return distanceFromBottom <= threshold;
}

/**
 * Builds concise human-readable hover tooltip details for an AI tool call pill.
 */
export function formatToolCallTooltip(tool: AiToolCallItem): ToolCallTooltipInfo {
  const title = formatToolDisplayName(tool.name);
  const statusLabel =
    tool.status === 'running'
      ? 'Running'
      : tool.status === 'error'
        ? 'Retrying after validation feedback'
        : tool.status === 'stopped'
          ? 'Stopped'
          : 'Done';

  const args = tool.arguments ?? {};
  let detail: string | undefined;

  switch (tool.name) {
    case 'get_script_overview': {
      detail = 'Reads Macro-Block & Macro-State structure, topology, snapshot hash, and lint counts.';
      break;
    }
    case 'get_script_source': {
      const targetIds = Array.isArray(args.targetIds)
        ? (args.targetIds as unknown[]).map(String).filter((id) => id.trim().length > 0)
        : [];
      if (targetIds.length > 0) {
        const shown = targetIds.slice(0, 6).join(', ');
        const suffix = targetIds.length > 6 ? ` (+${targetIds.length - 6})` : '';
        detail = `Targets: ${shown}${suffix}`;
      } else {
        detail = 'Reads full canonical v0.4.0 plain-text script source.';
      }
      break;
    }
    case 'inspect_lens_slice': {
      const preset = typeof args.preset === 'string' ? args.preset : undefined;
      const spec =
        args.spec && typeof args.spec === 'object' && !Array.isArray(args.spec)
          ? (args.spec as Record<string, unknown>)
          : undefined;
      const rawMacroStateIds = Array.isArray(args.macroStateIds)
        ? args.macroStateIds
        : spec && Array.isArray(spec.macroStateIds)
          ? spec.macroStateIds
          : [];
      const macroStateIds = (rawMacroStateIds as unknown[])
        .map(String)
        .filter((id) => id.trim().length > 0);
      const statesSuffix =
        macroStateIds.length > 0
          ? `States: ${macroStateIds.slice(0, 6).join(', ')}${macroStateIds.length > 6 ? ` (+${macroStateIds.length - 6})` : ''}`
          : '';
      const baseDetail = preset
        ? `Preset: ${preset}`
        : spec && Array.isArray(spec.dimensions) && spec.dimensions.length > 0
          ? `Custom slice: ${(spec.dimensions as unknown[]).map(String).join(', ')}`
          : '';
      if (baseDetail && statesSuffix) {
        detail = `${baseDetail} · ${statesSuffix}`;
      } else if (baseDetail) {
        detail = baseDetail;
      } else if (statesSuffix) {
        detail = `Custom slice · ${statesSuffix}`;
      } else {
        detail = 'Inspects targeted Script Supervisor lens slice.';
      }
      break;
    }
    case 'propose_script_patch': {
      const opsCount = Array.isArray(args.ops) ? args.ops.length : 0;
      const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
      const parts: string[] = [];
      if (opsCount > 0) parts.push(`${opsCount} ${opsCount === 1 ? 'op' : 'ops'}`);
      if (summary) parts.push(truncatePreview(summary, 90));
      detail = parts.length > 0 ? parts.join(' · ') : 'Dry-runs and stages targeted script patch.';
      break;
    }
    case 'propose_text_replace': {
      const rulesCount = Array.isArray(args.replacements) ? args.replacements.length : 0;
      const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
      const parts: string[] = [];
      if (rulesCount > 0) parts.push(`${rulesCount} ${rulesCount === 1 ? 'rule' : 'rules'}`);
      if (summary) parts.push(truncatePreview(summary, 90));
      detail =
        parts.length > 0
          ? parts.join(' · ')
          : 'Applies literal or regex replacements and stages a lint-checked patch.';
      break;
    }
    case 'propose_script_title': {
      const titleArg = typeof args.title === 'string' ? args.title.trim() : '';
      detail = titleArg
        ? `"${truncatePreview(titleArg, 70)}"`
        : 'Stages a proposed scene title update.';
      break;
    }
    case 'propose_script_draft': {
      const titleArg = typeof args.title === 'string' ? args.title.trim() : '';
      const summaryArg = typeof args.summary === 'string' ? args.summary.trim() : '';
      const parts: string[] = [];
      if (titleArg) parts.push(`"${truncatePreview(titleArg, 50)}"`);
      if (summaryArg) parts.push(truncatePreview(summaryArg, 80));
      detail = parts.length > 0 ? parts.join(' · ') : 'Compiles and lint-checks a full v0.4.0 draft.';
      break;
    }
    case 'report_audit_review': {
      const issueCount = Array.isArray(args.issues) ? args.issues.length : 0;
      const summary = typeof args.overallSummary === 'string' ? args.overallSummary.trim() : '';
      const parts: string[] = [];
      parts.push(`${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}`);
      if (summary) parts.push(truncatePreview(summary, 80));
      detail = parts.join(' · ');
      break;
    }
    case 'load_auteur_skill': {
      const skillId = typeof args.skillId === 'string' ? args.skillId.trim() : '';
      detail = skillId ? `Skill: ${skillId}` : 'Loads an on-demand Auteur craft skill.';
      break;
    }
    case 'ask_question': {
      const questions = Array.isArray(args.questions) ? args.questions : [];
      const count = questions.length;
      const firstQ =
        questions[0] && typeof questions[0] === 'object' && !Array.isArray(questions[0])
          ? String((questions[0] as Record<string, unknown>).question ?? '').trim()
          : '';
      if (count > 0 && firstQ) {
        detail = `${count} ${count === 1 ? 'question' : 'questions'} · ${truncatePreview(firstQ, 70)}`;
      } else if (count > 0) {
        detail = `${count} clarifying ${count === 1 ? 'question' : 'questions'}`;
      } else {
        detail = 'Presents multi-select clarifying questions.';
      }
      break;
    }
    default: {
      const keys = Object.keys(args);
      if (keys.length > 0) {
        detail = `Args: ${keys.join(', ')}`;
      }
      break;
    }
  }

  return {
    title,
    toolName: tool.name,
    statusLabel,
    ...(detail ? {detail} : {}),
  };
}

/**
 * Clamps a requested composer textarea height within safe minimum/maximum bounds,
 * optionally constrained by the available sidebar height so the chat stream stays usable.
 */
export function clampComposerHeight(requestedHeight: number, sidebarHeight?: number): number {
  const dynamicMax =
    typeof sidebarHeight === 'number' && Number.isFinite(sidebarHeight) && sidebarHeight > 0
      ? Math.max(MIN_COMPOSER_HEIGHT, Math.min(MAX_COMPOSER_HEIGHT, Math.floor(sidebarHeight * 0.48)))
      : MAX_COMPOSER_HEIGHT;
  const safeValue = Number.isFinite(requestedHeight) ? requestedHeight : MIN_COMPOSER_HEIGHT;
  return Math.max(MIN_COMPOSER_HEIGHT, Math.min(dynamicMax, Math.round(safeValue)));
}

export function hasAnyQuestionAnswer(
  answers: Readonly<Record<string, QuestionAnswerDraft>>
): boolean {
  return Object.values(answers).some(
    (entry) => entry.selectedOptions.length > 0 || entry.comment.trim().length > 0
  );
}

/**
 * Formats multi-select choices and optional inline comments from a QuestionSuggestion card
 * into a clean structured follow-up message for the next AI turn.
 */
export function formatQuestionAnswersPrompt(
  suggestion: QuestionSuggestion,
  answers: Readonly<Record<string, QuestionAnswerDraft>>
): FormattedQuestionAnswers {
  const blocks: string[] = [];
  let answeredCount = 0;

  suggestion.questions.forEach((item, index) => {
    const draft = answers[item.id];
    const selectedSet = new Set(draft?.selectedOptions ?? []);
    const orderedSelected = item.options.filter((opt) => selectedSet.has(opt));
    const comment = draft?.comment.trim() ?? '';

    const lines: string[] = [`${index + 1}. ${item.question}`];
    if (orderedSelected.length > 0 || comment.length > 0) {
      answeredCount += 1;
      if (orderedSelected.length > 0) {
        lines.push(`- Selected: ${orderedSelected.join(', ')}`);
      }
      if (comment.length > 0) {
        lines.push(`- Comment: ${comment}`);
      }
    } else {
      lines.push('- (No preference — your call)');
    }
    blocks.push(lines.join('\n'));
  });

  const body = blocks.join('\n\n');
  return {
    promptText: `Clarifying answers:\n\n${body}`,
    displayText: body,
    answeredCount,
    totalCount: suggestion.questions.length,
  };
}

/**
 * Builds the structured Interactions API `function_result` JSON payload sent back
 * when resuming a paused `ask_question` call (answer submission, Skip & Proceed, or dismiss).
 */
export function buildQuestionToolResultPayload(
  suggestion: QuestionSuggestion,
  answers: Readonly<Record<string, QuestionAnswerDraft>>,
  status: 'answered' | 'skipped' | 'dismissed',
  updatedEditorContext?: string
): Record<string, unknown> {
  if (status === 'skipped') {
    return {
      ok: true,
      status: 'skipped',
      instruction:
        'User clicked Skip & Proceed ("Your call"). Do not ask clarifying questions again; apply strong Auteur craft defaults and proceed directly with drafting or editing.',
      ...(updatedEditorContext ? {updatedEditorContext} : {}),
    };
  }

  if (status === 'dismissed') {
    return {
      ok: true,
      status: 'dismissed',
      instruction:
        'User dismissed the clarifying question card. Proceed using the user message and current editor/brief context without repeating those questions.',
      ...(updatedEditorContext ? {updatedEditorContext} : {}),
    };
  }

  const normalizedAnswers = suggestion.questions.map((item) => {
    const draft = answers[item.id];
    const selectedSet = new Set(draft?.selectedOptions ?? []);
    const selected = item.options.filter((opt) => selectedSet.has(opt));
    const note = draft?.comment.trim() ?? '';

    return {
      id: item.id,
      question: item.question,
      selected,
      ...(note ? {note} : {}),
      ...(selected.length === 0 && !note ? {preference: 'no_preference_your_call'} : {}),
    };
  });

  return {
    ok: true,
    status: 'answered',
    answers: normalizedAnswers,
    ...(updatedEditorContext ? {updatedEditorContext} : {}),
  };
}

/**
 * Returns the latest active (non-dismissed, non-stale, non-superseded) Quick Scan result
 * from the chat history so Live Mode suspect `S#` dots stay synchronized and clear
 * automatically once edited, dismissed, or superseded by a newer completed Audit review.
 */
export function getLatestActiveQuickScan(
  messages: readonly AiChatMessage[],
  currentSnapshotHash: string
): QuickScanResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;

    // A newer completed Audit review supersedes prior Quick Scan Live Mode dots
    if (
      !msg.isStreaming &&
      msg.suggestions?.some((s) => s.kind === 'audit_review')
    ) {
      return null;
    }

    if (msg.quickScan) {
      if (msg.quickScanDismissed) return null;
      if (msg.quickScan.snapshotHash !== currentSnapshotHash) return null;
      return msg.quickScan;
    }
  }
  return null;
}
