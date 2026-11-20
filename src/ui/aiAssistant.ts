import type {AuditLens, AuteurDocument, AuteurLensPresetId, SceneTopology} from '../core/index.ts';
import {
  DEFAULT_DRAFT_WRAPPER_TEMPLATE,
  type AssistantFocus,
} from '../services/auteurKnowledge.ts';
import type {AgentTurnTrace, GeminiErrorCode} from '../services/geminiInteractions.ts';
import type {AssistantMode, StagedSuggestion} from '../services/scriptTools.ts';

export type AiTargetScope =
  | {kind: 'whole'; key: 'whole'; label: string}
  | {kind: 'macro_block'; key: string; id: string; blockIndex: number; header: string; label: string}
  | {kind: 'macro_state'; key: string; id: string; beatIndex: number; preview: string; label: string};

export type AuditQuickCheckId = 'all' | AuteurLensPresetId;

export interface AuditQuickCheckOption {
  id: AuditQuickCheckId;
  preset?: AuteurLensPresetId;
}

export const AUDIT_QUICK_CHECKS: readonly AuditQuickCheckOption[] = [
  {id: 'all'},
  {id: 'lens1_spatial_optics', preset: 'lens1_spatial_optics'},
  {id: 'lens2_temporal_pacing_wear', preset: 'lens2_temporal_pacing_wear'},
  {id: 'lens3_props_inventory', preset: 'lens3_props_inventory'},
  {id: 'lens4_acoustics_voice', preset: 'lens4_acoustics_voice'},
  {id: 'lens5_blocks_grammar', preset: 'lens5_blocks_grammar'},
] as const;

export interface AiToolCallItem {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'running' | 'ok' | 'error' | 'stopped';
  stagedSuggestionId?: string;
}

export interface AiLoadedSkillItem {
  id: string;
  name: string;
  source: 'passive' | 'pinned' | 'tool';
}

export type ReferenceKind = 'text' | 'image' | 'video' | 'audio';

export interface ReferenceEntry {
  id: string;
  handle: string;
  kind: ReferenceKind;
  label: string;
  note?: string;
}

export interface DraftBriefState {
  references: ReferenceEntry[];
  specs: string;
  subtext: string;
}

export const EMPTY_DRAFT_BRIEF: DraftBriefState = {
  references: [],
  specs: '',
  subtext: '',
};

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  mode: AssistantMode;
  focus: AssistantFocus;
  text: string;
  scopeLabel?: string;
  briefSummary?: string;
  thoughtSummary?: string;
  toolCalls?: AiToolCallItem[];
  loadedSkills?: AiLoadedSkillItem[];
  suggestions?: StagedSuggestion[];
  dismissedSuggestionIds?: string[];
  appliedSuggestionIds?: string[];
  error?: {
    code: GeminiErrorCode;
    message: string;
  };
  trace?: AgentTurnTrace;
  isStreaming?: boolean;
  hitToolRoundLimit?: boolean;
}

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

export type EditorJumpTarget =
  | {phase: 'staging'; blockIndex: number; domId: string}
  | {phase: 'execution'; beatIndex: number; domId: string};

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
    return `[Target Scope: Execution Beat ${scope.id} — focus edits on ${scope.id} unless adjacent beats require minimal continuity alignment.]\n\n${trimmed}`;
  }

  return trimmed;
}

const AUDIT_QUICK_PROMPTS: Record<AuditQuickCheckId, string> = {
  all: 'Run a full Script Supervisor audit across all 5 lenses (Spatial & Optics, Temporal Pacing & Wear, Props & Inventory, Acoustics & Voice, Blocks & Grammar). Inspect relevant lens slices first, respect the scene topology, and call report_audit_review with exact target IDs and clean suggestedPatch fixes where helpful.',
  lens1_spatial_optics:
    'Run a focused Script Supervisor audit on Lens 1: Spatial & Optics (camera framing, viewport coordinate purity, blocking sightlines, and continuity). Inspect the lens1_spatial_optics slice first and call report_audit_review with clickable target IDs and clean suggestedPatch fixes where appropriate.',
  lens2_temporal_pacing_wear:
    'Run a focused Script Supervisor audit on Lens 2: Temporal, Pacing & Wear (physical continuity, state evolution, beat pacing, and scene topology compliance). Inspect the lens2_temporal_pacing_wear slice first and call report_audit_review with clickable target IDs and clean suggestedPatch fixes where appropriate.',
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

  const beatMatch = trimmed.match(/^S(\d+)(?:\.\d+)?$/i);
  if (beatMatch) {
    const beatIndex = Number.parseInt(beatMatch[1], 10);
    const exists = doc.execution?.beats.some((beat) => beat.index === beatIndex) ?? false;
    if (exists) {
      return {
        phase: 'execution',
        beatIndex,
        domId: `execution-beat-${beatIndex}`,
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
    case 'inspect_lens_slice':
      return 'Inspect lens slice';
    case 'propose_script_patch':
      return 'Stage patch';
    case 'propose_script_draft':
      return 'Compile draft';
    case 'report_audit_review':
      return 'Stage audit review';
    case 'load_auteur_skill':
      return 'Load skill';
    default:
      return toolName;
  }
}

export function shouldShowSettingsLinkForError(code: GeminiErrorCode): boolean {
  return code === 'missing_api_key' || code === 'invalid_api_key' || code === 'model_not_found';
}

// ---------------------------------------------------------------------------
// Unified Focus & Collapsible Brief / Refs Helpers
// ---------------------------------------------------------------------------

/**
 * Maps the unified AssistantFocus back to a legacy AssistantMode so trace payloads
 * and backwards-compatible consumers always receive a valid mode value.
 */
export function focusToLegacyMode(focus: AssistantFocus, isEmpty: boolean): AssistantMode {
  switch (focus) {
    case 'draft':
      return 'draft';
    case 'audit':
      return 'check';
    case 'refine':
      return 'refine';
    case 'auto':
      return isEmpty ? 'draft' : 'refine';
  }
}

function normalizeHandleToken(rawHandle: string): string {
  const trimmed = rawHandle.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function isNonEmptyReference(entry: ReferenceEntry): boolean {
  return (
    entry.handle.trim().length > 0 ||
    entry.label.trim().length > 0 ||
    (entry.note?.trim().length ?? 0) > 0
  );
}

export function hasDraftBriefContent(brief: DraftBriefState): boolean {
  return (
    brief.specs.trim().length > 0 ||
    brief.subtext.trim().length > 0 ||
    brief.references.some(isNonEmptyReference)
  );
}

/**
 * Extracts normalized `@handle` references from the Brief / Refs tray (including
 * explicit `@...` tokens in notes such as `voice: @audio1`) for passive skill activation.
 */
export function getBriefReferenceHandles(brief: DraftBriefState): string[] {
  const seen = new Set<string>();
  const handles: string[] = [];

  const pushHandle = (raw: string) => {
    const normalized = normalizeHandleToken(raw);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    handles.push(normalized);
  };

  for (const entry of brief.references) {
    if (entry.handle.trim().length > 0) {
      pushHandle(entry.handle);
    }
    if (entry.note && entry.note.trim().length > 0) {
      const noteMatches = entry.note.match(/@[a-zA-Z0-9_-]+/g);
      if (noteMatches) {
        for (const match of noteMatches) {
          pushHandle(match);
        }
      }
    }
  }

  return handles;
}

/**
 * Suggests the next sequential `@imageN` handle when adding a new ReferenceEntry row.
 */
export function getNextReferenceHandle(references: readonly ReferenceEntry[]): string {
  let maxIndex = 0;
  for (const entry of references) {
    const match = entry.handle.trim().match(/^@?image(\d+)$/i);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (Number.isFinite(num) && num > maxIndex) {
        maxIndex = num;
      }
    }
  }
  return `@image${maxIndex + 1}`;
}

/**
 * Formats non-empty ReferenceEntry rows into clean prompt lines such as
 * `@image1 as Mark (voice: @audio1)` or `@video1: Clip 1 terminal frame`.
 */
export function formatReferenceEntriesForPrompt(references: readonly ReferenceEntry[]): string {
  const lines: string[] = [];

  for (const entry of references) {
    const handle = normalizeHandleToken(entry.handle);
    const label = entry.label.trim();
    const note = entry.note?.trim() ?? '';
    if (!handle && !label && !note) continue;

    let base = '';
    if (handle && label) {
      base = /^@video/i.test(handle) ? `${handle}: ${label}` : `${handle} as ${label}`;
    } else if (handle) {
      base = handle;
    } else if (label) {
      base = label;
    }

    if (base && note) {
      lines.push(`${base} (${note})`);
    } else if (base) {
      lines.push(base);
    } else if (note) {
      lines.push(note);
    }
  }

  return lines.join('\n');
}

export function shouldApplyDraftWrapperTemplate(options: {
  focus: AssistantFocus;
  isEmpty: boolean;
}): boolean {
  return options.focus === 'draft' || (options.focus === 'auto' && options.isEmpty);
}

const BRIEF_PLACEHOLDER_REGEX = /\{\{\s*(idea|cast|specs|subtext)\s*\}\}/g;

/**
 * Interpolates the editable Draft Wrapper Template with the user's idea and optional
 * Brief / Refs fields, cleanly omitting lines whose optional placeholders resolve empty
 * and guaranteeing the user's idea is never silently dropped if a custom template omits `{{idea}}`.
 */
export function formatDraftBriefPrompt(
  idea: string,
  brief: DraftBriefState,
  templateOverride?: string | null
): string {
  const trimmedIdea = idea.trim();
  const template = templateOverride?.trim() || DEFAULT_DRAFT_WRAPPER_TEMPLATE;

  const values: Record<'idea' | 'cast' | 'specs' | 'subtext', string> = {
    idea: trimmedIdea,
    cast: formatReferenceEntriesForPrompt(brief.references),
    specs: brief.specs.trim(),
    subtext: brief.subtext.trim(),
  };

  let templateContainedIdea = false;
  const outputLines: string[] = [];

  for (const line of template.split(/\r?\n/)) {
    const matches = Array.from(line.matchAll(BRIEF_PLACEHOLDER_REGEX));
    if (matches.length === 0) {
      outputLines.push(line);
      continue;
    }

    const keys = matches.map((m) => m[1] as keyof typeof values);
    if (keys.includes('idea')) {
      templateContainedIdea = true;
    }

    // Omit lines where every placeholder on the line resolved to empty
    const allEmpty = keys.every((key) => values[key].length === 0);
    if (allEmpty) {
      continue;
    }

    const substituted = line.replace(BRIEF_PLACEHOLDER_REGEX, (_, key: keyof typeof values) => {
      return values[key];
    });
    outputLines.push(substituted);
  }

  let assembled = outputLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!templateContainedIdea && trimmedIdea.length > 0) {
    assembled = assembled.length > 0 ? `${assembled}\n\n${trimmedIdea}` : trimmedIdea;
  }

  return assembled;
}

export function buildBriefSummaryBadge(brief: DraftBriefState): string | undefined {
  if (!hasDraftBriefContent(brief)) return undefined;
  const refCount = brief.references.filter(isNonEmptyReference).length;
  if (refCount > 0) {
    return `Brief · ${refCount} ${refCount === 1 ? 'ref' : 'refs'}`;
  }
  return 'Brief';
}

