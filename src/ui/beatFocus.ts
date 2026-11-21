export interface StepFocusSnapshot {
  focusedStepIndex: number | null;
  activeDraft: string;
  pendingAfterIndex: number | null;
  pendingDraft: string;
}

export interface StepFocusTarget {
  type: 'step' | 'pending';
  index: number;
  caret: number;
}

export interface StepDeleteReconcileResult {
  focusedStepIndex: number | null;
  activeDraft: string;
  pendingAfterIndex: number | null;
  nextFocusTarget: StepFocusTarget | null;
}

/**
 * Reconciles ExecutionBeatRow focus, active draft, and pending-step anchor
 * when deleting a Sub-State step at `deletedIndex` so focus/draft never desyncs.
 */
export function reconcileStepFocusOnDelete(
  state: StepFocusSnapshot,
  subStateRaws: readonly string[],
  deletedIndex: number,
  currentCaret?: number
): StepDeleteReconcileResult {
  const remainingCount = Math.max(0, subStateRaws.length - 1);
  let nextFocusedStepIndex = state.focusedStepIndex;
  let nextActiveDraft = state.activeDraft;
  let nextPendingAfterIndex = state.pendingAfterIndex;
  let nextFocusTarget: StepFocusTarget | null = null;

  if (remainingCount === 0) {
    return {
      focusedStepIndex: null,
      activeDraft: '',
      pendingAfterIndex: null,
      nextFocusTarget: null,
    };
  }

  if (state.focusedStepIndex !== null) {
    if (state.focusedStepIndex === deletedIndex) {
      const targetIndex = Math.max(0, deletedIndex - 1);
      const targetRaw = subStateRaws[targetIndex] ?? '';
      nextFocusedStepIndex = targetIndex;
      nextActiveDraft = targetRaw;
      nextFocusTarget = {type: 'step', index: targetIndex, caret: targetRaw.length};
    } else if (state.focusedStepIndex > deletedIndex) {
      const shiftedIndex = state.focusedStepIndex - 1;
      const caret = currentCaret ?? state.activeDraft.length;
      nextFocusedStepIndex = shiftedIndex;
      nextFocusTarget = {type: 'step', index: shiftedIndex, caret};
    }
  }

  if (state.pendingAfterIndex !== null && state.pendingAfterIndex >= deletedIndex) {
    const shiftedPending = Math.max(0, state.pendingAfterIndex - 1);
    nextPendingAfterIndex = shiftedPending;
    if (!nextFocusTarget) {
      nextFocusTarget = {
        type: 'pending',
        index: shiftedPending,
        caret: currentCaret ?? state.pendingDraft.length,
      };
    }
  }

  return {
    focusedStepIndex: nextFocusedStepIndex,
    activeDraft: nextActiveDraft,
    pendingAfterIndex: nextPendingAfterIndex,
    nextFocusTarget,
  };
}

export interface SubStateShortcutKeyEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * Matches Alt+ArrowUp / Alt+ArrowDown (Option+ArrowUp / Option+ArrowDown on macOS)
 * with no other modifier keys for keyboard-only Sub-State reordering.
 */
export function matchSubStateMoveShortcut(event: SubStateShortcutKeyEvent): -1 | 1 | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }
  if (event.key === 'ArrowUp') return -1;
  if (event.key === 'ArrowDown') return 1;
  return null;
}

/**
 * Computes the destination Sub-State index for a relative move (-1 or +1)
 * within a Macro-State, returning null at list boundaries or when < 2 Sub-States exist.
 */
export function computeSubStateMoveTarget(
  currentIndex: number,
  subStateCount: number,
  delta: -1 | 1
): number | null {
  if (subStateCount < 2 || currentIndex < 0 || currentIndex >= subStateCount) {
    return null;
  }
  const targetIndex = currentIndex + delta;
  if (targetIndex < 0 || targetIndex >= subStateCount) {
    return null;
  }
  return targetIndex;
}
