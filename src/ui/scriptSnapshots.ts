import {buildLineDiff, type DiffLine} from '../services/scriptTools.ts';
import {diffWords, type WordDiffToken} from './patchIndicators.ts';

export type SnapshotTrigger = 'ai_draft' | 'ai_patch' | 'ai_fix' | 'pre_restore' | 'manual';

export type SnapshotOrigin = 'auto' | 'manual';

export interface ScriptSnapshot {
  id: string;
  scriptId: string;
  trigger: SnapshotTrigger;
  label: string;
  rawText: string;
  createdAt: number;
  pinned?: boolean;
}

export const MAX_AUTO_SNAPSHOTS_PER_SCRIPT = 30;

const VALID_TRIGGERS = new Set<string>(['ai_draft', 'ai_patch', 'ai_fix', 'pre_restore', 'manual']);

export function isValidSnapshotTrigger(value: unknown): value is SnapshotTrigger {
  return typeof value === 'string' && VALID_TRIGGERS.has(value);
}

/**
 * Classifies a snapshot trigger as either user-authored ('manual') or
 * system-captured ('auto').
 */
export function getSnapshotOrigin(trigger: SnapshotTrigger): SnapshotOrigin {
  return trigger === 'manual' ? 'manual' : 'auto';
}

/**
 * Sorts snapshots strictly newest-first (`createdAt` descending, deterministic `id` tiebreak).
 */
export function sortScriptSnapshots(snapshots: readonly ScriptSnapshot[]): ScriptSnapshot[] {
  return [...snapshots].sort((a, b) => {
    if (b.createdAt !== a.createdAt) {
      return b.createdAt - a.createdAt;
    }
    return b.id.localeCompare(a.id);
  });
}

/**
 * Manual milestones and explicitly pinned auto-snapshots are protected from
 * automatic FIFO retention pruning.
 */
export function isProtectedSnapshot(snapshot: Pick<ScriptSnapshot, 'trigger' | 'pinned'>): boolean {
  return Boolean(snapshot.pinned) || snapshot.trigger === 'manual';
}

/**
 * Returns the IDs of oldest unprotected auto-snapshots exceeding `maxAuto`.
 */
export function selectSnapshotsToPrune(
  snapshots: readonly ScriptSnapshot[],
  maxAuto: number = MAX_AUTO_SNAPSHOTS_PER_SCRIPT
): string[] {
  const limit = Math.max(0, Math.floor(maxAuto));
  const sorted = sortScriptSnapshots(snapshots);
  const autoSnapshots = sorted.filter((snapshot) => !isProtectedSnapshot(snapshot));
  if (autoSnapshots.length <= limit) return [];
  return autoSnapshots.slice(limit).map((snapshot) => snapshot.id);
}

/**
 * Skips empty/whitespace-only and consecutive identical automatic snapshots
 * while allowing manual milestones to always be recorded when explicitly requested.
 */
export function shouldSkipAutoSnapshot(
  latestSnapshot: ScriptSnapshot | undefined,
  candidateRawText: string,
  trigger: SnapshotTrigger
): boolean {
  if (trigger === 'manual') return false;
  if (candidateRawText.trim().length === 0) return true;
  if (!latestSnapshot) return false;
  return latestSnapshot.rawText === candidateRawText;
}

/**
 * Builds a concise, scannable snapshot label for pre- or post-AI-apply checkpoints.
 */
export function buildAiSnapshotLabel(
  trigger: 'ai_draft' | 'ai_patch' | 'ai_fix',
  detail?: string,
  options?: {batchCount?: number; phase?: 'before' | 'after'}
): string {
  const phase = options?.phase ?? 'before';
  const cleanDetail = detail?.replace(/\s+/g, ' ').trim() ?? '';
  const truncate = (text: string, maxLen = 58): string =>
    text.length <= maxLen ? text : `${text.slice(0, maxLen - 1).trimEnd()}…`;

  if (phase === 'after') {
    if (trigger === 'ai_draft') {
      return cleanDetail ? `AI Draft: ${truncate(cleanDetail)}` : 'AI Draft';
    }
    if (trigger === 'ai_fix') {
      if (options?.batchCount && options.batchCount > 1) {
        return `Applied ${options.batchCount} Audit Fixes`;
      }
      return cleanDetail ? `Audit Fix: ${truncate(cleanDetail)}` : 'Audit Fix';
    }
    return cleanDetail ? `AI Patch: ${truncate(cleanDetail)}` : 'AI Patch';
  }

  if (trigger === 'ai_draft') {
    return cleanDetail ? `Before AI Draft: ${truncate(cleanDetail)}` : 'Before AI Draft';
  }
  if (trigger === 'ai_fix') {
    if (options?.batchCount && options.batchCount > 1) {
      return `Before ${options.batchCount} Audit Fixes`;
    }
    return cleanDetail ? `Before Audit Fix: ${truncate(cleanDetail)}` : 'Before Audit Fix';
  }
  return cleanDetail ? `Before AI Patch: ${truncate(cleanDetail)}` : 'Before AI Patch';
}

/**
 * Computes line-level diff showing what changes will happen to `currentRawText`
 * if `snapshotRawText` is restored (`+` = restored lines, `-` = current lines replaced).
 */
export function computeRestoreDiff(
  currentRawText: string,
  snapshotRawText: string
): {
  lines: DiffLine[];
  added: number;
  removed: number;
  isIdentical: boolean;
} {
  if (currentRawText === snapshotRawText) {
    return {
      lines: [],
      added: 0,
      removed: 0,
      isIdentical: true,
    };
  }
  const diff = buildLineDiff(currentRawText, snapshotRawText);
  return {
    lines: diff.lines,
    added: diff.addedCount,
    removed: diff.removedCount,
    isIdentical: !diff.hasChanges,
  };
}

export interface DiffHunkLine {
  kind: 'context' | 'changed' | 'added' | 'removed';
  tokens: WordDiffToken[];
  lineNumber?: number;
  text: string;
}

export type DiffDisplayRow =
  | {
      kind: 'line';
      entry: DiffHunkLine;
      sourceIndex: number;
    }
  | {
      kind: 'omitted';
      id: string;
      count: number;
      lines: DiffHunkLine[];
      startIndex: number;
    };

/**
 * Pairs adjacent removed/added runs into single-line inline word diffs (matching
 * Live Mode patch previews), keeps `contextRadius` unchanged lines around each
 * edit, and folds multi-line unchanged stretches (2+ lines) into expandable
 * `omitted` markers.
 */
export function buildCompactDiffRows(
  lines: readonly DiffLine[],
  contextRadius: number = 2
): DiffDisplayRow[] {
  if (lines.length === 0) return [];

  const grouped: DiffHunkLine[] = [];
  let idx = 0;
  while (idx < lines.length) {
    const current = lines[idx];
    if (current.type === 'context') {
      grouped.push({
        kind: 'context',
        tokens: current.text.length > 0 ? [{type: 'equal', text: current.text}] : [],
        lineNumber: current.afterLineNumber ?? current.beforeLineNumber,
        text: current.text,
      });
      idx++;
      continue;
    }

    const removedRun: DiffLine[] = [];
    const addedRun: DiffLine[] = [];
    while (idx < lines.length && lines[idx].type !== 'context') {
      if (lines[idx].type === 'removed') {
        removedRun.push(lines[idx]);
      } else {
        addedRun.push(lines[idx]);
      }
      idx++;
    }

    const pairedCount = Math.min(removedRun.length, addedRun.length);
    for (let k = 0; k < pairedCount; k++) {
      const removedLine = removedRun[k];
      const addedLine = addedRun[k];
      grouped.push({
        kind: 'changed',
        tokens: diffWords(removedLine.text, addedLine.text),
        lineNumber: addedLine.afterLineNumber ?? removedLine.beforeLineNumber,
        text: addedLine.text,
      });
    }
    for (let k = pairedCount; k < removedRun.length; k++) {
      const removedLine = removedRun[k];
      grouped.push({
        kind: 'removed',
        tokens: removedLine.text.length > 0 ? [{type: 'removed', text: removedLine.text}] : [],
        lineNumber: removedLine.beforeLineNumber,
        text: removedLine.text,
      });
    }
    for (let k = pairedCount; k < addedRun.length; k++) {
      const addedLine = addedRun[k];
      grouped.push({
        kind: 'added',
        tokens: addedLine.text.length > 0 ? [{type: 'added', text: addedLine.text}] : [],
        lineNumber: addedLine.afterLineNumber,
        text: addedLine.text,
      });
    }
  }

  const total = grouped.length;
  const radius = Math.max(0, Math.floor(contextRadius));
  const visible = new Uint8Array(total);
  let hasChange = false;

  for (let i = 0; i < total; i++) {
    if (grouped[i].kind !== 'context') {
      hasChange = true;
      const start = Math.max(0, i - radius);
      const end = Math.min(total - 1, i + radius);
      for (let j = start; j <= end; j++) {
        visible[j] = 1;
      }
    }
  }

  if (!hasChange) {
    return grouped.map((entry, index) => ({
      kind: 'line',
      entry,
      sourceIndex: index,
    }));
  }

  const rows: DiffDisplayRow[] = [];
  let i = 0;
  while (i < total) {
    if (visible[i] === 1) {
      rows.push({
        kind: 'line',
        entry: grouped[i],
        sourceIndex: i,
      });
      i++;
      continue;
    }

    const start = i;
    while (i < total && visible[i] === 0) {
      i++;
    }
    const end = i - 1;
    const count = end - start + 1;

    // Showing 1 unchanged line directly avoids wasting a divider row for a single line.
    if (count === 1) {
      rows.push({
        kind: 'line',
        entry: grouped[start],
        sourceIndex: start,
      });
    } else {
      rows.push({
        kind: 'omitted',
        id: `omitted-${start}-${end}`,
        count,
        lines: grouped.slice(start, end + 1),
        startIndex: start,
      });
    }
  }

  return rows;
}

/**
 * Formats a compact, human-readable timestamp for snapshot rows.
 * Accepts an injectable `nowMs` for deterministic unit testing.
 */
export function formatSnapshotTimestamp(timestamp: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(timestamp)) return '';
  const deltaMs = Math.max(0, nowMs - timestamp);
  const minuteMs = 60_000;
  const hourMs = 3_600_000;
  const dayMs = 86_400_000;

  if (deltaMs < minuteMs) return 'Just now';
  if (deltaMs < hourMs) {
    const mins = Math.floor(deltaMs / minuteMs);
    return `${mins}m ago`;
  }
  if (deltaMs < dayMs) {
    const hrs = Math.floor(deltaMs / hourMs);
    return `${hrs}h ago`;
  }

  const date = new Date(timestamp);
  const now = new Date(nowMs);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = months[date.getMonth()] ?? '';
  const dayNum = date.getDate();

  if (date.getFullYear() === now.getFullYear()) {
    return `${monthLabel} ${dayNum} · ${hh}:${mm}`;
  }
  return `${monthLabel} ${dayNum}, ${date.getFullYear()}`;
}
