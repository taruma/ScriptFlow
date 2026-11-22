import {parseAuteurScript, type MacroBlockKind} from '../core/index.ts';
import type {BundledExample} from '../data/examples/index.ts';
import type {ScriptRecord} from './scriptLibraryDb.ts';

export interface ActiveScriptRef {
  kind: 'custom' | 'example';
  id: string;
}

export type LibraryFilterTab = 'all' | 'custom' | 'examples';

export type LibrarySortBy = 'recent' | 'title' | 'beats';

export interface LibraryQueryOptions {
  sortBy?: LibrarySortBy;
  folder?: string | null;
  tag?: string | null;
}

export type LibraryRowItem =
  | {
      kind: 'custom';
      id: string;
      title: string;
      rawText: string;
      createdAt: number;
      updatedAt: number;
      forkedFromId?: string;
      pinned?: boolean;
      folder?: string;
      tags?: string[];
      matchSnippet?: string;
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
      matchSnippet?: string;
      example: BundledExample;
    };

export interface LibraryFacets {
  folders: string[];
  tags: string[];
  pinnedCount: number;
}

export interface LibraryPreviewStagingBlock {
  name: string;
  kind: MacroBlockKind;
  excerpt: string;
  lineCount: number;
}

export interface LibraryPreviewBeat {
  index: number;
  raw: string;
}

export interface LibraryScriptPreview {
  stagingBlocks: LibraryPreviewStagingBlock[];
  leadSummary: string;
  beatCount: number;
  previewBeats: LibraryPreviewBeat[];
  remainingBeatCount: number;
}

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
 * Extracts a compact single-line excerpt centered around the first body match of normalizedQuery.
 */
export function extractBodyMatchSnippet(rawText: string, normalizedQuery: string): string | undefined {
  if (!rawText || !normalizedQuery) return undefined;
  const lower = rawText.toLowerCase();
  const matchIdx = lower.indexOf(normalizedQuery);
  if (matchIdx === -1) return undefined;

  const lineStart = rawText.lastIndexOf('\n', matchIdx);
  const lineEnd = rawText.indexOf('\n', matchIdx + normalizedQuery.length);
  const rawLine = rawText
    .slice(lineStart === -1 ? 0 : lineStart + 1, lineEnd === -1 ? rawText.length : lineEnd)
    .replace(/\s+/g, ' ')
    .trim();

  if (rawLine.length <= 96) {
    return rawLine;
  }

  const lineLower = rawLine.toLowerCase();
  const localIdx = Math.max(0, lineLower.indexOf(normalizedQuery));
  const windowStart = Math.max(0, localIdx - 32);
  const windowEnd = Math.min(rawLine.length, windowStart + 92);
  const prefix = windowStart > 0 ? '…' : '';
  const suffix = windowEnd < rawLine.length ? '…' : '';
  return `${prefix}${rawLine.slice(windowStart, windowEnd).trim()}${suffix}`;
}

/**
 * Collects unique folders, tags, and pinned count from custom scripts for quiet filter facets.
 */
export function collectLibraryFacets(customScripts: readonly ScriptRecord[]): LibraryFacets {
  const folderMap = new Map<string, string>();
  const tagSet = new Set<string>();
  let pinnedCount = 0;

  for (const record of customScripts) {
    if (record.pinned) pinnedCount += 1;
    if (record.folder) {
      const clean = record.folder.trim();
      const key = clean.toLowerCase();
      if (clean.length > 0 && !folderMap.has(key)) {
        folderMap.set(key, clean);
      }
    }
    if (record.tags) {
      for (const tag of record.tags) {
        const clean = tag.trim().toLowerCase();
        if (clean.length > 0) tagSet.add(clean);
      }
    }
  }

  return {
    folders: Array.from(folderMap.values()).sort((a, b) => a.localeCompare(b)),
    tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
    pinnedCount,
  };
}

/**
 * Filters and orders library rows across titles, folders, tags, example metadata, and full script bodies.
 * Pinned custom scripts float to the top; supports recent, alphabetical (title), and beat-count sorting.
 */
export function buildLibraryRows(
  customScripts: readonly ScriptRecord[],
  examples: readonly BundledExample[],
  filter: LibraryFilterTab,
  query: string,
  options: LibraryQueryOptions = {}
): LibraryRowItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  const sortBy: LibrarySortBy = options.sortBy ?? 'recent';
  const folderFilter = options.folder ? options.folder.trim().toLowerCase() : null;
  const tagFilter = options.tag ? options.tag.trim().toLowerCase() : null;
  const hasCustomFacetFilter = folderFilter !== null || tagFilter !== null;

  const customRows: Extract<LibraryRowItem, {kind: 'custom'}>[] = [];
  const exampleRows: Extract<LibraryRowItem, {kind: 'example'}>[] = [];

  if (filter === 'all' || filter === 'custom') {
    for (const record of customScripts) {
      if (folderFilter !== null && (record.folder?.trim().toLowerCase() ?? '') !== folderFilter) {
        continue;
      }
      if (
        tagFilter !== null &&
        !(record.tags?.some((t) => t.trim().toLowerCase() === tagFilter) ?? false)
      ) {
        continue;
      }

      let matchSnippet: string | undefined;
      if (normalizedQuery.length > 0) {
        const titleMatch = record.title.toLowerCase().includes(normalizedQuery);
        const folderMatch = record.folder?.toLowerCase().includes(normalizedQuery) ?? false;
        const tagMatch = record.tags?.some((t) => t.toLowerCase().includes(normalizedQuery)) ?? false;

        if (!titleMatch && !folderMatch && !tagMatch) {
          matchSnippet = extractBodyMatchSnippet(record.rawText, normalizedQuery);
          if (!matchSnippet) continue;
        }
      }

      customRows.push({
        kind: 'custom',
        id: record.id,
        title: record.title,
        rawText: record.rawText,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.forkedFromId ? {forkedFromId: record.forkedFromId} : {}),
        ...(record.pinned ? {pinned: true} : {}),
        ...(record.folder ? {folder: record.folder} : {}),
        ...(record.tags && record.tags.length > 0 ? {tags: record.tags} : {}),
        ...(matchSnippet ? {matchSnippet} : {}),
        record,
      });
    }
  }

  if ((filter === 'all' || filter === 'examples') && !hasCustomFacetFilter) {
    for (const example of examples) {
      let matchSnippet: string | undefined;
      if (normalizedQuery.length > 0) {
        const metaMatch =
          example.title.toLowerCase().includes(normalizedQuery) ||
          example.topology.toLowerCase().includes(normalizedQuery) ||
          (example.category?.toLowerCase().includes(normalizedQuery) ?? false) ||
          example.summary.toLowerCase().includes(normalizedQuery);
        if (!metaMatch) {
          matchSnippet = extractBodyMatchSnippet(example.content, normalizedQuery);
          if (!matchSnippet) continue;
        }
      }

      exampleRows.push({
        kind: 'example',
        id: example.id,
        title: example.title,
        topology: example.topology,
        summary: example.summary,
        ...(example.category ? {category: example.category} : {}),
        rawText: example.content,
        ...(matchSnippet ? {matchSnippet} : {}),
        example,
      });
    }
  }

  const beatCountCache = sortBy === 'beats' ? new Map<string, number>() : null;
  const getBeats = (row: LibraryRowItem): number => {
    if (!beatCountCache) return 0;
    const key = `${row.kind}:${row.id}`;
    const cached = beatCountCache.get(key);
    if (cached !== undefined) return cached;
    const count = countExecutionBeatsFast(row.rawText);
    beatCountCache.set(key, count);
    return count;
  };

  customRows.sort((a, b) => {
    const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;

    if (sortBy === 'title') {
      return a.title.localeCompare(b.title) || b.updatedAt - a.updatedAt;
    }
    if (sortBy === 'beats') {
      return getBeats(b) - getBeats(a) || b.updatedAt - a.updatedAt;
    }
    return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
  });

  if (sortBy === 'title') {
    exampleRows.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'beats') {
    exampleRows.sort((a, b) => getBeats(b) - getBeats(a) || a.title.localeCompare(b.title));
  }

  return [...customRows, ...exampleRows];
}

/**
 * Extracts a structured editorial preview for a single selected script.
 * Intended strictly for the active preview pane (never called across the full list).
 */
export function extractLibraryScriptPreview(rawText: string, maxBeats = 6): LibraryScriptPreview {
  const doc = parseAuteurScript(rawText);

  const stagingBlocks: LibraryPreviewStagingBlock[] = doc.stagingBlocks.map((block) => {
    const nonEmptyLines = block.lines.map((line) => line.trim()).filter((line) => line.length > 0);
    const joined = nonEmptyLines.slice(0, 2).join(' · ');
    const excerpt = joined.length > 180 ? `${joined.slice(0, 177).trimEnd()}…` : joined;
    return {
      name: block.name,
      kind: block.kind,
      excerpt,
      lineCount: nonEmptyLines.length,
    };
  });

  const leadBlock =
    stagingBlocks.find((b) => b.kind === 'INTENT' && b.excerpt.length > 0) ??
    stagingBlocks.find((b) => b.kind === 'OPENING' && b.excerpt.length > 0) ??
    stagingBlocks.find((b) => b.excerpt.length > 0);

  const allBeats = doc.execution?.beats ?? [];
  const safeMax = Math.max(1, maxBeats);
  const previewBeats: LibraryPreviewBeat[] = allBeats.slice(0, safeMax).map((beat) => ({
    index: beat.index,
    raw: beat.raw,
  }));

  return {
    stagingBlocks,
    leadSummary: leadBlock?.excerpt ?? '',
    beatCount: allBeats.length,
    previewBeats,
    remainingBeatCount: Math.max(0, allBeats.length - previewBeats.length),
  };
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

export interface DuplicatedScriptBuildInput {
  id: string;
  sourceId: string;
  sourceTitle: string;
  rawText: string;
  existingTitles: ReadonlySet<string>;
  now: number;
  folder?: string;
  tags?: readonly string[];
}

/**
 * Pure builder for duplicating either a custom script or read-only example into My Scripts,
 * preserving folder/tags and generating a collision-free "(Copy)" title.
 */
export function buildDuplicatedScriptRecord({
  id,
  sourceId,
  sourceTitle,
  rawText,
  existingTitles,
  now,
  folder,
  tags,
}: DuplicatedScriptBuildInput): ScriptRecord {
  const title = createCopyTitle(sourceTitle, existingTitles, 'Copy');
  return {
    id,
    title,
    rawText,
    createdAt: now,
    updatedAt: now,
    forkedFromId: sourceId,
    ...(folder ? {folder} : {}),
    ...(tags && tags.length > 0 ? {tags: [...tags]} : {}),
  };
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
