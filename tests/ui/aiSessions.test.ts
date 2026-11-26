import {describe, expect, it} from 'vitest';
import type {BundledExample} from '../../src/data/examples/index.ts';
import type {AgentTurnTrace} from '../../src/services/geminiInteractions.ts';
import {
  EMPTY_DRAFT_BRIEF,
  formatSceneBriefContext,
  type AiChatMessage,
  type DraftBriefState,
} from '../../src/ui/aiAssistant.ts';
import {
  AI_SESSION_SCHEMA_VERSION,
  compactSessionForStorage,
  describeStagedSuggestion,
  filterAiSessions,
  formatAiSessionAsMarkdown,
  hydrateSessionFromStorage,
  resolveSessionScriptStatus,
  selectAiSessionsToPrune,
  selectRecentSessionsForScript,
  stripBriefMediaForStorage,
  type AiSessionRecord,
} from '../../src/ui/aiSessions.ts';
import type {ScriptRecord} from '../../src/ui/scriptLibraryDb.ts';

function makeSampleTrace(systemInstruction: string, interactionId = 'int-1'): AgentTurnTrace {
  return {
    model: 'gemini-4-hydrogen',
    reasoningLevel: 'low',
    mode: 'refine',
    focus: 'auto',
    activeSkillIds: [],
    loadedSkillIds: ['draft_craft'],
    startedAt: '2026-11-26T00:00:00.000Z',
    durationMs: 420,
    initialPreviousInteractionId: null,
    finalInteractionId: interactionId,
    toolRounds: 1,
    hitToolRoundLimit: false,
    usage: {
      total_input_tokens: 1500,
      total_cached_tokens: 1000,
      total_output_tokens: 220,
      total_thought_tokens: 80,
    },
    rounds: [
      {
        roundIndex: 1,
        durationMs: 210,
        interactionId: 'int-r1',
        status: 'requires_action',
        request: {
          model: 'gemini-4-hydrogen',
          previous_interaction_id: null,
          generation_config: {thinking_level: 'low', thinking_summaries: 'auto'},
          toolNames: ['get_script_overview'],
          systemInstruction,
          input: 'Tighten pacing',
        },
        toolCalls: [],
      },
      {
        roundIndex: 2,
        durationMs: 210,
        interactionId,
        status: 'completed',
        request: {
          model: 'gemini-4-hydrogen',
          previous_interaction_id: 'int-r1',
          generation_config: {thinking_level: 'low', thinking_summaries: 'auto'},
          toolNames: ['get_script_overview'],
          systemInstruction,
          input: [],
        },
        toolCalls: [],
      },
    ],
  };
}

function makeSampleSession(overrides: Partial<AiSessionRecord> = {}): AiSessionRecord {
  const messages: AiChatMessage[] = overrides.messages ?? [
    {
      id: 'u1',
      role: 'user',
      mode: 'draft',
      focus: 'auto',
      text: 'Draft a tense rainy rooftop confrontation.',
    },
    {
      id: 'a1',
      role: 'assistant',
      mode: 'draft',
      focus: 'auto',
      text: 'Here is a two-beat confrontation.',
      trace: makeSampleTrace('A'.repeat(260)),
    },
  ];
  return {
    id: 'aisess-1',
    schemaVersion: AI_SESSION_SCHEMA_VERSION,
    title: 'Draft a tense rainy rooftop confrontation.',
    createdAt: 1000,
    updatedAt: 2000,
    scriptSessionKey: 'custom:script-1',
    scriptId: 'script-1',
    scriptKind: 'custom',
    scriptTitleSnapshot: 'Rooftop Scene',
    focus: 'auto',
    selectedTargetKey: 'whole',
    model: 'gemini-4-hydrogen',
    messageCount: messages.length,
    turnCount: 1,
    estimatedCostUsd: 0,
    messages,
    brief: {...EMPTY_DRAFT_BRIEF},
    continuity: {
      lastInteractionId: 'int-1',
      lastTurnSnapshotHash: 'hash-1',
    },
    ...overrides,
  };
}

describe('aiSessions domain & storage codec', () => {
  it('strips binary/file media from Brief while keeping formatSceneBriefContext byte-identical for cache stability', () => {
    const briefWithMedia: DraftBriefState = {
      enabled: true,
      specs: '16:9 · 24fps',
      subtext: 'Keep silence before impact',
      references: [
        {
          id: 'ref-1',
          handle: '@image1',
          kind: 'image',
          label: 'Nadia',
          note: 'wet trench coat',
          attachment: {
            source: 'inline',
            mimeType: 'image/jpeg',
            fileName: 'nadia.jpg',
            inlineBase64: 'BASE64_PAYLOAD_HERE',
            previewUrl: 'data:image/jpeg;base64,BASE64_PAYLOAD_HERE',
            fingerprint: 'fp-1',
          },
        },
        {
          id: 'ref-2',
          handle: '@video1',
          kind: 'video',
          label: 'Prev shot',
          attachment: {
            source: 'youtube',
            mimeType: 'video/mp4',
            uri: 'https://youtu.be/abc',
            fingerprint: 'fp-yt',
          },
        },
      ],
    };

    const beforeText = formatSceneBriefContext(briefWithMedia);
    const {brief: stripped, hadMedia} = stripBriefMediaForStorage(briefWithMedia);
    const afterText = formatSceneBriefContext(stripped);

    expect(hadMedia).toBe(true);
    expect(stripped.references[0].attachment).toBeUndefined();
    expect(stripped.references[0].omittedAttachmentTag).toBe('[attached image: nadia.jpg]');
    expect(stripped.references[1].attachment).toBeUndefined();
    expect(stripped.references[1].omittedAttachmentTag).toBe('[YouTube video]');
    expect(afterText).toBe(beforeText);
  });

  it('deduplicates repeated Zone 1 systemInstruction strings across rounds and hydrates identically', () => {
    const frozenSys = 'AUTEUR SYSTEM INSTRUCTION '.repeat(20);
    const originalTrace = makeSampleTrace(frozenSys, 'int-final');
    const session = makeSampleSession({
      messages: [
        {
          id: 'u1',
          role: 'user',
          mode: 'refine',
          focus: 'auto',
          text: 'Tighten beat 1',
        },
        {
          id: 'a1',
          role: 'assistant',
          mode: 'refine',
          focus: 'auto',
          text: 'Done.',
          isStreaming: true,
          toolCalls: [{callId: 'c1', name: 'get_script_overview', arguments: {}, status: 'running'}],
          trace: originalTrace,
        },
      ],
    });

    const compacted = compactSessionForStorage(session);
    expect(compacted.traceSystemInstructions).toBeDefined();
    expect(Object.keys(compacted.traceSystemInstructions!)).toEqual(['sys_0']);
    expect(compacted.messages[1].trace?.rounds[0].request.systemInstruction).toBe('__ref:sys_0');
    expect(compacted.messages[1].trace?.rounds[1].request.systemInstruction).toBe('__ref:sys_0');
    expect(compacted.messages[1].isStreaming).toBe(false);
    expect(compacted.messages[1].toolCalls?.[0].status).toBe('stopped');

    const hydrated = hydrateSessionFromStorage(compacted);
    expect(hydrated.messages[1].trace).toEqual(originalTrace);
  });

  it('prioritizes sessions for the current script first in Recent 5 and backfills from other scripts', () => {
    const customScripts: ScriptRecord[] = [
      {id: 'script-a', title: 'Alpha Scene', rawText: '', createdAt: 1, updatedAt: 1},
      {id: 'script-b', title: 'Beta Scene', rawText: '', createdAt: 1, updatedAt: 1},
    ];
    const examples: BundledExample[] = [];

    const sessions: AiSessionRecord[] = [
      makeSampleSession({id: 'b-newest', scriptSessionKey: 'custom:script-b', scriptId: 'script-b', updatedAt: 9000}),
      makeSampleSession({id: 'a-old', scriptSessionKey: 'custom:script-a', scriptId: 'script-a', updatedAt: 2000}),
      makeSampleSession({id: 'a-mid', scriptSessionKey: 'custom:script-a', scriptId: 'script-a', updatedAt: 5000}),
      makeSampleSession({id: 'deleted-1', scriptSessionKey: 'custom:gone', scriptId: 'gone', scriptTitleSnapshot: 'Lost Script', updatedAt: 8000}),
      makeSampleSession({id: 'b-older', scriptSessionKey: 'custom:script-b', scriptId: 'script-b', updatedAt: 7000}),
      makeSampleSession({id: 'b-oldest', scriptSessionKey: 'custom:script-b', scriptId: 'script-b', updatedAt: 1000}),
    ];

    const recent = selectRecentSessionsForScript(
      sessions,
      'custom:script-a',
      customScripts,
      examples,
      5
    );

    expect(recent.map((r) => r.session.id)).toEqual([
      'a-mid',
      'a-old',
      'b-newest',
      'deleted-1',
      'b-older',
    ]);
    expect(recent[0].scriptStatus).toBe('current');
    expect(recent[2].scriptStatus).toBe('other_exists');
    expect(recent[3].scriptStatus).toBe('deleted');
    expect(recent[3].resolvedScriptTitle).toBe('Lost Script');
  });

  it('resolves script statuses and protects pinned and custom-renamed sessions from pruning', () => {
    const customScripts: ScriptRecord[] = [
      {id: 's1', title: 'Live Title', rawText: '', createdAt: 1, updatedAt: 1},
    ];
    const current = resolveSessionScriptStatus(
      makeSampleSession({id: '1', scriptSessionKey: 'custom:s1', scriptId: 's1'}),
      'custom:s1',
      customScripts,
      []
    );
    const other = resolveSessionScriptStatus(
      makeSampleSession({id: '2', scriptSessionKey: 'custom:s1', scriptId: 's1'}),
      'custom:s2',
      customScripts,
      []
    );
    const deleted = resolveSessionScriptStatus(
      makeSampleSession({id: '3', scriptSessionKey: 'custom:missing', scriptId: 'missing', scriptTitleSnapshot: 'Old'}),
      'custom:s1',
      customScripts,
      []
    );
    expect(current.scriptStatus).toBe('current');
    expect(current.resolvedScriptTitle).toBe('Live Title');
    expect(other.scriptStatus).toBe('other_exists');
    expect(deleted.scriptStatus).toBe('deleted');

    const pruneIds = selectAiSessionsToPrune(
      [
        makeSampleSession({id: 'pinned-old', pinned: true, updatedAt: 100}),
        makeSampleSession({id: 'renamed-old', titleIsCustom: true, updatedAt: 200}),
        makeSampleSession({id: 'auto-oldest', updatedAt: 300}),
        makeSampleSession({id: 'auto-mid', updatedAt: 400}),
        makeSampleSession({id: 'auto-newest', updatedAt: 500}),
      ],
      2
    );
    expect(pruneIds).toEqual(['auto-oldest']);
  });

  it('filters sessions by query/tab and exports Markdown with suggestion summaries', () => {
    const sessions = [
      makeSampleSession({
        id: 's1',
        title: 'Opening Rain Beat',
        pinned: true,
        brief: {...EMPTY_DRAFT_BRIEF, specs: 'Anamorphic 2.39:1', subtext: 'Silent grief'},
        messages: [
          {id: 'u1', role: 'user', mode: 'draft', focus: 'draft', text: 'Use golden sodium streetlights'},
          {
            id: 'a1',
            role: 'assistant',
            mode: 'draft',
            focus: 'draft',
            text: 'Drafted opening.',
            appliedSuggestionIds: ['sug-1'],
            suggestions: [
              {
                id: 'sug-1',
                kind: 'title',
                title: 'Rain Over Harbor',
                baseSnapshotHash: 'h1',
              },
            ],
          },
        ],
      }),
      makeSampleSession({id: 's2', scriptSessionKey: 'custom:other', scriptId: 'other', title: 'Car Chase'}),
    ];

    const resolved = sessions.map((s) =>
      resolveSessionScriptStatus(s, 'custom:script-1', [], [])
    );

    expect(filterAiSessions(resolved, {query: 'sodium', filter: 'all'}).map((r) => r.session.id)).toEqual(['s1']);
    expect(filterAiSessions(resolved, {query: 'anamorphic', filter: 'pinned'}).map((r) => r.session.id)).toEqual(['s1']);
    expect(filterAiSessions(resolved, {query: '', filter: 'current_script'}).map((r) => r.session.id)).toEqual(['s1']);

    const md = formatAiSessionAsMarkdown(sessions[0], 'Script deleted');
    expect(md).toContain('# Opening Rain Beat');
    expect(md).toContain('Script deleted');
    expect(md).toContain('[Applied] title: Rain Over Harbor');
    expect(
      describeStagedSuggestion({
        id: 'q1',
        kind: 'question',
        intro: 'Quick framing check',
        questions: [],
      })
    ).toBe('Quick framing check');
  });
});
