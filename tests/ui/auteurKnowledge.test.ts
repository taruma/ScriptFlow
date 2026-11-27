import {describe, expect, it} from 'vitest';
import {toAuteurEnvelope} from '../../src/core/index.ts';
import {TEST_CRAFT_EXEMPLARS} from '../fixtures/craftExemplars.ts';
import {
  AUTEUR_KNOWLEDGE_VERSION,
  BUILTIN_AUTEUR_SKILLS,
  DEFAULT_FOUNDATIONAL_CRAFT,
  assistantModeToFocus,
  buildRecentEditSummary,
  composeAgentContext,
  computeAllowedToolNames,
  getLensAuditChecklist,
  type LensAuditChecklist,
} from '../../src/services/auteurKnowledge.ts';
import {
  runGeminiAgentTurn,
  type InteractionStreamEventLike,
  type InteractionsClientLike,
} from '../../src/services/geminiInteractions.ts';
import {
  buildLineDiff,
  buildToolDeclarationsForContext,
  executeScriptToolCall,
  upsertStagedSuggestion,
  type AuditReviewSuggestion,
  type DraftSuggestion,
  type PatchSuggestion,
  type StagedSuggestion,
} from '../../src/services/scriptTools.ts';
import {asAsyncStream} from './aiTestFixtures.ts';
describe('Phase 1 Unified Auteur Agent: Knowledge Registry, Context Composer & Dynamic Skills', () => {
  const MONTAGE_SCRIPT = TEST_CRAFT_EXEMPLARS['heist-montage'].content;
  const INTERROGATION_SCRIPT = TEST_CRAFT_EXEMPLARS['interrogation-coverage'].content;

  it('exposes all 7 tools consistently in Auto regardless of emptiness, while scoping Draft/Refine/Audit cleanly', () => {
    expect(assistantModeToFocus('check')).toBe('audit');
    expect(assistantModeToFocus('refine')).toBe('refine');
    expect(assistantModeToFocus('draft')).toBe('draft');

    const expectedAutoTools = [
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_patch',
      'propose_script_draft',
      'report_audit_review',
      'ask_question',
      'load_auteur_skill',
    ];

    // auto + empty script -> exposes all 7 tools consistently for frozen [tools] prefix caching
    const autoEmpty = composeAgentContext({focus: 'auto', rawText: '   '});
    expect(autoEmpty.editorState.isEmpty).toBe(true);
    expect(autoEmpty.allowedToolNames).toEqual(expectedAutoTools);

    // auto + existing script -> identical 7 tools
    const autoExisting = composeAgentContext({focus: 'auto', rawText: INTERROGATION_SCRIPT});
    expect(autoExisting.editorState.isEmpty).toBe(false);
    expect(autoExisting.allowedToolNames).toEqual(expectedAutoTools);

    // draft + empty vs non-empty (non-empty Draft gains inspect tools)
    const draftEmpty = composeAgentContext({focus: 'draft', rawText: ''});
    expect(draftEmpty.allowedToolNames).toEqual([
      'propose_script_draft',
      'ask_question',
      'load_auteur_skill',
    ]);
    const draftExisting = composeAgentContext({focus: 'draft', rawText: INTERROGATION_SCRIPT});
    expect(draftExisting.allowedToolNames).toEqual([
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_draft',
      'ask_question',
      'load_auteur_skill',
    ]);

    // refine & audit focus
    const refineCtx = composeAgentContext({focus: 'refine', rawText: INTERROGATION_SCRIPT});
    expect(refineCtx.allowedToolNames).toEqual([
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_patch',
      'ask_question',
      'load_auteur_skill',
    ]);
    const auditCtx = composeAgentContext({focus: 'audit', rawText: INTERROGATION_SCRIPT});
    expect(auditCtx.allowedToolNames).toEqual([
      'get_script_source',
      'inspect_lens_slice',
      'report_audit_review',
      'load_auteur_skill',
    ]);
    // Audit never exposes ask_question even if explicitly requested
    expect(computeAllowedToolNames('audit', false, true, 'ask_first')).not.toContain(
      'ask_question'
    );

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
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_patch',
      'ask_question',
    ]);
  });

  it('enforces single-state skill machine (pinned | on-demand | muted) with zero passive auto-injection and zero duplication', () => {
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

    const defaultCtx = composeAgentContext({
      focus: 'auto',
      rawText: richScript,
      referenceHandles: ['@video1', '@image1'],
    });
    // Zero default pinned skills & zero passive auto-injection
    expect(defaultCtx.activeSkills).toEqual([]);
    expect(defaultCtx.availableSkills.map((s) => s.id)).toEqual(
      BUILTIN_AUTEUR_SKILLS.map((s) => s.id)
    );

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

    // Strictly pinned skills are active; all other non-muted skills stay on-demand in directory
    const activeIds = ctx.activeSkills.map((s) => s.id);
    const availableIds = ctx.availableSkills.map((s) => s.id);
    const mutedIds = ctx.mutedSkills.map((s) => s.id);

    expect(activeIds).toEqual(['temporal_calibration']);
    expect(mutedIds).toEqual(['spatial_fences']);
    expect(availableIds).toEqual(
      expect.arrayContaining([
        'draft_craft',
        'video_continuation',
        'token_mapping',
        'character_reference',
        'house_noir_voice',
      ])
    );

    // Mutual exclusivity across all three buckets
    const allIds = [...activeIds, ...availableIds, ...mutedIds];
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.length).toBe(ctx.resolvedSkills.length);

    // Pinned skills appear in sections.activeSkills, NEVER in skillDirectory or load_auteur_skill enum
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

    // Dynamic enum reflects user custom skill configuration
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

    // Pinning draft_craft stays static across topologies (no systemInstruction mutation on montage)
    const pinnedEmpty = composeAgentContext({
      focus: 'auto',
      rawText: '',
      skillOverrides: {draft_craft: {pinMode: 'pinned'}},
    });
    const pinnedMontage = composeAgentContext({
      focus: 'auto',
      rawText: MONTAGE_SCRIPT,
      skillOverrides: {draft_craft: {pinMode: 'pinned'}},
    });
    expect(pinnedEmpty.systemInstruction).toBe(pinnedMontage.systemInstruction);
  });

  it('keeps Zone 1 systemInstruction & tools byte-for-byte cache-stable across script edits, Brief updates, and Ask First toggles', () => {
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

    const turn1Ctx = composeAgentContext({
      focus: 'auto',
      rawText: '',
      briefContext: '### Format & Specs\nSingle take.',
      askQuestionMode: 'ask_first',
      foundationalCraftOverride: 'Custom director voice override.',
    });

    expect(turn1Ctx.knowledgeVersion).toBe(AUTEUR_KNOWLEDGE_VERSION);
    expect(turn1Ctx.sections.foundationalCraft.isOverridden).toBe(true);
    expect(turn1Ctx.sections.foundationalCraft.text).toBe('Custom director voice override.');
    expect(turn1Ctx.sections.toolProtocol.editable).toBe(true);
    expect(turn1Ctx.sections.toolProtocol.isOverridden).toBe(false);
    expect(turn1Ctx.sections.toolProtocol.text).toContain('expectedSnapshotHash');
    expect(turn1Ctx.sections.toolProtocol.text).not.toContain(turn1Ctx.editorState.snapshotHash);
    expect(turn1Ctx.systemInstruction).not.toContain('## Live Editor State');
    expect(turn1Ctx.systemInstruction).not.toContain('## Scene Brief & References');
    expect(turn1Ctx.systemInstruction).not.toContain('<turn_directive>');
    expect(turn1Ctx.turnContext.liveEditorStateMode).toBe('full');
    expect(turn1Ctx.turnContext.briefDelivery).toBe('full');
    expect(turn1Ctx.turnContext.askDirectiveText).toContain('[Ask First: ON]');

    // Turn 2: script drafted + lint errors + Brief edited + Ask First turned OFF -> Zone 1 & tools stay identical!
    const turn2Ctx = composeAgentContext({
      focus: 'auto',
      rawText: scriptWithLint,
      sceneTitle: 'Corridor Standoff',
      hasPreviousInteraction: true,
      previousSnapshotHash: turn1Ctx.editorState.snapshotHash,
      previousRawText: '',
      previousBriefContext: '### Format & Specs\nSingle take.',
      briefContext: '### Format & Specs\nHandheld 35mm take.',
      askQuestionMode: 'off',
      foundationalCraftOverride: 'Custom director voice override.',
    });

    expect(turn2Ctx.systemInstruction).toBe(turn1Ctx.systemInstruction);
    expect(JSON.stringify(buildToolDeclarationsForContext(turn2Ctx))).toBe(
      JSON.stringify(buildToolDeclarationsForContext(turn1Ctx))
    );

    expect(turn2Ctx.editorState.changedSinceLastTurn).toBe(true);
    expect(turn2Ctx.editorState.diagnosticsSummary.errors).toBe(1);
    expect(turn2Ctx.editorState.diagnosticsSummary.warnings).toBe(1);
    expect(turn2Ctx.turnContext.liveEditorStateMode).toBe('full');
    expect(turn2Ctx.turnContext.liveEditorStateText).toContain(turn2Ctx.editorState.snapshotHash);
    expect(turn2Ctx.turnContext.liveEditorStateText).toContain('CHANGED since last turn');
    expect(turn2Ctx.turnContext.liveEditorStateText).toContain('Execution Macro-State(s)');
    expect(turn2Ctx.turnContext.liveEditorStateText).not.toContain('Execution Beat(s)');
    expect(turn2Ctx.turnContext.liveEditorStateText).toContain('viewport-coordinate-purity');
    expect(turn2Ctx.turnContext.liveEditorStateText).toContain('macro-state-resolution');
    expect(turn2Ctx.turnContext.briefDelivery).toBe('updated');
    expect(turn2Ctx.turnContext.sceneBriefText).toContain('UPDATED');
    expect(turn2Ctx.turnContext.askDirectiveText).toBe('');

    const defaultCraftCtx = composeAgentContext({
      focus: 'refine',
      rawText: scriptWithLint,
    });
    expect(defaultCraftCtx.sections.foundationalCraft.text).toContain('Macro-State');
    expect(defaultCraftCtx.sections.foundationalCraft.text).not.toContain('Execution Beat');
    expect(defaultCraftCtx.sections.foundationalCraft.text).not.toContain('Macro-State beat');

    // Turn 3: script, title, diagnostics, and Brief unchanged -> compact 1-line Live Editor State + omitted Brief
    const turn3Ctx = composeAgentContext({
      focus: 'auto',
      rawText: scriptWithLint,
      sceneTitle: 'Corridor Standoff',
      hasPreviousInteraction: true,
      previousSnapshotHash: turn2Ctx.editorState.snapshotHash,
      previousRawText: scriptWithLint,
      previousSceneTitle: 'Corridor Standoff',
      previousDiagnosticsFingerprint: turn2Ctx.editorState.diagnosticsFingerprint,
      previousBriefContext: '### Format & Specs\nHandheld 35mm take.',
      briefContext: '### Format & Specs\nHandheld 35mm take.',
    });
    expect(turn3Ctx.editorState.changedSinceLastTurn).toBe(false);
    expect(turn3Ctx.editorState.recentEditSummary).toBeUndefined();
    expect(turn3Ctx.turnContext.liveEditorStateMode).toBe('unchanged');
    expect(turn3Ctx.turnContext.liveEditorStateText).toContain('Unchanged since last turn.');
    expect(turn3Ctx.turnContext.liveEditorStateText).toContain(turn3Ctx.editorState.snapshotHash);
    expect(turn3Ctx.turnContext.briefDelivery).toBe('unchanged');
    expect(turn3Ctx.turnContext.sceneBriefText).toBe('');

    // Turn 4: Brief paused/cleared emits explicit 1-line cleared notice; manual script edit emits diff
    const editedScript = scriptWithLint.replace('Elena steps stage-left', 'Elena pauses');
    const turn4Ctx = composeAgentContext({
      focus: 'auto',
      rawText: editedScript,
      sceneTitle: 'Corridor Standoff',
      hasPreviousInteraction: true,
      previousSnapshotHash: turn3Ctx.editorState.snapshotHash,
      previousRawText: scriptWithLint,
      previousSceneTitle: 'Corridor Standoff',
      previousDiagnosticsFingerprint: turn3Ctx.editorState.diagnosticsFingerprint,
      previousBriefContext: '### Format & Specs\nHandheld 35mm take.',
      briefContext: undefined,
    });
    expect(turn4Ctx.editorState.changedSinceLastTurn).toBe(true);
    expect(turn4Ctx.editorState.recentEditSummary).toContain('Modified: S1');
    expect(turn4Ctx.editorState.recentEditSummary).toContain('- [CAM 01]');
    expect(turn4Ctx.editorState.recentEditSummary).toContain('+ [CAM 01]');
    expect(turn4Ctx.turnContext.liveEditorStateMode).toBe('full');
    expect(turn4Ctx.turnContext.liveEditorStateText).toContain('Recent user edits since last turn:');
    expect(turn4Ctx.turnContext.liveEditorStateText).toContain('Modified: S1');
    expect(turn4Ctx.turnContext.briefDelivery).toBe('cleared');
    expect(turn4Ctx.turnContext.sceneBriefText).toContain('status="cleared"');

    // Direct buildRecentEditSummary test for unchanged input
    expect(buildRecentEditSummary(scriptWithLint, scriptWithLint)).toBeUndefined();
    // Beginner & Power-User adaptation guidance is present in default foundational craft
    expect(DEFAULT_FOUNDATIONAL_CRAFT).toContain('Beginner & Power-User Adaptation');
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

    // Verify auto mode sent all 7 tools consistently and moved volatile turn context into Round 1 input
    expect(result.trace.rounds[0].request.toolNames).toEqual([
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_patch',
      'propose_script_draft',
      'report_audit_review',
      'ask_question',
      'load_auteur_skill',
    ]);
    expect(String(capturedRequests[0].system_instruction)).not.toContain('CHANGED since last turn');
    expect(String(capturedRequests[0].system_instruction)).not.toContain('Scene Brief & References');
    expect(String(capturedRequests[0].input)).toContain('<live_editor_state>');
    expect(String(capturedRequests[0].input)).toContain('CHANGED since last turn');
    expect(String(capturedRequests[0].input)).toContain('Scene Brief & References');
    expect(String(capturedRequests[0].input)).toContain('Single continuous handheld take.');
    expect(String(capturedRequests[0].input)).toContain('Check blocking with our studio rule.');

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

  it('supports 3-state function tool activation (auto/enabled/disabled), editable protocol, and pure conversation mode', () => {
    // 1. Force Always On (ask_question & propose_script_draft) + Disable (report_audit_review)
    const customCtx = composeAgentContext({
      focus: 'auto',
      rawText: INTERROGATION_SCRIPT,
      toolProtocolOverride: '- Custom core staging safety rule.',
      enforceToolLinterGate: false,
      toolOverrides: {
        ask_question: {activationMode: 'enabled'},
        propose_script_draft: {
          activationMode: 'enabled',
          protocolGuidanceOverride: '- Custom draft bullet for forced draft tool.',
          descriptionOverride: 'Custom API description for draft tool.',
        },
        report_audit_review: {activationMode: 'disabled'},
      },
    });

    expect(customCtx.enforceToolLinterGate).toBe(false);
    expect(customCtx.allowedToolNames).toContain('ask_question');
    expect(customCtx.allowedToolNames).toContain('propose_script_draft');
    expect(customCtx.allowedToolNames).not.toContain('report_audit_review');
    expect(customCtx.sections.toolProtocol.isOverridden).toBe(true);
    expect(customCtx.sections.toolProtocol.text).toContain('- Custom core staging safety rule.');
    expect(customCtx.sections.toolProtocol.text).toContain(
      '- Custom draft bullet for forced draft tool.'
    );
    expect(customCtx.sections.toolProtocol.text).toContain('Linter gate override:');
    expect(customCtx.sections.toolProtocol.text).not.toContain('- `report_audit_review`:');

    // Static ask_question protocol rule lives in toolProtocol; Ask First toggles live in turnContext
    expect(customCtx.sections.toolProtocol.text).toContain('[Ask First: ON]');
    expect(customCtx.turnContext.askDirectiveText).toBe('');

    // When Ask First IS toggled, turnContext carries the Ask First directive while systemInstruction stays identical
    const forcedWithAskFirst = composeAgentContext({
      focus: 'auto',
      rawText: INTERROGATION_SCRIPT,
      askQuestionMode: 'ask_first',
      toolOverrides: {ask_question: {activationMode: 'enabled'}},
    });
    expect(forcedWithAskFirst.turnContext.askDirectiveText).toContain('[Ask First: ON]');
    expect(forcedWithAskFirst.systemInstruction).toBe(
      composeAgentContext({
        focus: 'auto',
        rawText: INTERROGATION_SCRIPT,
        askQuestionMode: 'off',
        toolOverrides: {ask_question: {activationMode: 'enabled'}},
      }).systemInstruction
    );

    // Custom API description flows into Gemini function declarations
    const decls = buildToolDeclarationsForContext(customCtx);
    const draftDecl = decls.find((d) => d.name === 'propose_script_draft');
    expect(draftDecl?.description).toBe('Custom API description for draft tool.');
    expect(decls.find((d) => d.name === 'report_audit_review')).toBeUndefined();

    // 2. Schema safety guard: load_auteur_skill forced Always On stays inactive when 0 available skills
    const allMutedSkills = Object.fromEntries(
      BUILTIN_AUTEUR_SKILLS.map((s) => [s.id, {pinMode: 'muted' as const}])
    );
    const guardedLoadCtx = composeAgentContext({
      focus: 'refine',
      rawText: INTERROGATION_SCRIPT,
      skillOverrides: allMutedSkills,
      toolOverrides: {load_auteur_skill: {activationMode: 'enabled'}},
    });
    expect(guardedLoadCtx.allowedToolNames).not.toContain('load_auteur_skill');
    const resolvedLoadTool = guardedLoadCtx.resolvedTools.find((t) => t.name === 'load_auteur_skill');
    expect(resolvedLoadTool?.status).toBe('inactive');
    expect(resolvedLoadTool?.reason).toBe('inactive_no_available_skills');

    // 3. Disabling all tools enters Pure Conversation Mode (0 tool schemas)
    const allDisabledTools = Object.fromEntries(
      customCtx.resolvedTools.map((t) => [t.name, {activationMode: 'disabled' as const}])
    );
    const pureChatCtx = composeAgentContext({
      focus: 'auto',
      rawText: INTERROGATION_SCRIPT,
      toolOverrides: allDisabledTools,
    });
    expect(pureChatCtx.allowedToolNames).toEqual([]);
    expect(buildToolDeclarationsForContext(pureChatCtx)).toEqual([]);
    expect(pureChatCtx.sections.toolProtocol.text).toContain('pure conversation mode');
    expect(BUILTIN_AUTEUR_SKILLS.some((skill) => skill.id === 'draft_interview')).toBe(true);
    expect(AUTEUR_KNOWLEDGE_VERSION).toBe('0.4.0-k6');
    expect(customCtx.systemInstruction).not.toContain('get_script_overview');
    expect(customCtx.systemInstruction).not.toContain('propose_text_replace');
    expect(customCtx.systemInstruction).not.toContain('propose_script_title');
  });

  it('tracks changedTargetIds on manual edits, includes MB#/cameraSlots in liveEditorState, and honors appliedAssistantHash', () => {
    const baseScript = [
      '[INTENT]',
      'Create a corridor beat with @image1 as Elena.',
      '',
      '[OPENING]',
      'MS eye level. Frame-left, Elena stands facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> [ACT] Elena pauses -> <door hum>',
      '[CAM 01] MS eye level -> [ACT] Elena turns -> <footstep>',
    ].join('\n');

    const unchangedCtx = composeAgentContext({
      focus: 'auto',
      rawText: baseScript,
      hasPreviousInteraction: true,
      previousSnapshotHash: toAuteurEnvelope(baseScript).snapshotHash,
      previousRawText: baseScript,
    });
    expect(unchangedCtx.editorState.changedSinceLastTurn).toBe(false);
    expect(unchangedCtx.editorState.changedTargetIds).toBeUndefined();

    const manuallyEditedScript = [
      '[INTENT]',
      'Create a tense corridor beat with @image1 as Elena.',
      '',
      '[OPENING]',
      'MS eye level. Frame-left, Elena stands facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> [ACT] Elena pauses -> <door hum>',
      '[CAM 01] MS eye level -> [ACT] Elena whispers and checks the lock -> <latch click>',
      '[CAM 01] MS eye level -> [ACT] Elena steps backward -> <boot scrape>',
    ].join('\n');

    const changedCtx = composeAgentContext({
      focus: 'auto',
      rawText: manuallyEditedScript,
      hasPreviousInteraction: true,
      previousSnapshotHash: toAuteurEnvelope(baseScript).snapshotHash,
      previousRawText: baseScript,
    });

    expect(changedCtx.editorState.changedSinceLastTurn).toBe(true);
    expect(changedCtx.editorState.changedTargetIds).toEqual(['MB0', 'S2', 'S3']);
    expect(changedCtx.turnContext.liveEditorStateText).toContain('call get_script_source before editing');
    expect(changedCtx.turnContext.liveEditorStateText).toContain('Staging blocks: MB0 [INTENT], MB1 [OPENING]');
    expect(changedCtx.turnContext.liveEditorStateText).toContain('Camera slots: CAM 01 (S1)');
    expect(changedCtx.sections.toolProtocol.text).toContain('Read & round efficiency');
    expect(changedCtx.sections.toolProtocol.text).toContain('fresh-read rule');
    expect(changedCtx.systemInstruction).toBe(unchangedCtx.systemInstruction);
    expect(JSON.stringify(buildToolDeclarationsForContext(changedCtx))).toBe(
      JSON.stringify(buildToolDeclarationsForContext(unchangedCtx))
    );

    // When appliedAssistantHash matches the live script, changedSinceLastTurn stays false even if previousSnapshotHash differs
    const appliedHash = toAuteurEnvelope(manuallyEditedScript).snapshotHash;
    const selfAppliedCtx = composeAgentContext({
      focus: 'auto',
      rawText: manuallyEditedScript,
      hasPreviousInteraction: true,
      previousSnapshotHash: toAuteurEnvelope(baseScript).snapshotHash,
      previousRawText: baseScript,
      appliedAssistantHash: appliedHash,
    });
    expect(selfAppliedCtx.editorState.changedSinceLastTurn).toBe(false);
    expect(selfAppliedCtx.editorState.appliedAssistantSuggestion).toBe(true);
    expect(selfAppliedCtx.turnContext.liveEditorStateMode).toBe('full');
    expect(selfAppliedCtx.turnContext.liveEditorStateText).toContain(
      'applied from your previous staged suggestion'
    );
  });
});
