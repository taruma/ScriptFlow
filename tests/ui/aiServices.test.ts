import {describe, expect, it} from 'vitest';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';
import {parseAuteurScript, toAuteurEnvelope} from '../../src/core/index.ts';
import {
  AUDIT_QUICK_CHECKS,
  buildAiTargetOptions,
  buildAuditQuickPrompt,
  buildScopedRefinePrompt,
  isSuggestionStale,
  reconcileTargetScope,
  resolveEditorJumpTarget,
  shouldShowSettingsLinkForError,
} from '../../src/ui/aiAssistant.ts';
import {
  AI_API_KEY_STORAGE_KEY,
  AI_SETTINGS_STORAGE_KEY,
  clearApiKey,
  DEFAULT_AI_SETTINGS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_REASONING_LEVEL,
  GEMINI_MODEL_OPTIONS,
  hasConfiguredApiKey,
  loadStoredAiSettings,
  REASONING_LEVEL_OPTIONS,
  sanitizeAiSettings,
  saveStoredAiSettings,
  switchApiKeyStorageMode,
  type KeyValueStorageLike,
} from '../../src/ui/aiSettings.ts';
import {
  buildLineDiff,
  executeScriptToolCall,
  getSystemInstructionForMode,
  getToolDeclarationsForMode,
  MODE_TOOL_NAMES,
  sanitizeJsonSchemaForTool,
  type AuditReviewSuggestion,
  type DraftSuggestion,
  type PatchSuggestion,
  type StagedSuggestion,
} from '../../src/services/scriptTools.ts';
import {
  classifyGeminiError,
  GeminiServiceError,
  MAX_AGENT_TOOL_ROUNDS,
  runGeminiAgentTurn,
  type InteractionStreamEventLike,
  type InteractionsClientLike,
} from '../../src/services/geminiInteractions.ts';

function createMemoryStorage(): KeyValueStorageLike & {store: Map<string, string>} {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

async function* asAsyncStream(
  events: InteractionStreamEventLike[]
): AsyncIterable<InteractionStreamEventLike> {
  for (const event of events) {
    yield event;
  }
}

const SAMPLE_SCRIPT = SCRIPT_PRESETS[0].content;

describe('aiSettings BYOK persistence and Gemini 4 catalog', () => {
  it('exposes strictly the Gemini 4 catalog and default settings', () => {
    expect(GEMINI_MODEL_OPTIONS.map((m) => m.id)).toEqual([
      'gemini-4-hydrogen',
      'gemini-4-argon',
      'gemini-4-carbon',
    ]);
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-4-hydrogen');
    expect(REASONING_LEVEL_OPTIONS.map((r) => r.id)).toEqual(['low', 'medium', 'high']);
    expect(DEFAULT_REASONING_LEVEL).toBe('medium');
    expect(DEFAULT_AI_SETTINGS).toEqual({
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      apiKey: '',
      sessionOnly: false,
      showThinkingSummary: true,
    });
  });

  it('stores API key in localStorage by default and moves it cleanly when toggling sessionOnly', () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const adapters = {local, session};

    const saved = saveStoredAiSettings(
      {
        model: 'gemini-4-argon',
        reasoningLevel: 'high',
        apiKey: '  AIza-test-key-123  ',
        sessionOnly: false,
        showThinkingSummary: false,
      },
      adapters
    );

    expect(saved.apiKey).toBe('AIza-test-key-123');
    expect(hasConfiguredApiKey(saved)).toBe(true);
    expect(local.getItem(AI_API_KEY_STORAGE_KEY)).toBe('AIza-test-key-123');
    expect(session.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(loadStoredAiSettings(adapters)).toEqual(saved);

    // Toggle to sessionOnly = true: moves key from localStorage to sessionStorage
    const sessionMode = switchApiKeyStorageMode(saved, true, adapters);
    expect(sessionMode.sessionOnly).toBe(true);
    expect(sessionMode.apiKey).toBe('AIza-test-key-123');
    expect(local.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(session.getItem(AI_API_KEY_STORAGE_KEY)).toBe('AIza-test-key-123');
    expect(loadStoredAiSettings(adapters)).toEqual(sessionMode);

    // Toggle back to sessionOnly = false: moves key back to localStorage
    const persistentMode = switchApiKeyStorageMode(sessionMode, false, adapters);
    expect(persistentMode.sessionOnly).toBe(false);
    expect(local.getItem(AI_API_KEY_STORAGE_KEY)).toBe('AIza-test-key-123');
    expect(session.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(loadStoredAiSettings(adapters)).toEqual(persistentMode);
  });

  it('clears API key from both localStorage and sessionStorage via clearApiKey', () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const adapters = {local, session};

    local.setItem(AI_API_KEY_STORAGE_KEY, 'key-local');
    session.setItem(AI_API_KEY_STORAGE_KEY, 'key-session');

    clearApiKey(adapters);
    expect(local.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(session.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
  });

  it('sanitizes unknown model IDs, invalid reasoning levels, and corrupt persisted JSON safely', () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const adapters = {local, session};

    expect(
      sanitizeAiSettings({
        model: 'gemini-1.5-pro',
        reasoningLevel: 'ultra',
        apiKey: '  secret ',
        sessionOnly: 'yes',
        showThinkingSummary: 123,
      })
    ).toEqual({
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      apiKey: 'secret',
      sessionOnly: false,
      showThinkingSummary: true,
    });

    local.setItem(AI_SETTINGS_STORAGE_KEY, '{broken json');
    expect(loadStoredAiSettings(adapters)).toEqual(DEFAULT_AI_SETTINGS);
  });
});

describe('scriptTools mode-scoped catalogs and local execution runtime', () => {
  it('scopes tool declarations and system instructions cleanly by mode', () => {
    expect(getToolDeclarationsForMode('refine').map((t) => t.name)).toEqual(
      MODE_TOOL_NAMES.refine
    );
    expect(getToolDeclarationsForMode('check').map((t) => t.name)).toEqual(
      MODE_TOOL_NAMES.check
    );
    expect(getToolDeclarationsForMode('draft').map((t) => t.name)).toEqual(
      MODE_TOOL_NAMES.draft
    );

    for (const mode of ['refine', 'check', 'draft'] as const) {
      const decls = getToolDeclarationsForMode(mode);
      for (const decl of decls) {
        expect(decl.type).toBe('function');
        expect(decl.parameters).not.toHaveProperty('$schema');
      }
      const instruction = getSystemInstructionForMode(mode);
      expect(instruction.length).toBeGreaterThan(100);
      expect(instruction.toLowerCase()).not.toContain('gemini');
    }

    // Disallowed tool call in check mode is cleanly rejected
    const blocked = executeScriptToolCall(
      {name: 'propose_script_patch', arguments: {ops: []}},
      {mode: 'check', rawText: SAMPLE_SCRIPT}
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.result.allowedTools).toEqual(MODE_TOOL_NAMES.check);
    expect(typeof blocked.result.repairHint).toBe('string');
  });

  it('returns compact overview and focused lens slices without mutating rawText', () => {
    const overview = executeScriptToolCall(
      {name: 'get_script_overview', arguments: {}},
      {mode: 'refine', rawText: SAMPLE_SCRIPT}
    );
    expect(overview.ok).toBe(true);
    expect(typeof overview.result.snapshotHash).toBe('string');
    expect(overview.result.sceneTopology).toBe('multi_camera_coverage');
    expect(Number(overview.result.beatCount)).toBeGreaterThan(0);

    const sliceResult = executeScriptToolCall(
      {name: 'inspect_lens_slice', arguments: {preset: 'lens1_spatial_optics'}},
      {mode: 'check', rawText: SAMPLE_SCRIPT}
    );
    expect(sliceResult.ok).toBe(true);
    const slice = sliceResult.result.slice as {preset: string; macroStates: unknown[]};
    expect(slice.preset).toBe('lens1_spatial_optics');
    expect(slice.macroStates.length).toBeGreaterThan(0);

    const invalidPreset = executeScriptToolCall(
      {name: 'inspect_lens_slice', arguments: {preset: 'lens99_invalid'}},
      {mode: 'check', rawText: SAMPLE_SCRIPT}
    );
    expect(invalidPreset.ok).toBe(false);
    expect(typeof invalidPreset.result.repairHint).toBe('string');
  });

  it('dry-runs propose_script_patch, rejects lint-violating patches with repairHint, and stages valid patches with diff & lint delta', () => {
    const rawWithWarning = [
      '[INTENT]',
      'Create an interrogation beat with @image1 as Miller.',
      '',
      '[OPENING]',
      'MS at eye level. Frame-left, Miller stands facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> [ACT] Miller taps the desk -> Miller says (flat) {Tell me again.}',
    ].join('\n');

    const envelope = toAuteurEnvelope(rawWithWarning);
    const staged: StagedSuggestion[] = [];

    // 1. Lint-rejected patch (introduces banned stage-left coordinate error)
    const rejected = executeScriptToolCall(
      {
        name: 'propose_script_patch',
        arguments: {
          expectedSnapshotHash: envelope.snapshotHash,
          summary: 'Shift Miller position',
          ops: [
            {
              op: 'replace_sub_state',
              subStateId: 'S1.1',
              subState: {
                dimension: 'action',
                subStateTag: 'ACT',
                content: 'Miller steps stage-left across the table',
              },
            },
          ],
        },
      },
      {
        mode: 'refine',
        rawText: rawWithWarning,
        onStageSuggestion: (s) => staged.push(s),
      }
    );

    expect(rejected.ok).toBe(false);
    expect(staged).toHaveLength(0);
    expect(Array.isArray(rejected.result.introducedErrors)).toBe(true);
    expect((rejected.result.introducedErrors as Array<{ruleId: string}>)[0].ruleId).toBe(
      'viewport-coordinate-purity'
    );
    expect(String(rejected.result.repairHint)).toContain('frame-left');

    // 2. Snapshot mismatch returns SNAPSHOT_MISMATCH + actual hash in repairHint
    const stale = executeScriptToolCall(
      {
        name: 'propose_script_patch',
        arguments: {
          expectedSnapshotHash: 'deadbeef',
          ops: [
            {
              op: 'insert_sub_state',
              macroStateId: 'S1',
              afterSubStateId: 'S1.2',
              subState: {dimension: 'foley', sound: 'metal chair scrape'},
            },
          ],
        },
      },
      {mode: 'refine', rawText: rawWithWarning}
    );
    expect(stale.ok).toBe(false);
    expect(String(stale.result.repairHint)).toContain(envelope.snapshotHash);

    // 3. Valid repaired patch resolves the trailing dialogue warning and stages PatchSuggestion
    const accepted = executeScriptToolCall(
      {
        name: 'propose_script_patch',
        arguments: {
          expectedSnapshotHash: envelope.snapshotHash,
          summary: 'Resolve Beat 1 dialogue with foley trigger',
          ops: [
            {
              op: 'insert_sub_state',
              macroStateId: 'S1',
              afterSubStateId: 'S1.2',
              subState: {dimension: 'foley', sound: 'folder slams shut'},
            },
          ],
        },
      },
      {
        mode: 'refine',
        rawText: rawWithWarning,
        createSuggestionId: () => 'patch-1',
        onStageSuggestion: (s) => staged.push(s),
      }
    );

    expect(accepted.ok).toBe(true);
    expect(staged).toHaveLength(1);
    const patchSuggestion = staged[0] as PatchSuggestion;
    expect(patchSuggestion.kind).toBe('patch');
    expect(patchSuggestion.id).toBe('patch-1');
    expect(patchSuggestion.summary).toBe('Resolve Beat 1 dialogue with foley trigger');
    expect(patchSuggestion.affectedIds).toEqual(['S1']);
    expect(patchSuggestion.beforeRawText).toBe(rawWithWarning);
    expect(patchSuggestion.candidateRawText).toContain('<folder slams shut>');
    expect(patchSuggestion.diff.hasChanges).toBe(true);
    expect(patchSuggestion.diff.addedCount).toBe(1);
    expect(patchSuggestion.diff.removedCount).toBe(1);
    expect(patchSuggestion.lintDelta.beforeWarnings).toBe(1);
    expect(patchSuggestion.lintDelta.afterWarnings).toBe(0);
    expect(patchSuggestion.lintDelta.resolvedDiagnostics).toHaveLength(1);

    // 4. Respects ruleOverrides: promoting macro-state-resolution to 'error' rejects introducing trailing dialogue
    const promotedReject = executeScriptToolCall(
      {
        name: 'propose_script_patch',
        arguments: {
          expectedSnapshotHash: patchSuggestion.nextSnapshotHash,
          ops: [
            {
              op: 'delete_sub_state',
              subStateId: 'S1.3',
            },
          ],
        },
      },
      {
        mode: 'refine',
        rawText: patchSuggestion.candidateRawText,
        ruleOverrides: {'macro-state-resolution': 'error'},
      }
    );
    expect(promotedReject.ok).toBe(false);
    expect((promotedReject.result.introducedErrors as Array<{ruleId: string}>)[0].ruleId).toBe(
      'macro-state-resolution'
    );
  });

  it('compiles and stages DraftSuggestion in draft mode and rejects invalid draft schemas', () => {
    const staged: StagedSuggestion[] = [];

    const badDraft = executeScriptToolCall(
      {
        name: 'propose_script_draft',
        arguments: {
          draft: {
            stagingMacroBlocks: [{header: 'EXECUTION', format: 'prose', body: 'Illegal header'}],
            executionMacroBlock: null,
          },
        },
      },
      {mode: 'draft', rawText: ''}
    );
    expect(badDraft.ok).toBe(false);
    expect(typeof badDraft.result.repairHint).toBe('string');

    const goodDraft = executeScriptToolCall(
      {
        name: 'propose_script_draft',
        arguments: {
          title: 'Rainy Alley Standoff',
          summary: 'Two-beat continuous oner in a neon alley.',
          draft: {
            stagingMacroBlocks: [
              {
                header: 'INTENT',
                format: 'prose',
                body: 'Create a tense noir standoff with @image1 as Mara.',
              },
              {
                header: 'AESTHETIC',
                format: 'key_value',
                entries: [
                  {key: 'Lighting', value: 'Wet sodium streetlamps -> ALLEY_KEY'},
                  {key: 'Audio', value: 'Steady rain hiss'},
                ],
              },
              {
                header: 'OPENING',
                format: 'prose',
                body: 'Medium wide at eye level. Frame-left, Mara stands motionless facing screen-right.',
              },
            ],
            executionMacroBlock: {
              header: 'EXECUTION',
              macroStates: [
                {
                  subStates: [
                    {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: 'MW, eye level'},
                    {dimension: 'action', subStateTag: 'ACT', content: 'Mara raises her left hand slowly'},
                    {dimension: 'foley', sound: 'coat fabric rustle'},
                  ],
                },
              ],
            },
          },
        },
      },
      {
        mode: 'draft',
        rawText: '',
        createSuggestionId: () => 'draft-1',
        onStageSuggestion: (s) => staged.push(s),
      }
    );

    expect(goodDraft.ok).toBe(true);
    expect(staged).toHaveLength(1);
    const draftSuggestion = staged[0] as DraftSuggestion;
    expect(draftSuggestion.kind).toBe('draft');
    expect(draftSuggestion.title).toBe('Rainy Alley Standoff');
    expect(draftSuggestion.sceneTopology).toBe('continuous_oner');
    expect(draftSuggestion.stagingBlockCount).toBe(3);
    expect(draftSuggestion.beatCount).toBe(1);
    expect(draftSuggestion.errorCount).toBe(0);
    expect(draftSuggestion.candidateRawText).toContain('[INTENT]');
    expect(draftSuggestion.candidateRawText).toContain('[CAM 01] MW, eye level -> [ACT]');
  });

  it('validates report_audit_review, dry-runs embedded suggestedPatch items, and withholds lint-violating fixes', () => {
    const raw = [
      '[INTENT]',
      'Create a quiet office check-in with @image1 as Elena.',
      '',
      '[OPENING]',
      'MS at eye level. Frame-left, Elena sits facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> Elena says (quiet) {Is it ready?}',
    ].join('\n');

    const envelope = toAuteurEnvelope(raw);
    const staged: StagedSuggestion[] = [];

    const res = executeScriptToolCall(
      {
        name: 'report_audit_review',
        arguments: {
          overallSummary: 'Checked acoustics and spatial blocking.',
          issues: [
            {
              id: 'iss-clean',
              lens: 'Lens 4: Acoustics & Voice',
              severity: 'warning',
              targetLevel: 'macro_state',
              targetId: 'S1',
              message: 'Beat S1 terminates on dialogue.',
              rationale: 'Macro-State Resolution Rule requires a physical or foley follow-through.',
              repairHint: 'Add an [ACT] or <foley> step after Elena speaks.',
              suggestedPatch: {
                expectedSnapshotHash: envelope.snapshotHash,
                summary: 'Add paper click follow-through',
                ops: [
                  {
                    op: 'insert_sub_state',
                    macroStateId: 'S1',
                    afterSubStateId: 'S1.1',
                    subState: {dimension: 'foley', sound: 'pen click'},
                  },
                ],
              },
            },
            {
              id: 'iss-broken-patch',
              lens: 'Lens 1: Spatial & Optics',
              severity: 'warning',
              targetLevel: 'macro_state',
              targetId: 'S1',
              message: 'Clarify viewport movement.',
              rationale: 'Example of a broken embedded patch that introduces stage-left.',
              repairHint: 'Use frame-left instead of stage-left.',
              suggestedPatch: {
                expectedSnapshotHash: envelope.snapshotHash,
                ops: [
                  {
                    op: 'insert_sub_state',
                    macroStateId: 'S1',
                    afterSubStateId: 'S1.0',
                    subState: {
                      dimension: 'action',
                      subStateTag: 'ACT',
                      content: 'Elena leans stage-left over the desk',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        mode: 'check',
        rawText: raw,
        onStageSuggestion: (s) => staged.push(s),
      }
    );

    expect(res.ok).toBe(true);
    expect(staged).toHaveLength(1);
    const review = staged[0] as AuditReviewSuggestion;
    expect(review.kind).toBe('audit_review');
    expect(review.issues).toHaveLength(2);
    expect(review.issues[0].patchSuggestion).toBeDefined();
    expect(review.issues[0].patchSuggestion?.candidateRawText).toContain('<pen click>');
    expect(review.issues[1].patchSuggestion).toBeUndefined();
    expect(review.issues[1].patchValidationErrors?.length).toBeGreaterThan(0);
    expect((res.result.invalidSuggestedPatches as unknown[]).length).toBe(1);
  });
});

describe('buildLineDiff', () => {
  it('computes unchanged, added, removed, and modified line diffs with accurate line numbers', () => {
    const unchanged = buildLineDiff('[INTENT]\nHello', '[INTENT]\nHello');
    expect(unchanged.hasChanges).toBe(false);
    expect(unchanged.addedCount).toBe(0);
    expect(unchanged.removedCount).toBe(0);

    const diff = buildLineDiff(
      ['[INTENT]', 'Line A', 'Line B', 'Line C'].join('\n'),
      ['[INTENT]', 'Line A edited', 'Line B', 'Line D', 'Line C'].join('\n')
    );
    expect(diff.hasChanges).toBe(true);
    expect(diff.removedCount).toBe(1);
    expect(diff.addedCount).toBe(2);
    expect(diff.lines.find((l) => l.type === 'removed')).toEqual({
      type: 'removed',
      text: 'Line A',
      beforeLineNumber: 2,
    });
    expect(diff.lines.filter((l) => l.type === 'added').map((l) => l.text)).toEqual([
      'Line A edited',
      'Line D',
    ]);
  });
});

describe('geminiInteractions streaming agent client', () => {
  it('fails fast with missing_api_key when no BYOK key is configured', async () => {
    await expect(
      runGeminiAgentTurn({
        apiKey: '   ',
        model: 'gemini-4-hydrogen',
        reasoningLevel: 'medium',
        mode: 'refine',
        prompt: 'Tighten beat 1.',
        rawText: SAMPLE_SCRIPT,
      })
    ).rejects.toMatchObject({
      name: 'GeminiServiceError',
      code: 'missing_api_key',
    });
  });

  it('streams thought_summary and text, re-specifies tools/config per call, chains previous_interaction_id, and supports self-repair loops', async () => {
    const rawScript = [
      '[INTENT]',
      'Create a corridor beat with @image1 as Nadia.',
      '',
      '[OPENING]',
      'MS eye level. Frame-left, Nadia stands facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> [ACT] Nadia opens the door -> <latch click>',
    ].join('\n');
    const snapshotHash = toAuteurEnvelope(rawScript).snapshotHash;

    const capturedRequests: Array<Record<string, unknown>> = [];
    const roundStreams: InteractionStreamEventLike[][] = [
      // Round 1: model emits a thought summary and calls propose_script_patch with banned 'stage-left'
      [
        {event_type: 'interaction.created', interaction: {id: 'int-round-1', status: 'in_progress'}},
        {
          event_type: 'step.delta',
          index: 0,
          delta: {type: 'thought_summary', content: {type: 'text', text: 'Checking beat 1 blocking.'}},
        },
        {
          event_type: 'step.start',
          index: 1,
          step: {
            type: 'function_call',
            id: 'call-1',
            name: 'propose_script_patch',
            arguments: {
              expectedSnapshotHash: snapshotHash,
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.1',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Nadia steps stage-left through the door',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 1},
        {event_type: 'interaction.completed', interaction: {id: 'int-round-1', status: 'requires_action'}},
      ],
      // Round 2: model receives lint rejection + repairHint, self-repairs to frame-right
      [
        {event_type: 'interaction.created', interaction: {id: 'int-round-2', status: 'in_progress'}},
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-2',
            name: 'propose_script_patch',
            arguments: {},
          },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: {
            type: 'arguments_delta',
            arguments: JSON.stringify({
              expectedSnapshotHash: snapshotHash,
              summary: 'Move Nadia frame-right through the door',
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.1',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Nadia steps frame-right through the door',
                  },
                },
              ],
            }),
          },
        },
        {event_type: 'step.stop', index: 0},
        {event_type: 'interaction.completed', interaction: {id: 'int-round-2', status: 'requires_action'}},
      ],
      // Round 3: final assistant text
      [
        {event_type: 'interaction.created', interaction: {id: 'int-round-3', status: 'in_progress'}},
        {event_type: 'step.delta', index: 0, delta: {type: 'text', text: 'Staged a clean patch '}},
        {event_type: 'step.delta', index: 0, delta: {type: 'text', text: 'for Beat 1.'}},
        {event_type: 'interaction.completed', interaction: {id: 'int-round-3', status: 'completed'}},
      ],
    ];

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async (params) => {
          capturedRequests.push(params);
          const next = roundStreams.shift() ?? [];
          return asAsyncStream(next);
        },
      },
    };

    const thoughts: string[] = [];
    const texts: string[] = [];
    const staged: StagedSuggestion[] = [];

    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-carbon',
      reasoningLevel: 'high',
      mode: 'refine',
      prompt: 'Have Nadia step through the door.',
      rawText: rawScript,
      previousInteractionId: 'int-prior-turn',
      createClient: () => fakeClient,
      callbacks: {
        onThoughtSummaryDelta: (chunk) => thoughts.push(chunk),
        onTextDelta: (chunk) => texts.push(chunk),
        onSuggestionStaged: (s) => staged.push(s),
      },
    });

    expect(capturedRequests).toHaveLength(3);
    // Every call re-specifies tools, system_instruction, generation_config, and chains previous_interaction_id
    expect(capturedRequests[0].previous_interaction_id).toBe('int-prior-turn');
    expect(capturedRequests[1].previous_interaction_id).toBe('int-round-1');
    expect(capturedRequests[2].previous_interaction_id).toBe('int-round-2');

    for (const req of capturedRequests) {
      expect(req.model).toBe('gemini-4-carbon');
      expect(req.stream).toBe(true);
      expect(req.generation_config).toEqual({
        thinking_level: 'high',
        thinking_summaries: 'auto',
      });
      expect(typeof req.system_instruction).toBe('string');
      expect(Array.isArray(req.tools)).toBe(true);
    }

    // Round 2 input should contain function_result with is_error=true from round 1 lint rejection
    const round2Input = capturedRequests[1].input as Array<Record<string, unknown>>;
    expect(round2Input).toHaveLength(1);
    expect(round2Input[0].type).toBe('function_result');
    expect(round2Input[0].call_id).toBe('call-1');
    expect(round2Input[0].is_error).toBe(true);

    // Round 3 input should contain function_result with staged=true from round 2 repair
    const round3Input = capturedRequests[2].input as Array<Record<string, unknown>>;
    expect(round3Input[0].call_id).toBe('call-2');
    expect(round3Input[0].is_error).toBeUndefined();

    expect(thoughts.join('')).toBe('Checking beat 1 blocking.');
    expect(texts.join('')).toBe('Staged a clean patch for Beat 1.');
    expect(result.interactionId).toBe('int-round-3');
    expect(result.toolRounds).toBe(2);
    expect(result.hitToolRoundLimit).toBe(false);
    expect(result.toolTraces).toHaveLength(2);
    expect(result.toolTraces[0].ok).toBe(false);
    expect(result.toolTraces[1].ok).toBe(true);
    expect(staged).toHaveLength(1);
    expect((staged[0] as PatchSuggestion).candidateRawText).toContain('frame-right');
  });

  it('caps tool execution loops at MAX_AGENT_TOOL_ROUNDS (5)', async () => {
    let counter = 0;
    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async () => {
          counter += 1;
          return asAsyncStream([
            {event_type: 'interaction.created', interaction: {id: `int-${counter}`, status: 'in_progress'}},
            {
              event_type: 'step.start',
              index: 0,
              step: {
                type: 'function_call',
                id: `call-${counter}`,
                name: 'get_script_overview',
                arguments: {},
              },
            },
            {event_type: 'step.stop', index: 0},
            {event_type: 'interaction.completed', interaction: {id: `int-${counter}`, status: 'requires_action'}},
          ]);
        },
      },
    };

    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      mode: 'refine',
      prompt: 'Loop forever.',
      rawText: SAMPLE_SCRIPT,
      createClient: () => fakeClient,
    });

    expect(MAX_AGENT_TOOL_ROUNDS).toBe(5);
    expect(result.toolRounds).toBe(5);
    expect(result.hitToolRoundLimit).toBe(true);
    expect(counter).toBe(6); // Initial call + 5 function_result rounds
  });

  it('supports AbortSignal cancellation and classifies common API errors cleanly', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runGeminiAgentTurn({
        apiKey: 'AIza-valid-test',
        model: 'gemini-4-hydrogen',
        reasoningLevel: 'medium',
        mode: 'check',
        prompt: 'Audit this.',
        rawText: SAMPLE_SCRIPT,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({code: 'aborted'});

    expect(classifyGeminiError({status: 401, message: 'API_KEY_INVALID'}).code).toBe(
      'invalid_api_key'
    );
    expect(classifyGeminiError({status: 429, message: 'RESOURCE_EXHAUSTED'}).code).toBe(
      'quota_exceeded'
    );
    expect(classifyGeminiError({status: 404, message: 'NOT_FOUND'}).code).toBe('model_not_found');
    expect(classifyGeminiError(new TypeError('Failed to fetch')).code).toBe('network_error');
    const existing = new GeminiServiceError('missing_api_key', 'Missing key');
    expect(classifyGeminiError(existing)).toBe(existing);
  });

  it('inserts \\n\\n boundaries between multi-round thought summaries and assistant text in both callbacks and output', async () => {
    const roundStreams: InteractionStreamEventLike[][] = [
      // Round 1: emits thought + text + tool call
      [
        {event_type: 'interaction.created', interaction: {id: 'int-r1', status: 'in_progress'}},
        {
          event_type: 'step.delta',
          index: 0,
          delta: {type: 'thought_summary', content: {type: 'text', text: 'Inspecting overview.'}},
        },
        {
          event_type: 'step.delta',
          index: 1,
          delta: {type: 'text', text: 'Checking your script.'},
        },
        {
          event_type: 'step.start',
          index: 2,
          step: {
            type: 'function_call',
            id: 'call-overview',
            name: 'get_script_overview',
            arguments: {},
          },
        },
        {event_type: 'step.stop', index: 2},
        {event_type: 'interaction.completed', interaction: {id: 'int-r1', status: 'requires_action'}},
      ],
      // Round 2: emits another thought + multi-chunk final text
      [
        {event_type: 'interaction.created', interaction: {id: 'int-r2', status: 'in_progress'}},
        {
          event_type: 'step.delta',
          index: 0,
          delta: {type: 'thought_summary', content: {type: 'text', text: 'Overview looks clean.'}},
        },
        {
          event_type: 'step.delta',
          index: 1,
          delta: {type: 'text', text: 'Everything '},
        },
        {
          event_type: 'step.delta',
          index: 1,
          delta: {type: 'text', text: 'is ready.'},
        },
        {event_type: 'interaction.completed', interaction: {id: 'int-r2', status: 'completed'}},
      ],
    ];

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async () => asAsyncStream(roundStreams.shift() ?? []),
      },
    };

    const streamedThoughts: string[] = [];
    const streamedTexts: string[] = [];

    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      mode: 'refine',
      prompt: 'Review overview.',
      rawText: SAMPLE_SCRIPT,
      createClient: () => fakeClient,
      callbacks: {
        onThoughtSummaryDelta: (delta) => streamedThoughts.push(delta),
        onTextDelta: (delta) => streamedTexts.push(delta),
      },
    });

    expect(result.thoughtSummary).toBe('Inspecting overview.\n\nOverview looks clean.');
    expect(streamedThoughts.join('')).toBe('Inspecting overview.\n\nOverview looks clean.');
    expect(result.text).toBe('Checking your script.\n\nEverything is ready.');
    expect(streamedTexts.join('')).toBe('Checking your script.\n\nEverything is ready.');
  });
});

describe('Phase 3A hardening: JSON Schema sanitization & lint-gated draft staging', () => {
  it('normalizes const keywords into type+enum and strips/hoists nested $defs across all tool schemas', () => {
    for (const mode of ['refine', 'check', 'draft'] as const) {
      for (const decl of getToolDeclarationsForMode(mode)) {
        const serialized = JSON.stringify(decl.parameters);
        expect(serialized).not.toContain('"const":');

        // Verify no nested $defs anywhere below root
        const visit = (node: unknown, isRoot: boolean) => {
          if (Array.isArray(node)) {
            node.forEach((child) => visit(child, false));
          } else if (node && typeof node === 'object') {
            const rec = node as Record<string, unknown>;
            if (!isRoot) {
              expect(rec).not.toHaveProperty('$defs');
            }
            for (const [k, v] of Object.entries(rec)) {
              if (k === '$defs' && isRoot) continue;
              visit(v, false);
            }
          }
        };
        visit(decl.parameters, true);
      }
    }

    // Direct test: const normalization + nested $defs hoisting when referenced vs stripping when unreferenced
    const withRef = sanitizeJsonSchemaForTool({
      type: 'object',
      properties: {
        kind: {const: 'camera'},
        count: {const: 3},
        flag: {const: true},
        nested: {
          type: 'object',
          $defs: {
            Inner: {type: 'object', properties: {tag: {const: 'ACT'}}},
          },
          properties: {
            item: {$ref: '#/$defs/Inner'},
          },
        },
      },
    }) as Record<string, unknown>;

    const props = withRef.properties as Record<string, Record<string, unknown>>;
    expect(props.kind).toEqual({type: 'string', enum: ['camera']});
    expect(props.count).toEqual({type: 'number', enum: [3]});
    expect(props.flag).toEqual({type: 'boolean', enum: [true]});
    expect(props.nested).not.toHaveProperty('$defs');
    expect(withRef.$defs).toEqual({
      Inner: {type: 'object', properties: {tag: {type: 'string', enum: ['ACT']}}},
    });

    const withoutRef = sanitizeJsonSchemaForTool({
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          $defs: {Unused: {type: 'string'}},
          properties: {a: {type: 'string'}},
        },
      },
    }) as Record<string, unknown>;
    expect(withoutRef).not.toHaveProperty('$defs');
  });

  it('rejects and withholds staging in propose_script_draft when deterministic lint errors exist', () => {
    const staged: StagedSuggestion[] = [];

    const lintBrokenDraft = executeScriptToolCall(
      {
        name: 'propose_script_draft',
        arguments: {
          title: 'Broken Blocking Draft',
          draft: {
            stagingMacroBlocks: [
              {
                header: 'OPENING',
                format: 'prose',
                body: '[ACT] Mara walks stage-left into frame.',
              },
            ],
            executionMacroBlock: {
              header: 'EXECUTION',
              macroStates: [
                {
                  subStates: [
                    {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: 'MS eye level'},
                    {dimension: 'action', subStateTag: 'ACT', content: 'Mara crosses stage-left'},
                  ],
                },
              ],
            },
          },
        },
      },
      {
        mode: 'draft',
        rawText: '',
        onStageSuggestion: (s) => staged.push(s),
      }
    );

    expect(lintBrokenDraft.ok).toBe(false);
    expect(lintBrokenDraft.stagedSuggestion).toBeUndefined();
    expect(staged).toHaveLength(0);
    expect(lintBrokenDraft.result.staged).toBe(false);
    expect(
      (lintBrokenDraft.result.diagnosticsSummary as {errors: number}).errors
    ).toBeGreaterThan(0);
    expect(typeof lintBrokenDraft.result.repairHint).toBe('string');
  });
});

describe('aiAssistant pure UI sidebar & target-scoping helpers', () => {
  it('builds Refine target options, reconciles removed targets, and scopes prompts cleanly', () => {
    const doc = parseAuteurScript(SAMPLE_SCRIPT);
    const options = buildAiTargetOptions(doc);

    expect(options[0]).toEqual({kind: 'whole', key: 'whole', label: 'Whole Script'});
    const mb0 = options.find((o) => o.key === 'MB0');
    const s1 = options.find((o) => o.key === 'S1');
    expect(mb0?.kind).toBe('macro_block');
    expect(s1?.kind).toBe('macro_state');

    expect(reconcileTargetScope('S999', options).key).toBe('whole');
    expect(reconcileTargetScope('S1', options).key).toBe('S1');

    expect(buildScopedRefinePrompt('Tighten pacing.', options[0])).toBe('Tighten pacing.');
    expect(buildScopedRefinePrompt('Clarify tone.', mb0!)).toContain('Staging Macro-Block MB0');
    expect(buildScopedRefinePrompt('Sharpen blocking.', s1!)).toContain('Execution Beat S1');
  });

  it('resolves MB#, MB#.#, S#, S#.#, and header names to editor jump targets and checks staleness', () => {
    const doc = parseAuteurScript(SAMPLE_SCRIPT);

    expect(resolveEditorJumpTarget('MB0', doc)).toEqual({
      phase: 'staging',
      blockIndex: 0,
      domId: 'staging-block-0',
    });
    expect(resolveEditorJumpTarget('MB1.2', doc)).toEqual({
      phase: 'staging',
      blockIndex: 1,
      domId: 'staging-block-1',
    });
    expect(resolveEditorJumpTarget('S1', doc)).toEqual({
      phase: 'execution',
      beatIndex: 1,
      domId: 'execution-beat-1',
    });
    expect(resolveEditorJumpTarget('S2.1', doc)).toEqual({
      phase: 'execution',
      beatIndex: 2,
      domId: 'execution-beat-2',
    });
    expect(resolveEditorJumpTarget('[OPENING]', doc)?.phase).toBe('staging');
    expect(resolveEditorJumpTarget('S999', doc)).toBeNull();
    expect(resolveEditorJumpTarget('MB999', doc)).toBeNull();

    expect(isSuggestionStale('abc123', 'abc123')).toBe(false);
    expect(isSuggestionStale('abc123', 'def456')).toBe(true);

    expect(AUDIT_QUICK_CHECKS).toHaveLength(6);
    for (const check of AUDIT_QUICK_CHECKS) {
      expect(buildAuditQuickPrompt(check.id)).toContain('report_audit_review');
    }

    expect(shouldShowSettingsLinkForError('missing_api_key')).toBe(true);
    expect(shouldShowSettingsLinkForError('invalid_api_key')).toBe(true);
    expect(shouldShowSettingsLinkForError('model_not_found')).toBe(true);
    expect(shouldShowSettingsLinkForError('network_error')).toBe(false);
    expect(shouldShowSettingsLinkForError('aborted')).toBe(false);
  });
});
