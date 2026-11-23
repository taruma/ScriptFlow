import {describe, expect, it} from 'vitest';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';
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
  const MONTAGE_SCRIPT = SCRIPT_PRESETS.find((p) => p.id === 'heist-montage')!.content;
  const INTERROGATION_SCRIPT = SCRIPT_PRESETS.find((p) => p.id === 'interrogation-coverage')!.content;

  it('prunes allowed tools by focus and editor emptiness without triple write-schema bloat', () => {
    expect(assistantModeToFocus('check')).toBe('audit');
    expect(assistantModeToFocus('refine')).toBe('refine');
    expect(assistantModeToFocus('draft')).toBe('draft');

    // auto + empty script -> propose_script_draft, propose_script_title (+ load_auteur_skill), no get_script_overview
    const autoEmpty = composeAgentContext({focus: 'auto', rawText: '   '});
    expect(autoEmpty.editorState.isEmpty).toBe(true);
    expect(autoEmpty.allowedToolNames).toEqual([
      'propose_script_draft',
      'propose_script_title',
      'load_auteur_skill',
    ]);
    expect(autoEmpty.allowedToolNames).not.toContain('ask_question');

    // auto + existing script -> overview, source, slice, patch, text replace, title, audit (+ load_auteur_skill), NO propose_script_draft
    const autoExisting = composeAgentContext({focus: 'auto', rawText: INTERROGATION_SCRIPT});
    expect(autoExisting.editorState.isEmpty).toBe(false);
    expect(autoExisting.allowedToolNames).toEqual([
      'get_script_overview',
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_patch',
      'propose_text_replace',
      'propose_script_title',
      'report_audit_review',
      'load_auteur_skill',
    ]);
    expect(autoExisting.allowedToolNames).not.toContain('propose_script_draft');
    expect(autoExisting.allowedToolNames).not.toContain('ask_question');

    // draft + empty vs non-empty (non-empty Draft gains get_script_source & inspect_lens_slice)
    const draftEmpty = composeAgentContext({focus: 'draft', rawText: ''});
    expect(draftEmpty.allowedToolNames).toEqual([
      'propose_script_draft',
      'propose_script_title',
      'load_auteur_skill',
    ]);
    const draftExisting = composeAgentContext({focus: 'draft', rawText: INTERROGATION_SCRIPT});
    expect(draftExisting.allowedToolNames).toEqual([
      'get_script_overview',
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_draft',
      'propose_script_title',
      'load_auteur_skill',
    ]);

    // refine & audit focus
    const refineCtx = composeAgentContext({focus: 'refine', rawText: INTERROGATION_SCRIPT});
    expect(refineCtx.allowedToolNames).toEqual([
      'get_script_overview',
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_patch',
      'propose_text_replace',
      'propose_script_title',
      'load_auteur_skill',
    ]);
    const auditCtx = composeAgentContext({focus: 'audit', rawText: INTERROGATION_SCRIPT});
    expect(auditCtx.allowedToolNames).toEqual([
      'get_script_overview',
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
      'get_script_overview',
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_patch',
      'propose_text_replace',
      'propose_script_title',
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
    expect(ctx.sections.toolProtocol.editable).toBe(true);
    expect(ctx.sections.toolProtocol.isOverridden).toBe(false);
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
      previousRawText: scriptWithLint,
      sceneTitle: 'Corridor Standoff',
    });
    expect(sameHashCtx.editorState.changedSinceLastTurn).toBe(false);
    expect(sameHashCtx.editorState.sceneTitle).toBe('Corridor Standoff');
    expect(sameHashCtx.editorState.recentEditSummary).toBeUndefined();
    expect(sameHashCtx.sections.liveEditorState.text).toContain('Scene title: "Corridor Standoff"');
    expect(sameHashCtx.sections.liveEditorState.text).not.toContain('Recent user edits');

    // Manual edit between turns injects automatic recent-edit diff summary into Live Editor State
    const editedScript = scriptWithLint.replace('Elena steps stage-left', 'Elena pauses');
    const editedCtx = composeAgentContext({
      focus: 'refine',
      rawText: editedScript,
      sceneTitle: 'Corridor Standoff',
      previousSnapshotHash: ctx.editorState.snapshotHash,
      previousRawText: scriptWithLint,
    });
    expect(editedCtx.editorState.changedSinceLastTurn).toBe(true);
    expect(editedCtx.editorState.recentEditSummary).toContain('Modified: S1');
    expect(editedCtx.editorState.recentEditSummary).toContain('- [CAM 01]');
    expect(editedCtx.editorState.recentEditSummary).toContain('+ [CAM 01]');
    expect(editedCtx.sections.liveEditorState.text).toContain('Recent user edits since last turn:');
    expect(editedCtx.sections.liveEditorState.text).toContain('Modified: S1');

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

    // Verify auto mode on existing script sent 8 tools (excluding propose_script_draft & ask_question)
    expect(result.trace.rounds[0].request.toolNames).toEqual([
      'get_script_overview',
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_patch',
      'propose_text_replace',
      'propose_script_title',
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

  it('supports 3-state function tool activation (auto/enabled/disabled), editable protocol, and pure conversation mode', () => {
    // 1. Force Always On (ask_question & propose_script_draft) + Disable (propose_text_replace)
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
        propose_text_replace: {activationMode: 'disabled'},
      },
    });

    expect(customCtx.enforceToolLinterGate).toBe(false);
    expect(customCtx.allowedToolNames).toContain('ask_question');
    expect(customCtx.allowedToolNames).toContain('propose_script_draft');
    expect(customCtx.allowedToolNames).not.toContain('propose_text_replace');
    expect(customCtx.sections.toolProtocol.isOverridden).toBe(true);
    expect(customCtx.sections.toolProtocol.text).toContain('- Custom core staging safety rule.');
    expect(customCtx.sections.toolProtocol.text).toContain(
      '- Custom draft bullet for forced draft tool.'
    );
    expect(customCtx.sections.toolProtocol.text).toContain('Linter gate override:');
    expect(customCtx.sections.toolProtocol.text).not.toContain('- `propose_text_replace`:');

    // ask_question forced Always On without Ask First uses on-demand ambiguity guidance
    expect(customCtx.sections.toolProtocol.text).toContain('genuine directorial ambiguity');
    expect(customCtx.sections.toolProtocol.text).not.toContain('Clarifying interview requested (Ask First)');

    // When Ask First IS toggled while ask_question is Always On, Ask First interview mode takes precedence
    const forcedWithAskFirst = composeAgentContext({
      focus: 'auto',
      rawText: INTERROGATION_SCRIPT,
      askQuestionMode: 'ask_first',
      toolOverrides: {ask_question: {activationMode: 'enabled'}},
    });
    expect(forcedWithAskFirst.sections.toolProtocol.text).toContain(
      'Clarifying interview requested (Ask First)'
    );

    // Custom API description flows into Gemini function declarations
    const decls = buildToolDeclarationsForContext(customCtx);
    const draftDecl = decls.find((d) => d.name === 'propose_script_draft');
    expect(draftDecl?.description).toBe('Custom API description for draft tool.');
    expect(decls.find((d) => d.name === 'propose_text_replace')).toBeUndefined();

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
  });
});
