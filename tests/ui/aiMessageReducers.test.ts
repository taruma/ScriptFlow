import {describe, expect, it} from 'vitest';
import {applyAuteurPatch, toAuteurEnvelope, type AuteurPatch} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';
import {
  GEMINI_DECISION_MODEL_ID,
  type QuickScanResult,
  type QuickScanTrace,
} from '../../src/services/geminiDecisions.ts';
import {
  buildLineDiff,
  type AuditReviewSuggestion,
  type PatchSuggestion,
} from '../../src/services/scriptTools.ts';
import type {AiChatMessage} from '../../src/ui/aiAssistant.ts';
import {
  appendTextDeltaInMessages,
  appendThoughtSummaryDeltaInMessages,
  applyBatchFixesReceiptToMessages,
  applyPatchReceiptToMessages,
  completeAssistantTurnInMessages,
  completeQuickScanInMessages,
  dismissQuickScanInMessages,
  failAssistantTurnInMessages,
  failQuickScanInMessages,
  markQuestionAnsweredInMessages,
  markSuggestionAppliedInMessages,
  markSuggestionDismissedInMessages,
  recordSkillLoadedInMessages,
  recordToolCallResultInMessages,
  recordToolCallStartInMessages,
  stageSuggestionInMessages,
} from '../../src/ui/ai/messageReducers.ts';

const INTERROGATION = SCRIPT_PRESETS[0].content;

function makeAssistantMessage(
  id: string,
  overrides: Partial<AiChatMessage> = {}
): AiChatMessage {
  return {
    id,
    role: 'assistant',
    mode: 'refine',
    focus: 'auto',
    text: '',
    thoughtSummary: '',
    toolCalls: [],
    loadedSkills: [],
    suggestions: [],
    dismissedSuggestionIds: [],
    appliedSuggestionIds: [],
    isStreaming: true,
    ...overrides,
  };
}

function makeFix(id: string, rawText: string, patch: AuteurPatch): PatchSuggestion {
  const before = toAuteurEnvelope(rawText);
  const applied = applyAuteurPatch(rawText, patch, {rejectOnNewErrors: true});
  if (!applied.ok || !applied.nextEnvelope) {
    throw new Error(
      `Fixture patch ${id} failed: ${applied.errors.map((e) => e.message).join('; ')}`
    );
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

function makeQuickScanFixture(snapshotHash: string): {
  result: QuickScanResult;
  trace: QuickScanTrace;
} {
  const result: QuickScanResult = {
    snapshotHash,
    rulesVersion: '1.0.0',
    sceneTopology: 'multi_camera_coverage',
    sensitivity: 'balanced',
    durationMs: 120,
    totalQuestions: 2,
    batchCount: 1,
    flaggedCount: 0,
    borderlineCount: 0,
    cleanCount: 2,
    deterministicCount: 0,
    skippedYoutubeHandles: [],
    lensSummaries: [],
    suspectBeats: [],
    allItems: [],
  };
  const trace: QuickScanTrace = {
    kind: 'quick_scan',
    model: GEMINI_DECISION_MODEL_ID,
    apiVersion: 'v1beta',
    sensitivity: 'balanced',
    snapshotHash,
    sceneTopology: 'multi_camera_coverage',
    startedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 120,
    totalQuestions: 2,
    batchCount: 1,
    skippedYoutubeHandles: [],
    input: 'test',
    questions: {},
    answers: {},
  };
  return {result, trace};
}

describe('ai messageReducers', () => {
  it('applies streaming text, thought, tool, skill, and suggestion deltas to the target message only', () => {
    const other = makeAssistantMessage('msg-other', {text: 'untouched', isStreaming: false});
    let messages: AiChatMessage[] = [other, makeAssistantMessage('msg-a1')];

    messages = appendThoughtSummaryDeltaInMessages(messages, 'msg-a1', 'Checking S1. ');
    messages = appendThoughtSummaryDeltaInMessages(messages, 'msg-a1', 'Looks clean.');
    messages = appendTextDeltaInMessages(messages, 'msg-a1', 'Hello ');
    messages = appendTextDeltaInMessages(messages, 'msg-a1', 'world');
    messages = recordToolCallStartInMessages(messages, 'msg-a1', {
      callId: 'call-1',
      name: 'get_script_overview',
      arguments: {},
    });
    messages = recordToolCallResultInMessages(messages, 'msg-a1', {
      callId: 'call-1',
      ok: true,
      stagedSuggestionId: 'sug-1',
    });
    messages = recordSkillLoadedInMessages(messages, 'msg-a1', {
      id: 'lens1',
      name: 'Spatial & Optics',
      source: 'tool',
    });

    const fix = makeFix('fix-s1', INTERROGATION, {
      summary: 'Tighten S1 action',
      ops: [
        {
          op: 'replace_sub_state',
          subStateId: 'S1.2',
          subState: {dimension: 'action', subStateTag: 'ACT', content: 'Miller taps the table once'},
        },
      ],
    });
    messages = stageSuggestionInMessages(messages, 'msg-a1', fix);

    expect(messages[0]).toBe(other);
    expect(messages[1].thoughtSummary).toBe('Checking S1. Looks clean.');
    expect(messages[1].text).toBe('Hello world');
    expect(messages[1].toolCalls).toEqual([
      {
        callId: 'call-1',
        name: 'get_script_overview',
        arguments: {},
        status: 'ok',
        stagedSuggestionId: 'sug-1',
      },
    ]);
    expect(messages[1].loadedSkills).toEqual([
      {id: 'lens1', name: 'Spatial & Optics', source: 'tool'},
    ]);
    expect(messages[1].suggestions).toHaveLength(1);
    expect(messages[1].suggestions?.[0].id).toBe('fix-s1');

    messages = completeAssistantTurnInMessages(messages, 'msg-a1', {
      text: '',
      thoughtSummary: '',
      hitToolRoundLimit: true,
    });
    expect(messages[1].isStreaming).toBe(false);
    expect(messages[1].text).toBe('Hello world');
    expect(messages[1].thoughtSummary).toBe('Checking S1. Looks clean.');
    expect(messages[1].hitToolRoundLimit).toBe(true);
  });

  it('marks running tool calls as stopped on abort and error on API failure while preserving finished tools', () => {
    const initial = [
      makeAssistantMessage('msg-a1', {
        toolCalls: [
          {callId: 'c1', name: 'get_script_overview', arguments: {}, status: 'ok'},
          {callId: 'c2', name: 'inspect_lens_slice', arguments: {}, status: 'running'},
        ],
      }),
    ];

    const aborted = failAssistantTurnInMessages(initial, 'msg-a1', {
      code: 'aborted',
      message: 'Cancelled',
    });
    expect(aborted[0].isStreaming).toBe(false);
    expect(aborted[0].toolCalls?.map((t) => t.status)).toEqual(['ok', 'stopped']);
    expect(aborted[0].error).toEqual({code: 'aborted', message: 'Cancelled'});

    const errored = failAssistantTurnInMessages(initial, 'msg-a1', {
      code: 'api_error',
      message: 'Boom',
    });
    expect(errored[0].toolCalls?.map((t) => t.status)).toEqual(['ok', 'error']);
    expect(errored[0].error).toEqual({code: 'api_error', message: 'Boom'});
  });

  it('applies a single audit fix receipt and rebases disjoint sibling audit fixes onto the new snapshot', () => {
    const fixS1 = makeFix('fix-s1', INTERROGATION, {
      summary: 'Tighten S1 action',
      ops: [
        {
          op: 'replace_sub_state',
          subStateId: 'S1.2',
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
          afterSubStateId: 'S2.0',
          subState: {dimension: 'light', subStateTag: 'LIGHT', content: 'overhead tube hums dimly'},
        },
      ],
    });
    const audit = makeAudit(INTERROGATION, [
      {targetId: 'S1', patch: fixS1},
      {targetId: 'S2', patch: fixS2},
    ]);
    const other = makeAssistantMessage('msg-other', {isStreaming: false});
    const messages = [
      other,
      makeAssistantMessage('msg-audit', {
        isStreaming: false,
        suggestions: [audit],
      }),
    ];

    const next = applyPatchReceiptToMessages(messages, 'msg-audit', fixS1, 'fix');
    expect(next[0]).toBe(other);
    expect(next[1].appliedSuggestionIds).toEqual(['fix-s1']);

    const updatedAudit = next[1].suggestions?.[0] as AuditReviewSuggestion;
    expect(updatedAudit.kind).toBe('audit_review');
    expect(updatedAudit.issues[0].patchSuggestion?.baseSnapshotHash).toBe(fixS1.baseSnapshotHash);
    expect(updatedAudit.issues[1].patchSuggestion?.baseSnapshotHash).toBe(fixS1.nextSnapshotHash);
    expect(updatedAudit.issues[1].patchSuggestion?.candidateRawText).toContain(
      'Miller taps the table once'
    );
    expect(updatedAudit.issues[1].patchSuggestion?.candidateRawText).toContain(
      'overhead tube hums dimly'
    );
  });

  it('marks standalone patch receipts applied without rebasing audit reviews', () => {
    const fixS1 = makeFix('patch-1', INTERROGATION, {
      summary: 'Tighten S1 action',
      ops: [
        {
          op: 'replace_sub_state',
          subStateId: 'S1.2',
          subState: {dimension: 'action', subStateTag: 'ACT', content: 'Miller taps the table once'},
        },
      ],
    });
    const messages = [
      makeAssistantMessage('msg-p', {
        isStreaming: false,
        suggestions: [fixS1],
      }),
    ];

    const next = applyPatchReceiptToMessages(messages, 'msg-p', fixS1, 'patch');
    expect(next[0].appliedSuggestionIds).toEqual(['patch-1']);
    expect(next[0].suggestions?.[0]).toBe(fixS1);
  });

  it('merges and deduplicates batch fix receipts and no-ops on empty lists', () => {
    const messages = [
      makeAssistantMessage('msg-b', {
        isStreaming: false,
        appliedSuggestionIds: ['fix-1'],
      }),
    ];

    expect(applyBatchFixesReceiptToMessages(messages, 'msg-b', [])).toBe(messages);

    const next = applyBatchFixesReceiptToMessages(messages, 'msg-b', ['fix-1', 'fix-2', 'fix-3']);
    expect(next[0].appliedSuggestionIds).toEqual(['fix-1', 'fix-2', 'fix-3']);
  });

  it('marks suggestions dismissed, applied, and questions answered cleanly with deduplication', () => {
    const messages = [makeAssistantMessage('msg-1', {isStreaming: false})];

    const afterDismiss = markSuggestionDismissedInMessages(messages, 'msg-1', 'sug-a');
    expect(afterDismiss[0].dismissedSuggestionIds).toEqual(['sug-a']);
    const afterDupDismiss = markSuggestionDismissedInMessages(afterDismiss, 'msg-1', 'sug-a');
    expect(afterDupDismiss[0].dismissedSuggestionIds).toEqual(['sug-a']);

    const afterApply = markSuggestionAppliedInMessages(afterDismiss, 'msg-1', 'sug-b');
    expect(afterApply[0].appliedSuggestionIds).toEqual(['sug-b']);

    const afterQuestion = markQuestionAnsweredInMessages(afterApply, 'msg-1', 'q-1');
    expect(afterQuestion[0].appliedSuggestionIds).toEqual(['sug-b', 'q-1']);

    // Unknown message ID preserves reference stability
    expect(markSuggestionDismissedInMessages(afterQuestion, 'missing', 'sug-z')).toBe(
      afterQuestion
    );
  });

  it('handles quick scan completion, error fallback, and dismissal', () => {
    const {result, trace} = makeQuickScanFixture('hash-1');
    const messages = [
      makeAssistantMessage('msg-qs', {mode: 'check', focus: 'audit', isStreaming: true}),
    ];

    const completed = completeQuickScanInMessages(messages, 'msg-qs', result, trace);
    expect(completed[0].isStreaming).toBe(false);
    expect(completed[0].quickScan).toBe(result);
    expect(completed[0].quickScanTrace).toBe(trace);

    const dismissed = dismissQuickScanInMessages(completed, 'msg-qs');
    expect(dismissed[0].quickScanDismissed).toBe(true);

    const failedApi = failQuickScanInMessages(messages, 'msg-qs', {
      code: 'api_error',
      message: 'Network failure',
    });
    expect(failedApi[0].isStreaming).toBe(false);
    expect(failedApi[0].quickScanErrorFallback).toBe(true);
    expect(failedApi[0].error?.message).toBe('Network failure');

    const failedAbort = failQuickScanInMessages(messages, 'msg-qs', {
      code: 'aborted',
      message: 'Stopped',
    });
    expect(failedAbort[0].quickScanErrorFallback).toBe(false);
  });
});
