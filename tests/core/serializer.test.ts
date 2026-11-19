import {describe, expect, it} from 'vitest';
import {
  deleteExecutionBeat,
  deleteExecutionSubState,
  deleteStagingBlock,
  exportPlainText,
  exportTagless,
  insertExecutionBeat,
  insertExecutionSubState,
  insertStagingBlock,
  mergeExecutionSubStateWithPrevious,
  parseAuteurScript,
  reorderExecutionBeats,
  updateExecutionBeat,
  updateExecutionSubState,
  updateStagingBlock,
} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';

const INTERROGATION = SCRIPT_PRESETS[0].content;

describe('Auteur Script Serializer & Tagless Exporter', () => {
  it('updates a Staging block without altering other blocks or Execution beats', () => {
    const updated = updateStagingBlock(
      INTERROGATION,
      0,
      'Create a quiet thriller scene in a concrete room featuring Miller and Ray.'
    );
    const doc = parseAuteurScript(updated);

    expect(doc.stagingBlocks[0].rawBody).toBe(
      'Create a quiet thriller scene in a concrete room featuring Miller and Ray.'
    );
    expect(doc.stagingBlocks[1].name).toBe('LOGIC');
    expect(doc.execution?.beats).toHaveLength(3);
  });

  it('inserts and deletes Staging Macro-Blocks cleanly while preserving Execution beats', () => {
    const appended = insertStagingBlock(
      INTERROGATION,
      'continuity protocol',
      'Inherit exact final frame from @video1.'
    );
    const docAppended = parseAuteurScript(appended);
    expect(docAppended.stagingBlocks.map((b) => b.name)).toEqual([
      'INTENT',
      'LOGIC',
      'AESTHETIC',
      'OPENING',
      'CONTINUITY PROTOCOL',
    ]);
    expect(docAppended.stagingBlocks[4].rawBody).toBe('Inherit exact final frame from @video1.');
    expect(docAppended.execution?.beats).toHaveLength(3);

    // Strips brackets and inserts at explicit index (between block 0 and block 1)
    const insertedMid = insertStagingBlock(appended, '[props]', 'Manila folder; steel handcuffs', 0);
    const docMid = parseAuteurScript(insertedMid);
    expect(docMid.stagingBlocks[1].name).toBe('PROPS');

    // Inserts before first block when afterBlockIndex is -1
    const insertedTop = insertStagingBlock(insertedMid, 'STAGE', 'Concrete basement', -1);
    expect(parseAuteurScript(insertedTop).stagingBlocks[0].name).toBe('STAGE');

    // Ignores reserved Execution header names
    const ignored = insertStagingBlock(insertedMid, 'EXECUTION', 'should not insert');
    expect(ignored).toBe(insertedMid);

    // Deletes Staging block cleanly
    const afterDelete = deleteStagingBlock(insertedMid, 1);
    const docAfterDelete = parseAuteurScript(afterDelete);
    expect(docAfterDelete.stagingBlocks.map((b) => b.name)).toEqual([
      'INTENT',
      'LOGIC',
      'AESTHETIC',
      'OPENING',
      'CONTINUITY PROTOCOL',
    ]);
    expect(docAfterDelete.execution?.beats).toHaveLength(3);

    // Out-of-bounds delete is a safe no-op
    expect(deleteStagingBlock(afterDelete, 99)).toBe(afterDelete);
  });

  it('updates, inserts, deletes, and reorders Execution beats cleanly', () => {
    const edited = updateExecutionBeat(
      INTERROGATION,
      2,
      '[CAM 02] CU on Ray -> [ACT] Ray exhales smoke -> <chair creak>'
    );
    expect(parseAuteurScript(edited).execution?.beats[1].raw).toBe(
      '[CAM 02] CU on Ray -> [ACT] Ray exhales smoke -> <chair creak>'
    );

    const inserted = insertExecutionBeat(
      edited,
      1,
      '[CAM 01] -> [ACT] Silence hangs over the table -> <fluorescent hum>'
    );
    const docAfterInsert = parseAuteurScript(inserted);
    expect(docAfterInsert.execution?.beats).toHaveLength(4);
    expect(docAfterInsert.execution?.beats[1].raw).toContain('Silence hangs over the table');

    const reordered = reorderExecutionBeats(inserted, 4, 1);
    const docAfterReorder = parseAuteurScript(reordered);
    expect(docAfterReorder.execution?.beats).toHaveLength(4);
    expect(docAfterReorder.execution?.beats[0].raw).toContain('Miller leans forward');

    const deleted = deleteExecutionBeat(reordered, 1);
    const docAfterDelete = parseAuteurScript(deleted);
    expect(docAfterDelete.execution?.beats).toHaveLength(3);
    expect(docAfterDelete.execution?.beats[0].raw).toContain('MS, OTS Miller');
  });

  it('supports in-place waterfall Sub-State edits, -> splits, inserts, deletes, and merges', () => {
    // Update single Sub-State and split with ->
    const split = updateExecutionSubState(
      INTERROGATION,
      3,
      1,
      '[ACT] Miller leans forward -> <chair legs scraping>'
    );
    const docSplit = parseAuteurScript(split);
    expect(docSplit.execution?.beats[2].subStates.map((s) => s.raw)).toEqual([
      '[CAM 01]',
      '[ACT] Miller leans forward',
      '<chair legs scraping>',
      '[ACT] Park, in the background, uncrosses his arms and takes one step toward the table',
      "<steel table groaning under Miller's weight>",
    ]);

    // Insert a Sub-State after index 2
    const inserted = insertExecutionSubState(split, 3, 2, 'Miller says (quietly) {Your move.}');
    expect(parseAuteurScript(inserted).execution?.beats[2].subStates[3].kind).toBe('dialogue');

    // Merge Sub-State back into previous (Backspace at col 0)
    const merged = mergeExecutionSubStateWithPrevious(inserted, 3, 2);
    expect(parseAuteurScript(merged).execution?.beats[2].subStates[1].raw).toBe(
      '[ACT] Miller leans forward <chair legs scraping>'
    );

    // Delete single Sub-State
    const removed = deleteExecutionSubState(merged, 3, 2);
    expect(parseAuteurScript(removed).execution?.beats[2].subStates).toHaveLength(4);
  });

  it('inserts at index 0 (before first beat) and appends [EXECUTION] when missing', () => {
    const atTop = insertExecutionBeat(INTERROGATION, 0, '[CAM 01] WS -> [ACT] Room settles');
    const parsedTop = parseAuteurScript(atTop);
    expect(parsedTop.execution?.beats).toHaveLength(4);
    expect(parsedTop.execution?.beats[0].raw).toBe('[CAM 01] WS -> [ACT] Room settles');

    const stagingOnly = `[INTENT]\nCreate a silent study.`;
    const createdExec = insertExecutionBeat(stagingOnly, 0, '[CAM 01] MS -> [ACT] Door opens');
    const parsedNew = parseAuteurScript(createdExec);
    expect(parsedNew.execution?.beats).toHaveLength(1);
    expect(parsedNew.execution?.beats[0].raw).toBe('[CAM 01] MS -> [ACT] Door opens');
  });

  it('exports Tagless text cleanly and drops empty bare camera holds without dangling leading arrows', () => {
    const tagless = exportTagless(INTERROGATION);
    const doc = parseAuteurScript(tagless);

    expect(doc.execution?.beats).toHaveLength(3);
    // Line 1: [CAM 01] MS, OTS Miller -> [BLOCK] ... -> [ACT] ...
    expect(doc.execution?.beats[0].raw.startsWith('MS, OTS Miller -> Miller frame-left FG')).toBe(
      true
    );
    expect(doc.execution?.beats[0].raw).not.toContain('[CAM 01]');
    expect(doc.execution?.beats[0].raw).not.toContain('[BLOCK]');
    expect(doc.execution?.beats[0].raw).not.toContain('[ACT]');

    // Line 3: originally "[CAM 01] -> [ACT] Miller leans forward..."
    // Bare [CAM 01] hold must vanish with ZERO leading "->"
    const line3 = doc.execution!.beats[2].raw;
    expect(line3.startsWith('Miller leans forward')).toBe(true);
    expect(line3.startsWith('->')).toBe(false);
    expect(line3).toContain('-> Park, in the background, uncrosses his arms');
    expect(line3).toContain('<steel table groaning under Miller\'s weight>');
  });

  it('normalizes CRLF and trailing spaces in exportPlainText', () => {
    const messy = '[INTENT]   \r\nCreate a scene.  \r\n\r\n[EXECUTION]\r\n[CAM 01] MS -> [ACT] Hold  \r\n';
    expect(exportPlainText(messy)).toBe(
      '[INTENT]\nCreate a scene.\n\n[EXECUTION]\n[CAM 01] MS -> [ACT] Hold'
    );
  });
});
