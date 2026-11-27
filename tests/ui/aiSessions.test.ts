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
  AI_SESSION_CONVERSATION_EXPORT_FORMAT,
  AI_SESSION_EXPORT_FORMAT,
  AI_SESSION_EXPORT_VERSION,
  AI_SESSION_SCHEMA_VERSION,
  buildAiSessionConversationJsonExport,
  buildAiSessionJsonExport,
  buildAiSessionMarkdownExport,
  compactSessionForStorage,
  describeStagedSuggestion,
  filterAiSessions,
  formatAiSessionAsMarkdown,
  hydrateSessionFromStorage,
  resolveSessionScriptStatus,
  selectAiSessionsToPrune,
  selectRecentSessionsForScript,
  stripBriefMediaForStorage,
  stripMessageAttachmentsForStorage,
  type AiSessionConversationJsonPayload,
  type AiSessionJsonExportPayload,
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
  it('strips binary/inline media while preserving lightweight YouTube and Files API URI metadata with byte-identical Brief text', () => {
    const nowMs = Date.parse('2026-11-27T12:00:00.000Z');
    const futureIso = '2026-11-28T12:00:00.000Z';
    const pastIso = '2026-11-27T11:00:00.000Z';

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
            mimeType: 'video/youtube',
            uri: 'https://youtu.be/abc',
            previewUrl: 'https://img.youtube.com/vi/abc/hqdefault.jpg',
            processingMode: 'agentic',
            fingerprint: 'fp-yt',
          },
        },
        {
          id: 'ref-3',
          handle: '@video2',
          kind: 'video',
          label: 'Generated clip',
          attachment: {
            source: 'files_api',
            mimeType: 'video/mp4',
            fileName: 'clip.mp4',
            sizeBytes: 102400,
            uri: 'https://generativelanguage.googleapis.com/v1beta/files/active1',
            filesApiName: 'files/active1',
            expirationTime: futureIso,
            processingMode: 'static',
            localMediaUrl: 'blob:http://localhost/1',
            previewUrl: 'blob:http://localhost/2',
            fingerprint: 'fp-files-active',
          },
        },
        {
          id: 'ref-4',
          handle: '@doc1',
          kind: 'document',
          label: 'Old PDF',
          attachment: {
            source: 'files_api',
            mimeType: 'application/pdf',
            fileName: 'old.pdf',
            sizeBytes: 20480,
            uri: 'https://generativelanguage.googleapis.com/v1beta/files/expired1',
            filesApiName: 'files/expired1',
            expirationTime: pastIso,
            localMediaUrl: 'blob:http://localhost/3',
            fingerprint: 'fp-files-expired',
          },
        },
      ],
    };

    const beforeText = formatSceneBriefContext(briefWithMedia);
    const {brief: stripped, hadMedia} = stripBriefMediaForStorage(briefWithMedia, nowMs);
    const afterText = formatSceneBriefContext(stripped);

    expect(hadMedia).toBe(true);
    expect(stripped.references[0].attachment).toBeUndefined();
    expect(stripped.references[0].omittedAttachmentTag).toBe('[attached image: nadia.jpg]');

    expect(stripped.references[1].omittedAttachmentTag).toBeUndefined();
    expect(stripped.references[1].attachment).toEqual({
      source: 'youtube',
      mimeType: 'video/youtube',
      uri: 'https://youtu.be/abc',
      previewUrl: 'https://img.youtube.com/vi/abc/hqdefault.jpg',
      processingMode: 'agentic',
      fingerprint: 'fp-yt',
    });

    expect(stripped.references[2].omittedAttachmentTag).toBeUndefined();
    expect(stripped.references[2].attachment).toEqual({
      source: 'files_api',
      mimeType: 'video/mp4',
      fileName: 'clip.mp4',
      sizeBytes: 102400,
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/active1',
      filesApiName: 'files/active1',
      expirationTime: futureIso,
      processingMode: 'static',
      fingerprint: 'fp-files-active',
    });

    expect(stripped.references[3].omittedAttachmentTag).toBeUndefined();
    expect(stripped.references[3].attachment).toEqual({
      source: 'files_api',
      mimeType: 'application/pdf',
      fileName: 'old.pdf',
      sizeBytes: 20480,
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/expired1',
      filesApiName: 'files/expired1',
      expirationTime: pastIso,
      fingerprint: 'fp-files-expired',
    });

    expect(afterText).toBe(beforeText);

    // Active-only YouTube + active Files API Brief should report hadMedia: false
    const activeRemoteOnly: DraftBriefState = {
      enabled: true,
      specs: '',
      subtext: '',
      references: [briefWithMedia.references[1], briefWithMedia.references[2]],
    };
    expect(stripBriefMediaForStorage(activeRemoteOnly, nowMs).hadMedia).toBe(false);

    // Expired Files API entry alone flips hadMedia: true
    const expiredRemoteOnly: DraftBriefState = {
      enabled: true,
      specs: '',
      subtext: '',
      references: [briefWithMedia.references[3]],
    };
    expect(stripBriefMediaForStorage(expiredRemoteOnly, nowMs).hadMedia).toBe(true);

    // Compaction + hydration round-trips preserved remote attachments cleanly
    const session = makeSampleSession({brief: activeRemoteOnly});
    const compacted = compactSessionForStorage(session);
    const hydrated = hydrateSessionFromStorage(compacted);
    expect(hydrated.brief.references[0].attachment?.uri).toBe('https://youtu.be/abc');
    expect(hydrated.brief.references[1].attachment?.uri).toBe(
      'https://generativelanguage.googleapis.com/v1beta/files/active1'
    );
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

  it('builds Markdown conversation exports and deduplicated JSON full-payload exports with toolsSummary', () => {
    const frozenSys = 'AUTEUR FROZEN ZONE 1 '.repeat(16);
    const trace = makeSampleTrace(frozenSys, 'int-final');
    trace.rounds[0].request.toolNames = ['get_script_overview', 'propose_script_patch'];
    trace.rounds[0].toolCalls = [
      {
        callId: 'c1',
        name: 'get_script_overview',
        arguments: {},
        ok: true,
        result: {beatCount: 3},
      },
      {
        callId: 'c2',
        name: 'propose_script_patch',
        arguments: {ops: []},
        ok: false,
        result: {error: 'lint error'},
      },
    ];
    trace.rounds[1].request.toolNames = ['get_script_overview', 'propose_script_patch'];
    trace.rounds[1].toolCalls = [
      {
        callId: 'c3',
        name: 'propose_script_patch',
        arguments: {ops: []},
        ok: true,
        result: {ok: true},
      },
    ];

    const session = makeSampleSession({
      id: 'export-1',
      title: 'Rainy Pier Rewrite',
      messages: [
        {
          id: 'u1',
          role: 'user',
          mode: 'refine',
          focus: 'auto',
          text: 'Tighten beat 1 framing.',
        },
        {
          id: 'a1',
          role: 'assistant',
          mode: 'refine',
          focus: 'auto',
          text: 'Staged a tighter cut.',
          trace,
        },
      ],
    });

    const fixedNow = new Date(2026, 10, 26, 11, 45, 30);
    const mdExport = buildAiSessionMarkdownExport(session, {
      scriptStatusLabel: 'Script deleted',
      now: fixedNow,
    });
    expect(mdExport.filename).toBe('rainy-pier-rewrite-ai-chat-20261126-114530.md');
    expect(mdExport.mimeType).toBe('text/markdown;charset=utf-8');
    expect(mdExport.content).toContain('# Rainy Pier Rewrite');
    expect(mdExport.content).toContain('Tighten beat 1 framing.');

    const jsonExport = buildAiSessionJsonExport(session, {
      scriptStatus: 'deleted',
      resolvedScriptTitle: 'Rooftop Scene',
      now: fixedNow,
    });
    expect(jsonExport.filename).toBe('rainy-pier-rewrite-ai-session-20261126-114530.json');
    expect(jsonExport.mimeType).toBe('application/json;charset=utf-8');

    const parsed = JSON.parse(jsonExport.content) as AiSessionJsonExportPayload;
    expect(parsed.format).toBe(AI_SESSION_EXPORT_FORMAT);
    expect(parsed.exportVersion).toBe(AI_SESSION_EXPORT_VERSION);
    expect(parsed.session.scriptStatus).toBe('deleted');
    expect(parsed.systemInstructions).toEqual({sys_0: frozenSys});
    expect(parsed.toolsSummary).toEqual({
      declaredTools: ['get_script_overview', 'propose_script_patch'],
      invokedTools: [
        {name: 'get_script_overview', calls: 1, okCount: 1, errorCount: 0},
        {name: 'propose_script_patch', calls: 2, okCount: 1, errorCount: 1},
      ],
    });

    const firstAssistant = parsed.messages[1] as {
      trace: {rounds: Array<{request: {systemInstruction?: string; systemInstructionRef?: string}}>};
    };
    expect(firstAssistant.trace.rounds[0].request.systemInstruction).toBeUndefined();
    expect(firstAssistant.trace.rounds[0].request.systemInstructionRef).toBe('sys_0');
    expect(firstAssistant.trace.rounds[1].request.systemInstructionRef).toBe('sys_0');
  });

  it('builds evaluation-ready Full Conversation JSON exports with scriptSnapshot, failed tool diagnostics, suggestion details, and per-turn metrics while omitting raw trace payloads', () => {
    const trace = makeSampleTrace('FROZEN SYSTEM PROMPT '.repeat(12), 'int-conv-1');
    trace.usage = {
      total_input_tokens: 1200,
      total_cached_tokens: 800,
      total_output_tokens: 150,
      total_thought_tokens: 50,
    };
    trace.toolRounds = 2;
    trace.durationMs = 1420;
    trace.rounds[0].toolCalls = [
      {
        callId: 'call-fail',
        name: 'propose_script_patch',
        arguments: {ops: [{op: 'replace_sub_state'}]},
        ok: false,
        result: {
          error: 'Linter rejected patch',
          errors: [{message: 'S1 missing [CAM]', repairHint: 'Prepend [CAM]'}],
          repairHint: 'Fix S1',
        },
      },
      {
        callId: 'call-ok',
        name: 'propose_script_patch',
        arguments: {ops: [{op: 'replace_sub_state'}]},
        ok: true,
        result: {beatCount: 3, ok: true},
      },
    ];

    const scriptText = '[INTENT] Rainy pier\n[EXECUTION]\n[CAM] WS -> [ACT] Cat walks';
    const session = makeSampleSession({
      id: 'conv-json-1',
      title: 'Pier Lighting Polish',
      continuity: {
        lastTurnRawText: scriptText,
      },
      messages: [
        {
          id: 'u1',
          role: 'user',
          mode: 'refine',
          focus: 'refine',
          scopeLabel: 'S1',
          text: 'Sharpen the sodium lamp reflection.',
        },
        {
          id: 'a1',
          role: 'assistant',
          mode: 'refine',
          focus: 'refine',
          thoughtSummary: 'Checking S1 lookbook references.',
          text: 'Updated S1 with amber reflections.',
          loadedSkills: [{id: 'token_mapping', name: 'Token Mapping', source: 'tool'}],
          toolCalls: [
            {
              callId: 'call-fail',
              name: 'propose_script_patch',
              arguments: {ops: [{op: 'replace_sub_state'}]},
              status: 'error',
            },
            {
              callId: 'call-ok',
              name: 'propose_script_patch',
              arguments: {ops: [{op: 'replace_sub_state'}]},
              status: 'ok',
            },
          ],
          appliedSuggestionIds: ['sug-patch', 'sug-title'],
          suggestions: [
            {
              id: 'sug-patch',
              kind: 'patch',
              summary: 'Sharpen sodium reflection in S1',
              baseSnapshotHash: 'h1',
              nextSnapshotHash: 'h2',
              affectedIds: ['S1'],
              opsCount: 1,
              patch: {expectedSnapshotHash: 'h1', ops: []},
              beforeRawText: '[CAM] WS',
              candidateRawText: '[CAM] WS -> [LIGHT] Sodium amber rim',
              diff: {
                lines: [
                  {type: 'removed', text: '[CAM] WS', beforeLineNumber: 1},
                  {type: 'added', text: '[CAM] WS -> [LIGHT] Sodium amber rim', afterLineNumber: 1},
                ],
                addedCount: 1,
                removedCount: 1,
                hasChanges: true,
              },
              lintDelta: {
                beforeErrors: 1,
                beforeWarnings: 0,
                afterErrors: 0,
                afterWarnings: 0,
                introducedErrors: [],
                introducedWarnings: [],
                resolvedDiagnostics: [],
              },
            },
            {
              id: 'sug-audit',
              kind: 'audit_review',
              baseSnapshotHash: 'h1',
              overallSummary: '1 continuity check flagged',
              errorCount: 1,
              warningCount: 0,
              issues: [
                {
                  id: 'iss-1',
                  lens: 'Lens 1: Spatial & Optics',
                  severity: 'error',
                  targetLevel: 'macro_state',
                  targetId: 'S1',
                  message: 'Shot opening missing camera slot.',
                  rationale: 'Establish framing first.',
                  repairHint: 'Prepend [CAM] WS.',
                },
              ],
            },
            {
              id: 'sug-title',
              kind: 'title',
              title: 'Amber Pier',
              previousTitle: 'Untitled Scene',
              rationale: 'Matches sodium palette',
              baseSnapshotHash: 'h1',
            },
          ],
          trace,
        },
      ],
    });

    const fixedNow = new Date(2026, 10, 26, 11, 50, 15);
    const convExport = buildAiSessionConversationJsonExport(session, {
      scriptStatus: 'current',
      resolvedScriptTitle: 'Rooftop Scene',
      now: fixedNow,
    });

    expect(convExport.filename).toBe('pier-lighting-polish-ai-conversation-20261126-115015.json');
    expect(convExport.mimeType).toBe('application/json;charset=utf-8');

    const parsed = JSON.parse(convExport.content) as AiSessionConversationJsonPayload & {
      systemInstructions?: unknown;
      continuity?: unknown;
    };
    expect(parsed.format).toBe(AI_SESSION_CONVERSATION_EXPORT_FORMAT);
    expect(parsed.exportVersion).toBe(AI_SESSION_EXPORT_VERSION);
    expect(parsed.systemInstructions).toBeUndefined();
    expect(parsed.continuity).toBeUndefined();
    expect(parsed.scriptSnapshot).toBe(scriptText);
    expect(parsed.skillsUsed).toEqual([
      {id: 'token_mapping', name: 'Token Mapping', source: 'tool'},
    ]);
    expect(parsed.toolsUsed).toEqual([
      {name: 'propose_script_patch', calls: 2, okCount: 1, errorCount: 1},
    ]);
    expect(parsed.conversation).toHaveLength(2);
    expect(parsed.conversation[0]).toMatchObject({
      role: 'user',
      scopeLabel: 'S1',
      text: 'Sharpen the sodium lamp reflection.',
    });

    const assistantTurn = parsed.conversation[1];
    expect(assistantTurn).toMatchObject({
      role: 'assistant',
      thoughtSummary: 'Checking S1 lookbook references.',
      text: 'Updated S1 with amber reflections.',
    });
    expect(assistantTurn.toolCalls?.[0].failure).toEqual({
      error: 'Linter rejected patch',
      errors: ['S1 missing [CAM]'],
      repairHints: ['Fix S1', 'Prepend [CAM]'],
    });
    expect(assistantTurn.toolCalls?.[1].failure).toBeUndefined();
    expect((assistantTurn.toolCalls?.[1] as {result?: unknown}).result).toBeUndefined();

    expect(assistantTurn.suggestions?.[0]).toMatchObject({
      kind: 'patch',
      status: 'applied',
      details: {
        affectedIds: ['S1'],
        opsCount: 1,
        addedCount: 1,
        removedCount: 1,
        diffLines: ['- [CAM] WS', '+ [CAM] WS -> [LIGHT] Sodium amber rim'],
        lintDelta: {
          beforeErrors: 1,
          afterErrors: 0,
          beforeWarnings: 0,
          afterWarnings: 0,
          introducedErrorCount: 0,
          introducedWarningCount: 0,
          resolvedCount: 0,
        },
      },
    });
    expect(assistantTurn.suggestions?.[1]).toMatchObject({
      kind: 'audit_review',
      status: 'staged',
      details: {
        errorCount: 1,
        warningCount: 0,
        issues: [
          {
            lens: 'Lens 1: Spatial & Optics',
            severity: 'error',
            targetLevel: 'macro_state',
            targetId: 'S1',
            message: 'Shot opening missing camera slot.',
            rationale: 'Establish framing first.',
            repairHint: 'Prepend [CAM] WS.',
            hasSuggestedPatch: false,
          },
        ],
      },
    });
    expect(assistantTurn.suggestions?.[2]).toMatchObject({
      kind: 'title',
      status: 'applied',
      details: {
        title: 'Amber Pier',
        previousTitle: 'Untitled Scene',
        rationale: 'Matches sodium palette',
      },
    });
    expect(assistantTurn.metrics).toMatchObject({
      toolRounds: 2,
      durationMs: 1420,
      inputTokens: 1200,
      cachedTokens: 800,
      nonCachedInputTokens: 400,
      outputTokens: 150,
      thoughtTokens: 50,
    });
    expect(assistantTurn.metrics?.cacheHitRate).toBeCloseTo(800 / 1200, 10);
    expect(assistantTurn.metrics?.estimatedCacheSavingsUsd).toBeGreaterThan(0);
    expect(parsed.session.cachedTokens).toBe(800);
    expect(parsed.session.nonCachedInputTokens).toBe(400);
    expect(parsed.session.cacheHitRate).toBeCloseTo(800 / 1200, 10);
    expect(parsed.session.estimatedCacheSavingsUsd).toBeGreaterThan(0);
    expect(assistantTurn.metrics?.estimatedCostUsd).toBeGreaterThan(0);
    expect((assistantTurn as {trace?: unknown}).trace).toBeUndefined();

    const convMd = formatAiSessionAsMarkdown(session);
    expect(convMd).toContain('- **Cache:** 67% hit · 33% miss (800 cached / 400 miss');
    expect(convMd).toContain('est. saved ');
  });

  it('persists remote YouTube/Files API user message attachments while stripping inline payloads across storage, search, and exports', () => {
    const nowMs = Date.parse('2026-11-27T12:00:00.000Z');
    const futureIso = '2026-11-28T12:00:00.000Z';

    const messages: AiChatMessage[] = [
      {
        id: 'u-att-1',
        role: 'user',
        mode: 'refine',
        focus: 'auto',
        text: 'Compare the generated render against my notes.',
        attachments: [
          {
            id: 'att-inline',
            kind: 'document',
            label: 'notes',
            fileName: 'director_notes.md',
            mimeType: 'text/markdown',
            sizeBytes: 512,
            source: 'inline',
            attachment: {
              source: 'inline',
              mimeType: 'text/markdown',
              fileName: 'director_notes.md',
              inlineText: 'Hold 1.5s before turning.',
              fingerprint: 'fp-notes',
            },
          },
          {
            id: 'att-cloud',
            kind: 'video',
            label: 'Render 1',
            fileName: 'render_take1.mp4',
            mimeType: 'video/mp4',
            sizeBytes: 2_000_000,
            source: 'files_api',
            attachment: {
              source: 'files_api',
              mimeType: 'video/mp4',
              fileName: 'render_take1.mp4',
              sizeBytes: 2_000_000,
              uri: 'https://generativelanguage.googleapis.com/v1beta/files/rt1',
              filesApiName: 'files/rt1',
              expirationTime: futureIso,
              processingMode: 'agentic',
              localMediaUrl: 'blob:http://localhost/rt1',
              fingerprint: 'fp-rt1',
            },
          },
        ],
      },
      {
        id: 'a-att-1',
        role: 'assistant',
        mode: 'refine',
        focus: 'auto',
        text: 'Looks solid, though S2 pacing runs slightly fast.',
      },
    ];

    const {messages: strippedMsgs, hadMedia} = stripMessageAttachmentsForStorage(messages, nowMs);
    expect(hadMedia).toBe(true);
    expect(strippedMsgs[0].attachments?.[0].omitted).toBe(true);
    expect(strippedMsgs[0].attachments?.[0].attachment).toBeUndefined();
    expect(strippedMsgs[0].attachments?.[1].omitted).toBeUndefined();
    expect(strippedMsgs[0].attachments?.[1].attachment).toEqual({
      source: 'files_api',
      mimeType: 'video/mp4',
      fileName: 'render_take1.mp4',
      sizeBytes: 2_000_000,
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/rt1',
      filesApiName: 'files/rt1',
      expirationTime: futureIso,
      processingMode: 'agentic',
      fingerprint: 'fp-rt1',
    });

    const session = makeSampleSession({messages});
    const compacted = compactSessionForStorage(session);
    expect(compacted.hasOmittedMedia).toBe(true);

    const hydrated = hydrateSessionFromStorage(compacted);
    expect(hydrated.messages[0].attachments?.[1].attachment?.uri).toBe(
      'https://generativelanguage.googleapis.com/v1beta/files/rt1'
    );

    const matched = filterAiSessions(
      [
        {
          session: hydrated,
          scriptStatus: 'current',
          resolvedScriptTitle: 'Rooftop Scene',
        },
      ],
      {query: 'render_take1', filter: 'all'}
    );
    expect(matched).toHaveLength(1);

    const md = formatAiSessionAsMarkdown(hydrated);
    expect(md).toContain('**Attachments:**');
    expect(md).toContain('director_notes.md');
    expect(md).toContain('render_take1.mp4 (video · Files API · agentic)');

    const convExport = buildAiSessionConversationJsonExport(hydrated, {now: new Date(nowMs)});
    const parsed = JSON.parse(convExport.content) as AiSessionConversationJsonPayload;
    expect(parsed.conversation[0].attachments).toEqual([
      {
        kind: 'document',
        label: 'notes',
        fileName: 'director_notes.md',
        mimeType: 'text/markdown',
        source: 'inline',
        omitted: true,
      },
      {
        kind: 'video',
        label: 'Render 1',
        fileName: 'render_take1.mp4',
        mimeType: 'video/mp4',
        source: 'files_api',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/rt1',
        expirationTime: futureIso,
        processingMode: 'agentic',
      },
    ]);
  });
});
