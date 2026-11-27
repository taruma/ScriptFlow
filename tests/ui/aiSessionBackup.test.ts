import {describe, expect, it} from 'vitest';
import type {BundledExample} from '../../src/data/examples/index.ts';
import type {AgentTurnTrace} from '../../src/services/geminiInteractions.ts';
import {
  EMPTY_DRAFT_BRIEF,
  type AiChatMessage,
} from '../../src/ui/aiAssistant.ts';
import {
  AI_SESSIONS_BACKUP_FORMAT,
  AI_SESSIONS_BACKUP_VERSION,
  AI_SESSION_SCHEMA_VERSION,
  analyzeAiSessionsImport,
  buildAiSessionConversationJsonExport,
  buildAiSessionJsonExport,
  buildAiSessionsBackupExport,
  compactSessionForStorage,
  formatBackupByteSize,
  hasSessionTraces,
  parseAiSessionsImport,
  prepareSelectedAiSessionsImport,
  resolveSessionScriptStatus,
  selectSessionsForBackup,
  stripTracesFromSession,
  type AiSessionRecord,
} from '../../src/ui/aiSessions.ts';
import type {ScriptRecord} from '../../src/ui/scriptLibraryDb.ts';

function makeTrace(systemInstruction: string, interactionId = 'int-1'): AgentTurnTrace {
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
        durationMs: 420,
        interactionId,
        status: 'completed',
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
    ],
  };
}

function makeSession(overrides: Partial<AiSessionRecord> = {}): AiSessionRecord {
  const messages: AiChatMessage[] = overrides.messages ?? [
    {
      id: 'u1',
      role: 'user',
      mode: 'draft',
      focus: 'auto',
      text: 'Tighten the rooftop beat.',
    },
    {
      id: 'a1',
      role: 'assistant',
      mode: 'draft',
      focus: 'auto',
      text: 'Trimmed the lead-in and added a beat.',
      thoughtSummary: 'Focused on opening lens cut.',
      toolCalls: [
        {
          callId: 'c1',
          name: 'get_script_overview',
          arguments: {},
          status: 'ok',
        },
      ],
      loadedSkills: [{id: 'draft_craft', name: 'Draft Craft', source: 'tool'}],
      trace: makeTrace('System prompt '.repeat(30)),
    },
  ];
  return {
    id: 'aisess-1',
    schemaVersion: AI_SESSION_SCHEMA_VERSION,
    title: 'Tighten the rooftop beat.',
    createdAt: 1000,
    updatedAt: 5000,
    scriptSessionKey: 'custom:script-1',
    scriptId: 'script-1',
    scriptKind: 'custom',
    scriptTitleSnapshot: 'Rooftop Scene',
    focus: 'auto',
    selectedTargetKey: 'whole',
    model: 'gemini-4-hydrogen',
    messageCount: messages.length,
    turnCount: 1,
    estimatedCostUsd: 0.0042,
    messages,
    brief: {
      ...EMPTY_DRAFT_BRIEF,
      specs: 'Single take, 35mm',
    },
    continuity: {
      lastInteractionId: 'int-1',
      lastTurnSnapshotHash: 'hash-1',
    },
    ...overrides,
  };
}

const CUSTOM_SCRIPTS: ScriptRecord[] = [
  {
    id: 'script-1',
    title: 'Rooftop Scene',
    rawText: '[INTENT]\nRooftop',
    createdAt: 1000,
    updatedAt: 2000,
  },
];

const EXAMPLES: BundledExample[] = [
  {
    id: 'example-1',
    slug: 'example-1',
    title: 'Bundled Scene',
    topology: 'Single Continuous Take',
    summary: 'Sample',
    file: 'example-1.txt',
    content: '[INTENT]\nSample',
    createdAt: 1000,
    updatedAt: 2000,
  },
];

describe('aiSessionBackup codec & preflight engine', () => {
  it('preserves recorded estimatedCostUsd in compactSessionForStorage when traces are absent', () => {
    const withTraces = compactSessionForStorage(makeSession());
    expect(withTraces.estimatedCostUsd).toBeGreaterThan(0);

    const stripped = stripTracesFromSession(withTraces);
    expect(hasSessionTraces(stripped)).toBe(false);
    expect(stripped.estimatedCostUsd).toBe(withTraces.estimatedCostUsd);
    expect(stripped.messages[1].thoughtSummary).toBe('Focused on opening lens cut.');
    expect(stripped.messages[1].toolCalls).toHaveLength(1);
    expect(stripped.messages[1].loadedSkills).toHaveLength(1);
    expect(stripped.brief.specs).toBe('Single take, 35mm');
  });

  it('selects sessions cleanly by scope (all, current_script, pinned, selected)', () => {
    const s1 = makeSession({id: 's1', scriptSessionKey: 'custom:script-1', scriptId: 'script-1', pinned: true, updatedAt: 300});
    const s2 = makeSession({id: 's2', scriptSessionKey: 'custom:missing', scriptId: 'missing', pinned: false, updatedAt: 500});
    const s3 = makeSession({id: 's3', scriptSessionKey: 'custom:script-1', scriptId: 'script-1', pinned: false, updatedAt: 400});

    const summaries = [s1, s2, s3].map((sess) =>
      resolveSessionScriptStatus(sess, 'custom:script-1', CUSTOM_SCRIPTS, EXAMPLES)
    );

    expect(selectSessionsForBackup(summaries, 'all').map((s) => s.id)).toEqual(['s2', 's3', 's1']);
    expect(selectSessionsForBackup(summaries, 'current_script').map((s) => s.id)).toEqual(['s3', 's1']);
    expect(selectSessionsForBackup(summaries, 'pinned').map((s) => s.id)).toEqual(['s1']);
    expect(selectSessionsForBackup(summaries, 'selected', new Set(['s2', 's1'])).map((s) => s.id)).toEqual([
      's2',
      's1',
    ]);
  });

  it('builds backup JSON with or without traces and produces a smaller trace-free payload', () => {
    const session = makeSession();
    const full = buildAiSessionsBackupExport([session], {
      includeTraces: true,
      now: new Date('2026-11-27T12:00:00.000Z'),
    });
    const lite = buildAiSessionsBackupExport([session], {
      includeTraces: false,
      now: new Date('2026-11-27T12:00:00.000Z'),
    });

    expect(full.payload.format).toBe(AI_SESSIONS_BACKUP_FORMAT);
    expect(full.payload.backupVersion).toBe(AI_SESSIONS_BACKUP_VERSION);
    expect(full.includesTraces).toBe(true);
    expect(lite.includesTraces).toBe(false);
    expect(lite.byteSize).toBeLessThan(full.byteSize);
    expect(formatBackupByteSize(lite.byteSize)).toMatch(/B|KB|MB/);
    expect(hasSessionTraces(full.payload.sessions[0])).toBe(true);
    expect(hasSessionTraces(lite.payload.sessions[0])).toBe(false);
  });

  it('parses both multi-session backups and single-session Full Payload exports with Trace Inspector parity', () => {
    const original = makeSession({id: 'aisess-roundtrip'});
    const backup = buildAiSessionsBackupExport([original], {includeTraces: true});
    const parsedBackup = parseAiSessionsImport(backup.content);
    expect(parsedBackup.ok).toBe(true);
    if (parsedBackup.ok) {
      expect(parsedBackup.sourceFormat).toBe('sessions-backup');
      expect(parsedBackup.includesTraces).toBe(true);
      expect(parsedBackup.sessions).toHaveLength(1);
      expect(parsedBackup.sessions[0].messages[1].trace?.rounds[0].request.systemInstruction).toContain(
        'System prompt'
      );
    }

    const singleExport = buildAiSessionJsonExport(original);
    const parsedSingle = parseAiSessionsImport(singleExport.content);
    expect(parsedSingle.ok).toBe(true);
    if (parsedSingle.ok) {
      expect(parsedSingle.sourceFormat).toBe('single-session-export');
      expect(parsedSingle.includesTraces).toBe(true);
      expect(parsedSingle.sessions[0].id).toBe('aisess-roundtrip');
      expect(parsedSingle.sessions[0].messages[1].trace?.rounds[0].request.systemInstruction).toContain(
        'System prompt'
      );
    }
  });

  it('rejects conversation-only exports, malformed JSON, and skips malformed entries with warnings', () => {
    const convExport = buildAiSessionConversationJsonExport(makeSession());
    const convResult = parseAiSessionsImport(convExport.content);
    expect(convResult.ok).toBe(false);

    const badJson = parseAiSessionsImport('{not valid');
    expect(badJson.ok).toBe(false);

    const partialBackup = JSON.stringify({
      format: AI_SESSIONS_BACKUP_FORMAT,
      backupVersion: AI_SESSIONS_BACKUP_VERSION,
      exportedAt: '2026-11-27T12:00:00.000Z',
      sessions: [makeSession({id: 'valid-1'}), {id: '', broken: true}],
    });
    const partialResult = parseAiSessionsImport(partialBackup);
    expect(partialResult.ok).toBe(true);
    if (partialResult.ok) {
      expect(partialResult.sessions).toHaveLength(1);
      expect(partialResult.warnings).toHaveLength(1);
    }
  });

  it('analyzes new, duplicate (including trace-free matches), and conflict sessions and forks conflicts non-destructively', () => {
    const existingSame = makeSession({id: 'same-1', title: 'Matching Session', updatedAt: 2000});
    const existingConflict = makeSession({
      id: 'conflict-1',
      title: 'Rooftop Edit',
      updatedAt: 3000,
    });

    const incomingTraceFreeSame = stripTracesFromSession(existingSame);
    const incomingModified = makeSession({
      id: 'conflict-1',
      title: 'Rooftop Edit',
      updatedAt: 9000,
      messages: [
        {id: 'u1', role: 'user', mode: 'draft', focus: 'auto', text: 'Completely different prompt'},
        {id: 'a1', role: 'assistant', mode: 'draft', focus: 'auto', text: 'Different reply'},
      ],
    });
    const incomingBrandNew = makeSession({
      id: 'brand-new',
      title: 'Orphaned Session',
      scriptSessionKey: 'custom:deleted-script',
      scriptId: 'deleted-script',
      scriptTitleSnapshot: 'Missing Script',
      updatedAt: 4000,
    });

    const backup = buildAiSessionsBackupExport(
      [incomingTraceFreeSame, incomingModified, incomingBrandNew],
      {includeTraces: false}
    );
    const parsed = parseAiSessionsImport(backup.content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const analysis = analyzeAiSessionsImport(parsed, [existingSame, existingConflict], {
      currentScriptSessionKey: 'custom:script-1',
      customScripts: CUSTOM_SCRIPTS,
      examples: EXAMPLES,
    });

    expect(analysis.newCount).toBe(1);
    expect(analysis.conflictCount).toBe(1);
    expect(analysis.duplicateCount).toBe(1);
    expect(analysis.withoutTracesCount).toBe(3);
    expect(analysis.orphanedScriptCount).toBe(1);

    const byId = new Map(analysis.items.map((item) => [item.session.id, item]));
    expect(byId.get('same-1')?.status).toBe('duplicate');
    expect(byId.get('same-1')?.defaultSelected).toBe(false);
    expect(byId.get('conflict-1')?.status).toBe('conflict');
    expect(byId.get('conflict-1')?.defaultSelected).toBe(true);
    expect(byId.get('brand-new')?.status).toBe('new');
    expect(byId.get('brand-new')?.resolvedSummary.scriptStatus).toBe('deleted');

    const prepared = prepareSelectedAiSessionsImport(
      analysis,
      new Set(['brand-new', 'conflict-1']),
      [existingSame, existingConflict],
      {generateId: () => 'aisess-forked-1'}
    );

    expect(prepared.addedCount).toBe(1);
    expect(prepared.forkedCount).toBe(1);
    expect(prepared.skippedCount).toBe(1);
    expect(prepared.recordsToWrite.map((r) => r.id)).toEqual(['aisess-forked-1', 'brand-new']);
    expect(prepared.recordsToWrite[0].title).toBe('Rooftop Edit (Imported)');
    expect(prepared.recordsToWrite[0].titleIsCustom).toBe(true);
  });
});
