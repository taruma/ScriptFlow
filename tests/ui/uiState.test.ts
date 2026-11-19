import {describe, expect, it} from 'vitest';
import {reconcileStepFocusOnDelete} from '../../src/ui/beatFocus.ts';
import {matchHistoryShortcut} from '../../src/ui/historyShortcuts.ts';
import {
  deleteCollapsedIndex,
  insertCollapsedIndex,
  pruneCollapsedIndices,
  reorderCollapsedIndices,
  toggleCollapsedIndex,
} from '../../src/ui/stagingCollapse.ts';

describe('stagingCollapse helpers', () => {
  it('toggles duplicate-header blocks independently by index', () => {
    // Imagine two [NOTES] blocks at indices 1 and 3
    let state = new Set<number>();
    state = toggleCollapsedIndex(state, 1);
    expect(state.has(1)).toBe(true);
    expect(state.has(3)).toBe(false);

    state = toggleCollapsedIndex(state, 3);
    expect(state.has(1)).toBe(true);
    expect(state.has(3)).toBe(true);

    state = toggleCollapsedIndex(state, 1);
    expect(state.has(1)).toBe(false);
    expect(state.has(3)).toBe(true);
  });

  it('follows the dragged block across forward and backward reorders', () => {
    // [0: expanded, 1: collapsed, 2: expanded, 3: collapsed]
    const initial = new Set<number>([1, 3]);

    // Drag collapsed block 1 forward to index 2 -> [0: exp, 1: exp, 2: col, 3: col]
    const movedForward = reorderCollapsedIndices(initial, 1, 2, 4);
    expect(Array.from(movedForward).sort((a, b) => a - b)).toEqual([2, 3]);

    // Drag collapsed block 3 backward to index 0 -> [0: col, 1: exp, 2: col, 3: exp]
    const movedBackward = reorderCollapsedIndices(initial, 3, 0, 4);
    expect(Array.from(movedBackward).sort((a, b) => a - b)).toEqual([0, 2]);
  });

  it('shifts collapsed indices cleanly on insert, delete, and prune', () => {
    const initial = new Set<number>([0, 2, 4]);

    // Insert at index 2 -> 0 stays 0, 2 becomes 3, 4 becomes 5 (new block at 2 starts expanded)
    const afterInsert = insertCollapsedIndex(initial, 2);
    expect(Array.from(afterInsert).sort((a, b) => a - b)).toEqual([0, 3, 5]);

    // Delete index 2 -> 0 stays 0, 2 removed, 4 becomes 3
    const afterDelete = deleteCollapsedIndex(initial, 2);
    expect(Array.from(afterDelete).sort((a, b) => a - b)).toEqual([0, 3]);

    // Prune when list shrinks to length 3
    const pruned = pruneCollapsedIndices(initial, 3);
    expect(Array.from(pruned).sort((a, b) => a - b)).toEqual([0, 2]);
  });
});

describe('reconcileStepFocusOnDelete', () => {
  const steps = ['[CAM 01] MS on Ada', '[ACT] Ada turns', '<rain on glass>', 'Ada says {Quiet.}'];

  it('moves focus and active draft to the previous step when deleting the focused step', () => {
    const result = reconcileStepFocusOnDelete(
      {
        focusedStepIndex: 2,
        activeDraft: '<rain on glass>',
        pendingAfterIndex: null,
        pendingDraft: '',
      },
      steps,
      2
    );

    expect(result.focusedStepIndex).toBe(1);
    expect(result.activeDraft).toBe('[ACT] Ada turns');
    expect(result.nextFocusTarget).toEqual({
      type: 'step',
      index: 1,
      caret: '[ACT] Ada turns'.length,
    });
  });

  it('shifts focusedStepIndex down and preserves activeDraft/caret when deleting an earlier step', () => {
    const result = reconcileStepFocusOnDelete(
      {
        focusedStepIndex: 3,
        activeDraft: 'Ada says {Quiet now.}',
        pendingAfterIndex: null,
        pendingDraft: '',
      },
      steps,
      1,
      14
    );

    expect(result.focusedStepIndex).toBe(2);
    expect(result.activeDraft).toBe('Ada says {Quiet now.}');
    expect(result.nextFocusTarget).toEqual({
      type: 'step',
      index: 2,
      caret: 14,
    });
  });

  it('keeps focus and draft untouched when deleting a later step', () => {
    const result = reconcileStepFocusOnDelete(
      {
        focusedStepIndex: 0,
        activeDraft: '[CAM 01] MS on Ada',
        pendingAfterIndex: null,
        pendingDraft: '',
      },
      steps,
      2,
      8
    );

    expect(result.focusedStepIndex).toBe(0);
    expect(result.activeDraft).toBe('[CAM 01] MS on Ada');
    expect(result.nextFocusTarget).toBeNull();
  });

  it('shifts pendingAfterIndex when deleting a step at or before the pending anchor', () => {
    const result = reconcileStepFocusOnDelete(
      {
        focusedStepIndex: null,
        activeDraft: '',
        pendingAfterIndex: 2,
        pendingDraft: '[LIGHT]',
      },
      steps,
      1,
      7
    );

    expect(result.focusedStepIndex).toBeNull();
    expect(result.pendingAfterIndex).toBe(1);
    expect(result.nextFocusTarget).toEqual({
      type: 'pending',
      index: 1,
      caret: 7,
    });
  });
});

describe('matchHistoryShortcut', () => {
  const base = {key: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false};

  it('matches Cmd+Z and Ctrl+Z as undo (case-insensitive)', () => {
    expect(matchHistoryShortcut({...base, key: 'z', metaKey: true})).toBe('undo');
    expect(matchHistoryShortcut({...base, key: 'Z', ctrlKey: true})).toBe('undo');
  });

  it('matches Cmd+Shift+Z, Ctrl+Shift+Z, and Ctrl+Y as redo', () => {
    expect(matchHistoryShortcut({...base, key: 'z', metaKey: true, shiftKey: true})).toBe('redo');
    expect(matchHistoryShortcut({...base, key: 'Z', ctrlKey: true, shiftKey: true})).toBe('redo');
    expect(matchHistoryShortcut({...base, key: 'y', ctrlKey: true})).toBe('redo');
    expect(matchHistoryShortcut({...base, key: 'Y', ctrlKey: true})).toBe('redo');
  });

  it('ignores non-matching chords, Cmd+Y, Alt combinations, and IME composition events', () => {
    expect(matchHistoryShortcut({...base, key: 'z'})).toBeNull();
    expect(matchHistoryShortcut({...base, key: 'y', metaKey: true})).toBeNull();
    expect(matchHistoryShortcut({...base, key: 'y', ctrlKey: true, shiftKey: true})).toBeNull();
    expect(matchHistoryShortcut({...base, key: 'z', ctrlKey: true, altKey: true})).toBeNull();
    expect(
      matchHistoryShortcut({...base, key: 'z', metaKey: true, isComposing: true})
    ).toBeNull();
  });
});

