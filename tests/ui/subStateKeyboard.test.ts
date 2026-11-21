import {describe, expect, it} from 'vitest';
import {
  resolvePendingSubStateChange,
  resolvePendingSubStateKeyDown,
  resolveSubStateBlur,
  resolveSubStateChange,
  resolveSubStateKeyDown,
  stripSubStateNewlines,
  type SubStateKeyDownInput,
} from '../../src/ui/subStateKeyboard.ts';

function makeKeyInput(overrides: Partial<SubStateKeyDownInput> = {}): SubStateKeyDownInput {
  return {
    key: 'a',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    readOnly: false,
    index: 1,
    subStateRaws: ['[CAM 01] MS on Ada', '[ACT] Ada turns', '<rain on glass>'],
    currentText: '[ACT] Ada turns',
    caretStart: 0,
    caretEnd: 0,
    ...overrides,
  };
}

describe('stripSubStateNewlines', () => {
  it('replaces LF and CRLF line breaks with single spaces', () => {
    expect(stripSubStateNewlines('[ACT] Ada walks\nto the window\r\nslowly')).toBe(
      '[ACT] Ada walks to the window slowly'
    );
    expect(stripSubStateNewlines('[ACT] Ada pauses')).toBe('[ACT] Ada pauses');
  });
});

describe('resolveSubStateChange', () => {
  it('returns coalesced update for normal single-line typing', () => {
    expect(resolveSubStateChange(0, '[ACT] Ada reaches for the latch')).toEqual({
      kind: 'update',
      singleLine: '[ACT] Ada reaches for the latch',
      shouldCommit: true,
      commitMode: 'coalesce',
    });
  });

  it('strips accidental raw newlines and suppresses commit on whitespace-only drafts', () => {
    expect(resolveSubStateChange(1, '   \r\n  ')).toEqual({
      kind: 'update',
      singleLine: '      ',
      shouldCommit: false,
      commitMode: 'coalesce',
    });
  });

  it('splits into next step immediately on ASCII "-> " with non-empty left and right', () => {
    expect(resolveSubStateChange(0, '[CAM 01] MS on Ada -> <rain on glass>')).toEqual({
      kind: 'split_into_step',
      combinedText: '[CAM 01] MS on Ada -> <rain on glass>',
      commitMode: 'checkpoint',
      nextFocusIndex: 1,
      nextDraft: '<rain on glass>',
      nextCaret: '<rain on glass>'.length,
    });
  });

  it('splits into next step immediately on Unicode "→ " with trimmed halves', () => {
    expect(resolveSubStateChange(1, '  [ACT] Ada turns  →   Ada says {Quiet.}  ')).toEqual({
      kind: 'split_into_step',
      combinedText: '[ACT] Ada turns -> Ada says {Quiet.}',
      commitMode: 'checkpoint',
      nextFocusIndex: 2,
      nextDraft: 'Ada says {Quiet.}',
      nextCaret: 'Ada says {Quiet.}'.length,
    });
  });

  it('opens a pending row after current step on trailing "-> " or "→ " with empty right', () => {
    expect(resolveSubStateChange(2, '[ACT] Ada turns -> ')).toEqual({
      kind: 'split_into_pending',
      leftText: '[ACT] Ada turns',
      commitMode: 'checkpoint',
      pendingAfterIndex: 2,
    });

    expect(resolveSubStateChange(0, '[CAM 01] MS →   ')).toEqual({
      kind: 'split_into_pending',
      leftText: '[CAM 01] MS',
      commitMode: 'checkpoint',
      pendingAfterIndex: 0,
    });
  });

  it('does not split before trailing space after arrow or when left side is empty', () => {
    expect(resolveSubStateChange(0, '[ACT] Ada turns->')).toEqual({
      kind: 'update',
      singleLine: '[ACT] Ada turns->',
      shouldCommit: true,
      commitMode: 'coalesce',
    });

    expect(resolveSubStateChange(0, '   -> [ACT] Ada turns')).toEqual({
      kind: 'update',
      singleLine: '   -> [ACT] Ada turns',
      shouldCommit: true,
      commitMode: 'coalesce',
    });
  });

  it('strips newlines prior to checking for live arrow split on multi-line paste', () => {
    expect(resolveSubStateChange(0, '[CAM 01] WS\n-> [ACT] Ada enters')).toEqual({
      kind: 'split_into_step',
      combinedText: '[CAM 01] WS -> [ACT] Ada enters',
      commitMode: 'checkpoint',
      nextFocusIndex: 1,
      nextDraft: '[ACT] Ada enters',
      nextCaret: '[ACT] Ada enters'.length,
    });
  });
});

describe('resolvePendingSubStateChange', () => {
  it('keeps whitespace-only typing or null anchor as local pending draft', () => {
    expect(resolvePendingSubStateChange('  \n ', 1)).toEqual({
      kind: 'draft',
      singleLine: '    ',
    });
    expect(resolvePendingSubStateChange('[ACT] Ada blinks', null)).toEqual({
      kind: 'draft',
      singleLine: '[ACT] Ada blinks',
    });
  });

  it('coalesces 1-2 character typing starts when promoting a pending row', () => {
    expect(resolvePendingSubStateChange('[', 0)).toEqual({
      kind: 'insert',
      insertAfter: 0,
      newStepIndex: 1,
      text: '[',
      commitMode: 'coalesce',
      nextCaret: 1,
    });

    expect(resolvePendingSubStateChange('<>', 2)).toEqual({
      kind: 'insert',
      insertAfter: 2,
      newStepIndex: 3,
      text: '<>',
      commitMode: 'coalesce',
      nextCaret: 2,
    });
  });

  it('checkpoints longer pastes and strips newlines when promoting a pending row', () => {
    expect(resolvePendingSubStateChange('<distant\r\nthunder>', 1)).toEqual({
      kind: 'insert',
      insertAfter: 1,
      newStepIndex: 2,
      text: '<distant thunder>',
      commitMode: 'checkpoint',
      nextCaret: '<distant thunder>'.length,
    });
  });
});

describe('resolveSubStateBlur', () => {
  it('deletes empty or whitespace-only steps on blur', () => {
    expect(resolveSubStateBlur('', '[ACT] Ada turns')).toEqual({kind: 'delete'});
    expect(resolveSubStateBlur('   \t ', '[ACT] Ada turns')).toEqual({kind: 'delete'});
  });

  it('coalesce-commits when trimmed draft differs from persisted raw', () => {
    expect(resolveSubStateBlur('  [ACT] Ada smiles  ', '[ACT] Ada turns')).toEqual({
      kind: 'commit',
      text: '[ACT] Ada smiles',
      commitMode: 'coalesce',
    });
  });

  it('noops when trimmed draft already matches persisted raw', () => {
    expect(resolveSubStateBlur('  [ACT] Ada turns ', '[ACT] Ada turns')).toEqual({
      kind: 'noop',
    });
  });
});

describe('resolveSubStateKeyDown', () => {
  it('only handles Escape in read-only mode', () => {
    expect(resolveSubStateKeyDown(makeKeyInput({readOnly: true, key: 'Escape'}))).toEqual({
      kind: 'blur',
      preventDefault: true,
    });
    expect(resolveSubStateKeyDown(makeKeyInput({readOnly: true, key: 'Enter'}))).toEqual({
      kind: 'noop',
    });
    expect(
      resolveSubStateKeyDown(makeKeyInput({readOnly: true, key: 'ArrowUp', altKey: true}))
    ).toEqual({kind: 'noop'});
    expect(resolveSubStateKeyDown(makeKeyInput({readOnly: true, key: 'Backspace'}))).toEqual({
      kind: 'noop',
    });
  });

  it('blurs on Escape when editable', () => {
    expect(resolveSubStateKeyDown(makeKeyInput({key: 'Escape'}))).toEqual({
      kind: 'blur',
      preventDefault: true,
    });
  });

  it('reorders on Alt+ArrowUp / Alt+ArrowDown and clamps selection to trimmed text', () => {
    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'ArrowUp',
          altKey: true,
          index: 1,
          currentText: '  [ACT] Ada turns  ',
          caretStart: 4,
          caretEnd: 19,
        })
      )
    ).toEqual({
      kind: 'reorder',
      fromIndex: 1,
      toIndex: 0,
      nextDraft: '[ACT] Ada turns',
      caret: 4,
      selectionEnd: 15,
    });

    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'ArrowDown',
          altKey: true,
          index: 1,
          caretStart: 2,
          caretEnd: 2,
        })
      )
    ).toEqual({
      kind: 'reorder',
      fromIndex: 1,
      toIndex: 2,
      nextDraft: '[ACT] Ada turns',
      caret: 2,
      selectionEnd: 2,
    });
  });

  it('prevents default without reordering at boundaries or on empty drafts for Alt+Arrow', () => {
    expect(
      resolveSubStateKeyDown(makeKeyInput({key: 'ArrowUp', altKey: true, index: 0}))
    ).toEqual({kind: 'prevent_only'});

    expect(
      resolveSubStateKeyDown(makeKeyInput({key: 'ArrowDown', altKey: true, index: 2}))
    ).toEqual({kind: 'prevent_only'});

    expect(
      resolveSubStateKeyDown(
        makeKeyInput({key: 'ArrowUp', altKey: true, index: 1, currentText: '   '})
      )
    ).toEqual({kind: 'prevent_only'});

    // Extra modifier does not trigger reorder
    expect(
      resolveSubStateKeyDown(
        makeKeyInput({key: 'ArrowUp', altKey: true, shiftKey: true, index: 1, caretStart: 3, caretEnd: 3})
      )
    ).toEqual({kind: 'noop'});
  });

  it('splits on Enter when caret is between non-empty before and after text', () => {
    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'Enter',
          index: 1,
          currentText: '[ACT] Ada turns <door clicks>',
          caretStart: 15,
          caretEnd: 15,
        })
      )
    ).toEqual({
      kind: 'enter_split',
      combinedText: '[ACT] Ada turns -> <door clicks>',
      commitMode: 'checkpoint',
      nextFocusIndex: 2,
      nextDraft: '<door clicks>',
      nextCaret: 0,
    });
  });

  it('opens a pending row on Enter at end (committing before) or at start (without commit)', () => {
    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'Enter',
          index: 1,
          currentText: '[ACT] Ada turns  ',
          caretStart: 17,
          caretEnd: 17,
        })
      )
    ).toEqual({
      kind: 'enter_open_pending',
      beforeText: '[ACT] Ada turns',
      shouldCommitBefore: true,
      commitMode: 'checkpoint',
      pendingAfterIndex: 1,
    });

    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'Enter',
          index: 1,
          currentText: '[ACT] Ada turns',
          caretStart: 0,
          caretEnd: 0,
        })
      )
    ).toEqual({
      kind: 'enter_open_pending',
      beforeText: null,
      shouldCommitBefore: false,
      commitMode: 'checkpoint',
      pendingAfterIndex: 1,
    });
  });

  it('blurs on Enter when the current step draft is empty or whitespace-only', () => {
    expect(
      resolveSubStateKeyDown(makeKeyInput({key: 'Enter', currentText: '   '}))
    ).toEqual({kind: 'blur', preventDefault: true});
  });

  it('handles Backspace at column 0 by merging non-empty steps or deleting empty steps', () => {
    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'Backspace',
          index: 1,
          currentText: '  [ACT] Ada turns  ',
          caretStart: 0,
          caretEnd: 0,
        })
      )
    ).toEqual({
      kind: 'backspace_merge',
      targetIndex: 0,
      nextDraft: '[CAM 01] MS on Ada [ACT] Ada turns',
      nextCaret: '[CAM 01] MS on Ada'.length + 1,
    });

    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'Backspace',
          index: 2,
          currentText: '   ',
          caretStart: 0,
          caretEnd: 0,
        })
      )
    ).toEqual({
      kind: 'backspace_delete_empty',
      targetIndex: 1,
      nextDraft: '[ACT] Ada turns',
      nextCaret: '[ACT] Ada turns'.length,
    });

    // Guard cases: lead step (index 0), non-zero caret, active selection
    expect(
      resolveSubStateKeyDown(makeKeyInput({key: 'Backspace', index: 0, caretStart: 0, caretEnd: 0}))
    ).toEqual({kind: 'noop'});
    expect(
      resolveSubStateKeyDown(makeKeyInput({key: 'Backspace', index: 1, caretStart: 1, caretEnd: 1}))
    ).toEqual({kind: 'noop'});
    expect(
      resolveSubStateKeyDown(makeKeyInput({key: 'Backspace', index: 1, caretStart: 0, caretEnd: 4}))
    ).toEqual({kind: 'noop'});
  });

  it('navigates across waterfall boundaries on ArrowUp at start and ArrowDown at end', () => {
    expect(
      resolveSubStateKeyDown(makeKeyInput({key: 'ArrowUp', index: 1, caretStart: 0, caretEnd: 0}))
    ).toEqual({
      kind: 'navigate',
      targetIndex: 0,
      nextDraft: '[CAM 01] MS on Ada',
      nextCaret: '[CAM 01] MS on Ada'.length,
    });

    expect(
      resolveSubStateKeyDown(makeKeyInput({key: 'ArrowUp', index: 0, caretStart: 0, caretEnd: 0}))
    ).toEqual({kind: 'noop'});

    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'ArrowDown',
          index: 1,
          currentText: '[ACT] Ada turns',
          caretStart: '[ACT] Ada turns'.length,
          caretEnd: '[ACT] Ada turns'.length,
        })
      )
    ).toEqual({
      kind: 'navigate',
      targetIndex: 2,
      nextDraft: '<rain on glass>',
      nextCaret: 0,
    });

    // Guard cases: last step, caret not at end, active selection
    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'ArrowDown',
          index: 2,
          currentText: '<rain on glass>',
          caretStart: '<rain on glass>'.length,
          caretEnd: '<rain on glass>'.length,
        })
      )
    ).toEqual({kind: 'noop'});
    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'ArrowDown',
          index: 1,
          currentText: '[ACT] Ada turns',
          caretStart: 5,
          caretEnd: 5,
        })
      )
    ).toEqual({kind: 'noop'});
    expect(
      resolveSubStateKeyDown(
        makeKeyInput({
          key: 'ArrowDown',
          index: 1,
          currentText: '[ACT] Ada turns',
          caretStart: 0,
          caretEnd: '[ACT] Ada turns'.length,
        })
      )
    ).toEqual({kind: 'noop'});
  });
});

describe('resolvePendingSubStateKeyDown', () => {
  const steps = ['[CAM 01] MS on Ada', '[ACT] Ada turns'];

  it('closes pending row on Escape or Enter', () => {
    expect(resolvePendingSubStateKeyDown('Escape', '', 1, steps)).toEqual({kind: 'close'});
    expect(resolvePendingSubStateKeyDown('Enter', '   ', 0, steps)).toEqual({kind: 'close'});
  });

  it('returns focus to the anchor step on Backspace when pending draft is empty', () => {
    expect(resolvePendingSubStateKeyDown('Backspace', '', 1, steps)).toEqual({
      kind: 'return_to_step',
      targetIndex: 1,
      nextDraft: '[ACT] Ada turns',
      nextCaret: '[ACT] Ada turns'.length,
    });
  });

  it('noops on Backspace with non-empty draft, null anchor, or unrelated keys', () => {
    expect(resolvePendingSubStateKeyDown('Backspace', ' ', 1, steps)).toEqual({kind: 'noop'});
    expect(resolvePendingSubStateKeyDown('Backspace', '', null, steps)).toEqual({kind: 'noop'});
    expect(resolvePendingSubStateKeyDown('ArrowDown', '', 1, steps)).toEqual({kind: 'noop'});
  });
});
