import {describe, expect, it} from 'vitest';
import {applyAuteurPatch, toAuteurEnvelope} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';

const INTERROGATION = SCRIPT_PRESETS[0].content;

describe('Auteur Script Transactional Patch Engine', () => {
  it('executes multi-op batches by snapshot ID without index drift', () => {
    const before = toAuteurEnvelope(INTERROGATION);

    const res = applyAuteurPatch(INTERROGATION, {
      expectedSnapshotHash: before.snapshotHash,
      summary: 'Delete S1, modify S3.1, and insert a new Macro-State after S2',
      ops: [
        {op: 'delete_macro_state', macroStateId: 'S1'},
        {
          op: 'replace_sub_state',
          subStateId: 'S3.1',
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
    // Original S2 is now S1, inserted CAM 03 is S2, original S3 (with edited S3.1) is S3
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
          afterSubStateId: 'S2.4',
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
      id: 'S3.5',
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
          afterSubStateId: 'S1.1',
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
            subStateId: 'S1.2',
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
});
