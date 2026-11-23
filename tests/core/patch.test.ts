import {describe, expect, it} from 'vitest';
import {
  applyAuteurPatch,
  projectAuteurPatchPreview,
  toAuteurEnvelope,
} from '../../src/core/index.ts';
import {TEST_CRAFT_EXEMPLARS} from '../fixtures/craftExemplars.ts';

const INTERROGATION = TEST_CRAFT_EXEMPLARS['interrogation-coverage'].content;

describe('Auteur Script Transactional Patch Engine', () => {
  it('executes multi-op batches by snapshot ID without index drift', () => {
    const before = toAuteurEnvelope(INTERROGATION);

    const res = applyAuteurPatch(INTERROGATION, {
      expectedSnapshotHash: before.snapshotHash,
      summary: 'Delete S1, modify S3.2, and insert a new Macro-State after S2',
      ops: [
        {op: 'delete_macro_state', macroStateId: 'S1'},
        {
          op: 'replace_sub_state',
          subStateId: 'S3.2',
          subState: {
            dimension: 'action',
            subStateTag: 'ACT',
            content: 'Miller slams his left palm flat on the manila folder',
          },
        },
        {
          op: 'insert_macro_state',
          afterMacroStateId: 'S2',
          subStates: [
            {dimension: 'camera', subStateTag: 'CAM', identifier: '03', content: 'CU on Park'},
            {
              dimension: 'action',
              subStateTag: 'ACT',
              content: 'Park narrows his eyes against the wall',
            },
          ],
        },
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.appliedOpsCount).toBe(3);

    const after = res.nextEnvelope!;
    const states = after.document.executionMacroBlock!.macroStates;
    expect(states).toHaveLength(3);
    // Original S2 is now S1, inserted CAM 03 is S2, original S3 (with edited S3.2) is S3
    expect(states[0].subStates[0]).toMatchObject({dimension: 'camera', identifier: '02'});
    expect(states[1].subStates[0]).toMatchObject({
      dimension: 'camera',
      identifier: '03',
      content: 'CU on Park',
    });
    expect(states[2].subStates[1]).toMatchObject({
      dimension: 'action',
      content: 'Miller slams his left palm flat on the manila folder',
    });
  });

  it('supports AESTHETIC key: value updates and token mapping upserts/deletions', () => {
    const res = applyAuteurPatch(INTERROGATION, {
      ops: [
        {
          op: 'set_aesthetic_entry',
          key: 'Lighting',
          value: 'flickering sodium vapor overhead, hard falloff',
        },
        {
          op: 'set_aesthetic_entry',
          key: 'Palette',
          value: 'charcoal steel and sickly amber',
        },
        {
          op: 'upsert_token_mapping',
          category: 'Location',
          description: 'concrete interrogation room',
          token: 'LOC01',
        },
        {
          op: 'upsert_token_mapping',
          category: 'Location',
          description: 'rainy exterior precinct steps',
          token: 'LOC02',
        },
        {
          op: 'upsert_token_mapping',
          category: 'Location',
          description: 'sweat-stained concrete interrogation room',
          token: 'LOC01',
        },
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.nextEnvelope!.derived.tokenMappings).toEqual([
      {
        token: 'LOC01',
        description: 'sweat-stained concrete interrogation room',
        category: 'Location',
        entryId: 'MB2.2',
      },
      {
        token: 'LOC02',
        description: 'rainy exterior precinct steps',
        category: 'Location',
        entryId: 'MB2.2',
      },
    ]);
    expect(res.nextRawText).toContain('Lighting: flickering sodium vapor overhead, hard falloff');
    expect(res.nextRawText).toContain('Palette: charcoal steel and sickly amber');

    // Delete LOC02 cleanly without touching LOC01
    const deleted = applyAuteurPatch(res.nextRawText, {
      ops: [{op: 'delete_token_mapping', token: 'LOC02'}],
    });
    expect(deleted.ok).toBe(true);
    expect(deleted.nextEnvelope!.derived.tokenMappings.map((t) => t.token)).toEqual(['LOC01']);
  });

  it('reorders Macro-States, manages Staging Macro-Blocks, and inserts/deletes Sub-States', () => {
    const res = applyAuteurPatch(INTERROGATION, {
      ops: [
        {
          op: 'insert_macro_block',
          afterMacroBlockId: 'MB0',
          macroBlock: {
            header: 'CHARACTERS',
            format: 'prose',
            body: '@image1 as Miller; @image2 as Ray',
          },
        },
        {
          op: 'reorder_macro_states',
          macroStateId: 'S3',
          afterMacroStateId: null,
        },
        {
          op: 'insert_sub_state',
          macroStateId: 'S2',
          afterSubStateId: 'S2.5',
          subState: {dimension: 'foley', sound: 'cigarette ash hiss'},
        },
      ],
    });

    expect(res.ok).toBe(true);
    const doc = res.nextEnvelope!.document;
    expect(doc.stagingMacroBlocks[1]).toMatchObject({
      header: 'CHARACTERS',
      kind: 'CHARACTERS',
      format: 'prose',
    });
    expect(res.nextEnvelope!.derived.referenceBindings).toHaveLength(2);
    // Original S3 moved to S1
    expect(doc.executionMacroBlock!.macroStates[0].subStates[1]).toMatchObject({
      dimension: 'action',
      content: 'Miller leans forward and plants both palms flat on the folder',
    });
    // Inserted foley on original S2 (now S3)
    const movedS2 = doc.executionMacroBlock!.macroStates[2];
    expect(movedS2.subStates[movedS2.subStates.length - 1]).toEqual({
      id: 'S3.6',
      dimension: 'foley',
      sound: 'cigarette ash hiss',
    });
  });

  it('rejects stale snapshot hashes safely without mutating the script', () => {
    const res = applyAuteurPatch(INTERROGATION, {
      expectedSnapshotHash: 'deadbeef',
      ops: [{op: 'delete_macro_state', macroStateId: 'S1'}],
    });

    expect(res.ok).toBe(false);
    expect(res.errors[0].code).toBe('SNAPSHOT_MISMATCH');
    expect(res.nextRawText).toBe(INTERROGATION);
  });

  it('tracks resolved diagnostics and enforces rejectOnNewErrors lint gate', () => {
    // 1. Start with a script that has a macro-state-resolution warning (ends on dialogue)
    const warningScript = `[INTENT]
Create a tense scene.

[LOGIC]
Maintain 180-degree axis. No subtitles appear on screen.

[OPENING]
MS on Miller seated frame-left facing screen-right.

[EXECUTION]
[CAM 01] MS on Miller -> Miller says (quiet) {We need to talk.}`;

    const fixRes = applyAuteurPatch(warningScript, {
      ops: [
        {
          op: 'insert_sub_state',
          macroStateId: 'S1',
          afterSubStateId: 'S1.2',
          subState: {dimension: 'foley', sound: 'chair legs scraping concrete'},
        },
      ],
    });
    expect(fixRes.ok).toBe(true);
    expect(fixRes.diagnosticsBefore).toHaveLength(1);
    expect(fixRes.diagnosticsAfter).toHaveLength(0);
    expect(fixRes.resolvedDiagnostics).toHaveLength(1);

    // 2. Reject a patch that injects a banned theatrical term ("stage-left") when rejectOnNewErrors=true
    const badRes = applyAuteurPatch(
      INTERROGATION,
      {
        ops: [
          {
            op: 'replace_sub_state',
            subStateId: 'S1.3',
            subState: {
              dimension: 'action',
              subStateTag: 'ACT',
              content: 'Miller enters stage-left with the folder',
            },
          },
        ],
      },
      {rejectOnNewErrors: true}
    );

    expect(badRes.ok).toBe(false);
    expect(badRes.nextRawText).toBe(INTERROGATION);
    expect(badRes.candidateRawText).toContain('stage-left');
    expect(badRes.introducedErrors).toHaveLength(1);
    expect(badRes.introducedErrors[0].ruleId).toBe('viewport-coordinate-purity');
    expect(badRes.errors[0].code).toBe('LINT_ERROR_INTRODUCED');
  });

  it('blocks reserved Execution headers in insert_macro_block patches', () => {
    for (const reserved of ['EXECUTION', 'TIMELINE', 'BEATS', 'SHOTLIST']) {
      const res = applyAuteurPatch(INTERROGATION, {
        ops: [
          {
            op: 'insert_macro_block',
            afterMacroBlockId: 'MB0',
            macroBlock: {
              header: reserved,
              format: 'prose',
              body: 'Invalid staging block using reserved execution header.',
            },
          },
        ],
      });

      expect(res.ok).toBe(false);
      expect(res.errors[0].code).toBe('VALIDATION_ERROR');
      expect(res.nextRawText).toBe(INTERROGATION);
    }
  });

  it('does not falsely reject patches with rejectOnNewErrors when inserting, deleting, or reordering beats shifts pre-existing S# diagnostics', () => {
    const scriptWithPreExistingError = `[INTENT]
Create a tense standoff.

[LOGIC]
Maintain 180-degree axis. No subtitles appear on screen.

[OPENING]
MS on Miller seated frame-left facing screen-right.

[EXECUTION]
[CAM 01] MS on Miller -> [ACT] Miller checks his watch -> <ticking watch>
[CAM 02] CU on Ray -> [ACT] Ray enters stage-left with a folder -> <folder slap>
[CAM 01] WS on room -> [ACT] Park stands still -> <chair creak>`;

    // 1. Insert a clean beat BEFORE S1 (shifts S2 error -> S3 and S3 camera-redef warning -> S4)
    const insertRes = applyAuteurPatch(
      scriptWithPreExistingError,
      {
        ops: [
          {
            op: 'insert_macro_state',
            afterMacroStateId: null,
            subStates: [
              {dimension: 'camera', subStateTag: 'CAM', identifier: '03', content: 'EWS hallway'},
              {dimension: 'action', subStateTag: 'ACT', content: 'Fluorescent tube flickers overhead'},
              {dimension: 'foley', sound: 'ballast buzz'},
            ],
          },
        ],
      },
      {rejectOnNewErrors: true}
    );

    expect(insertRes.ok).toBe(true);
    expect(insertRes.introducedErrors).toHaveLength(0);
    expect(insertRes.introducedWarnings).toHaveLength(0);
    expect(insertRes.resolvedDiagnostics).toHaveLength(0);

    // 2. Delete clean S1 BEFORE S2 (shifts S2 error -> S1)
    const deleteRes = applyAuteurPatch(
      scriptWithPreExistingError,
      {
        ops: [{op: 'delete_macro_state', macroStateId: 'S1'}],
      },
      {rejectOnNewErrors: true}
    );

    expect(deleteRes.ok).toBe(true);
    expect(deleteRes.introducedErrors).toHaveLength(0);
    expect(deleteRes.errors).toHaveLength(0);

    // 3. Reorder S2 to top (shifts S2 error -> S1)
    const reorderRes = applyAuteurPatch(
      scriptWithPreExistingError,
      {
        ops: [{op: 'reorder_macro_states', macroStateId: 'S2', afterMacroStateId: null}],
      },
      {rejectOnNewErrors: true}
    );

    expect(reorderRes.ok).toBe(true);
    expect(reorderRes.introducedErrors).toHaveLength(0);

    // 4. Still REJECTS a patch that introduces a NEW beat with the SAME pre-existing error text!
    const duplicateErrRes = applyAuteurPatch(
      scriptWithPreExistingError,
      {
        ops: [
          {
            op: 'insert_macro_state',
            afterMacroStateId: 'S2',
            subStates: [
              {dimension: 'camera', subStateTag: 'CAM', identifier: '03', content: 'CU on door'},
              {dimension: 'action', subStateTag: 'ACT', content: 'Park enters stage-left quickly'},
            ],
          },
        ],
      },
      {rejectOnNewErrors: true}
    );

    expect(duplicateErrRes.ok).toBe(false);
    expect(duplicateErrRes.introducedErrors).toHaveLength(1);
    expect(duplicateErrRes.introducedErrors[0].targetId).toBe('S3');
    expect(duplicateErrRes.errors[0].code).toBe('LINT_ERROR_INTRODUCED');
  });

  it('parses [AESTHETIC] prose body updates via canonical parseAestheticLine consistently', () => {
    const res = applyAuteurPatch(INTERROGATION, {
      ops: [
        {
          op: 'set_macro_block',
          header: 'AESTHETIC',
          body: '  Medium: 16mm grainy\nWardrobe:\n  : stray colon note',
        },
      ],
    });

    expect(res.ok).toBe(true);
    const aesthetic = res.nextEnvelope!.document.stagingMacroBlocks.find(
      (b) => b.format === 'key_value'
    );
    expect(aesthetic?.format).toBe('key_value');
    if (aesthetic?.format === 'key_value') {
      expect(aesthetic.entries).toEqual([
        {id: 'MB2.0', key: 'Medium', value: '16mm grainy'},
        {id: 'MB2.1', key: 'Wardrobe', value: ''},
        {id: 'MB2.2', key: null, value: '  : stray colon note'},
      ]);
    }
    expect(res.nextRawText).toContain('[AESTHETIC]\nMedium: 16mm grainy\nWardrobe:\n  : stray colon note');
  });

  it('respects options.ruleOverrides during pre/post-patch linting and rejectOnNewErrors gating', () => {
    // 1. Default: adding trailing dialogue only triggers a warning, so rejectOnNewErrors allows it
    const trailingDialoguePatch = {
      ops: [
        {
          op: 'insert_sub_state' as const,
          macroStateId: 'S1',
          afterSubStateId: 'S1.5',
          subState: {dimension: 'dialogue' as const, speaker: 'Miller', line: 'Not another word.'},
        },
      ],
    };

    const defaultRes = applyAuteurPatch(INTERROGATION, trailingDialoguePatch, {
      rejectOnNewErrors: true,
    });
    expect(defaultRes.ok).toBe(true);
    expect(defaultRes.introducedWarnings.some((d) => d.ruleId === 'macro-state-resolution')).toBe(
      true
    );

    // 2. Promoting macro-state-resolution to 'error' causes rejectOnNewErrors to block the same patch
    const strictRes = applyAuteurPatch(INTERROGATION, trailingDialoguePatch, {
      rejectOnNewErrors: true,
      ruleOverrides: {'macro-state-resolution': 'error'},
    });
    expect(strictRes.ok).toBe(false);
    expect(strictRes.introducedErrors).toHaveLength(1);
    expect(strictRes.introducedErrors[0].ruleId).toBe('macro-state-resolution');
    expect(strictRes.errors[0].code).toBe('LINT_ERROR_INTRODUCED');

    // 3. Disabling viewport-coordinate-purity allows a patch with 'stage-left' under rejectOnNewErrors
    const relaxedRes = applyAuteurPatch(
      INTERROGATION,
      {
        ops: [
          {
            op: 'replace_sub_state',
            subStateId: 'S1.3',
            subState: {
              dimension: 'action',
              subStateTag: 'ACT',
              content: 'Miller enters stage-left with the folder',
            },
          },
        ],
      },
      {
        rejectOnNewErrors: true,
        ruleOverrides: {'viewport-coordinate-purity': 'off'},
      }
    );
    expect(relaxedRes.ok).toBe(true);
    expect(relaxedRes.introducedErrors).toHaveLength(0);
    expect(relaxedRes.diagnosticsAfter).toHaveLength(0);
  });

  describe('projectAuteurPatchPreview', () => {
    it('projects compound Staging and Execution ops accurately without index drift', () => {
      const before = toAuteurEnvelope(INTERROGATION);
      const projection = projectAuteurPatchPreview(INTERROGATION, {
        expectedSnapshotHash: before.snapshotHash,
        ops: [
          {
            op: 'set_aesthetic_entry',
            key: 'Lighting',
            value: 'flickering sodium vapor overhead',
          },
          {
            op: 'insert_macro_block',
            afterMacroBlockId: null,
            macroBlock: {
              header: 'STAGE',
              format: 'prose',
              body: 'Concrete box, single metal table bolted center-frame.',
            },
          },
          {
            op: 'delete_macro_state',
            macroStateId: 'S1',
          },
          {
            op: 'insert_macro_state',
            afterMacroStateId: 'S2',
            subStates: [
              {dimension: 'camera', subStateTag: 'CAM', identifier: '03', content: 'CU on Park'},
              {dimension: 'action', subStateTag: 'ACT', content: 'Park blinks once slowly'},
            ],
          },
          {
            op: 'replace_sub_state',
            subStateId: 'S3.2',
            subState: {
              dimension: 'action',
              subStateTag: 'ACT',
              content: 'Miller slams his left palm flat on the folder',
            },
          },
        ],
      });

      expect(projection).not.toBeNull();
      // Aesthetic block (MB2) modified
      expect(projection!.stagingChanges).toHaveLength(1);
      expect(projection!.stagingChanges[0]).toMatchObject({
        kind: 'modify',
        blockIndex: 2,
        header: 'AESTHETIC',
      });
      expect(projection!.stagingChanges[0].afterBody).toContain(
        'Lighting: flickering sodium vapor overhead'
      );

      // Staging block inserted before MB0 (afterBlockIndex = -1)
      expect(projection!.stagingInsertions).toEqual([
        {
          afterBlockIndex: -1,
          header: 'STAGE',
          body: 'Concrete box, single metal table bolted center-frame.',
        },
      ]);

      // Execution: S1 deleted, S3 modified (retaining original beatIndex 3 despite S1 delete + S2 insert!)
      expect(projection!.executionChanges).toHaveLength(2);
      expect(projection!.executionChanges[0]).toMatchObject({
        kind: 'delete',
        beatIndex: 1,
        macroStateId: 'S1',
      });
      expect(projection!.executionChanges[1]).toMatchObject({
        kind: 'modify',
        beatIndex: 3,
        macroStateId: 'S3',
      });
      expect(projection!.executionChanges[1].afterText).toContain(
        '[ACT] Miller slams his left palm flat on the folder'
      );

      // Inserted Macro-State anchored after original S2 (post-patch index 2 since S1 was deleted)
      expect(projection!.executionInsertions).toEqual([
        {
          afterBeatIndex: 2,
          insertedBeatIndex: 2,
          text: '[CAM 03] CU on Park -> [ACT] Park blinks once slowly',
        },
      ]);
    });

    it('projects delete_macro_block, reorder_macro_states, and auto-created AESTHETIC block', () => {
      const minimalScript = `[INTENT]\nTense standoff.\n\n[EXECUTION]\n[CAM 01] MS -> [ACT] One\n[CAM 02] CU -> [ACT] Two\n[CAM 03] WS -> [ACT] Three`;

      const projection = projectAuteurPatchPreview(minimalScript, {
        ops: [
          {op: 'delete_macro_block', macroBlockId: 'MB0'},
          {op: 'set_aesthetic_entry', key: 'Palette', value: 'cold steel'},
          {op: 'reorder_macro_states', macroStateId: 'S3', afterMacroStateId: null},
        ],
      });

      expect(projection).not.toBeNull();
      expect(projection!.stagingChanges).toEqual([
        {
          kind: 'delete',
          blockIndex: 0,
          blockId: 'MB0',
          header: 'INTENT',
          beforeBody: 'Tense standoff.',
        },
      ]);
      expect(projection!.stagingInsertions).toEqual([
        {
          afterBlockIndex: -1,
          header: 'AESTHETIC',
          body: 'Palette: cold steel',
        },
      ]);
      expect(projection!.executionChanges).toEqual([
        {
          kind: 'reorder',
          beatIndex: 3,
          macroStateId: 'S3',
          beforeText: '[CAM 03] WS -> [ACT] Three',
          afterText: '[CAM 03] WS -> [ACT] Three',
          movedToBeatIndex: 1,
        },
      ]);
    });

    it('returns null when snapshot hash mismatches or patch fails validation', () => {
      expect(
        projectAuteurPatchPreview(INTERROGATION, {
          expectedSnapshotHash: 'stale-hash-000',
          ops: [{op: 'delete_macro_state', macroStateId: 'S1'}],
        })
      ).toBeNull();

      expect(
        projectAuteurPatchPreview(INTERROGATION, {
          ops: [{op: 'delete_macro_state', macroStateId: 'S999'}],
        })
      ).toBeNull();
    });
  });
});

