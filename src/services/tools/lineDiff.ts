import {normalizeLineEndings} from '../../core/index.ts';

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
