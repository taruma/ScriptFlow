import {describe, expect, it} from 'vitest';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';
import {parseAuteurScript, toAuteurEnvelope} from '../../src/core/index.ts';
import {
  AUDIT_QUICK_CHECKS,
  buildAiTargetOptions,
  buildAuditQuickPrompt,
  buildScopedRefinePrompt,
  formatQuestionAnswersPrompt,
  formatToolCallTooltip,
  formatToolDisplayName,
  hasAnyQuestionAnswer,
  isSuggestionStale,
  reconcileTargetScope,
  resolveEditorJumpTarget,
  shouldShowSettingsLinkForError,
} from '../../src/ui/aiAssistant.ts';
import {parseMarkdownBlocks, parseMarkdownInline} from '../../src/ui/markdown.ts';
import {
  AI_API_KEY_STORAGE_KEY,
  AI_SETTINGS_STORAGE_KEY,
  clearApiKey,
  DEFAULT_AI_SETTINGS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_REASONING_LEVEL,
  GEMINI_MODEL_OPTIONS,
  hasConfiguredApiKey,
  isDefaultAiPreferences,
  loadStoredAiSettings,
  REASONING_LEVEL_OPTIONS,
  resetAiPreferencesToDefault,
  sanitizeAiSettings,
  saveStoredAiSettings,
  switchApiKeyStorageMode,
  type KeyValueStorageLike,
} from '../../src/ui/aiSettings.ts';
import {
  AUTEUR_KNOWLEDGE_VERSION,
  BUILTIN_AUTEUR_SKILLS,
  DEFAULT_FOUNDATIONAL_CRAFT,
  assistantModeToFocus,
  composeAgentContext,
  getLensAuditChecklist,
  type LensAuditChecklist,
} from '../../src/services/auteurKnowledge.ts';
import {
  buildLineDiff,
  buildToolDeclarationsForContext,
  executeScriptToolCall,
  getSystemInstructionForMode,
  getToolDeclarationsForMode,
  MODE_TOOL_NAMES,
  sanitizeJsonSchemaForTool,
  upsertStagedSuggestion,
  type AuditReviewSuggestion,
  type DraftSuggestion,
  type PatchSuggestion,
  type QuestionSuggestion,
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

describe('aiSettings BYOK persistence and Gemini model catalog', () => {
  it('exposes the supported Gemini model catalog and default settings', () => {
    expect(GEMINI_MODEL_OPTIONS.map((m) => m.id)).toEqual([
      'gemini-4-hydrogen',
      'gemini-4-neon',
      'gemini-4-carbon',
      'gemini-3.5-flash-lite',
    ]);
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-4-hydrogen');
    expect(REASONING_LEVEL_OPTIONS.map((r) => r.id)).toEqual(['low', 'medium', 'high']);
    expect(DEFAULT_REASONING_LEVEL).toBe('medium');
    expect(DEFAULT_AI_SETTINGS).toEqual({
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      quickScanSensitivity: 'balanced',
      apiKey: '',
      sessionOnly: false,
      showThinkingSummary: true,
      showEstimatedCost: true,
      showDebugTrace: false,
    });
  });

  it('stores API key in localStorage by default and moves it cleanly when toggling sessionOnly', () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const adapters = {local, session};

    const saved = saveStoredAiSettings(
      {
        model: 'gemini-4-neon',
        reasoningLevel: 'high',
        quickScanSensitivity: 'strict',
        apiKey: '  AIza-test-key-123  ',
        sessionOnly: false,
        showThinkingSummary: false,
        showEstimatedCost: false,
        showDebugTrace: true,
      },
      adapters
    );

    expect(saved.apiKey).toBe('AIza-test-key-123');
    expect(saved.showEstimatedCost).toBe(false);
    expect(saved.showDebugTrace).toBe(true);
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
        showEstimatedCost: 'nope',
        showDebugTrace: 'true',
      })
    ).toEqual({
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      quickScanSensitivity: 'balanced',
      apiKey: 'secret',
      sessionOnly: false,
      showThinkingSummary: true,
      showEstimatedCost: true,
      showDebugTrace: false,
    });

    // Legacy gemini-4-argon preference migrates cleanly to the middle tier (gemini-4-neon)
    expect(sanitizeAiSettings({model: 'gemini-4-argon', reasoningLevel: 'high'}).model).toBe(
      'gemini-4-neon'
    );

    expect(
      sanitizeAiSettings({
        model: 'gemini-4-carbon',
        reasoningLevel: 'high',
        apiKey: '',
        sessionOnly: true,
        showThinkingSummary: false,
        showDebugTrace: true,
      }).showDebugTrace
    ).toBe(true);

    local.setItem(AI_SETTINGS_STORAGE_KEY, '{broken json');
    expect(loadStoredAiSettings(adapters)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('resets model, reasoning level, and display toggles to defaults without clearing API key or sessionOnly', () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const adapters = {local, session};

    expect(isDefaultAiPreferences(DEFAULT_AI_SETTINGS)).toBe(true);

    const customized = saveStoredAiSettings(
      {
        model: 'gemini-4-carbon',
        reasoningLevel: 'high',
        quickScanSensitivity: 'lenient',
        apiKey: 'AIza-keep-me-intact',
        sessionOnly: true,
        showThinkingSummary: false,
        showEstimatedCost: false,
        showDebugTrace: true,
      },
      adapters
    );

    expect(isDefaultAiPreferences(customized)).toBe(false);

    const reset = resetAiPreferencesToDefault(customized, adapters);
    expect(isDefaultAiPreferences(reset)).toBe(true);
    expect(reset).toEqual({
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      quickScanSensitivity: 'balanced',
      apiKey: 'AIza-keep-me-intact',
      sessionOnly: true,
      showThinkingSummary: true,
      showEstimatedCost: true,
      showDebugTrace: false,
    });
    expect(session.getItem(AI_API_KEY_STORAGE_KEY)).toBe('AIza-keep-me-intact');
    expect(local.getItem(AI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(loadStoredAiSettings(adapters)).toEqual(reset);
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
    expect(Number(overview.result.macroStateCount)).toBeGreaterThan(0);
    expect(Array.isArray(overview.result.macroStates)).toBe(true);
    expect(overview.result).not.toHaveProperty('beatCount');
    expect(overview.result).not.toHaveProperty('beats');

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

  it('caps tool execution loops at MAX_AGENT_TOOL_ROUNDS (8) and honors maxToolRounds clamping', async () => {
    let counter = 0;
    const makeFakeClient = (): InteractionsClientLike => ({
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
    });

    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      mode: 'refine',
      prompt: 'Loop forever.',
      rawText: SAMPLE_SCRIPT,
      createClient: makeFakeClient,
    });

    expect(MAX_AGENT_TOOL_ROUNDS).toBe(8);
    expect(result.toolRounds).toBe(8);
    expect(result.hitToolRoundLimit).toBe(true);
    expect(counter).toBe(9); // Initial call + 8 function_result rounds

    // Explicit maxToolRounds override below cap clamps cleanly
    counter = 0;
    const clampedLow = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      mode: 'refine',
      prompt: 'Loop with cap 2.',
      rawText: SAMPLE_SCRIPT,
      maxToolRounds: 2,
      createClient: makeFakeClient,
    });
    expect(clampedLow.toolRounds).toBe(2);
    expect(clampedLow.hitToolRoundLimit).toBe(true);
    expect(counter).toBe(3);

    // Explicit maxToolRounds above MAX_AGENT_TOOL_ROUNDS clamps to MAX_AGENT_TOOL_ROUNDS (8)
    counter = 0;
    const clampedHigh = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      mode: 'refine',
      prompt: 'Loop with cap 99.',
      rawText: SAMPLE_SCRIPT,
      maxToolRounds: 99,
      createClient: makeFakeClient,
    });
    expect(clampedHigh.toolRounds).toBe(8);
    expect(clampedHigh.hitToolRoundLimit).toBe(true);
    expect(counter).toBe(9);
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

  it('captures a sanitized multi-round AgentTurnTrace with usage, requests, tool loops, and never leaks apiKey', async () => {
    const secretKey = 'AIza-super-secret-trace-key-999';
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

    let clockMs = Date.parse('2026-11-20T10:00:00.000Z');
    const tickNow = () => {
      clockMs += 25;
      return clockMs;
    };

    const roundStreams: InteractionStreamEventLike[][] = [
      [
        {event_type: 'interaction.created', interaction: {id: 'int-t1', status: 'in_progress'}},
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-bad',
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
                    content: 'Nadia crosses stage-left quickly',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 0},
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'int-t1',
            status: 'requires_action',
            usage: {total_input_tokens: 120, total_output_tokens: 45, total_tokens: 165},
          },
        },
      ],
      [
        {event_type: 'interaction.created', interaction: {id: 'int-t2', status: 'in_progress'}},
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-fixed',
            name: 'propose_script_patch',
            arguments: {
              expectedSnapshotHash: snapshotHash,
              summary: 'Shift Nadia frame-right',
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.1',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Nadia crosses frame-right quickly',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 0},
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'int-t2',
            status: 'requires_action',
            usage: {total_input_tokens: 210, total_output_tokens: 60, total_tokens: 270},
          },
        },
      ],
      [
        {event_type: 'interaction.created', interaction: {id: 'int-t3', status: 'in_progress'}},
        {event_type: 'step.delta', index: 0, delta: {type: 'text', text: 'Repaired and staged.'}},
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'int-t3',
            status: 'completed',
            usage: {total_input_tokens: 250, total_output_tokens: 20, total_tokens: 270},
          },
        },
      ],
    ];

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async () => asAsyncStream(roundStreams.shift() ?? []),
      },
    };

    const result = await runGeminiAgentTurn({
      apiKey: secretKey,
      model: 'gemini-4-neon',
      reasoningLevel: 'high',
      mode: 'refine',
      prompt: 'Have Nadia cross the room.',
      rawText: rawScript,
      previousInteractionId: 'int-prev-0',
      createSuggestionId: () => 'sugg-trace-1',
      now: tickNow,
      createClient: () => fakeClient,
    });

    const {trace} = result;
    expect(trace.model).toBe('gemini-4-neon');
    expect(trace.reasoningLevel).toBe('high');
    expect(trace.mode).toBe('refine');
    expect(trace.focus).toBe('refine');
    expect(trace.activeSkillIds).toEqual(['character_reference']);
    expect(trace.loadedSkillIds).toEqual([]);
    expect(trace.startedAt).toBe('2026-11-20T10:00:00.025Z');
    expect(trace.durationMs).toBeGreaterThan(0);
    expect(trace.initialPreviousInteractionId).toBe('int-prev-0');
    expect(trace.finalInteractionId).toBe('int-t3');
    expect(trace.toolRounds).toBe(2);
    expect(trace.hitToolRoundLimit).toBe(false);
    expect(trace.error).toBeUndefined();
    expect(trace.usage).toEqual({
      total_input_tokens: 580,
      total_output_tokens: 125,
      total_tokens: 705,
    });

    expect(trace.rounds).toHaveLength(3);
    expect(trace.rounds[0].roundIndex).toBe(1);
    expect(trace.rounds[0].interactionId).toBe('int-t1');
    expect(trace.rounds[0].status).toBe('requires_action');
    expect(trace.rounds[0].request.previous_interaction_id).toBe('int-prev-0');
    expect(trace.rounds[0].request.toolNames).toEqual([
      ...MODE_TOOL_NAMES.refine,
      'load_auteur_skill',
    ]);
    expect(trace.rounds[0].request.input).toBe('Have Nadia cross the room.');
    expect(trace.rounds[0].toolCalls).toHaveLength(1);
    expect(trace.rounds[0].toolCalls[0].ok).toBe(false);
    expect(typeof trace.rounds[0].toolCalls[0].result.repairHint).toBe('string');

    expect(trace.rounds[1].roundIndex).toBe(2);
    expect(trace.rounds[1].request.previous_interaction_id).toBe('int-t1');
    expect(trace.rounds[1].toolCalls).toHaveLength(1);
    expect(trace.rounds[1].toolCalls[0].ok).toBe(true);
    expect(trace.rounds[1].toolCalls[0].stagedSuggestionId).toBe('sugg-trace-1');

    expect(trace.rounds[2].roundIndex).toBe(3);
    expect(trace.rounds[2].request.previous_interaction_id).toBe('int-t2');
    expect(trace.rounds[2].status).toBe('completed');
    expect(trace.rounds[2].toolCalls).toHaveLength(0);

    const serialized = JSON.stringify(trace);
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain('apiKey');
  });

  it('attaches partial sanitized trace to GeminiServiceError on mid-turn failures and redacts apiKey', async () => {
    const secretKey = 'AIza-secret-error-key-42';
    let callCount = 0;

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async () => {
          callCount += 1;
          if (callCount === 1) {
            return asAsyncStream([
              {event_type: 'interaction.created', interaction: {id: 'int-ok-1', status: 'in_progress'}},
              {
                event_type: 'step.start',
                index: 0,
                step: {
                  type: 'function_call',
                  id: 'call-overview',
                  name: 'get_script_overview',
                  arguments: {},
                },
              },
              {event_type: 'step.stop', index: 0},
              {
                event_type: 'interaction.completed',
                interaction: {
                  id: 'int-ok-1',
                  status: 'requires_action',
                  usage: {total_input_tokens: 90, total_output_tokens: 15, total_tokens: 105},
                },
              },
            ]);
          }
          const upstreamErr = Object.assign(
            new Error(`Upstream gateway failed for key ${secretKey}`),
            {status: 503}
          );
          throw upstreamErr;
        },
      },
    };

    let caught: unknown;
    try {
      await runGeminiAgentTurn({
        apiKey: secretKey,
        model: 'gemini-4-carbon',
        reasoningLevel: 'medium',
        mode: 'check',
        prompt: 'Audit this scene.',
        rawText: SAMPLE_SCRIPT,
        createClient: () => fakeClient,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(GeminiServiceError);
    const serviceErr = caught as GeminiServiceError;
    expect(serviceErr.code).toBe('api_error');
    expect(serviceErr.status).toBe(503);
    expect(serviceErr.trace).toBeDefined();

    const trace = serviceErr.trace!;
    expect(trace.model).toBe('gemini-4-carbon');
    expect(trace.mode).toBe('check');
    expect(trace.toolRounds).toBe(1);
    expect(trace.finalInteractionId).toBe('int-ok-1');
    expect(trace.usage).toEqual({total_input_tokens: 90, total_output_tokens: 15, total_tokens: 105});
    expect(trace.error).toEqual({
      code: 'api_error',
      status: 503,
      message: 'Upstream gateway failed for key [REDACTED]',
    });
    expect(trace.rounds).toHaveLength(2);
    expect(trace.rounds[0].status).toBe('requires_action');
    expect(trace.rounds[0].toolCalls).toHaveLength(1);
    expect(trace.rounds[0].toolCalls[0].ok).toBe(true);
    expect(trace.rounds[1].status).toBe('error');
    expect(trace.rounds[1].request.previous_interaction_id).toBe('int-ok-1');

    const serialized = JSON.stringify(trace);
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain('apiKey');
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
    expect(buildScopedRefinePrompt('Sharpen blocking.', s1!)).toContain('Execution Macro-State S1');
    expect(buildScopedRefinePrompt('Sharpen blocking.', s1!)).not.toContain('Execution Beat');
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
      subStateIndex: 1,
      domId: 'execution-beat-2-substate-1',
      fallbackDomId: 'execution-beat-2',
    });
    expect(resolveEditorJumpTarget('S2.99', doc)).toEqual({
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

describe('markdown parser for AI assistant replies', () => {
  it('parses headings, loose ordered lists with nested bullets, code blocks, and inline spans', () => {
    const sample = [
      'A full 5-lens audit on snapshot `d1aed335` passed with **0 errors** and **0 warnings**.',
      '',
      '### 5-Lens Audit Breakdown',
      '',
      '1. **Lens 1: Spatial & Optics — Pass**',
      '   - `sceneTopology` (`multi_camera_coverage`) is respected across `S1`.',
      '   - Framing stays clean for *Ray*.',
      '',
      '2. **Lens 2: Temporal, Pacing & Wear — Pass**',
      '   - `MB3` (`OPENING`) is properly frozen.',
      '',
      '```text',
      '[CAM 01] MS, eye level',
      '```',
    ].join('\n');

    const blocks = parseMarkdownBlocks(sample);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'heading', 'list', 'code_block']);

    const heading = blocks[1];
    expect(heading.type === 'heading' && heading.level).toBe(3);

    const list = blocks[2];
    expect(list.type).toBe('list');
    if (list.type === 'list') {
      expect(list.ordered).toBe(true);
      expect(list.items).toHaveLength(2);
      expect(list.items[0].nestedLists).toHaveLength(1);
      expect(list.items[0].nestedLists[0].ordered).toBe(false);
      expect(list.items[0].nestedLists[0].items).toHaveLength(2);
      expect(list.items[1].nestedLists[0].items).toHaveLength(1);
    }

    const codeBlock = blocks[3];
    expect(codeBlock).toEqual({
      type: 'code_block',
      language: 'text',
      code: '[CAM 01] MS, eye level',
    });
  });

  it('preserves snake_case identifiers and blocks unsafe link protocols', () => {
    const inline = parseMarkdownInline(
      'Check multi_camera_coverage and [docs](https://example.com) and [bad](javascript:alert(1))'
    );
    expect(inline.some((n) => n.type === 'em')).toBe(false);
    expect(inline.filter((n) => n.type === 'link')).toEqual([
      {
        type: 'link',
        label: [{type: 'text', text: 'docs'}],
        href: 'https://example.com',
      },
    ]);
  });
});

describe('Phase 1 Unified Auteur Agent: Knowledge Registry, Context Composer & Dynamic Skills', () => {
  const MONTAGE_SCRIPT = SCRIPT_PRESETS.find((p) => p.id === 'heist-montage')!.content;
  const INTERROGATION_SCRIPT = SCRIPT_PRESETS.find((p) => p.id === 'interrogation-coverage')!.content;

  it('prunes allowed tools by focus and editor emptiness without triple write-schema bloat', () => {
    expect(assistantModeToFocus('check')).toBe('audit');
    expect(assistantModeToFocus('refine')).toBe('refine');
    expect(assistantModeToFocus('draft')).toBe('draft');

    // auto + empty script -> propose_script_draft (+ load_auteur_skill), no get_script_overview
    const autoEmpty = composeAgentContext({focus: 'auto', rawText: '   '});
    expect(autoEmpty.editorState.isEmpty).toBe(true);
    expect(autoEmpty.allowedToolNames).toEqual(['propose_script_draft', 'load_auteur_skill']);

    // auto + existing script -> overview, slice, patch, audit (+ load_auteur_skill), NO propose_script_draft
    const autoExisting = composeAgentContext({focus: 'auto', rawText: INTERROGATION_SCRIPT});
    expect(autoExisting.editorState.isEmpty).toBe(false);
    expect(autoExisting.allowedToolNames).toEqual([
      'get_script_overview',
      'inspect_lens_slice',
      'propose_script_patch',
      'report_audit_review',
      'load_auteur_skill',
    ]);
    expect(autoExisting.allowedToolNames).not.toContain('propose_script_draft');

    // draft + empty vs non-empty
    const draftEmpty = composeAgentContext({focus: 'draft', rawText: ''});
    expect(draftEmpty.allowedToolNames).toEqual(['propose_script_draft', 'load_auteur_skill']);
    const draftExisting = composeAgentContext({focus: 'draft', rawText: INTERROGATION_SCRIPT});
    expect(draftExisting.allowedToolNames).toEqual([
      'get_script_overview',
      'propose_script_draft',
      'load_auteur_skill',
    ]);

    // refine & audit focus
    const refineCtx = composeAgentContext({focus: 'refine', rawText: INTERROGATION_SCRIPT});
    expect(refineCtx.allowedToolNames).toEqual([
      'get_script_overview',
      'inspect_lens_slice',
      'propose_script_patch',
      'load_auteur_skill',
    ]);
    const auditCtx = composeAgentContext({focus: 'audit', rawText: INTERROGATION_SCRIPT});
    expect(auditCtx.allowedToolNames).toEqual([
      'get_script_overview',
      'inspect_lens_slice',
      'report_audit_review',
      'load_auteur_skill',
    ]);

    // When zero skills are available (all muted), load_auteur_skill is omitted entirely
    const allMutedOverrides = Object.fromEntries(
      BUILTIN_AUTEUR_SKILLS.map((s) => [s.id, {pinMode: 'muted' as const}])
    );
    const noSkillsCtx = composeAgentContext({
      focus: 'refine',
      rawText: INTERROGATION_SCRIPT,
      skillOverrides: allMutedOverrides,
    });
    expect(noSkillsCtx.availableSkills).toHaveLength(0);
    expect(noSkillsCtx.allowedToolNames).toEqual([
      'get_script_overview',
      'inspect_lens_slice',
      'propose_script_patch',
    ]);
  });

  it('enforces single-state skill machine (active | available | muted), passive triggers, Pin/Mute, custom skills, and zero duplication', () => {
    const richScript = [
      '[INTENT]',
      'Create a continuous sequel extending @video1 featuring @image1 as Mara (voice: @audio1).',
      '',
      '[CONTINUITY PROTOCOL]',
      'Preserve Mara drenched jacket from the terminal frame of @video1.',
      '',
      '[AESTHETIC]',
      'Location: rain-slick alley -> LOC01',
      'Lighting: sodium streetlamp -> EV01',
      '',
      '[OPENING]',
      'MS at eye level in LOC01. Frame-left, Mara stands facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> [ACT] Mara steps forward in LOC01 -> <boot splash>',
    ].join('\n');

    const ctx = composeAgentContext({
      focus: 'refine',
      rawText: richScript,
      skillOverrides: {
        temporal_calibration: {pinMode: 'pinned'},
        spatial_fences: {pinMode: 'muted'},
      },
      customSkills: [
        {
          id: 'house_noir_voice',
          name: 'House Noir Voice',
          triggerHint: 'Hardboiled clipped dialogue rhythm.',
          body: 'Keep spoken exchanges under 8 words per line.',
        },
      ],
    });

    // Passive triggers: video_continuation, token_mapping, character_reference + pinned temporal_calibration
    const activeIds = ctx.activeSkills.map((s) => s.id);
    const availableIds = ctx.availableSkills.map((s) => s.id);
    const mutedIds = ctx.mutedSkills.map((s) => s.id);

    expect(activeIds).toEqual(
      expect.arrayContaining([
        'video_continuation',
        'token_mapping',
        'character_reference',
        'temporal_calibration',
      ])
    );
    expect(activeIds).not.toContain('draft_craft');
    expect(activeIds).not.toContain('spatial_fences');
    expect(mutedIds).toEqual(['spatial_fences']);
    expect(availableIds).toEqual(expect.arrayContaining(['draft_craft', 'house_noir_voice']));

    // Mutual exclusivity across all three buckets
    const allIds = [...activeIds, ...availableIds, ...mutedIds];
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.length).toBe(ctx.resolvedSkills.length);

    // Active skills appear in sections.activeSkills, NEVER in skillDirectory or load_auteur_skill enum
    const decls = buildToolDeclarationsForContext(ctx);
    const loadDecl = decls.find((d) => d.name === 'load_auteur_skill')!;
    expect(loadDecl).toBeDefined();
    const skillIdSchema = (
      loadDecl.parameters.properties as Record<string, {enum?: string[]}>
    ).skillId;
    expect(skillIdSchema.enum).toEqual(availableIds);

    for (const id of activeIds) {
      expect(ctx.sections.activeSkills.text).toContain(`(\`${id}\`)`);
      expect(ctx.sections.skillDirectory.text).not.toContain(`\`${id}\`:`);
      expect(skillIdSchema.enum).not.toContain(id);
    }
    for (const id of mutedIds) {
      expect(ctx.systemInstruction).not.toContain(id);
      expect(skillIdSchema.enum).not.toContain(id);
    }

    // Dynamic enum is NOT statically cached across turns with different custom skills
    const secondTurnCtx = composeAgentContext({
      focus: 'refine',
      rawText: INTERROGATION_SCRIPT,
      customSkills: [
        {
          id: 'custom_second_turn_skill',
          name: 'Second Turn Custom',
          triggerHint: 'Second turn only.',
          body: 'Custom body for turn 2.',
        },
      ],
    });
    const secondLoadDecl = buildToolDeclarationsForContext(secondTurnCtx).find(
      (d) => d.name === 'load_auteur_skill'
    )!;
    const secondEnum = (
      secondLoadDecl.parameters.properties as Record<string, {enum?: string[]}>
    ).skillId.enum!;
    expect(secondEnum).toContain('custom_second_turn_skill');
    expect(secondEnum).not.toContain('house_noir_voice');

    // draft_craft auto-activates on empty doc and includes montage example ONLY on montage topology
    const emptyDraftCtx = composeAgentContext({focus: 'auto', rawText: ''});
    const emptyDraftSkill = emptyDraftCtx.activeSkills.find((s) => s.id === 'draft_craft')!;
    expect(emptyDraftSkill).toBeDefined();
    expect(emptyDraftSkill.body).toContain('POV Forest Horror');
    expect(emptyDraftSkill.body).toContain('Interrogation Room Coverage');
    expect(emptyDraftSkill.body).not.toContain('Discontinuous Montage');

    const montageDraftCtx = composeAgentContext({focus: 'draft', rawText: MONTAGE_SCRIPT});
    const montageDraftSkill = montageDraftCtx.activeSkills.find((s) => s.id === 'draft_craft')!;
    expect(montageDraftSkill.body).toContain('Discontinuous Montage');
    expect(montageDraftSkill.body).toContain('safecracker');
  });

  it('keeps editable foundational craft separate from code-owned toolProtocol and injects Live Editor State up front', () => {
    const scriptWithLint = [
      '[INTENT]',
      'Create a corridor scene with @image1 as Elena.',
      '',
      '[OPENING]',
      'MS eye level. Frame-left, Elena stands facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> [ACT] Elena steps stage-left -> Elena says {Wait.}',
    ].join('\n');

    const ctx = composeAgentContext({
      focus: 'refine',
      rawText: scriptWithLint,
      previousSnapshotHash: 'old-hash-000',
      foundationalCraftOverride: 'Custom director voice override.',
    });

    expect(ctx.knowledgeVersion).toBe(AUTEUR_KNOWLEDGE_VERSION);
    expect(ctx.sections.foundationalCraft.isOverridden).toBe(true);
    expect(ctx.sections.foundationalCraft.text).toBe('Custom director voice override.');
    expect(ctx.sections.toolProtocol.editable).toBe(false);
    expect(ctx.sections.toolProtocol.text).toContain(ctx.editorState.snapshotHash);
    expect(ctx.sections.toolProtocol.text).toContain('expectedSnapshotHash');

    expect(ctx.editorState.changedSinceLastTurn).toBe(true);
    expect(ctx.editorState.diagnosticsSummary.errors).toBe(1);
    expect(ctx.editorState.diagnosticsSummary.warnings).toBe(1);
    expect(ctx.sections.liveEditorState.text).toContain(ctx.editorState.snapshotHash);
    expect(ctx.sections.liveEditorState.text).toContain('CHANGED since last turn');
    expect(ctx.sections.liveEditorState.text).toContain('Execution Macro-State(s)');
    expect(ctx.sections.liveEditorState.text).not.toContain('Execution Beat(s)');
    expect(ctx.sections.liveEditorState.text).toContain('viewport-coordinate-purity');
    expect(ctx.sections.liveEditorState.text).toContain('macro-state-resolution');

    const defaultCraftCtx = composeAgentContext({
      focus: 'refine',
      rawText: scriptWithLint,
    });
    expect(defaultCraftCtx.sections.foundationalCraft.text).toContain('Macro-State');
    expect(defaultCraftCtx.sections.foundationalCraft.text).not.toContain('Execution Beat');
    expect(defaultCraftCtx.sections.foundationalCraft.text).not.toContain('Macro-State beat');

    const sameHashCtx = composeAgentContext({
      focus: 'refine',
      rawText: scriptWithLint,
      previousSnapshotHash: ctx.editorState.snapshotHash,
    });
    expect(sameHashCtx.editorState.changedSinceLastTurn).toBe(false);
  });

  it('executes load_auteur_skill cleanly across available, active, muted, unknown, and custom skill paths', () => {
    const ctx = composeAgentContext({
      focus: 'refine',
      rawText: INTERROGATION_SCRIPT,
      skillOverrides: {
        temporal_calibration: {pinMode: 'pinned'},
        spatial_fences: {pinMode: 'muted'},
      },
      customSkills: [
        {
          id: 'my_lens_rule',
          name: 'My Lens Rule',
          triggerHint: 'Custom optics guidance.',
          body: 'Prefer 40mm anamorphic close-ups for reveals.',
        },
      ],
    });

    const loadedEvents: Array<{id: string; name: string; source: 'tool'}> = [];

    // 1. Available built-in skill loads cleanly and fires callback
    const okBuiltin = executeScriptToolCall(
      {name: 'load_auteur_skill', arguments: {skillId: 'token_mapping'}},
      {
        mode: 'refine',
        rawText: INTERROGATION_SCRIPT,
        composedContext: ctx,
        onSkillLoaded: (e) => loadedEvents.push(e),
      }
    );
    expect(okBuiltin.ok).toBe(true);
    expect(okBuiltin.result.skillId).toBe('token_mapping');
    expect(String(okBuiltin.result.content)).toContain('Description -> TOKEN');
    expect(loadedEvents).toEqual([
      {id: 'token_mapping', name: 'Aesthetic Shorthand Token Mapping', source: 'tool'},
    ]);

    // 2. Available custom skill loads cleanly
    const okCustom = executeScriptToolCall(
      {name: 'load_auteur_skill', arguments: {skillId: 'my_lens_rule'}},
      {
        mode: 'refine',
        rawText: INTERROGATION_SCRIPT,
        composedContext: ctx,
        onSkillLoaded: (e) => loadedEvents.push(e),
      }
    );
    expect(okCustom.ok).toBe(true);
    expect(okCustom.result.content).toBe('Prefer 40mm anamorphic close-ups for reveals.');
    expect(loadedEvents).toHaveLength(2);

    // 3. Active skill returns alreadyActive: true without dumping duplicate body
    const alreadyActive = executeScriptToolCall(
      {name: 'load_auteur_skill', arguments: {skillId: 'temporal_calibration'}},
      {mode: 'refine', rawText: INTERROGATION_SCRIPT, composedContext: ctx}
    );
    expect(alreadyActive.ok).toBe(true);
    expect(alreadyActive.result.alreadyActive).toBe(true);
    expect(alreadyActive.result.content).toBeUndefined();

    // 4. Muted skill is strictly rejected
    const muted = executeScriptToolCall(
      {name: 'load_auteur_skill', arguments: {skillId: 'spatial_fences'}},
      {mode: 'refine', rawText: INTERROGATION_SCRIPT, composedContext: ctx}
    );
    expect(muted.ok).toBe(false);
    expect(muted.result.error).toBe('Skill is muted by the user.');
    expect(Array.isArray(muted.result.availableSkills)).toBe(true);

    // 5. Unknown skill returns structured error + repairHint
    const unknown = executeScriptToolCall(
      {name: 'load_auteur_skill', arguments: {skillId: 'nonexistent_skill'}},
      {mode: 'refine', rawText: INTERROGATION_SCRIPT, composedContext: ctx}
    );
    expect(unknown.ok).toBe(false);
    expect(typeof unknown.result.repairHint).toBe('string');
    expect(unknown.result.availableSkills).toContain('my_lens_rule');
  });

  it('co-locates topology-filtered audit checklists in inspect_lens_slice for all 5 presets', () => {
    const presets = [
      'lens1_spatial_optics',
      'lens2_temporal_pacing_wear',
      'lens3_props_inventory',
      'lens4_acoustics_voice',
      'lens5_blocks_grammar',
    ] as const;

    for (const preset of presets) {
      const montageRes = executeScriptToolCall(
        {name: 'inspect_lens_slice', arguments: {preset}},
        {mode: 'check', rawText: MONTAGE_SCRIPT}
      );
      expect(montageRes.ok).toBe(true);
      const montageChecklist = montageRes.result.checklist as LensAuditChecklist;
      expect(montageChecklist).toBeDefined();
      expect(montageChecklist.preset).toBe(preset);
      expect(montageChecklist.topology).toBe('discontinuous_montage');
      expect(montageChecklist.checks.length).toBeGreaterThan(0);
    }

    // Lens 1: montage suppresses cross-cut 180-degree & S0->S1 carryover; coverage keeps them
    const montageL1 = getLensAuditChecklist('lens1_spatial_optics', 'discontinuous_montage');
    const coverageL1 = getLensAuditChecklist('lens1_spatial_optics', 'multi_camera_coverage');
    expect(montageL1.checks.join(' ').toLowerCase()).not.toContain('180-degree');
    expect(montageL1.checks.join(' ')).not.toContain('S0 -> S1');
    expect(montageL1.checks.join(' ')).toContain('[CAM]');
    expect(montageL1.suppressedChecks.length).toBeGreaterThan(0);
    expect(coverageL1.checks.join(' ').toLowerCase()).toContain('180-degree');
    expect(coverageL1.checks.join(' ')).toContain('S0 -> S1');

    // Lens 2 & Lens 3: montage suppresses cross-beat wear & prop persistence while keeping cut-latency floor
    const montageL2 = getLensAuditChecklist('lens2_temporal_pacing_wear', 'discontinuous_montage');
    expect(montageL2.checks.join(' ')).toContain('Duration(s) / 2.0');
    expect(montageL2.checks.join(' ').toLowerCase()).not.toContain('sweat');
    expect(montageL2.suppressedChecks.length).toBeGreaterThan(0);

    const montageL3 = getLensAuditChecklist('lens3_props_inventory', 'discontinuous_montage');
    const coverageL3 = getLensAuditChecklist('lens3_props_inventory', 'multi_camera_coverage');
    expect(montageL3.checks.join(' ').toLowerCase()).not.toContain('repetition across cuts');
    expect(coverageL3.checks.join(' ').toLowerCase()).toContain('repetition across cuts');

    // Custom spec without preset omits checklist
    const customSlice = executeScriptToolCall(
      {name: 'inspect_lens_slice', arguments: {spec: {dimensions: ['action']}}},
      {mode: 'check', rawText: INTERROGATION_SCRIPT}
    );
    expect(customSlice.ok).toBe(true);
    expect(customSlice.result.checklist).toBeUndefined();
  });

  it('enforces 100% platform-agnostic purity and strict JSON Schema sanitization across dynamic tool declarations', () => {
    const bannedTerms = ['gemini', 'seedance', 'runway', 'kling', 'sora', 'veo', 'openai', 'claude'];
    const textsToCheck: string[] = [
      DEFAULT_FOUNDATIONAL_CRAFT,
      ...BUILTIN_AUTEUR_SKILLS.map((s) => `${s.name}\n${s.triggerHint}\n${s.body}`),
    ];

    for (const focus of ['auto', 'draft', 'refine', 'audit'] as const) {
      for (const raw of ['', INTERROGATION_SCRIPT, MONTAGE_SCRIPT]) {
        const ctx = composeAgentContext({focus, rawText: raw});
        textsToCheck.push(ctx.systemInstruction);

        const decls = buildToolDeclarationsForContext(ctx);
        for (const decl of decls) {
          const serialized = JSON.stringify(decl.parameters);
          expect(serialized).not.toContain('"$schema":');
          expect(serialized).not.toContain('"const":');

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
    }

    for (const preset of [
      'lens1_spatial_optics',
      'lens2_temporal_pacing_wear',
      'lens3_props_inventory',
      'lens4_acoustics_voice',
      'lens5_blocks_grammar',
    ] as const) {
      for (const topology of [
        'continuous_oner',
        'multi_camera_coverage',
        'discontinuous_montage',
        'mixed',
        'empty',
      ] as const) {
        textsToCheck.push(JSON.stringify(getLensAuditChecklist(preset, topology)));
      }
    }

    const corpus = textsToCheck.join('\n').toLowerCase();
    for (const term of bannedTerms) {
      expect(corpus).not.toContain(term);
    }
  });

  it('wires unified focus, onSkillLoaded callbacks, trace skill lists, and secret redaction end-to-end in runGeminiAgentTurn', async () => {
    const secretKey = 'AIza-phase1-secret-skill-trace-777';
    const roundStreams: InteractionStreamEventLike[][] = [
      // Round 1: model calls load_auteur_skill for an available custom skill
      [
        {event_type: 'interaction.created', interaction: {id: 'int-s1', status: 'in_progress'}},
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-skill-1',
            name: 'load_auteur_skill',
            arguments: {skillId: 'studio_blocking_rule'},
          },
        },
        {event_type: 'step.stop', index: 0},
        {event_type: 'interaction.completed', interaction: {id: 'int-s1', status: 'requires_action'}},
      ],
      // Round 2: model returns final reply
      [
        {event_type: 'interaction.created', interaction: {id: 'int-s2', status: 'in_progress'}},
        {event_type: 'step.delta', index: 0, delta: {type: 'text', text: 'Loaded custom blocking skill.'}},
        {event_type: 'interaction.completed', interaction: {id: 'int-s2', status: 'completed'}},
      ],
    ];

    const capturedRequests: Array<Record<string, unknown>> = [];
    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async (params) => {
          capturedRequests.push(params);
          return asAsyncStream(roundStreams.shift() ?? []);
        },
      },
    };

    const skillEvents: Array<{id: string; name: string; source: 'passive' | 'pinned' | 'tool'}> = [];
    const result = await runGeminiAgentTurn({
      apiKey: secretKey,
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      mode: 'refine',
      focus: 'auto',
      prompt: 'Check blocking with our studio rule.',
      rawText: INTERROGATION_SCRIPT,
      previousSnapshotHash: 'prior-hash',
      briefContext: '### Format & Specs\nSingle continuous handheld take.',
      skillOverrides: {
        temporal_calibration: {pinMode: 'pinned'},
      },
      customSkills: [
        {
          id: 'studio_blocking_rule',
          name: 'Studio Blocking Rule',
          triggerHint: 'Studio framing checklist.',
          body: 'Keep foreground subjects off dead-center.',
        },
      ],
      createClient: () => fakeClient,
      callbacks: {
        onSkillLoaded: (event) => skillEvents.push(event),
      },
    });

    expect(result.trace.focus).toBe('auto');
    expect(result.trace.mode).toBe('refine');
    expect(result.trace.activeSkillIds).toEqual(['temporal_calibration']);
    expect(result.trace.loadedSkillIds).toEqual(['studio_blocking_rule']);
    expect(skillEvents).toEqual([
      {
        id: 'temporal_calibration',
        name: 'Temporal Calibration & Tempo Table',
        source: 'pinned',
      },
      {
        id: 'studio_blocking_rule',
        name: 'Studio Blocking Rule',
        source: 'tool',
      },
    ]);

    // Verify auto mode on existing script sent 5 tools (excluding propose_script_draft)
    expect(result.trace.rounds[0].request.toolNames).toEqual([
      'get_script_overview',
      'inspect_lens_slice',
      'propose_script_patch',
      'report_audit_review',
      'load_auteur_skill',
    ]);
    expect(String(capturedRequests[0].system_instruction)).toContain('CHANGED since last turn');
    expect(String(capturedRequests[0].system_instruction)).toContain('Scene Brief & References');
    expect(String(capturedRequests[0].system_instruction)).toContain(
      'Single continuous handheld take.'
    );
    expect(capturedRequests[0].input).toBe('Check blocking with our studio rule.');

    // Trace never contains apiKey
    const serialized = JSON.stringify(result.trace);
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain('apiKey');
  });

  it('replaces superseded drafts, audits, and same-target patches within a turn while keeping distinct patches', () => {
    const emptyDiff = buildLineDiff('', '');
    const emptyLintDelta = {
      beforeErrors: 0,
      beforeWarnings: 0,
      afterErrors: 0,
      afterWarnings: 0,
      introducedErrors: [],
      introducedWarnings: [],
      resolvedDiagnostics: [],
    };

    const draftWarn: DraftSuggestion = {
      id: 'draft-1',
      kind: 'draft',
      title: 'Roadside',
      summary: 'First pass with 1 warn',
      baseSnapshotHash: 'h0',
      nextSnapshotHash: 'h1',
      sceneTopology: 'multi_camera_coverage',
      stagingBlockCount: 4,
      beatCount: 4,
      candidateRawText: 'v1',
      diff: emptyDiff,
      diagnostics: [],
      errorCount: 0,
      warningCount: 1,
    };
    const draftClean: DraftSuggestion = {
      ...draftWarn,
      id: 'draft-2',
      summary: 'Polished clean pass',
      nextSnapshotHash: 'h2',
      candidateRawText: 'v2',
      warningCount: 0,
    };

    const afterDrafts = upsertStagedSuggestion(
      upsertStagedSuggestion([], draftWarn),
      draftClean
    );
    expect(afterDrafts.map((s) => s.id)).toEqual(['draft-2']);

    const patchS2Warn: PatchSuggestion = {
      id: 'patch-1',
      kind: 'patch',
      summary: 'S2 pass 1',
      baseSnapshotHash: 'h0',
      nextSnapshotHash: 'h1',
      affectedIds: ['S2'],
      opsCount: 1,
      patch: {ops: []},
      beforeRawText: 'a',
      candidateRawText: 'b',
      diff: emptyDiff,
      lintDelta: emptyLintDelta,
    };
    const patchMB0: PatchSuggestion = {
      ...patchS2Warn,
      id: 'patch-2',
      summary: 'MB0 polish',
      affectedIds: ['MB0'],
    };
    const patchS2Clean: PatchSuggestion = {
      ...patchS2Warn,
      id: 'patch-3',
      summary: 'S2 pass 2',
      affectedIds: ['S2'],
    };

    let list: StagedSuggestion[] = [];
    list = upsertStagedSuggestion(list, patchS2Warn);
    list = upsertStagedSuggestion(list, patchMB0);
    list = upsertStagedSuggestion(list, patchS2Clean);
    expect(list.map((s) => s.id)).toEqual(['patch-3', 'patch-2']);

    const audit1: AuditReviewSuggestion = {
      id: 'audit-1',
      kind: 'audit_review',
      baseSnapshotHash: 'h0',
      overallSummary: 'Initial audit',
      issues: [],
      errorCount: 0,
      warningCount: 1,
    };
    const audit2: AuditReviewSuggestion = {
      ...audit1,
      id: 'audit-2',
      overallSummary: 'Revised audit',
      warningCount: 0,
    };
    const afterAudits = upsertStagedSuggestion(upsertStagedSuggestion([], audit1), audit2);
    expect(afterAudits.map((s) => s.id)).toEqual(['audit-2']);
  });

  it('deduplicates multi-round propose_script_draft self-repair in runGeminiAgentTurn while keeping both rounds in trace', async () => {
    const draftPayloadV1 = {
      title: 'Gravel Roadside Breakdown',
      summary: 'First draft pass with trailing dialogue warning',
      draft: {
        stagingMacroBlocks: [
          {header: 'INTENT', format: 'prose', body: 'Raw confrontation by the roadside.'},
          {header: 'OPENING', format: 'prose', body: 'Robbie stands beside the shoulder.'},
        ],
        executionMacroBlock: {
          header: 'EXECUTION',
          macroStates: [
            {
              subStates: [
                {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: 'MS, handheld'},
                {dimension: 'action', subStateTag: 'ACT', content: 'Robbie kicks loose gravel'},
                {
                  dimension: 'dialogue',
                  speaker: 'Robbie',
                  delivery: 'hoarse',
                  line: 'Stop talking.',
                },
              ],
            },
          ],
        },
      },
    };
    const draftPayloadV2 = {
      ...draftPayloadV1,
      summary: 'Clean revised draft pass',
      draft: {
        ...draftPayloadV1.draft,
        executionMacroBlock: {
          header: 'EXECUTION',
          macroStates: [
            {
              subStates: [
                {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: 'MS, handheld'},
                {dimension: 'action', subStateTag: 'ACT', content: 'Robbie kicks loose gravel'},
                {
                  dimension: 'dialogue',
                  speaker: 'Robbie',
                  delivery: 'hoarse',
                  line: 'Stop talking.',
                },
                {dimension: 'foley', sound: 'gravel crunching underfoot'},
              ],
            },
          ],
        },
      },
    };

    const roundStreams: InteractionStreamEventLike[][] = [
      [
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-draft-1',
            name: 'propose_script_draft',
            arguments: draftPayloadV1,
          },
        },
        {event_type: 'step.stop', index: 0},
        {
          event_type: 'interaction.completed',
          interaction: {id: 'int-draft-1', status: 'requires_action'},
        },
      ],
      [
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-draft-2',
            name: 'propose_script_draft',
            arguments: draftPayloadV2,
          },
        },
        {event_type: 'step.stop', index: 0},
        {
          event_type: 'interaction.completed',
          interaction: {id: 'int-draft-2', status: 'requires_action'},
        },
      ],
      [
        {event_type: 'step.delta', index: 0, delta: {type: 'text', text: 'Staged clean draft.'}},
        {event_type: 'interaction.completed', interaction: {id: 'int-draft-3', status: 'completed'}},
      ],
    ];

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async () => asAsyncStream(roundStreams.shift() ?? []),
      },
    };

    let uiSuggestions: StagedSuggestion[] = [];
    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      mode: 'draft',
      focus: 'draft',
      prompt: 'Draft a tense roadside confrontation.',
      rawText: '',
      createClient: () => fakeClient,
      callbacks: {
        onSuggestionStaged: (suggestion) => {
          uiSuggestions = upsertStagedSuggestion(uiSuggestions, suggestion);
        },
      },
    });

    expect(result.stagedSuggestions).toHaveLength(1);
    expect(result.stagedSuggestions[0].kind).toBe('draft');
    const finalDraft = result.stagedSuggestions[0] as DraftSuggestion;
    expect(finalDraft.summary).toBe('Clean revised draft pass');
    expect(finalDraft.warningCount).toBe(0);
    expect(uiSuggestions).toHaveLength(1);
    expect(uiSuggestions[0].id).toBe(finalDraft.id);
    // Trace still records both tool rounds transparently
    expect(result.trace.toolRounds).toBe(2);
    expect(result.trace.rounds).toHaveLength(3);
  });
});

describe('ask_question opt-in clarifying workflow', () => {
  const sampleScript = SCRIPT_PRESETS[0].content;

  it('omits ask_question by default across all focuses and exposes it only when explicitly enabled outside Audit', () => {
    for (const focus of ['auto', 'draft', 'refine', 'audit'] as const) {
      const ctx = composeAgentContext({focus, rawText: sampleScript});
      expect(ctx.allowedToolNames).not.toContain('ask_question');
      expect(buildToolDeclarationsForContext(ctx).map((t) => t.name)).not.toContain('ask_question');
    }

    const askFirstAuto = composeAgentContext({
      focus: 'auto',
      rawText: sampleScript,
      askQuestionMode: 'ask_first',
    });
    expect(askFirstAuto.allowedToolNames).toContain('ask_question');
    expect(askFirstAuto.sections.toolProtocol.text).toContain('Ask First');
    expect(buildToolDeclarationsForContext(askFirstAuto).map((t) => t.name)).toContain(
      'ask_question'
    );

    const followupDraft = composeAgentContext({
      focus: 'draft',
      rawText: '',
      askQuestionMode: 'followup',
    });
    expect(followupDraft.allowedToolNames).toContain('ask_question');
    expect(followupDraft.sections.toolProtocol.text).toContain('Clarifying follow-up');

    // Audit focus always suppresses ask_question even if requested
    const auditBlocked = composeAgentContext({
      focus: 'audit',
      rawText: sampleScript,
      askQuestionMode: 'ask_first',
    });
    expect(auditBlocked.allowedToolNames).not.toContain('ask_question');
  });

  it('validates, sanitizes, stages, and supersedes QuestionSuggestion cards cleanly', () => {
    const defaultCtx = composeAgentContext({focus: 'draft', rawText: ''});
    const blocked = executeScriptToolCall(
      {
        name: 'ask_question',
        arguments: {
          questions: [{question: 'Topology?', options: ['Oner', 'Coverage']}],
        },
      },
      {mode: 'draft', rawText: '', composedContext: defaultCtx}
    );
    expect(blocked.ok).toBe(false);

    const askCtx = composeAgentContext({
      focus: 'draft',
      rawText: '',
      askQuestionMode: 'ask_first',
    });

    // Rejects invalid/too-few options after stripping "Other"
    const invalid = executeScriptToolCall(
      {
        name: 'ask_question',
        arguments: {
          questions: [{question: 'Pick one?', options: ['Only one', 'Other']}],
        },
      },
      {mode: 'draft', rawText: '', composedContext: askCtx}
    );
    expect(invalid.ok).toBe(false);

    const staged: StagedSuggestion[] = [];
    const valid = executeScriptToolCall(
      {
        name: 'ask_question',
        arguments: {
          intro: 'Quick creative check before drafting:',
          questions: [
            {
              question: 'Camera topology?',
              options: ['Continuous Oner', 'Multi-Camera Coverage', 'continuous oner', 'Other'],
            },
            {
              question: 'Audio emphasis?',
              options: ['Dialogue-driven', 'Diegetic foley only', 'Minimal score'],
            },
          ],
        },
      },
      {
        mode: 'draft',
        rawText: '',
        composedContext: askCtx,
        createSuggestionId: () => 'q-sug-1',
        onStageSuggestion: (item) => staged.push(item),
      }
    );

    expect(valid.ok).toBe(true);
    expect(staged).toHaveLength(1);
    const card = staged[0] as QuestionSuggestion;
    expect(card.kind).toBe('question');
    expect(card.intro).toBe('Quick creative check before drafting:');
    expect(card.questions).toHaveLength(2);
    // Deduplicated case-insensitively and stripped "Other"
    expect(card.questions[0].options).toEqual(['Continuous Oner', 'Multi-Camera Coverage']);

    // Superseding question card in the same turn replaces prior question card
    const replacement: QuestionSuggestion = {
      id: 'q-sug-2',
      kind: 'question',
      questions: [{id: 'q-1', question: 'Pacing?', options: ['Fast', 'Slow']}],
    };
    const merged = upsertStagedSuggestion(staged, replacement);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('q-sug-2');
  });

  it('formats multi-select choices, inline comments, and skipped questions cleanly', () => {
    const suggestion: QuestionSuggestion = {
      id: 'q-sug-1',
      kind: 'question',
      questions: [
        {
          id: 'q-1',
          question: 'Camera topology?',
          options: ['Continuous Oner', 'Handheld tracking', 'Static locked-off'],
        },
        {
          id: 'q-2',
          question: 'Audio mood?',
          options: ['Silent + foley', 'Dialogue-driven'],
        },
        {
          id: 'q-3',
          question: 'Color palette?',
          options: ['Warm tungsten', 'Cold fluorescent'],
        },
      ],
    };

    expect(hasAnyQuestionAnswer({})).toBe(false);
    expect(hasAnyQuestionAnswer({'q-1': {selectedOptions: [], comment: '   '}})).toBe(false);

    const answers = {
      'q-1': {
        selectedOptions: ['Handheld tracking', 'Continuous Oner'],
        comment: 'Start close on her hands then widen',
      },
      'q-2': {
        selectedOptions: [],
        comment: 'Rain on metal roof only',
      },
    };
    expect(hasAnyQuestionAnswer(answers)).toBe(true);

    const formatted = formatQuestionAnswersPrompt(suggestion, answers);
    expect(formatted.answeredCount).toBe(2);
    expect(formatted.totalCount).toBe(3);
    // Preserves canonical option order from question definition
    expect(formatted.displayText).toContain('- Selected: Continuous Oner, Handheld tracking');
    expect(formatted.displayText).toContain('- Comment: Start close on her hands then widen');
    expect(formatted.displayText).toContain('- Comment: Rain on metal roof only');
    expect(formatted.displayText).toContain('- (No preference — your call)');
    expect(formatted.promptText).toContain('Clarifying answers:');

    expect(formatToolDisplayName('ask_question')).toBe('Clarifying questions');
    const tooltip = formatToolCallTooltip({
      callId: 'c-q',
      name: 'ask_question',
      arguments: {questions: [{question: 'Camera topology?', options: ['Oner', 'Coverage']}]},
      status: 'ok',
    });
    expect(tooltip.title).toBe('Clarifying questions');
    expect(tooltip.detail).toContain('1 question');
    expect(tooltip.detail).toContain('Camera topology?');
  });
});

