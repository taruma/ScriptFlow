import {
  normalizeLineEndings,
  projectAuteurPatchPreview,
  type AuditLens,
} from '../core/index.ts';
import type {PatchSuggestion} from '../services/scriptTools.ts';
import {isSuggestionStale, type AiChatMessage} from './aiAssistant.ts';

export interface ActiveAiPatchItem {
  id: string;
  sourceKind: 'patch' | 'audit_fix';
  summary: string;
  lens?: AuditLens;
  issueMessage?: string;
  suggestion: PatchSuggestion;
}

export interface WordDiffToken {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

export interface WordDiffLine {
  kind: 'context' | 'changed' | 'added' | 'removed' | 'omitted';
  tokens: WordDiffToken[];
  omittedCount?: number;
}

export interface LiveBlockPatchIndicator {
  patchId: string;
  sourceKind: 'patch' | 'audit_fix';
  summary: string;
  lens?: AuditLens;
  issueMessage?: string;
  kind: 'modify' | 'delete';
  blockIndex: number;
  header: string;
  afterHeader?: string;
  lines: WordDiffLine[];
}

export interface LiveBeatPatchIndicator {
  patchId: string;
  sourceKind: 'patch' | 'audit_fix';
  summary: string;
  lens?: AuditLens;
  issueMessage?: string;
  kind: 'modify' | 'delete' | 'reorder';
  beatIndex: number;
  movedToBeatIndex?: number;
  tokens: WordDiffToken[];
}

export interface LiveInsertionPatchIndicator {
  patchId: string;
  sourceKind: 'patch' | 'audit_fix';
  summary: string;
  lens?: AuditLens;
  issueMessage?: string;
  phase: 'staging' | 'execution';
  /** Staging: `-1` before MB0, `k` after MB<k>. Execution: `0` before S1, `k` after S<k>. */
  afterIndex: number;
  /** Staging header name (e.g. "AESTHETIC"), omitted for Execution. */
  header?: string;
  /** Execution 1-based post-patch Macro-State number, omitted for Staging. */
  insertedBeatIndex?: number;
  content: string;
}

export interface LivePatchIndicatorMaps {
  stagingByBlockIndex: Map<number, LiveBlockPatchIndicator[]>;
  stagingInsertionsByAfterIndex: Map<number, LiveInsertionPatchIndicator[]>;
  executionByBeatIndex: Map<number, LiveBeatPatchIndicator[]>;
  executionInsertionsByAfterBeatIndex: Map<number, LiveInsertionPatchIndicator[]>;
}

const MAX_WORD_LCS_CELLS = 100_000;
const MAX_LINE_LCS_CELLS = 50_000;

function tokenizeWords(text: string): string[] {
  if (text.length === 0) return [];
  return text.match(/\n|[^\S\n]+|[\p{L}\p{N}_@'-]+|[^\s\p{L}\p{N}_@'-]+/gu) ?? [text];
}

function coalesceTokens(rawTokens: WordDiffToken[]): WordDiffToken[] {
  const merged: WordDiffToken[] = [];
  for (const token of rawTokens) {
    if (token.text.length === 0) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.type === token.type) {
      prev.text += token.text;
    } else {
      merged.push({type: token.type, text: token.text});
    }
  }

  // Smooth choppy `[removed][added][space][removed][added]` spans into a single
  // readable `[removed phrase][added phrase]` pair when bridged only by spaces.
  const result: WordDiffToken[] = [];
  let i = 0;
  while (i < merged.length) {
    if (merged[i].type === 'equal') {
      result.push(merged[i]);
      i++;
      continue;
    }

    let j = i;
    let hasBridge = false;
    while (j < merged.length) {
      if (merged[j].type !== 'equal') {
        j++;
        continue;
      }
      const isHorizontalSpace = /^[^\S\n]+$/.test(merged[j].text);
      if (isHorizontalSpace && j + 1 < merged.length && merged[j + 1].type !== 'equal') {
        hasBridge = true;
        j++;
        continue;
      }
      break;
    }

    if (!hasBridge) {
      for (let k = i; k < j; k++) {
        result.push(merged[k]);
      }
    } else {
      let removedText = '';
      let addedText = '';
      for (let k = i; k < j; k++) {
        const tok = merged[k];
        if (tok.type === 'removed') {
          removedText += tok.text;
        } else if (tok.type === 'added') {
          addedText += tok.text;
        } else {
          removedText += tok.text;
          addedText += tok.text;
        }
      }
      if (removedText.length > 0) {
        result.push({type: 'removed', text: removedText});
      }
      if (addedText.length > 0) {
        result.push({type: 'added', text: addedText});
      }
    }

    i = j;
  }

  return result;
}

/**
 * Deterministic word-level diff preserving exact whitespace and punctuation.
 * Uses prefix/suffix trimming + bounded DP LCS so popover rendering stays instant.
 */
export function diffWords(before: string, after: string): WordDiffToken[] {
  if (before === after) {
    return before.length > 0 ? [{type: 'equal', text: before}] : [];
  }

  const a = tokenizeWords(before);
  const b = tokenizeWords(after);

  let prefixLen = 0;
  const minLen = Math.min(a.length, b.length);
  while (prefixLen < minLen && a[prefixLen] === b[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    a[a.length - 1 - suffixLen] === b[b.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const midA = a.slice(prefixLen, a.length - suffixLen);
  const midB = b.slice(prefixLen, b.length - suffixLen);

  const tokens: WordDiffToken[] = [];
  if (prefixLen > 0) {
    tokens.push({type: 'equal', text: a.slice(0, prefixLen).join('')});
  }

  const m = midA.length;
  const n = midB.length;

  if (m === 0 && n > 0) {
    tokens.push({type: 'added', text: midB.join('')});
  } else if (n === 0 && m > 0) {
    tokens.push({type: 'removed', text: midA.join('')});
  } else if (m > 0 && n > 0) {
    if (m * n > MAX_WORD_LCS_CELLS) {
      tokens.push({type: 'removed', text: midA.join('')});
      tokens.push({type: 'added', text: midB.join('')});
    } else {
      const cols = n + 1;
      const dp = new Uint32Array((m + 1) * cols);

      for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
          if (midA[i] === midB[j]) {
            dp[i * cols + j] = dp[(i + 1) * cols + (j + 1)] + 1;
          } else {
            const down = dp[(i + 1) * cols + j];
            const right = dp[i * cols + (j + 1)];
            dp[i * cols + j] = down >= right ? down : right;
          }
        }
      }

      let i = 0;
      let j = 0;
      while (i < m && j < n) {
        if (midA[i] === midB[j]) {
          tokens.push({type: 'equal', text: midA[i]});
          i++;
          j++;
        } else if (dp[(i + 1) * cols + j] >= dp[i * cols + (j + 1)]) {
          tokens.push({type: 'removed', text: midA[i]});
          i++;
        } else {
          tokens.push({type: 'added', text: midB[j]});
          j++;
        }
      }
      while (i < m) {
        tokens.push({type: 'removed', text: midA[i++]});
      }
      while (j < n) {
        tokens.push({type: 'added', text: midB[j++]});
      }
    }
  }

  if (suffixLen > 0) {
    tokens.push({type: 'equal', text: a.slice(a.length - suffixLen).join('')});
  }

  return coalesceTokens(tokens);
}

interface RawLineOp {
  type: 'equal' | 'removed' | 'added';
  text: string;
}

function diffLinesRaw(beforeLines: string[], afterLines: string[]): RawLineOp[] {
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

  const ops: RawLineOp[] = [];
  for (let i = 0; i < prefixLen; i++) {
    ops.push({type: 'equal', text: beforeLines[i]});
  }

  const midA = beforeLines.slice(prefixLen, beforeLines.length - suffixLen);
  const midB = afterLines.slice(prefixLen, afterLines.length - suffixLen);
  const m = midA.length;
  const n = midB.length;

  if (m * n > MAX_LINE_LCS_CELLS) {
    for (const line of midA) ops.push({type: 'removed', text: line});
    for (const line of midB) ops.push({type: 'added', text: line});
  } else if (m > 0 || n > 0) {
    const cols = n + 1;
    const dp = new Uint32Array((m + 1) * cols);

    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          dp[i * cols + j] = dp[(i + 1) * cols + (j + 1)] + 1;
        } else {
          const down = dp[(i + 1) * cols + j];
          const right = dp[i * cols + (j + 1)];
          dp[i * cols + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        ops.push({type: 'equal', text: midA[i]});
        i++;
        j++;
      } else if (dp[(i + 1) * cols + j] >= dp[i * cols + (j + 1)]) {
        ops.push({type: 'removed', text: midA[i]});
        i++;
      } else {
        ops.push({type: 'added', text: midB[j]});
        j++;
      }
    }
    while (i < m) ops.push({type: 'removed', text: midA[i++]});
    while (j < n) ops.push({type: 'added', text: midB[j++]});
  }

  for (let i = beforeLines.length - suffixLen; i < beforeLines.length; i++) {
    ops.push({type: 'equal', text: beforeLines[i]});
  }

  return ops;
}

/**
 * Builds compact line-grouped word diffs for multi-line Staging Macro-Block bodies,
 * pairing adjacent removed/added lines for inline word highlighting and collapsing
 * long unchanged context runs so hover popovers stay concise.
 */
export function buildMultiLineWordDiff(beforeBody: string, afterBody: string): WordDiffLine[] {
  const beforeNorm = normalizeLineEndings(beforeBody);
  const afterNorm = normalizeLineEndings(afterBody);
  const beforeLines = beforeNorm.length === 0 ? [] : beforeNorm.split('\n');
  const afterLines = afterNorm.length === 0 ? [] : afterNorm.split('\n');

  const rawOps = diffLinesRaw(beforeLines, afterLines);
  const fullLines: WordDiffLine[] = [];

  let idx = 0;
  while (idx < rawOps.length) {
    if (rawOps[idx].type === 'equal') {
      fullLines.push({
        kind: 'context',
        tokens: rawOps[idx].text.length > 0 ? [{type: 'equal', text: rawOps[idx].text}] : [],
      });
      idx++;
      continue;
    }

    const removedRun: string[] = [];
    const addedRun: string[] = [];
    while (idx < rawOps.length && rawOps[idx].type !== 'equal') {
      if (rawOps[idx].type === 'removed') {
        removedRun.push(rawOps[idx].text);
      } else {
        addedRun.push(rawOps[idx].text);
      }
      idx++;
    }

    const pairedCount = Math.min(removedRun.length, addedRun.length);
    for (let k = 0; k < pairedCount; k++) {
      fullLines.push({
        kind: 'changed',
        tokens: diffWords(removedRun[k], addedRun[k]),
      });
    }
    for (let k = pairedCount; k < removedRun.length; k++) {
      fullLines.push({
        kind: 'removed',
        tokens: removedRun[k].length > 0 ? [{type: 'removed', text: removedRun[k]}] : [],
      });
    }
    for (let k = pairedCount; k < addedRun.length; k++) {
      fullLines.push({
        kind: 'added',
        tokens: addedRun[k].length > 0 ? [{type: 'added', text: addedRun[k]}] : [],
      });
    }
  }

  // Keep short blocks intact; collapse long runs of unchanged context to 1 neighboring line
  if (fullLines.length <= 5) {
    return fullLines;
  }

  const keep = new Array<boolean>(fullLines.length).fill(false);
  for (let i = 0; i < fullLines.length; i++) {
    if (fullLines[i].kind !== 'context') {
      keep[i] = true;
      if (i > 0) keep[i - 1] = true;
      if (i + 1 < fullLines.length) keep[i + 1] = true;
    }
  }

  const compacted: WordDiffLine[] = [];
  let i = 0;
  while (i < fullLines.length) {
    if (keep[i]) {
      compacted.push(fullLines[i]);
      i++;
    } else {
      let count = 0;
      while (i < fullLines.length && !keep[i]) {
        count++;
        i++;
      }
      compacted.push({kind: 'omitted', tokens: [], omittedCount: count});
    }
  }

  return compacted;
}

/**
 * Extracts all currently active (unapplied, undismissed, non-stale) AI patches
 * from the in-memory assistant thread — covering both standalone Refine patches
 * and embedded Audit Review issue fixes.
 */
export function collectActiveAiPatches(
  messages: readonly AiChatMessage[],
  currentSnapshotHash: string
): ActiveAiPatchItem[] {
  const active: ActiveAiPatchItem[] = [];
  const seenIds = new Set<string>();

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.suggestions || msg.suggestions.length === 0) {
      continue;
    }

    const applied = new Set(msg.appliedSuggestionIds ?? []);
    const dismissed = new Set(msg.dismissedSuggestionIds ?? []);

    for (const suggestion of msg.suggestions) {
      if (suggestion.kind === 'patch') {
        if (
          seenIds.has(suggestion.id) ||
          applied.has(suggestion.id) ||
          dismissed.has(suggestion.id) ||
          isSuggestionStale(suggestion.baseSnapshotHash, currentSnapshotHash)
        ) {
          continue;
        }
        seenIds.add(suggestion.id);
        active.push({
          id: suggestion.id,
          sourceKind: 'patch',
          summary: suggestion.summary,
          suggestion,
        });
      } else if (suggestion.kind === 'audit_review') {
        for (const issue of suggestion.issues) {
          const patch = issue.patchSuggestion;
          if (
            !patch ||
            seenIds.has(patch.id) ||
            applied.has(patch.id) ||
            dismissed.has(patch.id) ||
            isSuggestionStale(patch.baseSnapshotHash, currentSnapshotHash)
          ) {
            continue;
          }
          seenIds.add(patch.id);
          active.push({
            id: patch.id,
            sourceKind: 'audit_fix',
            summary: patch.summary,
            lens: issue.lens,
            issueMessage: issue.message,
            suggestion: patch,
          });
        }
      }
    }
  }

  return active;
}

function pushToMap<T>(map: Map<number, T[]>, key: number, value: T): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

/**
 * Projects all active non-stale AI patches onto indexed maps consumed by
 * StagingPane and ExecutionPane. Returns empty maps in O(1) when no patches are active.
 */
export function buildLivePatchIndicators(
  rawText: string,
  activePatches: readonly ActiveAiPatchItem[]
): LivePatchIndicatorMaps {
  const stagingByBlockIndex = new Map<number, LiveBlockPatchIndicator[]>();
  const stagingInsertionsByAfterIndex = new Map<number, LiveInsertionPatchIndicator[]>();
  const executionByBeatIndex = new Map<number, LiveBeatPatchIndicator[]>();
  const executionInsertionsByAfterBeatIndex = new Map<number, LiveInsertionPatchIndicator[]>();

  if (activePatches.length === 0) {
    return {
      stagingByBlockIndex,
      stagingInsertionsByAfterIndex,
      executionByBeatIndex,
      executionInsertionsByAfterBeatIndex,
    };
  }

  for (const item of activePatches) {
    const projection = projectAuteurPatchPreview(rawText, item.suggestion.patch);
    if (!projection) continue;

    for (const change of projection.stagingChanges) {
      const lines: WordDiffLine[] =
        change.kind === 'delete'
          ? normalizeLineEndings(change.beforeBody)
              .split('\n')
              .map((line) => ({
                kind: 'removed' as const,
                tokens: line.length > 0 ? [{type: 'removed' as const, text: line}] : [],
              }))
          : buildMultiLineWordDiff(change.beforeBody, change.afterBody ?? '');

      pushToMap(stagingByBlockIndex, change.blockIndex, {
        patchId: item.id,
        sourceKind: item.sourceKind,
        summary: item.summary,
        lens: item.lens,
        issueMessage: item.issueMessage,
        kind: change.kind,
        blockIndex: change.blockIndex,
        header: change.header,
        afterHeader: change.afterHeader,
        lines,
      });
    }

    for (const ins of projection.stagingInsertions) {
      pushToMap(stagingInsertionsByAfterIndex, ins.afterBlockIndex, {
        patchId: item.id,
        sourceKind: item.sourceKind,
        summary: item.summary,
        lens: item.lens,
        issueMessage: item.issueMessage,
        phase: 'staging',
        afterIndex: ins.afterBlockIndex,
        header: ins.header,
        content: ins.body,
      });
    }

    for (const change of projection.executionChanges) {
      const tokens: WordDiffToken[] =
        change.kind === 'delete'
          ? [{type: 'removed', text: change.beforeText}]
          : change.kind === 'reorder'
            ? [{type: 'equal', text: change.beforeText}]
            : diffWords(change.beforeText, change.afterText ?? '');

      pushToMap(executionByBeatIndex, change.beatIndex, {
        patchId: item.id,
        sourceKind: item.sourceKind,
        summary: item.summary,
        lens: item.lens,
        issueMessage: item.issueMessage,
        kind: change.kind,
        beatIndex: change.beatIndex,
        movedToBeatIndex: change.movedToBeatIndex,
        tokens,
      });
    }

    for (const ins of projection.executionInsertions) {
      pushToMap(executionInsertionsByAfterBeatIndex, ins.afterBeatIndex, {
        patchId: item.id,
        sourceKind: item.sourceKind,
        summary: item.summary,
        lens: item.lens,
        issueMessage: item.issueMessage,
        phase: 'execution',
        afterIndex: ins.afterBeatIndex,
        insertedBeatIndex: ins.insertedBeatIndex,
        content: ins.text,
      });
    }
  }

  return {
    stagingByBlockIndex,
    stagingInsertionsByAfterIndex,
    executionByBeatIndex,
    executionInsertionsByAfterBeatIndex,
  };
}
