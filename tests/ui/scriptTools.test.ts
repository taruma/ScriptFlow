import {describe, expect, it} from 'vitest';
import {projectAuteurPatchPreview, toAuteurEnvelope} from '../../src/core/index.ts';
import {TEST_CRAFT_EXEMPLARS} from '../fixtures/craftExemplars.ts';
import {BUILTIN_SCRIPT_TOOLS, composeAgentContext} from '../../src/services/auteurKnowledge.ts';
import {
  buildLineDiff,
  buildToolDeclarationsForContext,
  executeScriptToolCall,
  getSystemInstructionForMode,
  getToolDeclarationsForMode,
  getToolParametersSchema,
  MODE_TOOL_NAMES,
  sanitizeJsonSchemaForTool,
  upsertStagedSuggestion,
  type AuditReviewSuggestion,
  type DraftSuggestion,
  type PatchSuggestion,
  type QuestionSuggestion,
  type StagedSuggestion,
  type TitleSuggestion,
} from '../../src/services/scriptTools.ts';
import {
  formatQuestionAnswersPrompt,
  formatToolCallTooltip,
  formatToolDisplayName,
  hasAnyQuestionAnswer,
} from '../../src/ui/aiAssistant.ts';
import {SAMPLE_SCRIPT} from './aiTestFixtures.ts';
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

  it('returns compact overview (including sceneTitle) and focused lens slices without mutating rawText', () => {
    const overview = executeScriptToolCall(
      {name: 'get_script_overview', arguments: {}},
      {mode: 'refine', rawText: SAMPLE_SCRIPT, sceneTitle: 'Interrogation Room Coverage'}
    );
    expect(overview.ok).toBe(true);
    expect(overview.result.sceneTitle).toBe('Interrogation Room Coverage');
    expect(typeof overview.result.snapshotHash).toBe('string');
    expect(overview.result.sceneTopology).toBe('multi_camera_coverage');
    expect(Number(overview.result.macroStateCount)).toBeGreaterThan(0);
    expect(Array.isArray(overview.result.macroStates)).toBe(true);
    expect(overview.result).not.toHaveProperty('beatCount');
    expect(overview.result).not.toHaveProperty('beats');

    const sliceResult = executeScriptToolCall(
      {
        name: 'inspect_lens_slice',
        arguments: {
          preset: 'lens1_spatial_optics',
          macroStateIds: ['S2', 'S3'],
          includeStaging: false,
        },
      },
      {mode: 'check', rawText: SAMPLE_SCRIPT}
    );
    expect(sliceResult.ok).toBe(true);
    const slice = sliceResult.result.slice as {
      preset: string;
      stagingMacroBlocks: unknown[];
      macroStates: Array<{id: string}>;
    };
    expect(slice.preset).toBe('lens1_spatial_optics');
    expect(slice.stagingMacroBlocks).toEqual([]);
    expect(slice.macroStates.map((ms) => ms.id)).toEqual(['S2', 'S3']);

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
              subStateId: 'S1.2',
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
              afterSubStateId: 'S1.3',
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
              afterSubStateId: 'S1.3',
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
              subStateId: 'S1.4',
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
                    afterSubStateId: 'S1.2',
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
                    afterSubStateId: 'S1.1',
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

describe('ask_question opt-in clarifying workflow', () => {
  const sampleScript = TEST_CRAFT_EXEMPLARS['interrogation-coverage'].content;

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

describe('get_script_source, propose_text_replace, and propose_script_title tools', () => {
  it('reads full canonical v0.4.0 source or filtered targetIds with optional ID annotations and reports unknown IDs', () => {
    const full = executeScriptToolCall(
      {name: 'get_script_source', arguments: {}},
      {mode: 'refine', rawText: SAMPLE_SCRIPT, sceneTitle: 'Interrogation'}
    );
    expect(full.ok).toBe(true);
    expect(full.result.sceneTitle).toBe('Interrogation');
    expect(String(full.result.sourceText)).toContain('# MB0');
    expect(String(full.result.sourceText)).toContain('S1: [CAM 01]');
    expect(Array.isArray(full.result.annotatedSections)).toBe(true);
    expect(
      (full.result.annotatedSections as Array<{id: string}>).some((s) => s.id === 'MB0')
    ).toBe(true);

    const fullRaw = executeScriptToolCall(
      {name: 'get_script_source', arguments: {annotateIds: false}},
      {mode: 'refine', rawText: SAMPLE_SCRIPT, sceneTitle: 'Interrogation'}
    );
    expect(fullRaw.ok).toBe(true);
    expect(fullRaw.result.sourceText).toBe(SAMPLE_SCRIPT);

    const filtered = executeScriptToolCall(
      {name: 'get_script_source', arguments: {targetIds: ['MB0', 'S2']}},
      {mode: 'refine', rawText: SAMPLE_SCRIPT}
    );
    expect(filtered.ok).toBe(true);
    expect(String(filtered.result.sourceText)).toContain('MB0');
    expect(String(filtered.result.sourceText)).toContain('[INTENT]');
    expect(String(filtered.result.sourceText)).toContain('S2:');
    expect(String(filtered.result.sourceText)).not.toContain('S1:');

    const unannotated = executeScriptToolCall(
      {name: 'get_script_source', arguments: {targetIds: ['MB0', 'S2'], annotateIds: false}},
      {mode: 'refine', rawText: SAMPLE_SCRIPT}
    );
    expect(unannotated.ok).toBe(true);
    expect(String(unannotated.result.sourceText)).not.toContain('# MB0');
    expect(String(unannotated.result.sourceText)).not.toContain('S2:');

    const missingOnly = executeScriptToolCall(
      {name: 'get_script_source', arguments: {targetIds: ['MB99', 'S99']}},
      {mode: 'refine', rawText: SAMPLE_SCRIPT}
    );
    expect(missingOnly.ok).toBe(false);
    expect(missingOnly.result.notFoundIds).toEqual(['MB99', 'S99']);
    expect(typeof missingOnly.result.repairHint).toBe('string');

    const partial = executeScriptToolCall(
      {name: 'get_script_source', arguments: {targetIds: ['MB0', 'S99']}},
      {mode: 'refine', rawText: SAMPLE_SCRIPT}
    );
    expect(partial.ok).toBe(true);
    expect(partial.result.notFoundIds).toEqual(['S99']);
    expect(typeof partial.result.repairHint).toBe('string');
  });

  it('executes propose_text_replace with literal/regex/word-boundary/scoped replacements, header guard, snapshot guard, and lint gate', () => {
    const baseEnvelope = toAuteurEnvelope(SAMPLE_SCRIPT);
    const staged: StagedSuggestion[] = [];

    // 1. Stale snapshotHash rejected
    const stale = executeScriptToolCall(
      {
        name: 'propose_text_replace',
        arguments: {
          expectedSnapshotHash: 'deadbeef',
          summary: 'Rename Miller to Mercer',
          replacements: [{find: 'Miller', replace: 'Mercer'}],
        },
      },
      {mode: 'refine', rawText: SAMPLE_SCRIPT}
    );
    expect(stale.ok).toBe(false);
    expect((stale.result.errors as Array<{code: string}>)[0]?.code).toBe('SNAPSHOT_MISMATCH');
    expect(String(stale.result.repairHint)).toContain(baseEnvelope.snapshotHash);

    // 2. Zero matches rejected cleanly
    const noMatch = executeScriptToolCall(
      {
        name: 'propose_text_replace',
        arguments: {
          expectedSnapshotHash: baseEnvelope.snapshotHash,
          summary: 'Replace missing word',
          replacements: [{find: 'NonExistentCharacter', replace: 'Someone'}],
        },
      },
      {mode: 'refine', rawText: SAMPLE_SCRIPT}
    );
    expect(noMatch.ok).toBe(false);
    expect(typeof noMatch.result.repairHint).toBe('string');

    // 3. Invalid regex rejected cleanly
    const badRegex = executeScriptToolCall(
      {
        name: 'propose_text_replace',
        arguments: {
          expectedSnapshotHash: baseEnvelope.snapshotHash,
          summary: 'Broken regex',
          replacements: [{find: '(unclosed', replace: 'x', isRegex: true}],
        },
      },
      {mode: 'refine', rawText: SAMPLE_SCRIPT}
    );
    expect(badRegex.ok).toBe(false);
    expect(String(badRegex.result.error)).toContain('Invalid regular expression');

    // 4. Header guard: replacing 'INTENT' globally must not corrupt the [INTENT] header bracket
    const headerGuard = executeScriptToolCall(
      {
        name: 'propose_text_replace',
        arguments: {
          expectedSnapshotHash: baseEnvelope.snapshotHash,
          summary: 'Attempt to replace INTENT header',
          replacements: [{find: 'INTENT', replace: 'BROKEN', caseSensitive: true}],
        },
      },
      {mode: 'refine', rawText: SAMPLE_SCRIPT}
    );
    expect(headerGuard.ok).toBe(false);

    // 5. Lint-error rejection when replacement introduces banned viewport syntax
    const lintBroken = executeScriptToolCall(
      {
        name: 'propose_text_replace',
        arguments: {
          expectedSnapshotHash: baseEnvelope.snapshotHash,
          summary: 'Break viewport coordinate rule',
          replacements: [
            {
              find: 'frame-left',
              replace: 'stage-left',
              caseSensitive: false,
            },
          ],
        },
      },
      {mode: 'refine', rawText: SAMPLE_SCRIPT, onStageSuggestion: (s) => staged.push(s)}
    );
    expect(lintBroken.ok).toBe(false);
    expect(staged).toHaveLength(0);
    expect(Array.isArray(lintBroken.result.introducedErrors)).toBe(true);

    // 6. Scoped targetIds replacement only touches requested Macro-State
    const scoped = executeScriptToolCall(
      {
        name: 'propose_text_replace',
        arguments: {
          expectedSnapshotHash: baseEnvelope.snapshotHash,
          summary: 'Rename Miller to Mercer in S1 only',
          replacements: [{find: 'Miller', replace: 'Mercer', targetIds: ['S1']}],
        },
      },
      {
        mode: 'refine',
        rawText: SAMPLE_SCRIPT,
        createSuggestionId: () => 'replace-scoped',
        onStageSuggestion: (s) => staged.push(s),
      }
    );
    expect(scoped.ok).toBe(true);
    const scopedPatch = staged[0] as PatchSuggestion;
    expect(scopedPatch.affectedIds).toEqual(['S1']);
    expect(scopedPatch.candidateRawText).toContain('Mercer');
    // Still contains Miller in other blocks/states
    expect(scopedPatch.candidateRawText).toContain('Miller');

    // 7. Full-script regex + wholeWord rename stages PatchSuggestion compatible with Live Mode margin indicators
    const fullRename = executeScriptToolCall(
      {
        name: 'propose_text_replace',
        arguments: {
          expectedSnapshotHash: baseEnvelope.snapshotHash,
          summary: 'Rename Miller to Mercer everywhere',
          replacements: [
            {
              find: 'Miller',
              replace: 'Mercer',
              wholeWord: true,
              caseSensitive: true,
            },
          ],
        },
      },
      {
        mode: 'refine',
        rawText: SAMPLE_SCRIPT,
        createSuggestionId: () => 'replace-full',
        onStageSuggestion: (s) => staged.push(s),
      }
    );
    expect(fullRename.ok).toBe(true);
    expect(Number(fullRename.result.matchCount)).toBeGreaterThan(2);
    const fullPatch = staged[1] as PatchSuggestion;
    expect(fullPatch.kind).toBe('patch');
    expect(fullPatch.candidateRawText).not.toContain('Miller');
    expect(fullPatch.candidateRawText).toContain('Mercer');
    expect(fullPatch.patch.ops.length).toBeGreaterThan(0);

    // Verify synthesized patch projects cleanly for Live Mode hover-to-diff margin indicators
    const preview = projectAuteurPatchPreview(SAMPLE_SCRIPT, fullPatch.patch);
    expect(preview).not.toBeNull();
    expect(preview!.stagingChanges.length).toBeGreaterThan(0);
    expect(preview!.executionChanges.length).toBeGreaterThan(0);
  });

  it('validates, normalizes, stages, and supersedes TitleSuggestion via propose_script_title', () => {
    const staged: StagedSuggestion[] = [];

    // Empty title rejected
    const emptyRes = executeScriptToolCall(
      {name: 'propose_script_title', arguments: {title: '   '}},
      {mode: 'refine', rawText: SAMPLE_SCRIPT, sceneTitle: 'Interrogation'}
    );
    expect(emptyRes.ok).toBe(false);

    // Duplicate title rejected (case-insensitive)
    const dupRes = executeScriptToolCall(
      {name: 'propose_script_title', arguments: {title: '"interrogation"'}},
      {mode: 'refine', rawText: SAMPLE_SCRIPT, sceneTitle: 'Interrogation'}
    );
    expect(dupRes.ok).toBe(false);

    // Valid title strips wrapping quotes and stages TitleSuggestion
    const validRes = executeScriptToolCall(
      {
        name: 'propose_script_title',
        arguments: {
          title: '"The Manila Folder"',
          rationale: 'Anchors the scene around its central physical prop.',
        },
      },
      {
        mode: 'refine',
        rawText: SAMPLE_SCRIPT,
        sceneTitle: 'Interrogation',
        createSuggestionId: () => 'title-1',
        onStageSuggestion: (s) => staged.push(s),
      }
    );
    expect(validRes.ok).toBe(true);
    expect(staged).toHaveLength(1);
    const titleSuggestion = staged[0] as TitleSuggestion;
    expect(titleSuggestion).toMatchObject({
      id: 'title-1',
      kind: 'title',
      title: 'The Manila Folder',
      previousTitle: 'Interrogation',
      rationale: 'Anchors the scene around its central physical prop.',
    });

    // Newer TitleSuggestion supersedes earlier TitleSuggestion in the same turn
    const replacement: TitleSuggestion = {
      id: 'title-2',
      kind: 'title',
      title: 'Cold Fluorescent Truth',
      previousTitle: 'Interrogation',
      baseSnapshotHash: titleSuggestion.baseSnapshotHash,
    };
    const merged = upsertStagedSuggestion(staged, replacement);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('title-2');
  });

  it('exposes sanitized JSON Schema parameters for all 10 tools and honors enforceToolLinterGate=false', () => {
    for (const def of BUILTIN_SCRIPT_TOOLS) {
      const schema = getToolParametersSchema(def.name);
      expect(schema).toBeTruthy();
      expect(schema.type).toBe('object');
      const serialized = JSON.stringify(schema);
      expect(serialized).not.toContain('"$schema":');
      expect(serialized).not.toContain('"const":');
    }

    const baseHash = toAuteurEnvelope(SAMPLE_SCRIPT).snapshotHash;

    // 1. Patch introducing a deterministic lint error ("stage-left") is rejected by default
    const gatedPatch = executeScriptToolCall(
      {
        name: 'propose_script_patch',
        arguments: {
          expectedSnapshotHash: baseHash,
          summary: 'Introduce stage-left wording',
          ops: [
            {
              op: 'replace_sub_state',
              subStateId: 'S1.2',
              subState: {
                dimension: 'action',
                subStateTag: 'ACT',
                content: 'Detective Vance leans stage-left over the table',
              },
            },
          ],
        },
      },
      {mode: 'refine', rawText: SAMPLE_SCRIPT}
    );
    expect(gatedPatch.ok).toBe(false);

    // 2. With enforceToolLinterGate=false, the same valid AST patch stages while still tracking lintDelta
    const bypassedPatch = executeScriptToolCall(
      {
        name: 'propose_script_patch',
        arguments: {
          expectedSnapshotHash: baseHash,
          summary: 'Introduce stage-left wording (gate bypassed)',
          ops: [
            {
              op: 'replace_sub_state',
              subStateId: 'S1.2',
              subState: {
                dimension: 'action',
                subStateTag: 'ACT',
                content: 'Detective Vance leans stage-left over the table',
              },
            },
          ],
        },
      },
      {mode: 'refine', rawText: SAMPLE_SCRIPT, enforceToolLinterGate: false}
    );
    expect(bypassedPatch.ok).toBe(true);
    expect((bypassedPatch.stagedSuggestion as PatchSuggestion).lintDelta.introducedErrors.length).toBeGreaterThan(0);

    // 3. Even with enforceToolLinterGate=false, SNAPSHOT_MISMATCH is still strictly rejected
    const stalePatch = executeScriptToolCall(
      {
        name: 'propose_script_patch',
        arguments: {
          expectedSnapshotHash: 'wrong-hash-9999',
          summary: 'Stale patch',
          ops: [
            {
              op: 'replace_sub_state',
              subStateId: 'S1.2',
              subState: {
                dimension: 'action',
                subStateTag: 'ACT',
                content: 'Detective Vance leans stage-left over the table',
              },
            },
          ],
        },
      },
      {mode: 'refine', rawText: SAMPLE_SCRIPT, enforceToolLinterGate: false}
    );
    expect(stalePatch.ok).toBe(false);

    // 4. Draft with lint error stages when enforceToolLinterGate=false
    const bypassedDraft = executeScriptToolCall(
      {
        name: 'propose_script_draft',
        arguments: {
          title: 'Unchecked Draft',
          draft: {
            stagingMacroBlocks: [
              {header: 'OPENING', format: 'prose', body: 'Mara stands stage-left.'},
            ],
            executionMacroBlock: {
              header: 'EXECUTION',
              macroStates: [
                {
                  subStates: [
                    {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: 'MS'},
                    {dimension: 'action', subStateTag: 'ACT', content: 'Mara crosses stage-left'},
                  ],
                },
              ],
            },
          },
        },
      },
      {mode: 'draft', rawText: '', enforceToolLinterGate: false}
    );
    expect(bypassedDraft.ok).toBe(true);
    expect((bypassedDraft.stagedSuggestion as DraftSuggestion).errorCount).toBeGreaterThan(0);
  });
});
