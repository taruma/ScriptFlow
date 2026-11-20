import type {BundledExample} from '../data/examples/index.ts';
import type {ScriptRecord} from './scriptLibraryDb.ts';

export type LibraryFilterTab = 'all' | 'custom' | 'examples';

export type LibraryRowItem =
  | {
      kind: 'custom';
      id: string;
      title: string;
      rawText: string;
      createdAt: number;
      updatedAt: number;
      forkedFromId?: string;
      record: ScriptRecord;
    }
  | {
      kind: 'example';
      id: string;
      title: string;
      topology: string;
      summary: string;
      category?: string;
      rawText: string;
      example: BundledExample;
    };

export const LIBRARY_PAGE_SIZE = 50;

const EXECUTION_HEADER_LINE_REGEX = /^\s*\[(?:EXECUTION|TIMELINE|BEATS|SHOTLIST)\]\s*$/i;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Lightweight O(n) execution beat counter that avoids full AST construction.
 * Scans directly for the Phase 2 Execution header and counts non-empty beat lines beneath it.
 */
export function countExecutionBeatsFast(rawText: string): number {
  if (!rawText) return 0;

  let inExecution = false;
  let count = 0;
  let start = 0;
  const len = rawText.length;

  while (start <= len) {
    let end = rawText.indexOf('\n', start);
    if (end === -1) end = len;
    const line = rawText.slice(start, end);

    if (!inExecution) {
      if (EXECUTION_HEADER_LINE_REGEX.test(line)) {
        inExecution = true;
      }
    } else if (line.trim().length > 0) {
      count += 1;
    }

    if (end === len) break;
    start = end + 1;
  }

  return count;
}

/**
 * Formats a compact human-readable relative updated timestamp (pure & clock-injectable).
 */
export function formatRelativeUpdatedTime(timestampMs: number, nowMs = Date.now()): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return '';
  const diffMs = Math.max(0, nowMs - timestampMs);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  const date = new Date(timestampMs);
  const nowDate = new Date(nowMs);
  const month = MONTH_SHORT[date.getMonth()] ?? '';
  const day = date.getDate();

  if (date.getFullYear() === nowDate.getFullYear()) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${date.getFullYear()}`;
}

/**
 * Filters and orders library rows without parsing script bodies or ASTs,
 * keeping search instant even across 1,000+ stored scripts.
 */
export function buildLibraryRows(
  customScripts: readonly ScriptRecord[],
  examples: readonly BundledExample[],
  filter: LibraryFilterTab,
  query: string
): LibraryRowItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  const rows: LibraryRowItem[] = [];

  if (filter === 'all' || filter === 'custom') {
    for (const record of customScripts) {
      if (normalizedQuery.length > 0 && !record.title.toLowerCase().includes(normalizedQuery)) {
        continue;
      }
      rows.push({
        kind: 'custom',
        id: record.id,
        title: record.title,
        rawText: record.rawText,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.forkedFromId ? {forkedFromId: record.forkedFromId} : {}),
        record,
      });
    }
  }

  if (filter === 'all' || filter === 'examples') {
    for (const example of examples) {
      if (normalizedQuery.length > 0) {
        const matches =
          example.title.toLowerCase().includes(normalizedQuery) ||
          example.topology.toLowerCase().includes(normalizedQuery) ||
          (example.category?.toLowerCase().includes(normalizedQuery) ?? false) ||
          example.summary.toLowerCase().includes(normalizedQuery);
        if (!matches) continue;
      }
      rows.push({
        kind: 'example',
        id: example.id,
        title: example.title,
        topology: example.topology,
        summary: example.summary,
        ...(example.category ? {category: example.category} : {}),
        rawText: example.content,
        example,
      });
    }
  }

  return rows;
}

export interface PaginatedLibraryRows {
  visible: LibraryRowItem[];
  remainingCount: number;
  hasMore: boolean;
}

export function paginateLibraryRows(
  rows: readonly LibraryRowItem[],
  visibleLimit: number
): PaginatedLibraryRows {
  const safeLimit = Math.max(1, visibleLimit);
  if (rows.length <= safeLimit) {
    return {
      visible: rows as LibraryRowItem[],
      remainingCount: 0,
      hasMore: false,
    };
  }
  return {
    visible: rows.slice(0, safeLimit),
    remainingCount: rows.length - safeLimit,
    hasMore: true,
  };
}

/**
 * Produces a clean, non-colliding copy/fork title (e.g. "Scene (Copy)", "Scene (Copy 2)").
 */
export function createCopyTitle(
  baseTitle: string,
  existingTitles: ReadonlySet<string>,
  suffix = 'Copy'
): string {
  const trimmed = baseTitle.trim() || 'Untitled Scene';
  const normalizedSet = new Set<string>();
  for (const title of existingTitles) {
    normalizedSet.add(title.trim().toLowerCase());
  }

  if (!normalizedSet.has(trimmed.toLowerCase())) {
    return trimmed;
  }

  const firstCandidate = `${trimmed} (${suffix})`;
  if (!normalizedSet.has(firstCandidate.toLowerCase())) {
    return firstCandidate;
  }

  let index = 2;
  while (normalizedSet.has(`${trimmed} (${suffix} ${index})`.toLowerCase())) {
    index += 1;
  }
  return `${trimmed} (${suffix} ${index})`;
}

/**
 * Pure keyboard selection stepper for the searchable Library list.
 */
export function stepLibrarySelectionIndex(
  currentIndex: number,
  delta: 1 | -1,
  totalCount: number
): number {
  if (totalCount <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= totalCount) {
    return delta > 0 ? 0 : totalCount - 1;
  }
  return (currentIndex + delta + totalCount) % totalCount;
}
