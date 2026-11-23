import {describe, expect, it} from 'vitest';
import {applyAuteurPatch, toAuteurEnvelope, type AuteurPatch} from '../../src/core/index.ts';
import {TEST_CRAFT_EXEMPLARS} from '../fixtures/craftExemplars.ts';
import {
  buildLineDiff,
  composeAuditFixesBatch,
  rebaseAuditReviewAfterFix,
  type AuditReviewSuggestion,
  type PatchSuggestion,
} from '../../src/services/scriptTools.ts';

const INTERROGATION = TEST_CRAFT_EXEMPLARS['interrogation-coverage'].content;

function makeFix(id: string, rawText: string, patch: AuteurPatch): PatchSuggestion {
  const before = toAuteurEnvelope(rawText);
  const applied = applyAuteurPatch(rawText, patch, {rejectOnNewErrors: true});
  if (!applied.ok || !applied.nextEnvelope) {
    throw new Error(`Fixture patch ${id} failed: ${applied.errors.map((e) => e.message).join('; ')}`);
  }

  return {
    id,
    kind: 'patch',
    summary: patch.summary ?? `Fix ${id}`,
    baseSnapshotHash: before.snapshotHash,
    nextSnapshotHash: applied.nextEnvelope.snapshotHash,
    affectedIds: [],
    opsCount: patch.ops.length,
    patch,
    beforeRawText: rawText,
    candidateRawText: applied.nextRawText,
    diff: buildLineDiff(rawText, applied.nextRawText),
    lintDelta: {
      beforeErrors: 0,
      beforeWarnings: 0,
      afterErrors: 0,
      afterWarnings: 0,
      introducedErrors: [],
      introducedWarnings: [],
      resolvedDiagnostics: [],
    },
  };
}

function makeAudit(
  rawText: string,
  fixes: Array<{targetId: string; patch: PatchSuggestion}>
): AuditReviewSuggestion {
  const env = toAuteurEnvelope(rawText);
  return {
    id: 'audit-1',
    kind: 'audit_review',
    baseSnapshotHash: env.snapshotHash,
    overallSummary: 'Test audit review.',
    errorCount: 0,
    warningCount: fixes.length,
    issues: fixes.map((item, idx) => ({
      id: `issue-${idx + 1}`,
      lens: 'Lens 4: Acoustics & Voice',
      severity: 'warning',
      targetLevel: 'macro_state',
      targetId: item.targetId,
      message: `Issue on ${item.targetId}`,
      rationale: 'Test rationale.',
      repairHint: 'Test repair hint.',
      patchSuggestion: item.patch,
    })),
  };
}

describe('Audit Review Smart Sibling Rebase & Apply All Batching', () => {
  it('rebases disjoint sibling fixes sequentially without losing prior edits', () => {
    const fixS1 = makeFix('fix-s1', INTERROGATION, {
      summary: 'Tighten S1 action',
      ops: [
        {
          op: 'replace_sub_state',
          subStateId: 'S1.3',
          subState: {dimension: 'action', subStateTag: 'ACT', content: 'Miller taps the table once'},
        },
      ],
    });
    const fixS2 = makeFix('fix-s2', INTERROGATION, {
      summary: 'Adjust S2 lighting',
      ops: [
        {
          op: 'insert_sub_state',
          macroStateId: 'S2',
          afterSubStateId: 'S2.1',
          subState: {dimension: 'light', subStateTag: 'LIGHT', content: 'overhead tube hums dimly'},
        },
      ],
    });
    const fixAesthetic = makeFix('fix-mb2', INTERROGATION, {
      summary: 'Refine AESTHETIC lighting',
      ops: [{op: 'set_aesthetic_entry', key: 'Lighting', value: 'cold overhead fluorescent'}],
    });

    const audit0 = makeAudit(INTERROGATION, [
      {targetId: 'S1', patch: fixS1},
      {targetId: 'S2', patch: fixS2},
      {targetId: 'MB2', patch: fixAesthetic},
    ]);

    // Step 1: Apply fixS1 and rebase siblings
    const text1 = fixS1.candidateRawText;
    const hash1 = toAuteurEnvelope(text1).snapshotHash;
    const audit1 = rebaseAuditReviewAfterFix(audit0, fixS1, text1, new Set(['fix-s1']));

    const rebasedS2 = audit1.issues[1].patchSuggestion!;
    const rebasedMb2 = audit1.issues[2].patchSuggestion!;
    expect(rebasedS2.baseSnapshotHash).toBe(hash1);
    expect(rebasedMb2.baseSnapshotHash).toBe(hash1);
    expect(rebasedS2.candidateRawText).toContain('Miller taps the table once');
    expect(rebasedS2.candidateRawText).toContain('[LIGHT] overhead tube hums dimly');

    // Step 2: Apply rebasedS2 and rebase remaining fixAesthetic
    const text2 = rebasedS2.candidateRawText;
    const hash2 = toAuteurEnvelope(text2).snapshotHash;
    const audit2 = rebaseAuditReviewAfterFix(
      audit1,
      rebasedS2,
      text2,
      new Set(['fix-s1', 'fix-s2'])
    );

    const rebasedMb2Step2 = audit2.issues[2].patchSuggestion!;
    expect(rebasedMb2Step2.baseSnapshotHash).toBe(hash2);
    expect(rebasedMb2Step2.candidateRawText).toContain('Miller taps the table once');
    expect(rebasedMb2Step2.candidateRawText).toContain('[LIGHT] overhead tube hums dimly');
    expect(rebasedMb2Step2.candidateRawText).toContain('Lighting: cold overhead fluorescent');
  });

  it('keeps conflicting or index-shifted siblings stale while still rebasing unaffected phases', () => {
    const deleteS1 = makeFix('fix-del-s1', INTERROGATION, {
      summary: 'Delete S1',
      ops: [{op: 'delete_macro_state', macroStateId: 'S1'}],
    });
    const editS2 = makeFix('fix-edit-s2', INTERROGATION, {
      summary: 'Edit S2',
      ops: [
        {
          op: 'insert_sub_state',
          macroStateId: 'S2',
          afterSubStateId: 'S2.1',
          subState: {dimension: 'light', subStateTag: 'LIGHT', content: 'overhead shadow'},
        },
      ],
    });
    const editAesthetic = makeFix('fix-edit-mb2', INTERROGATION, {
      summary: 'Edit AESTHETIC',
      ops: [{op: 'set_aesthetic_entry', key: 'Lighting', value: 'harsh sodium vapor'}],
    });

    const beforeHash = toAuteurEnvelope(INTERROGATION).snapshotHash;
    const audit0 = makeAudit(INTERROGATION, [
      {targetId: 'S1', patch: deleteS1},
      {targetId: 'S2', patch: editS2},
      {targetId: 'MB2', patch: editAesthetic},
    ]);

    const nextText = deleteS1.candidateRawText;
    const nextHash = toAuteurEnvelope(nextText).snapshotHash;
    const audit1 = rebaseAuditReviewAfterFix(audit0, deleteS1, nextText, new Set(['fix-del-s1']));

    // Execution sibling S2 must stay stale because deleting S1 shifted Execution S# IDs
    expect(audit1.issues[1].patchSuggestion!.baseSnapshotHash).toBe(beforeHash);
    // Staging sibling MB2 is unaffected by Execution index shifts and rebases cleanly
    expect(audit1.issues[2].patchSuggestion!.baseSnapshotHash).toBe(nextHash);
    expect(audit1.issues[2].patchSuggestion!.candidateRawText).toContain(
      'Lighting: harsh sodium vapor'
    );
  });

  it('keeps same-Macro-State conflicting siblings stale on rebase', () => {
    const fixS1a = makeFix('fix-s1-a', INTERROGATION, {
      ops: [
        {
          op: 'replace_sub_state',
          subStateId: 'S1.3',
          subState: {dimension: 'action', subStateTag: 'ACT', content: 'Miller leans back'},
        },
      ],
    });
    const fixS1b = makeFix('fix-s1-b', INTERROGATION, {
      ops: [
        {
          op: 'replace_sub_state',
          subStateId: 'S1.1',
          subState: {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: 'CU on Miller'},
        },
      ],
    });

    const beforeHash = toAuteurEnvelope(INTERROGATION).snapshotHash;
    const audit0 = makeAudit(INTERROGATION, [
      {targetId: 'S1.3', patch: fixS1a},
      {targetId: 'S1.1', patch: fixS1b},
    ]);

    const audit1 = rebaseAuditReviewAfterFix(
      audit0,
      fixS1a,
      fixS1a.candidateRawText,
      new Set(['fix-s1-a'])
    );

    expect(audit1.issues[1].patchSuggestion!.baseSnapshotHash).toBe(beforeHash);
  });

  it('composes all disjoint Audit fixes (including structural deletes) into a single transactional batch', () => {
    const deleteS1 = makeFix('fix-del-s1', INTERROGATION, {
      ops: [{op: 'delete_macro_state', macroStateId: 'S1'}],
    });
    const editS2 = makeFix('fix-edit-s2', INTERROGATION, {
      ops: [
        {
          op: 'insert_sub_state',
          macroStateId: 'S2',
          afterSubStateId: 'S2.1',
          subState: {dimension: 'light', subStateTag: 'LIGHT', content: 'pale doorway glare'},
        },
      ],
    });
    const editMb2 = makeFix('fix-edit-mb2', INTERROGATION, {
      ops: [{op: 'set_aesthetic_entry', key: 'Lighting', value: 'cold daylight spill'}],
    });

    const hash = toAuteurEnvelope(INTERROGATION).snapshotHash;
    const audit = makeAudit(INTERROGATION, [
      {targetId: 'S1', patch: deleteS1},
      {targetId: 'S2', patch: editS2},
      {targetId: 'MB2', patch: editMb2},
    ]);

    const plan = composeAuditFixesBatch(INTERROGATION, audit, [], hash);
    expect(plan.eligibleCount).toBe(3);
    expect(plan.skippedCount).toBe(0);
    expect(plan.includedFixIds).toEqual(['fix-del-s1', 'fix-edit-s2', 'fix-edit-mb2']);
    expect(plan.combinedPatch).not.toBeNull();
    expect(plan.combinedPatch!.candidateRawText).toContain('[LIGHT] pale doorway glare');
    expect(plan.combinedPatch!.candidateRawText).toContain('Lighting: cold daylight spill');
    // Original S1 was deleted so only 2 Macro-States remain
    expect(toAuteurEnvelope(plan.combinedPatch!.candidateRawText).document.executionMacroBlock!.macroStates).toHaveLength(2);
  });

  it('skips overlapping conflicting fixes in batch composition and returns null when < 2 remain', () => {
    const fixS1a = makeFix('fix-s1-a', INTERROGATION, {
      ops: [
        {
          op: 'replace_sub_state',
          subStateId: 'S1.3',
          subState: {dimension: 'action', subStateTag: 'ACT', content: 'Miller adjusts his collar'},
        },
      ],
    });
    const fixS1b = makeFix('fix-s1-b', INTERROGATION, {
      ops: [
        {
          op: 'replace_sub_state',
          subStateId: 'S1.3',
          subState: {dimension: 'action', subStateTag: 'ACT', content: 'Miller folds his hands'},
        },
      ],
    });
    const fixS2 = makeFix('fix-s2', INTERROGATION, {
      ops: [
        {
          op: 'insert_sub_state',
          macroStateId: 'S2',
          afterSubStateId: 'S2.1',
          subState: {dimension: 'light', subStateTag: 'LIGHT', content: 'dim tungsten'},
        },
      ],
    });

    const hash = toAuteurEnvelope(INTERROGATION).snapshotHash;
    const audit = makeAudit(INTERROGATION, [
      {targetId: 'S1', patch: fixS1a},
      {targetId: 'S1', patch: fixS1b},
      {targetId: 'S2', patch: fixS2},
    ]);

    const plan = composeAuditFixesBatch(INTERROGATION, audit, [], hash);
    expect(plan.eligibleCount).toBe(3);
    expect(plan.includedFixIds).toEqual(['fix-s1-a', 'fix-s2']);
    expect(plan.skippedCount).toBe(1);
    expect(plan.combinedPatch).not.toBeNull();

    // Once fix-s1-a and fix-s2 are already applied, only 1 fix remains -> no batch button
    const planAfter = composeAuditFixesBatch(
      INTERROGATION,
      audit,
      ['fix-s1-a', 'fix-s2'],
      hash
    );
    expect(planAfter.eligibleCount).toBe(1);
    expect(planAfter.combinedPatch).toBeNull();
  });
});
