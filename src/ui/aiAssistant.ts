import type {AuditLens, AuteurDocument, AuteurLensPresetId, SceneTopology} from '../core/index.ts';
import type {AssistantFocus} from '../services/auteurKnowledge.ts';
import type {
  AgentMediaAttachment,
  AgentTurnTrace,
  GeminiErrorCode,
} from '../services/geminiInteractions.ts';
import type {
  AssistantMode,
  QuestionSuggestion,
  StagedSuggestion,
} from '../services/scriptTools.ts';

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

export type ReferenceKind = 'text' | 'image' | 'video' | 'audio' | 'document';
export type ReferenceSourceKind = 'inline' | 'files_api' | 'youtube';
export type VideoProcessingMode = 'static' | 'agentic';

export interface ReferenceAttachment {
  source: ReferenceSourceKind;
  mimeType: string;
  fileName?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  inlineBase64?: string;
  previewUrl?: string;
  /** Optional session-local object URL for instant preview/playback of Files API uploads. */
  localMediaUrl?: string;
  inlineText?: string;
  uri?: string;
  filesApiName?: string;
  expirationTime?: string;
  processingMode?: VideoProcessingMode;
  fingerprint: string;
}

export interface ReferenceEntry {
  id: string;
  handle: string;
  kind: ReferenceKind;
  label: string;
  note?: string;
  attachment?: ReferenceAttachment;
}

export interface DraftBriefState {
  /** Whether populated Brief fields are actively injected into AI context across all modes. */
  enabled: boolean;
  references: ReferenceEntry[];
  specs: string;
  subtext: string;
}

export const EMPTY_DRAFT_BRIEF: DraftBriefState = {
  enabled: true,
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
  askFirst?: boolean;
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
    case 'ask_question':
      return 'Clarifying questions';
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
    (entry.note?.trim().length ?? 0) > 0 ||
    Boolean(entry.attachment)
  );
}

export function hasDraftBriefContent(brief: DraftBriefState): boolean {
  return (
    brief.specs.trim().length > 0 ||
    brief.subtext.trim().length > 0 ||
    brief.references.some(isNonEmptyReference)
  );
}

export function isDraftBriefActive(brief: DraftBriefState): boolean {
  return brief.enabled && hasDraftBriefContent(brief);
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
 * Suggests the next sequential `@imageN`, `@videoN`, `@audioN`, or `@docN` handle
 * when adding a new ReferenceEntry.
 */
export function getNextReferenceHandle(
  references: readonly ReferenceEntry[],
  kind: ReferenceKind = 'image'
): string {
  const prefix =
    kind === 'video'
      ? 'video'
      : kind === 'audio'
        ? 'audio'
        : kind === 'document'
          ? 'doc'
          : 'image';
  const pattern = new RegExp(`^@?${prefix}(\\d+)$`, 'i');

  let maxIndex = 0;
  for (const entry of references) {
    const match = entry.handle.trim().match(pattern);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (Number.isFinite(num) && num > maxIndex) {
        maxIndex = num;
      }
    }
  }
  return `@${prefix}${maxIndex + 1}`;
}

function formatAttachmentTag(entry: ReferenceEntry): string {
  const att = entry.attachment;
  if (!att) return '';
  if (att.source === 'youtube') {
    return '[YouTube video]';
  }
  const mediaLabel =
    entry.kind === 'image'
      ? 'image'
      : entry.kind === 'video'
        ? 'video'
        : entry.kind === 'audio'
          ? 'audio'
          : 'document';
  const sourceLabel = att.source === 'files_api' ? 'Files API ' : 'attached ';
  const fileDetail = att.fileName ? `: ${att.fileName}` : '';
  return `[${sourceLabel}${mediaLabel}${fileDetail}]`;
}

/**
 * Formats non-empty ReferenceEntry rows into clean manifest lines such as
 * `@image1 as Mark (voice: @audio1) [attached image: mark.jpg]` or
 * `@video1: Clip 1 terminal frame [YouTube video]`.
 */
export function formatReferenceEntriesForPrompt(references: readonly ReferenceEntry[]): string {
  const lines: string[] = [];

  for (const entry of references) {
    const handle = normalizeHandleToken(entry.handle);
    const label = entry.label.trim();
    const note = entry.note?.trim() ?? '';
    const attachmentTag = formatAttachmentTag(entry);
    if (!handle && !label && !note && !attachmentTag) continue;

    let base = '';
    if (handle && label) {
      base = /^@(video|doc)/i.test(handle) ? `${handle}: ${label}` : `${handle} as ${label}`;
    } else if (handle) {
      base = handle;
    } else if (label) {
      base = label;
    }

    let line = '';
    if (base && note) {
      line = `${base} (${note})`;
    } else if (base) {
      line = base;
    } else if (note) {
      line = note;
    }

    if (attachmentTag) {
      line = line ? `${line} ${attachmentTag}` : attachmentTag;
    }

    if (line) {
      lines.push(line);
    }
  }

  return lines.join('\n');
}

/**
 * Selects which Brief multimodal attachments should be delivered on the upcoming turn.
 * Because ScriptFlow chains server-side state via `previous_interaction_id`, each attachment
 * is transmitted only once per conversation chain (or all active attachments on a fresh chain).
 */
export function collectPendingBriefAttachments(
  brief: DraftBriefState,
  sentFingerprints: ReadonlySet<string>,
  hasActiveInteractionChain: boolean
): AgentMediaAttachment[] {
  if (!isDraftBriefActive(brief)) return [];

  const pending: AgentMediaAttachment[] = [];
  for (const entry of brief.references) {
    const att = entry.attachment;
    if (!att) continue;
    if (hasActiveInteractionChain && sentFingerprints.has(att.fingerprint)) {
      continue;
    }
    const mediaKind: AgentMediaAttachment['kind'] =
      entry.kind === 'text' ? 'document' : entry.kind;
    pending.push({
      handle: normalizeHandleToken(entry.handle) || `@${mediaKind}`,
      label: entry.label.trim() || att.fileName || '',
      ...(entry.note?.trim() ? {note: entry.note.trim()} : {}),
      kind: mediaKind,
      source: att.source,
      mimeType: att.mimeType,
      ...(att.fileName ? {fileName: att.fileName} : {}),
      ...(att.inlineBase64 ? {inlineBase64: att.inlineBase64} : {}),
      ...(typeof att.inlineText === 'string' ? {inlineText: att.inlineText} : {}),
      ...(att.uri ? {uri: att.uri} : {}),
      ...(att.processingMode ? {processingMode: att.processingMode} : {}),
      fingerprint: att.fingerprint,
    });
  }
  return pending;
}

/**
 * Formats populated Scene Brief & References fields into a clean, mode-neutral
 * reference context block for `system_instruction`. Returns an empty string when
 * the Brief is empty or paused (`enabled: false`).
 */
export function formatSceneBriefContext(brief: DraftBriefState): string {
  if (!isDraftBriefActive(brief)) return '';

  const sections: string[] = [];
  const castLines = formatReferenceEntriesForPrompt(brief.references);
  if (castLines.length > 0) {
    const bulletedCast = castLines
      .split('\n')
      .map((line) => `- ${line}`)
      .join('\n');
    sections.push(`### Cast & References\n${bulletedCast}`);
  }

  const specs = brief.specs.trim();
  if (specs.length > 0) {
    sections.push(`### Format & Specs\n${specs}`);
  }

  const subtext = brief.subtext.trim();
  if (subtext.length > 0) {
    sections.push(`### Subtext & Additional Instructions\n${subtext}`);
  }

  return sections.join('\n\n');
}

export function buildBriefSummaryBadge(brief: DraftBriefState): string | undefined {
  if (!isDraftBriefActive(brief)) return undefined;
  const refCount = brief.references.filter(isNonEmptyReference).length;
  if (refCount > 0) {
    return `Brief · ${refCount} ${refCount === 1 ? 'ref' : 'refs'}`;
  }
  return 'Brief';
}

export const MIN_COMPOSER_HEIGHT = 56;
export const AUTO_GROW_MAX_COMPOSER_HEIGHT = 180;
export const MAX_COMPOSER_HEIGHT = 360;
export const STREAM_STICKY_BOTTOM_THRESHOLD_PX = 48;

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

export interface ToolCallTooltipInfo {
  title: string;
  toolName: string;
  statusLabel: string;
  detail?: string;
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
    case 'inspect_lens_slice': {
      const preset = typeof args.preset === 'string' ? args.preset : undefined;
      const spec =
        args.spec && typeof args.spec === 'object' && !Array.isArray(args.spec)
          ? (args.spec as Record<string, unknown>)
          : undefined;
      if (preset) {
        detail = `Preset: ${preset}`;
      } else if (spec && Array.isArray(spec.dimensions) && spec.dimensions.length > 0) {
        detail = `Custom slice: ${(spec.dimensions as unknown[]).map(String).join(', ')}`;
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

export interface QuestionAnswerDraft {
  selectedOptions: string[];
  comment: string;
}

export interface FormattedQuestionAnswers {
  promptText: string;
  displayText: string;
  answeredCount: number;
  totalCount: number;
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


