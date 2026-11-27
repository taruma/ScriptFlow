import {describe, expect, it} from 'vitest';
import {buildPriorSessionRecap} from '../../src/services/geminiInteractions.ts';
import type {AiChatMessage} from '../../src/ui/aiAssistant.ts';

describe('sessionRecap builder', () => {
  it('builds a deterministic <prior_session_recap> preserving first prompt, suggestion outcomes, question answers, and cross-script context', () => {
    const messages: AiChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        mode: 'draft',
        focus: 'auto',
        text: 'First draft prompt: nocturnal harbor pier with flickering lantern.',
      },
      {
        id: 'a1',
        role: 'assistant',
        mode: 'draft',
        focus: 'auto',
        text: 'Clarifying a few choices first.',
        appliedSuggestionIds: ['q1'],
        questionResponses: {
          q1: {
            status: 'answered',
            answers: {
              lens: {selectedOptions: ['35mm handheld'], comment: 'stay tight on hands'},
            },
          },
        },
        suggestions: [
          {
            id: 'q1',
            kind: 'question',
            intro: 'Camera feel check',
            questions: [{id: 'lens', question: 'Lens?', options: ['35mm handheld']}],
          },
        ],
      },
      {
        id: 'u2',
        role: 'user',
        mode: 'refine',
        focus: 'refine',
        scopeLabel: 'S1',
        attachments: [
          {
            id: 'a-clip',
            kind: 'video',
            label: 'Result 01',
            fileName: 'result_01.mp4',
            mimeType: 'video/mp4',
            source: 'files_api',
            attachment: {
              source: 'files_api',
              mimeType: 'video/mp4',
              fileName: 'result_01.mp4',
              uri: 'https://generativelanguage.googleapis.com/v1beta/files/r01',
              processingMode: 'agentic',
              fingerprint: 'fp-r01',
            },
          },
          {
            id: 'a-section',
            kind: 'document',
            label: '<screenplay>',
            mimeType: 'text/plain',
            sizeBytes: 42,
            source: 'inline',
            sectionTag: 'screenplay',
            attachment: {
              source: 'inline',
              mimeType: 'text/plain',
              sizeBytes: 42,
              sectionTag: 'screenplay',
              inlineText: 'EXT. HARBOR - NIGHT\nWaves slap the pilings.',
              fingerprint: 'fp-sec',
            },
          },
        ],
        text: 'Tighten S1 blocking and add foghorn foley.',
      },
      {
        id: 'a2',
        role: 'assistant',
        mode: 'refine',
        focus: 'refine',
        text: 'Updated S1 with foghorn.',
        appliedSuggestionIds: ['p1'],
        suggestions: [
          {
            id: 'p1',
            kind: 'patch',
            summary: 'Add foghorn foley to S1',
            baseSnapshotHash: 'h1',
            nextSnapshotHash: 'h2',
            affectedIds: ['S1'],
            opsCount: 1,
            patch: {expectedSnapshotHash: 'h1', ops: []},
            beforeRawText: '',
            candidateRawText: '',
            diff: {lines: [], addedCount: 0, removedCount: 0, hasChanges: false},
            lintDelta: {
              beforeErrors: 0,
              beforeWarnings: 0,
              afterErrors: 0,
              afterWarnings: 0,
              introducedErrors: [],
              introducedWarnings: [],
              resolvedDiagnostics: [],
            },
          },
        ],
      },
    ];

    const recap = buildPriorSessionRecap(messages, {
      originalScriptTitle: 'Harbor Pier Draft 1',
      currentScriptTitle: 'Harbor Pier Draft 2',
      isCrossScript: true,
      hasOmittedMedia: true,
    });

    expect(recap).toContain('<prior_session_recap>');
    expect(recap).toContain('</prior_session_recap>');
    expect(recap).toContain('Harbor Pier Draft 1');
    expect(recap).toContain('Harbor Pier Draft 2');
    expect(recap).toContain('Binary media attachments from earlier turns are not persisted');
    expect(recap).toContain('First draft prompt: nocturnal harbor pier');
    expect(recap).toContain('Attachments: result_01.mp4 (video · Files API · agentic), <screenplay> (section · 42 B)');
    expect(recap).toContain('<screenplay>\nEXT. HARBOR - NIGHT\nWaves slap the pilings.\n</screenplay>');
    expect(recap).toContain('[QUESTION ANSWERED] Camera feel check => lens: 35mm handheld — stay tight on hands');
    expect(recap).toContain('[APPLIED] patch: Add foghorn foley to S1');
  });

  it('respects maxChars budget while keeping first prompt and most recent turns', () => {
    const messages: AiChatMessage[] = [
      {id: 'u0', role: 'user', mode: 'draft', focus: 'auto', text: 'ANCHOR_FIRST_PROMPT'},
      ...Array.from({length: 12}, (_, i) => ({
        id: `u-${i + 1}`,
        role: 'user' as const,
        mode: 'refine' as const,
        focus: 'refine' as const,
        text: `TURN_${i + 1} ${'x'.repeat(300)}`,
      })),
    ];

    const recap = buildPriorSessionRecap(messages, {
      currentScriptTitle: 'Test Scene',
      isCrossScript: false,
      maxChars: 1400,
    });

    expect(recap.length).toBeLessThanOrEqual(1500);
    expect(recap).toContain('ANCHOR_FIRST_PROMPT');
    expect(recap).toContain('TURN_12');
    expect(recap).toContain('earlier intermediate turns omitted');
  });
});
