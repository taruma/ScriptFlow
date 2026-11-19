/**
 * Pure, zero-React document-level Undo / Redo history engine over canonical `rawText`.
 *
 * Supports two commit semantics:
 * - `'coalesce'`: rapid sequential typing within a time window and edit scope (`groupKey`)
 *   updates `present` in place while keeping the pre-burst snapshot at the top of `past`.
 *   Bulk single-step edits (e.g. pastes or large deletions) automatically promote to checkpoints.
 * - `'checkpoint'`: structural actions (splits, merges, insertions, deletions, drag-reorders,
 *   preset switches, paste-hydrate, Debug Patch commits) immediately push `present` onto `past`
 *   and close any open coalescing window.
 */

export type HistoryCommitMode = 'coalesce' | 'checkpoint';

export interface DocumentHistoryState {
  readonly past: readonly string[];
  readonly present: string;
  readonly future: readonly string[];
  readonly lastCommitMode: HistoryCommitMode | null;
  readonly lastGroupKey: string | null;
  readonly lastCommitAt: number | null;
  /**
   * Monotonic counter incremented exclusively when `undoDocumentHistory` or
   * `redoDocumentHistory` transitions `present`. UI editors subscribe to this
   * revision so even actively focused Live Mode drafts immediately resync.
   */
  readonly revision: number;
}

export interface HistoryCommitOptions {
  mode?: HistoryCommitMode;
  /** Logical edit scope (e.g. `'source'`, `'staging:0'`, `'beat:1:step:0'`). */
  groupKey?: string | null;
  /** Caller-supplied timestamp in ms (injected to keep `src/core/` 100% pure & deterministic). */
  timestamp?: number | null;
  /** Max elapsed ms between consecutive typing commits to coalesce into one undo burst. */
  coalesceWindowMs?: number;
  /** Max absolute character-length delta eligible for coalescing before auto-checkpointing. */
  maxCoalesceDeltaChars?: number;
  /** Maximum number of undo snapshots retained in `past`. */
  maxEntries?: number;
}

export const DEFAULT_HISTORY_COALESCE_WINDOW_MS = 800;
export const DEFAULT_HISTORY_MAX_COALESCE_DELTA = 32;
export const DEFAULT_MAX_HISTORY_ENTRIES = 100;

export function createDocumentHistory(initialPresent: string): DocumentHistoryState {
  return {
    past: [],
    present: initialPresent,
    future: [],
    lastCommitMode: null,
    lastGroupKey: null,
    lastCommitAt: null,
    revision: 0,
  };
}

export function canUndoDocument(state: DocumentHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedoDocument(state: DocumentHistoryState): boolean {
  return state.future.length > 0;
}

/**
 * Closes any open typing coalescing window without altering `past`, `present`, or `future`.
 * Useful when switching editor views or leaving an editing session.
 */
export function breakHistoryCoalescing(state: DocumentHistoryState): DocumentHistoryState {
  if (
    state.lastCommitMode === null &&
    state.lastGroupKey === null &&
    state.lastCommitAt === null
  ) {
    return state;
  }
  return {
    ...state,
    lastCommitMode: null,
    lastGroupKey: null,
    lastCommitAt: null,
  };
}

/**
 * Commits a new canonical `rawText` snapshot into document history.
 * Returns the exact input reference when `nextPresent === state.present`.
 */
export function commitDocumentHistory(
  state: DocumentHistoryState,
  nextPresent: string,
  options: HistoryCommitOptions = {}
): DocumentHistoryState {
  if (nextPresent === state.present) {
    return state;
  }

  const requestedMode: HistoryCommitMode = options.mode ?? 'checkpoint';
  const groupKey = options.groupKey ?? null;
  const timestamp = options.timestamp ?? null;
  const coalesceWindowMs = options.coalesceWindowMs ?? DEFAULT_HISTORY_COALESCE_WINDOW_MS;
  const maxCoalesceDeltaChars =
    options.maxCoalesceDeltaChars ?? DEFAULT_HISTORY_MAX_COALESCE_DELTA;
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_HISTORY_ENTRIES);

  const charDelta = Math.abs(nextPresent.length - state.present.length);
  const isBulkEdit = charDelta > maxCoalesceDeltaChars;
  const effectiveMode: HistoryCommitMode =
    requestedMode === 'coalesce' && !isBulkEdit ? 'coalesce' : 'checkpoint';

  const withinWindow =
    state.lastCommitAt !== null &&
    timestamp !== null &&
    timestamp >= state.lastCommitAt &&
    timestamp - state.lastCommitAt <= coalesceWindowMs;

  const sameGroup = state.lastGroupKey === groupKey;

  const shouldCoalesce =
    effectiveMode === 'coalesce' &&
    state.lastCommitMode === 'coalesce' &&
    state.past.length > 0 &&
    sameGroup &&
    withinWindow;

  if (shouldCoalesce) {
    // If rapid typing + immediate backspacing returns to the exact pre-burst snapshot,
    // pop that redundant entry so Undo never produces a phantom no-op step.
    if (state.past[state.past.length - 1] === nextPresent) {
      return {
        past: state.past.slice(0, -1),
        present: nextPresent,
        future: [],
        lastCommitMode: null,
        lastGroupKey: null,
        lastCommitAt: null,
        revision: state.revision,
      };
    }

    return {
      past: state.past,
      present: nextPresent,
      future: [],
      lastCommitMode: 'coalesce',
      lastGroupKey: groupKey,
      lastCommitAt: timestamp,
      revision: state.revision,
    };
  }

  const nextPast =
    state.past.length >= maxEntries
      ? [...state.past.slice(state.past.length - maxEntries + 1), state.present]
      : [...state.past, state.present];

  return {
    past: nextPast,
    present: nextPresent,
    future: [],
    lastCommitMode: effectiveMode,
    lastGroupKey: effectiveMode === 'coalesce' ? groupKey : null,
    lastCommitAt: effectiveMode === 'coalesce' ? timestamp : null,
    revision: state.revision,
  };
}

/**
 * Steps backward one snapshot in document history, incrementing `revision` so
 * actively focused Live Mode editors immediately resync their drafts.
 */
export function undoDocumentHistory(state: DocumentHistoryState): DocumentHistoryState {
  if (state.past.length === 0) {
    return state;
  }

  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
    lastCommitMode: null,
    lastGroupKey: null,
    lastCommitAt: null,
    revision: state.revision + 1,
  };
}

/**
 * Steps forward one snapshot in document history, incrementing `revision` so
 * actively focused Live Mode editors immediately resync their drafts.
 */
export function redoDocumentHistory(state: DocumentHistoryState): DocumentHistoryState {
  if (state.future.length === 0) {
    return state;
  }

  const [next, ...restFuture] = state.future;
  return {
    past: [...state.past, state.present],
    present: next,
    future: restFuture,
    lastCommitMode: null,
    lastGroupKey: null,
    lastCommitAt: null,
    revision: state.revision + 1,
  };
}
