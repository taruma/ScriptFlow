import {describe, expect, it} from 'vitest';
import {
  applyAuteurPatch,
  breakHistoryCoalescing,
  canRedoDocument,
  canUndoDocument,
  commitDocumentHistory,
  createDocumentHistory,
  deleteExecutionBeat,
  deleteStagingBlock,
  insertExecutionBeat,
  insertStagingBlock,
  mergeExecutionSubStateWithPrevious,
  redoDocumentHistory,
  reorderExecutionBeats,
  reorderStagingBlocks,
  undoDocumentHistory,
  updateExecutionSubState,
  updateStagingBlock,
} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';

const BASE_SCRIPT = `[INTENT]
Create a quiet hallway confrontation.

[AESTHETIC]
Medium: 35mm film
Lighting: cool fluorescent overhead

[EXECUTION]
[CAM 01] MS on Ada -> [ACT] Ada pauses at the door
[CAM 01] -> [ACT] Ada reaches for the handle -> <metal latch clicks>`;

describe('document history engine (src/core/history.ts)', () => {
  it('initializes with empty stacks and safely no-ops undo/redo when empty', () => {
    const initial = createDocumentHistory(BASE_SCRIPT);

    expect(initial.present).toBe(BASE_SCRIPT);
    expect(canUndoDocument(initial)).toBe(false);
    expect(canRedoDocument(initial)).toBe(false);
    expect(initial.revision).toBe(0);

    expect(undoDocumentHistory(initial)).toBe(initial);
    expect(redoDocumentHistory(initial)).toBe(initial);
  });

  it('ignores no-op commits without mutating stacks or clearing future', () => {
    let state = createDocumentHistory('v1');
    state = commitDocumentHistory(state, 'v2', {mode: 'checkpoint'});
    state = undoDocumentHistory(state);

    expect(state.present).toBe('v1');
    expect(canRedoDocument(state)).toBe(true);

    const unchanged = commitDocumentHistory(state, 'v1', {mode: 'checkpoint'});
    expect(unchanged).toBe(state);
    expect(canRedoDocument(unchanged)).toBe(true);
  });

  it('creates immediate checkpoints for structural actions and cleanly undoes/redoes every edit type', () => {
    let state = createDocumentHistory(BASE_SCRIPT);

    // 1. Insert staging block
    const s1 = insertStagingBlock(state.present, 'LOGIC', 'Keep Ada frame-left.');
    state = commitDocumentHistory(state, s1, {mode: 'checkpoint'});

    // 2. Reorder staging blocks
    const s2 = reorderStagingBlocks(state.present, 2, 0);
    state = commitDocumentHistory(state, s2, {mode: 'checkpoint'});

    // 3. Delete staging block
    const s3 = deleteStagingBlock(state.present, 0);
    state = commitDocumentHistory(state, s3, {mode: 'checkpoint'});

    // 4. Insert execution beat
    const s4 = insertExecutionBeat(state.present, 2, '[CAM 02] CU on handle -> [ACT] Handle turns');
    state = commitDocumentHistory(state, s4, {mode: 'checkpoint'});

    // 5. Reorder execution beats
    const s5 = reorderExecutionBeats(state.present, 3, 1);
    state = commitDocumentHistory(state, s5, {mode: 'checkpoint'});

    // 6. Split step -> merge step -> delete beat
    const s6 = updateExecutionSubState(state.present, 1, 1, '[ACT] Handle turns -> <soft click>');
    state = commitDocumentHistory(state, s6, {mode: 'checkpoint'});

    const s7 = mergeExecutionSubStateWithPrevious(state.present, 1, 2);
    state = commitDocumentHistory(state, s7, {mode: 'checkpoint'});

    const s8 = deleteExecutionBeat(state.present, 1);
    state = commitDocumentHistory(state, s8, {mode: 'checkpoint'});

    // 7. Preset switch / paste-hydrate
    const presetScript = SCRIPT_PRESETS[1].content;
    state = commitDocumentHistory(state, presetScript, {mode: 'checkpoint'});

    // 8. Debug Patch commit
    const patchRes = applyAuteurPatch(state.present, {
      ops: [
        {
          op: 'set_aesthetic_entry',
          key: 'Lighting',
          value: 'flickering sodium vapor overhead, hard falloff',
        },
      ],
    });
    expect(patchRes.ok).toBe(true);
    state = commitDocumentHistory(state, patchRes.nextRawText!, {mode: 'checkpoint'});

    expect(state.past).toHaveLength(10);
    expect(state.revision).toBe(0);

    // Undo all 10 checkpoints back to BASE_SCRIPT
    const expectedSnapshots = [
      patchRes.nextRawText!,
      presetScript,
      s8,
      s7,
      s6,
      s5,
      s4,
      s3,
      s2,
      s1,
      BASE_SCRIPT,
    ];

    for (let i = 1; i < expectedSnapshots.length; i++) {
      state = undoDocumentHistory(state);
      expect(state.present).toBe(expectedSnapshots[i]);
      expect(state.revision).toBe(i);
    }

    expect(canUndoDocument(state)).toBe(false);
    expect(canRedoDocument(state)).toBe(true);

    // Redo all 10 checkpoints forward
    for (let i = expectedSnapshots.length - 2; i >= 0; i--) {
      state = redoDocumentHistory(state);
      expect(state.present).toBe(expectedSnapshots[i]);
    }

    expect(canRedoDocument(state)).toBe(false);
    expect(state.present).toBe(patchRes.nextRawText);
  });

  it('coalesces rapid sequential typing within the same groupKey and time window into one undo burst', () => {
    let state = createDocumentHistory(BASE_SCRIPT);
    const t0 = 10_000;

    // Type " quickly" one character at a time within 800ms in staging:0
    const suffixes = [' ', 'q', 'u', 'i', 'c', 'k', 'l', 'y'];
    let body = 'Create a quiet hallway confrontation.';
    for (let i = 0; i < suffixes.length; i++) {
      body += suffixes[i];
      state = commitDocumentHistory(state, updateStagingBlock(state.present, 0, body), {
        mode: 'coalesce',
        groupKey: 'staging:0',
        timestamp: t0 + i * 90,
      });
    }

    // All 8 keystrokes should collapse into a single undo stop back to BASE_SCRIPT
    expect(state.past).toEqual([BASE_SCRIPT]);
    expect(state.present).toContain('confrontation. quickly');

    state = undoDocumentHistory(state);
    expect(state.present).toBe(BASE_SCRIPT);

    state = redoDocumentHistory(state);
    expect(state.present).toContain('confrontation. quickly');
  });

  it('starts a new undo stop when the coalescing time window expires', () => {
    let state = createDocumentHistory('A');

    state = commitDocumentHistory(state, 'AB', {
      mode: 'coalesce',
      groupKey: 'source',
      timestamp: 1000,
    });
    state = commitDocumentHistory(state, 'ABC', {
      mode: 'coalesce',
      groupKey: 'source',
      timestamp: 1300,
    });

    // Pause longer than default 800ms window
    state = commitDocumentHistory(state, 'ABCD', {
      mode: 'coalesce',
      groupKey: 'source',
      timestamp: 2500,
    });
    state = commitDocumentHistory(state, 'ABCDE', {
      mode: 'coalesce',
      groupKey: 'source',
      timestamp: 2650,
    });

    expect(state.past).toEqual(['A', 'ABC']);
    expect(state.present).toBe('ABCDE');

    state = undoDocumentHistory(state);
    expect(state.present).toBe('ABC');
    state = undoDocumentHistory(state);
    expect(state.present).toBe('A');
  });

  it('starts a new undo stop immediately when groupKey changes even inside the time window', () => {
    let state = createDocumentHistory(BASE_SCRIPT);

    const editStep0 = updateExecutionSubState(state.present, 1, 0, '[CAM 01] CU on Ada');
    state = commitDocumentHistory(state, editStep0, {
      mode: 'coalesce',
      groupKey: 'beat:1:step:0',
      timestamp: 1000,
    });

    const editStep1 = updateExecutionSubState(state.present, 1, 1, '[ACT] Ada freezes at the door');
    state = commitDocumentHistory(state, editStep1, {
      mode: 'coalesce',
      groupKey: 'beat:1:step:1',
      timestamp: 1150,
    });

    expect(state.past).toEqual([BASE_SCRIPT, editStep0]);
    expect(state.present).toBe(editStep1);
  });

  it('does not coalesce subsequent typing into a preceding structural checkpoint', () => {
    let state = createDocumentHistory(BASE_SCRIPT);

    // Structural beat insert checkpoint
    const withNewBeat = insertExecutionBeat(state.present, 2, '[CAM 01] -> [ACT] ');
    state = commitDocumentHistory(state, withNewBeat, {mode: 'checkpoint'});

    // Immediate typing inside the newly inserted beat
    const typed1 = updateExecutionSubState(state.present, 3, 1, '[ACT] A');
    state = commitDocumentHistory(state, typed1, {
      mode: 'coalesce',
      groupKey: 'beat:3:step:1',
      timestamp: 2000,
    });
    const typed2 = updateExecutionSubState(state.present, 3, 1, '[ACT] Ada');
    state = commitDocumentHistory(state, typed2, {
      mode: 'coalesce',
      groupKey: 'beat:3:step:1',
      timestamp: 2100,
    });

    expect(state.past).toEqual([BASE_SCRIPT, withNewBeat]);

    // First undo reverts the typing while keeping the newly inserted beat
    state = undoDocumentHistory(state);
    expect(state.present).toBe(withNewBeat);

    // Second undo removes the newly inserted beat
    state = undoDocumentHistory(state);
    expect(state.present).toBe(BASE_SCRIPT);
  });

  it('promotes bulk single-step edits (e.g. pastes or large deletions) to immediate checkpoints', () => {
    let state = createDocumentHistory('Start');

    state = commitDocumentHistory(state, 'Start!', {
      mode: 'coalesce',
      groupKey: 'source',
      timestamp: 1000,
    });

    const bulkPaste = 'Start! ' + 'A'.repeat(60);
    state = commitDocumentHistory(state, bulkPaste, {
      mode: 'coalesce',
      groupKey: 'source',
      timestamp: 1100,
    });

    // Subsequent typing after a bulk paste also starts its own undo stop
    state = commitDocumentHistory(state, `${bulkPaste}.`, {
      mode: 'coalesce',
      groupKey: 'source',
      timestamp: 1180,
    });

    expect(state.past).toEqual(['Start', 'Start!', bulkPaste]);
  });

  it('collapses phantom no-op undo entries when rapid typing is immediately backspaced away', () => {
    let state = createDocumentHistory('Hello');

    state = commitDocumentHistory(state, 'Hello!', {
      mode: 'coalesce',
      groupKey: 'source',
      timestamp: 1000,
    });
    expect(canUndoDocument(state)).toBe(true);

    state = commitDocumentHistory(state, 'Hello', {
      mode: 'coalesce',
      groupKey: 'source',
      timestamp: 1120,
    });

    expect(state.present).toBe('Hello');
    expect(state.past).toEqual([]);
    expect(canUndoDocument(state)).toBe(false);
  });

  it('clears the redo stack on any new edit after undo and breaks coalescing on undo/redo/view switch', () => {
    let state = createDocumentHistory('v1');
    state = commitDocumentHistory(state, 'v2', {mode: 'coalesce', groupKey: 'source', timestamp: 100});
    state = breakHistoryCoalescing(state);
    state = commitDocumentHistory(state, 'v3', {mode: 'coalesce', groupKey: 'source', timestamp: 150});

    expect(state.past).toEqual(['v1', 'v2']);

    state = undoDocumentHistory(state);
    expect(state.present).toBe('v2');
    expect(state.future).toEqual(['v3']);

    // Typing after undo must push 'v2' onto past and clear 'v3' from future
    state = commitDocumentHistory(state, 'v2-branch', {
      mode: 'coalesce',
      groupKey: 'source',
      timestamp: 200,
    });
    expect(state.past).toEqual(['v1', 'v2']);
    expect(state.present).toBe('v2-branch');
    expect(state.future).toEqual([]);
    expect(canRedoDocument(state)).toBe(false);
  });

  it('enforces maxEntries cap by retaining the most recent snapshots', () => {
    let state = createDocumentHistory('s0');
    for (let i = 1; i <= 6; i++) {
      state = commitDocumentHistory(state, `s${i}`, {mode: 'checkpoint', maxEntries: 3});
    }

    expect(state.present).toBe('s6');
    expect(state.past).toEqual(['s3', 's4', 's5']);

    state = undoDocumentHistory(state);
    state = undoDocumentHistory(state);
    state = undoDocumentHistory(state);
    expect(state.present).toBe('s3');
    expect(canUndoDocument(state)).toBe(false);
  });
});
