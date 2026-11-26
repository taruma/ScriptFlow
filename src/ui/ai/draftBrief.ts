import type {AssistantFocus} from '../../services/auteurKnowledge.ts';
import type {AgentMediaAttachment} from '../../services/geminiInteractions.ts';
import type {AssistantMode} from '../../services/scriptTools.ts';
import type {DraftBriefState, ReferenceEntry, ReferenceKind} from './types.ts';

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
    Boolean(entry.attachment) ||
    Boolean(entry.omittedAttachmentTag?.trim())
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

export function formatAttachmentTag(entry: ReferenceEntry): string {
  const att = entry.attachment;
  if (!att) return entry.omittedAttachmentTag?.trim() ?? '';
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
