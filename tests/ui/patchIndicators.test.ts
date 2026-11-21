import {describe, expect, it} from 'vitest';
import {applyAuteurPatch, toAuteurEnvelope, type AuteurPatch} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';
import {buildLineDiff, type PatchSuggestion} from '../../src/services/scriptTools.ts';
import type {AiChatMessage} from '../../src/ui/aiAssistant.ts';
import {
  buildLivePatchIndicators,
  buildMultiLineWordDiff,
  collectActiveAiPatches,
  diffWords,
} from '../../src/ui/patchIndicators.ts';
import {
  stabilizeBeatPatchMap,
  stabilizeBlockPatchMap,
  stabilizeInsertionPatchMap,
} from '../../src/ui/referenceStability.ts';

const INTERROGATION = SCRIPT_PRESETS[0].content;

function makePatchSuggestion(id: string, rawText: string, patch: AuteurPatch): PatchSuggestion {
  const before = toAuteurEnvelope(rawText);
  const applied = applyAuteurPatch(rawText, patch);
  if (!applied.ok || !applied.nextEnvelope) {
    throw new Error(`Test fixture patch ${id} failed to apply`);
  }

  return {
    id,
    kind: 'patch',
    summary: patch.summary ?? `Patch ${id}`,
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

describe('Quiet AI Patch Indicators & Word Diff', () => {
  it('computes clean word-level diffs preserving unchanged text and punctuation', () => {
    const tokens = diffWords(
      '[CAM 01] MS -> [ACT] Miller turns quickly -> {Wait.}',
      '[CAM 01] CU -> [ACT] Miller turns slowly -> {Wait.}'
    );

    expect(tokens).toEqual([
      {type: 'equal', text: '[CAM 01] '},
      {type: 'removed', text: 'MS'},
      {type: 'added', text: 'CU'},
      {type: 'equal', text: ' -> [ACT] Miller turns '},
      {type: 'removed', text: 'quickly'},
      {type: 'added', text: 'slowly'},
      {type: 'equal', text: ' -> {Wait.}'},
    ]);
  });

  it('compacts long multi-line Staging diffs while preserving paired word highlights', () => {
    const before = [
      'Lens: 35mm anamorphic',
      'Lighting: warm tungsten',
      'Palette: muted slate',
      'Grain: 35mm fine',
      'Aspect: 2.39:1',
      'Texture: damp concrete',
      'Atmosphere: stale smoke',
    ].join('\n');
    const after = [
      'Lens: 35mm anamorphic',
      'Lighting: cold fluorescent',
      'Palette: muted slate',
      'Grain: 35mm fine',
      'Aspect: 2.39:1',
      'Texture: damp concrete',
      'Atmosphere: stale smoke',
    ].join('\n');

    const lines = buildMultiLineWordDiff(before, after);
    expect(lines.some((l) => l.kind === 'changed')).toBe(true);
    expect(lines.some((l) => l.kind === 'omitted' && (l.omittedCount ?? 0) >= 3)).toBe(true);

    const changedLine = lines.find((l) => l.kind === 'changed')!;
    expect(changedLine.tokens).toEqual([
      {type: 'equal', text: 'Lighting: '},
      {type: 'removed', text: 'warm tungsten'},
      {type: 'added', text: 'cold fluorescent'},
    ]);
  });

  it('collects only active (unapplied, undismissed, non-stale) patches and audit fixes', () => {
    const envelope = toAuteurEnvelope(INTERROGATION);
    const activeRefine = makePatchSuggestion('p-active', INTERROGATION, {
      summary: 'Tighten S1 action',
      ops: [
        {
          op: 'replace_sub_state',
          subStateId: 'S1.3',
          subState: {dimension: 'action', subStateTag: 'ACT', content: 'Miller leans forward'},
        },
      ],
    });
    const appliedPatch = makePatchSuggestion('p-applied', INTERROGATION, {
      summary: 'Already applied',
      ops: [{op: 'delete_macro_state', macroStateId: 'S3'}],
    });
    const dismissedPatch = makePatchSuggestion('p-dismissed', INTERROGATION, {
      summary: 'Dismissed',
      ops: [{op: 'delete_macro_state', macroStateId: 'S2'}],
    });
    const stalePatch: PatchSuggestion = {
      ...makePatchSuggestion('p-stale', INTERROGATION, {
        summary: 'Stale patch',
        ops: [{op: 'delete_macro_state', macroStateId: 'S1'}],
      }),
      baseSnapshotHash: 'different-snapshot-hash',
    };
    const auditFix = makePatchSuggestion('fix-1', INTERROGATION, {
      summary: 'Fix S2 lighting',
      ops: [
        {
          op: 'insert_sub_state',
          macroStateId: 'S2',
          afterSubStateId: 'S2.1',
          subState: {dimension: 'light', subStateTag: 'LIGHT', content: 'overhead flicker'},
        },
      ],
    });

    const messages: AiChatMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        mode: 'refine',
        focus: 'refine',
        text: 'Proposed edits.',
        suggestions: [activeRefine, appliedPatch, dismissedPatch, stalePatch],
        appliedSuggestionIds: ['p-applied'],
        dismissedSuggestionIds: ['p-dismissed'],
      },
      {
        id: 'm2',
        role: 'assistant',
        mode: 'check',
        focus: 'audit',
        text: 'Audit complete.',
        suggestions: [
          {
            id: 'audit-1',
            kind: 'audit_review',
            baseSnapshotHash: envelope.snapshotHash,
            overallSummary: 'One lighting note.',
            errorCount: 0,
            warningCount: 1,
            issues: [
              {
                id: 'issue-1',
                lens: 'Lens 1: Spatial & Optics',
                severity: 'warning',
                targetLevel: 'macro_state',
                targetId: 'S2',
                message: 'Anchor overhead light transition on S2',
                rationale: 'Keeps illumination explicit across the cut.',
                repairHint: 'Add a [LIGHT] Sub-State.',
                patchSuggestion: auditFix,
              },
            ],
          },
        ],
      },
    ];

    const collected = collectActiveAiPatches(messages, envelope.snapshotHash);
    expect(collected.map((item) => item.id)).toEqual(['p-active', 'fix-1']);
    expect(collected[0]).toMatchObject({
      messageId: 'm1',
      sourceKind: 'patch',
    });
    expect(collected[1]).toMatchObject({
      messageId: 'm2',
      sourceKind: 'audit_fix',
      lens: 'Lens 1: Spatial & Optics',
      issueMessage: 'Anchor overhead light transition on S2',
    });

    // Streaming turns propagate isStreaming so Live Mode popovers disable Apply until completion
    const streamingMessages = messages.map((m, idx) =>
      idx === 0 ? {...m, isStreaming: true} : m
    );
    const collectedStreaming = collectActiveAiPatches(streamingMessages, envelope.snapshotHash);
    expect(collectedStreaming[0]?.isStreaming).toBe(true);
    expect(collectedStreaming[1]?.isStreaming).toBeUndefined();

    // Changing snapshot hash immediately clears all stale patches
    expect(collectActiveAiPatches(messages, 'mutated-hash')).toEqual([]);
  });

  it('aggregates multiple active patches into indexed maps and preserves reference stability', () => {
    const patchA = makePatchSuggestion('p-a', INTERROGATION, {
      summary: 'Edit S1 and insert after S2',
      ops: [
        {
          op: 'replace_sub_state',
          subStateId: 'S1.3',
          subState: {dimension: 'action', subStateTag: 'ACT', content: 'Miller leans in slowly'},
        },
        {
          op: 'insert_macro_state',
          afterMacroStateId: 'S2',
          subStates: [
            {dimension: 'camera', subStateTag: 'CAM', identifier: '03', content: 'CU on Park'},
            {dimension: 'action', subStateTag: 'ACT', content: 'Park shifts in the chair'},
          ],
        },
      ],
    });

    const patchB = makePatchSuggestion('p-b', INTERROGATION, {
      summary: 'Update AESTHETIC and also tweak S1',
      ops: [
        {op: 'set_aesthetic_entry', key: 'Lighting', value: 'harsh fluorescent overhead'},
        {
          op: 'replace_sub_state',
          subStateId: 'S1.1',
          subState: {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: 'CU on Miller'},
        },
      ],
    });

    const activeItems = [
      {
        id: patchA.id,
        messageId: 'm1',
        sourceKind: 'patch' as const,
        summary: patchA.summary,
        isStreaming: false,
        suggestion: patchA,
      },
      {
        id: patchB.id,
        messageId: 'm2',
        sourceKind: 'patch' as const,
        summary: patchB.summary,
        isStreaming: false,
        suggestion: patchB,
      },
    ];

    const maps1 = buildLivePatchIndicators(INTERROGATION, activeItems);
    const maps2 = buildLivePatchIndicators(INTERROGATION, activeItems);

    // S1 receives both patch indicators; MB2 (AESTHETIC) receives 1; insertion sits after S2
    expect(maps1.executionByBeatIndex.get(1)).toHaveLength(2);
    expect(maps1.stagingByBlockIndex.get(2)).toHaveLength(1);
    expect(maps1.executionInsertionsByAfterBeatIndex.get(2)).toHaveLength(1);

    // Map stabilizers must return previous map references when content is structurally identical
    expect(stabilizeBlockPatchMap(maps1.stagingByBlockIndex, maps2.stagingByBlockIndex)).toBe(
      maps1.stagingByBlockIndex
    );
    expect(stabilizeBeatPatchMap(maps1.executionByBeatIndex, maps2.executionByBeatIndex)).toBe(
      maps1.executionByBeatIndex
    );
    expect(
      stabilizeInsertionPatchMap(
        maps1.executionInsertionsByAfterBeatIndex,
        maps2.executionInsertionsByAfterBeatIndex
      )
    ).toBe(maps1.executionInsertionsByAfterBeatIndex);

    // Flipping isStreaming must invalidate the stabilized maps so Live Mode Apply unlocks immediately
    const streamingMaps = buildLivePatchIndicators(
      INTERROGATION,
      activeItems.map((item) => ({...item, isStreaming: true}))
    );
    expect(
      stabilizeBeatPatchMap(maps1.executionByBeatIndex, streamingMaps.executionByBeatIndex)
    ).not.toBe(maps1.executionByBeatIndex);
  });
});
