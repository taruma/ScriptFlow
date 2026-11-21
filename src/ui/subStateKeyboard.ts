import type {HistoryCommitMode} from '../core/history.ts';
import {
  computeSubStateMoveTarget,
  matchSubStateMoveShortcut,
  type SubStateShortcutKeyEvent,
} from './beatFocus.ts';

/**
 * Matches a live waterfall fork trigger inside a single Sub-State line:
 * "<left> -> <right>" or "<left> → <right>" (requires at least one space after the arrow).
 */
export const LIVE_ARROW_SPLIT_REGEX = /^(.*?)\s*(?:->|→)\s+(.*)$/;

/**
 * Strips accidental raw newlines inside a single Sub-State step.
 */
export function stripSubStateNewlines(value: string): string {
  return value.replace(/\r?\n/g, ' ');
}

export type SubStateChangeAction =
  | {
      kind: 'split_into_step';
      combinedText: string;
      commitMode: HistoryCommitMode;
      nextFocusIndex: number;
      nextDraft: string;
      nextCaret: number;
    }
  | {
      kind: 'split_into_pending';
      leftText: string;
      commitMode: HistoryCommitMode;
      pendingAfterIndex: number;
    }
  | {
      kind: 'update';
      singleLine: string;
      shouldCommit: boolean;
      commitMode: HistoryCommitMode;
    };

/**
 * Resolves a text change inside an existing Sub-State editor:
 * strips accidental newlines, detects live `-> ` / `→ ` waterfall splits,
 * or produces a coalesced single-line draft update.
 */
export function resolveSubStateChange(index: number, nextValue: string): SubStateChangeAction {
  const singleLine = stripSubStateNewlines(nextValue);

  const splitMatch = LIVE_ARROW_SPLIT_REGEX.exec(singleLine);
  if (splitMatch) {
    const left = splitMatch[1].trim();
    const right = splitMatch[2];

    if (left.length > 0 && right.trim().length > 0) {
      const rightTrimmed = right.trim();
      return {
        kind: 'split_into_step',
        combinedText: `${left} -> ${rightTrimmed}`,
        commitMode: 'checkpoint',
        nextFocusIndex: index + 1,
        nextDraft: rightTrimmed,
        nextCaret: rightTrimmed.length,
      };
    }

    if (left.length > 0 && right.trim().length === 0) {
      return {
        kind: 'split_into_pending',
        leftText: left,
        commitMode: 'checkpoint',
        pendingAfterIndex: index,
      };
    }
  }

  return {
    kind: 'update',
    singleLine,
    shouldCommit: singleLine.trim().length > 0,
    commitMode: 'coalesce',
  };
}

export type PendingSubStateChangeAction =
  | {
      kind: 'insert';
      insertAfter: number;
      newStepIndex: number;
      text: string;
      commitMode: HistoryCommitMode;
      nextCaret: number;
    }
  | {
      kind: 'draft';
      singleLine: string;
    };

/**
 * Resolves typing inside a pending `↳` Sub-State row.
 * As soon as non-whitespace text is entered, promotes the pending row into a real Sub-State
 * (coalescing 1-2 char typing starts, checkpointing longer pastes/inserts).
 */
export function resolvePendingSubStateChange(
  nextValue: string,
  pendingAfterIndex: number | null
): PendingSubStateChangeAction {
  const singleLine = stripSubStateNewlines(nextValue);

  if (singleLine.trim().length > 0 && pendingAfterIndex !== null) {
    const insertAfter = pendingAfterIndex;
    const newStepIndex = insertAfter + 1;
    const commitMode: HistoryCommitMode = singleLine.trim().length <= 2 ? 'coalesce' : 'checkpoint';
    return {
      kind: 'insert',
      insertAfter,
      newStepIndex,
      text: singleLine,
      commitMode,
      nextCaret: singleLine.length,
    };
  }

  return {
    kind: 'draft',
    singleLine,
  };
}

export type SubStateBlurAction =
  | {kind: 'delete'}
  | {kind: 'commit'; text: string; commitMode: HistoryCommitMode}
  | {kind: 'noop'};

/**
 * Resolves blurring a focused Sub-State step:
 * empty/whitespace drafts delete the step; changed trimmed drafts coalesce-commit.
 */
export function resolveSubStateBlur(
  activeDraft: string,
  persistedRaw: string
): SubStateBlurAction {
  const trimmed = activeDraft.trim();
  if (trimmed.length === 0) {
    return {kind: 'delete'};
  }
  if (trimmed !== persistedRaw) {
    return {kind: 'commit', text: trimmed, commitMode: 'coalesce'};
  }
  return {kind: 'noop'};
}

export interface SubStateKeyDownInput extends SubStateShortcutKeyEvent {
  readOnly: boolean;
  index: number;
  subStateRaws: readonly string[];
  currentText: string;
  caretStart: number;
  caretEnd: number;
}

export type SubStateKeyDownAction =
  | {kind: 'noop'}
  | {kind: 'prevent_only'}
  | {kind: 'blur'; preventDefault: true}
  | {
      kind: 'reorder';
      fromIndex: number;
      toIndex: number;
      nextDraft: string;
      caret: number;
      selectionEnd: number;
    }
  | {
      kind: 'enter_split';
      combinedText: string;
      commitMode: HistoryCommitMode;
      nextFocusIndex: number;
      nextDraft: string;
      nextCaret: number;
    }
  | {
      kind: 'enter_open_pending';
      beforeText: string | null;
      shouldCommitBefore: boolean;
      commitMode: HistoryCommitMode;
      pendingAfterIndex: number;
    }
  | {
      kind: 'backspace_delete_empty';
      targetIndex: number;
      nextDraft: string;
      nextCaret: number;
    }
  | {
      kind: 'backspace_merge';
      targetIndex: number;
      nextDraft: string;
      nextCaret: number;
    }
  | {
      kind: 'navigate';
      targetIndex: number;
      nextDraft: string;
      nextCaret: number;
    };

/**
 * Pure waterfall keyboard state machine for a focused Sub-State editor:
 * - `Escape`: blur (including read-only mode)
 * - `Alt+ArrowUp` / `Alt+ArrowDown`: reorder Sub-State within the Macro-State
 * - `Enter`: split around caret or open a pending `↳` row below
 * - `Backspace` at column 0 (on step > 0, no selection): delete empty step or merge into previous
 * - `ArrowUp` at column 0 / `ArrowDown` at end: boundary navigation across waterfall steps
 */
export function resolveSubStateKeyDown(input: SubStateKeyDownInput): SubStateKeyDownAction {
  const {readOnly, key, index, subStateRaws, currentText, caretStart, caretEnd} = input;

  if (readOnly) {
    if (key === 'Escape') {
      return {kind: 'blur', preventDefault: true};
    }
    return {kind: 'noop'};
  }

  const hasSelection = caretStart !== caretEnd;

  if (key === 'Escape') {
    return {kind: 'blur', preventDefault: true};
  }

  // Alt+ArrowUp / Alt+ArrowDown reorders this Sub-State within the current Macro-State
  const moveDelta = matchSubStateMoveShortcut(input);
  if (moveDelta !== null) {
    const trimmed = currentText.trim();
    if (trimmed.length === 0) {
      return {kind: 'prevent_only'};
    }

    const targetIndex = computeSubStateMoveTarget(index, subStateRaws.length, moveDelta);
    if (targetIndex === null) {
      return {kind: 'prevent_only'};
    }

    return {
      kind: 'reorder',
      fromIndex: index,
      toIndex: targetIndex,
      nextDraft: trimmed,
      caret: Math.min(caretStart, trimmed.length),
      selectionEnd: Math.min(caretEnd, trimmed.length),
    };
  }

  // Enter splits/adds a new ↳ waterfall step below
  if (key === 'Enter') {
    if (currentText.trim().length === 0) {
      return {kind: 'blur', preventDefault: true};
    }

    const before = currentText.slice(0, caretStart).trim();
    const after = currentText.slice(caretEnd).trim();

    if (before.length > 0 && after.length > 0) {
      return {
        kind: 'enter_split',
        combinedText: `${before} -> ${after}`,
        commitMode: 'checkpoint',
        nextFocusIndex: index + 1,
        nextDraft: after,
        nextCaret: 0,
      };
    }

    if (before.length > 0) {
      return {
        kind: 'enter_open_pending',
        beforeText: before,
        shouldCommitBefore: true,
        commitMode: 'checkpoint',
        pendingAfterIndex: index,
      };
    }

    return {
      kind: 'enter_open_pending',
      beforeText: null,
      shouldCommitBefore: false,
      commitMode: 'checkpoint',
      pendingAfterIndex: index,
    };
  }

  // Backspace at column 0 of an indented ↳ step merges it cleanly into the previous step
  if (key === 'Backspace' && !hasSelection && caretStart === 0 && index > 0) {
    const prevRaw = subStateRaws[index - 1] ?? '';
    const currTrimmed = currentText.trim();

    if (currTrimmed.length === 0) {
      return {
        kind: 'backspace_delete_empty',
        targetIndex: index - 1,
        nextDraft: prevRaw,
        nextCaret: prevRaw.length,
      };
    }

    return {
      kind: 'backspace_merge',
      targetIndex: index - 1,
      nextDraft: `${prevRaw} ${currTrimmed}`,
      nextCaret: prevRaw.length + 1,
    };
  }

  // ArrowUp at very start navigates to previous waterfall step
  if (key === 'ArrowUp' && !hasSelection && caretStart === 0 && index > 0) {
    const prevRaw = subStateRaws[index - 1] ?? '';
    return {
      kind: 'navigate',
      targetIndex: index - 1,
      nextDraft: prevRaw,
      nextCaret: prevRaw.length,
    };
  }

  // ArrowDown at very end navigates to next waterfall step
  if (
    key === 'ArrowDown' &&
    !hasSelection &&
    caretStart === currentText.length &&
    index < subStateRaws.length - 1
  ) {
    const nextRaw = subStateRaws[index + 1] ?? '';
    return {
      kind: 'navigate',
      targetIndex: index + 1,
      nextDraft: nextRaw,
      nextCaret: 0,
    };
  }

  return {kind: 'noop'};
}

export type PendingSubStateKeyDownAction =
  | {kind: 'noop'}
  | {kind: 'close'}
  | {
      kind: 'return_to_step';
      targetIndex: number;
      nextDraft: string;
      nextCaret: number;
    };

/**
 * Pure keyboard state machine for a pending (not-yet-inserted) `↳` Sub-State row.
 */
export function resolvePendingSubStateKeyDown(
  key: string,
  pendingDraft: string,
  pendingAfterIndex: number | null,
  subStateRaws: readonly string[]
): PendingSubStateKeyDownAction {
  if (key === 'Escape' || key === 'Enter') {
    return {kind: 'close'};
  }
  if (key === 'Backspace' && pendingDraft.length === 0 && pendingAfterIndex !== null) {
    const targetIndex = pendingAfterIndex;
    const prevRaw = subStateRaws[targetIndex] ?? '';
    return {
      kind: 'return_to_step',
      targetIndex,
      nextDraft: prevRaw,
      nextCaret: prevRaw.length,
    };
  }
  return {kind: 'noop'};
}
