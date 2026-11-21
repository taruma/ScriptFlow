import {describe, expect, it} from 'vitest';
import {toAuteurEnvelope} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';
import {composeAgentContext} from '../../src/services/auteurKnowledge.ts';
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
