import {describe, expect, it} from 'vitest';
import {computeSnapshotHash} from '../../src/core/index.ts';
import {BUNDLED_QUICK_SCAN_RULES} from '../../src/data/knowledge/index.ts';
import {BUILTIN_AUTEUR_SKILLS} from '../../src/services/auteurKnowledge.ts';
import {
  AUTEUR_AGENT_CONTEXT_PACK_FORMAT,
  AUTEUR_AGENT_CONTEXT_PACK_VERSION,
  analyzeAgentContextImport,
  applyAgentContextImport,
  buildAgentContextPackExport,
  createDefaultImportSelection,
  parseAgentContextPack,
  summarizeAgentContextImportImpact,
} from '../../src/ui/agentContextCodec.ts';
import {
  DEFAULT_AI_SKILLS_STATE,
  type AiSkillsState,
} from '../../src/ui/aiSkillsStore.ts';
import {
  DEFAULT_QUICK_SCAN_RULES_STATE,
  type QuickScanRulesState,
} from '../../src/ui/quickScanRulesStore.ts';

const FIRST_BUILTIN_SKILL_ID = BUILTIN_AUTEUR_SKILLS[0].id;
const SECOND_BUILTIN_SKILL_ID = BUILTIN_AUTEUR_SKILLS[1].id;
const FIRST_BUILTIN_RULE_ID = BUNDLED_QUICK_SCAN_RULES[0].id;
const SECOND_BUILTIN_RULE_ID = BUNDLED_QUICK_SCAN_RULES[1].id;

function makeSampleSkillsState(): AiSkillsState {
  return {
    ...DEFAULT_AI_SKILLS_STATE,
    foundationalCraftOverride: 'Custom director craft discipline for stylized noir pacing.',
    skillOverrides: {
      [FIRST_BUILTIN_SKILL_ID]: {
        pinMode: 'pinned',
        bodyOverride: 'Custom override instructions for first built-in skill.',
      },
      [SECOND_BUILTIN_SKILL_ID]: {
        pinMode: 'muted',
      },
      noir_lighting_pass: {
        pinMode: 'pinned',
      },
    },
    customSkills: [
      {
        id: 'noir_lighting_pass',
        name: 'Noir Lighting Pass',
        triggerHint: 'When refining high-contrast shadow choreography.',
        body: 'Enforce motivated practical key lights and Venetian shadow splits.',
      },
      {
        id: 'kinetic_fight_rhythm',
        name: 'Kinetic Fight Rhythm',
        triggerHint: 'When staging close-quarters action Sub-States.',
        body: 'Alternate crisp impact beats with tactile foley anchors.',
      },
    ],
  };
}

function makeSampleQuickScanState(): QuickScanRulesState {
  return {
    ...DEFAULT_QUICK_SCAN_RULES_STATE,
    ruleOverrides: {
      [FIRST_BUILTIN_RULE_ID]: {
        enabled: false,
        instructionsOverride: 'Custom binary check question for first built-in rule?',
      },
      avoid_dutch_drift: {
        enabled: false,
      },
    },
    customRules: [
      {
        id: 'avoid_dutch_drift',
        lens: 'lens1_spatial_optics',
        scope: 'sub_state',
        label: 'Avoid Unmotivated Dutch Angles',
        when: ['sub_is_camera'],
        instructions: 'Does {{SUB_STATE_ID}} use an unmotivated Dutch tilt?',
        trueDescription: 'Dutch angle is used without narrative disorientation.',
        falseDescription: 'Camera angle is level or clearly motivated.',
      },
      {
        id: 'check_foley_specificity',
        lens: 'lens4_acoustics_voice',
        scope: 'sub_state',
        label: 'Specific Foley Texture',
        when: ['sub_is_foley'],
        instructions: 'Is {{SUB_STATE_ID}} a generic sound label instead of a physical texture?',
        trueDescription: 'Uses generic foley like <noise> or <sound>.',
        falseDescription: 'Uses concrete physical foley.',
      },
    ],
  };
}

describe('agentContextCodec', () => {
  it('exports a unified JSON pack and round-trips cleanly with zero warnings', () => {
    const exported = buildAgentContextPackExport(
      makeSampleSkillsState(),
      makeSampleQuickScanState(),
      {exportedAt: '2026-11-21T15:30:00.000Z'}
    );

    const expectedHash = computeSnapshotHash(
      JSON.stringify({
        skills: exported.pack.skills,
        quickScanRules: exported.pack.quickScanRules,
      })
    );
    expect(expectedHash).toMatch(/^[0-9a-f]{8}$/);
    expect(exported.filename).toBe(`auteur-agent-context-20261121-153000-${expectedHash}.json`);

    // Hash remains stable across timestamps when pack contents are unchanged
    const exportedLater = buildAgentContextPackExport(
      makeSampleSkillsState(),
      makeSampleQuickScanState(),
      {exportedAt: '2026-11-22T09:05:12.000Z'}
    );
    expect(exportedLater.filename).toBe(
      `auteur-agent-context-20261122-090512-${expectedHash}.json`
    );

    expect(exported.pack.format).toBe(AUTEUR_AGENT_CONTEXT_PACK_FORMAT);
    expect(exported.pack.packVersion).toBe(AUTEUR_AGENT_CONTEXT_PACK_VERSION);

    const parsed = parseAgentContextPack(exported.content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.warnings).toEqual([]);
    expect(parsed.pack.skills?.foundationalCraftOverride).toBe(
      'Custom director craft discipline for stylized noir pacing.'
    );
    expect(parsed.pack.skills?.customSkills).toHaveLength(2);
    expect(parsed.pack.skills?.skillOverrides.noir_lighting_pass).toEqual({pinMode: 'pinned'});
    expect(parsed.pack.quickScanRules?.customRules).toHaveLength(2);
    expect(parsed.pack.quickScanRules?.ruleOverrides.avoid_dutch_drift).toEqual({enabled: false});
  });

  it('rejects empty, malformed, unsupported format, or section-less JSON payloads', () => {
    expect(parseAgentContextPack('   ').ok).toBe(false);
    expect(parseAgentContextPack('{not valid json').ok).toBe(false);
    expect(
      parseAgentContextPack(JSON.stringify({format: 'wrong-format', packVersion: 1})).ok
    ).toBe(false);
    expect(
      parseAgentContextPack(
        JSON.stringify({
          format: AUTEUR_AGENT_CONTEXT_PACK_FORMAT,
          packVersion: 1,
        })
      ).ok
    ).toBe(false);
  });

  it('accepts partial packs and surfaces sanitizer warnings for invalid or colliding custom entries', () => {
    const rawPartial = JSON.stringify({
      format: AUTEUR_AGENT_CONTEXT_PACK_FORMAT,
      packVersion: 1,
      skills: {
        skillOverrides: {
          [FIRST_BUILTIN_SKILL_ID]: {pinMode: 'muted'},
          nonexistent_skill_xyz: {pinMode: 'pinned'},
        },
        customSkills: [
          {
            id: FIRST_BUILTIN_SKILL_ID, // collides with built-in
            name: 'Collision',
            triggerHint: 'Should be skipped',
            body: 'Skipped',
          },
          {
            id: 'valid_custom_skill',
            name: 'Valid Custom Skill',
            triggerHint: 'Valid hint',
            body: 'Valid instructions',
          },
        ],
      },
    });

    const parsed = parseAgentContextPack(rawPartial);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.pack.skills?.customSkills.map((item) => item.id)).toEqual(['valid_custom_skill']);
    expect(parsed.pack.quickScanRules).toBeUndefined();
    expect(parsed.warnings).toHaveLength(2);
    expect(parsed.warnings[0]).toContain('Skipped 1 invalid or colliding custom skill');
    expect(parsed.warnings[1]).toContain('Ignored 1 unrecognized skill override');
  });

  it('analyzes conflicts accurately against existing local state', () => {
    const exported = buildAgentContextPackExport(
      makeSampleSkillsState(),
      makeSampleQuickScanState()
    );
    const currentSkills: AiSkillsState = {
      ...DEFAULT_AI_SKILLS_STATE,
      foundationalCraftOverride: 'Existing local craft.',
      skillOverrides: {
        [FIRST_BUILTIN_SKILL_ID]: {pinMode: 'muted'},
      },
      customSkills: [
        {
          id: 'noir_lighting_pass',
          name: 'Older Noir Lighting Pass',
          triggerHint: 'Old hint',
          body: 'Old body',
        },
      ],
    };
    const currentQuickScan: QuickScanRulesState = {
      ...DEFAULT_QUICK_SCAN_RULES_STATE,
      ruleOverrides: {
        [FIRST_BUILTIN_RULE_ID]: {enabled: false},
      },
      customRules: [
        {
          id: 'avoid_dutch_drift',
          lens: 'lens1_spatial_optics',
          scope: 'sub_state',
          label: 'Old Dutch Rule',
          when: ['sub_is_camera'],
          instructions: 'Old Q?',
          trueDescription: 'Old T',
          falseDescription: 'Old F',
        },
      ],
    };

    const analysis = analyzeAgentContextImport(exported.pack, currentSkills, currentQuickScan);
    expect(analysis.foundationalCraft?.willOverwrite).toBe(true);
    expect(
      analysis.builtInSkillOverrides.find((o) => o.id === FIRST_BUILTIN_SKILL_ID)?.willOverwrite
    ).toBe(true);
    expect(
      analysis.builtInSkillOverrides.find((o) => o.id === SECOND_BUILTIN_SKILL_ID)?.willOverwrite
    ).toBe(false);
    expect(analysis.customSkills.find((s) => s.skill.id === 'noir_lighting_pass')?.willOverwrite).toBe(
      true
    );
    expect(analysis.customSkills.find((s) => s.skill.id === 'noir_lighting_pass')?.pinMode).toBe(
      'pinned'
    );
    expect(
      analysis.customSkills.find((s) => s.skill.id === 'kinetic_fight_rhythm')?.willOverwrite
    ).toBe(false);
    expect(
      analysis.customQuickScanRules.find((r) => r.rule.id === 'avoid_dutch_drift')?.enabled
    ).toBe(false);
    expect(
      analysis.customQuickScanRules.find((r) => r.rule.id === 'avoid_dutch_drift')?.willOverwrite
    ).toBe(true);
  });

  it('applies selective Merge mode without disturbing unchecked items or local customizations', () => {
    const exported = buildAgentContextPackExport(
      makeSampleSkillsState(),
      makeSampleQuickScanState()
    );
    const currentSkills: AiSkillsState = {
      ...DEFAULT_AI_SKILLS_STATE,
      foundationalCraftOverride: 'Keep my local craft.',
      skillOverrides: {},
      customSkills: [
        {
          id: 'my_local_skill',
          name: 'My Local Skill',
          triggerHint: 'Local trigger',
          body: 'Local body',
        },
      ],
    };
    const currentQuickScan: QuickScanRulesState = {
      ...DEFAULT_QUICK_SCAN_RULES_STATE,
      ruleOverrides: {
        [SECOND_BUILTIN_RULE_ID]: {enabled: false},
      },
      customRules: [
        {
          id: 'my_local_rule',
          lens: 'lens5_blocks_grammar',
          scope: 'document',
          label: 'My Local Rule',
          when: ['all'],
          instructions: 'Local Q?',
          trueDescription: 'T',
          falseDescription: 'F',
        },
      ],
    };

    const selection = {
      applySkills: true,
      applyQuickScan: true,
      includeFoundationalCraft: false, // unchecked: keep local craft!
      builtInSkillOverrideIds: [SECOND_BUILTIN_SKILL_ID],
      customSkillIds: ['noir_lighting_pass'], // carries pinMode: 'pinned'
      builtInQuickScanOverrideIds: [],
      customQuickScanRuleIds: ['avoid_dutch_drift'], // carries enabled: false
    };

    const impact = summarizeAgentContextImportImpact(
      exported.pack,
      selection,
      'merge',
      currentSkills,
      currentQuickScan
    );
    expect(impact.canApply).toBe(true);
    expect(impact.hasDestructiveRemovals).toBe(false);
    expect(impact.selectedItemCount).toBe(3);
    expect(impact.customSkillsAdded).toBe(1);
    expect(impact.customRulesAdded).toBe(1);

    const applied = applyAgentContextImport(
      exported.pack,
      selection,
      'merge',
      currentSkills,
      currentQuickScan
    );

    expect(applied.skills.foundationalCraftOverride).toBe('Keep my local craft.');
    expect(applied.skills.customSkills.map((s) => s.id)).toEqual([
      'my_local_skill',
      'noir_lighting_pass',
    ]);
    expect(applied.skills.skillOverrides).toEqual({
      [SECOND_BUILTIN_SKILL_ID]: {pinMode: 'muted'},
      noir_lighting_pass: {pinMode: 'pinned'},
    });

    expect(applied.quickScanRules.customRules.map((r) => r.id)).toEqual([
      'my_local_rule',
      'avoid_dutch_drift',
    ]);
    expect(applied.quickScanRules.ruleOverrides).toEqual({
      [SECOND_BUILTIN_RULE_ID]: {enabled: false},
      avoid_dutch_drift: {enabled: false},
    });
  });

  it('applies selective Replace mode only to checked domains and reports exact destructive removals', () => {
    const exported = buildAgentContextPackExport(
      makeSampleSkillsState(),
      makeSampleQuickScanState()
    );
    const currentSkills: AiSkillsState = {
      ...DEFAULT_AI_SKILLS_STATE,
      foundationalCraftOverride: 'Old local craft',
      skillOverrides: {
        [FIRST_BUILTIN_SKILL_ID]: {pinMode: 'muted'},
      },
      customSkills: [
        {
          id: 'obsolete_local_skill',
          name: 'Obsolete Local Skill',
          triggerHint: 'Old',
          body: 'Old',
        },
      ],
    };
    const currentQuickScan: QuickScanRulesState = {
      ...DEFAULT_QUICK_SCAN_RULES_STATE,
      ruleOverrides: {
        [SECOND_BUILTIN_RULE_ID]: {enabled: false},
      },
      customRules: [
        {
          id: 'keep_this_local_rule',
          lens: 'lens5_blocks_grammar',
          scope: 'document',
          label: 'Keep This Local Rule',
          when: ['all'],
          instructions: 'Keep?',
          trueDescription: 'T',
          falseDescription: 'F',
        },
      ],
    };

    const analysis = analyzeAgentContextImport(exported.pack, currentSkills, currentQuickScan);
    const defaults = createDefaultImportSelection(analysis);

    // Replace ONLY Skills domain with 1 custom skill (no craft, no built-in overrides); leave Quick Scan untouched!
    const selection = {
      ...defaults,
      applySkills: true,
      applyQuickScan: false,
      includeFoundationalCraft: false,
      builtInSkillOverrideIds: [],
      customSkillIds: ['kinetic_fight_rhythm'],
    };

    const impact = summarizeAgentContextImportImpact(
      exported.pack,
      selection,
      'replace',
      currentSkills,
      currentQuickScan
    );
    expect(impact.hasDestructiveRemovals).toBe(true);
    expect(impact.craftCleared).toBe(true);
    expect(impact.customSkillsRemoved).toBe(1);
    expect(impact.builtInSkillOverridesReset).toBe(1);
    expect(impact.customRulesRemoved).toBe(0);
    expect(impact.builtInRuleOverridesReset).toBe(0);

    const applied = applyAgentContextImport(
      exported.pack,
      selection,
      'replace',
      currentSkills,
      currentQuickScan
    );

    expect(applied.skillsChanged).toBe(true);
    expect(applied.quickScanChanged).toBe(false);
    expect(applied.skills.foundationalCraftOverride).toBeNull();
    expect(applied.skills.customSkills.map((s) => s.id)).toEqual(['kinetic_fight_rhythm']);
    expect(applied.skills.skillOverrides).toEqual({});
    // Quick Scan domain remained completely untouched
    expect(applied.quickScanRules).toBe(currentQuickScan);
  });

  it('exports, parses, warns on unknown tool overrides, and selectively merges/replaces tool & protocol customizations', () => {
    const sampleSkills: AiSkillsState = {
      ...DEFAULT_AI_SKILLS_STATE,
      toolProtocolOverride: '- Custom tool safety protocol.',
      enforceToolLinterGate: false,
      toolOverrides: {
        ask_question: {activationMode: 'enabled'},
        propose_text_replace: {
          activationMode: 'disabled',
          protocolGuidanceOverride: '- Custom text replace guidance.',
        },
      },
    };

    const exported = buildAgentContextPackExport(sampleSkills, DEFAULT_QUICK_SCAN_RULES_STATE);
    const parsed = parseAgentContextPack(exported.content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.warnings).toEqual([]);
    expect(parsed.pack.skills?.toolProtocolOverride).toBe('- Custom tool safety protocol.');
    expect(parsed.pack.skills?.enforceToolLinterGate).toBe(false);
    expect(parsed.pack.skills?.toolOverrides.ask_question).toEqual({activationMode: 'enabled'});

    // Unrecognized tool override emits sanitizer warning
    const withUnknownTool = parseAgentContextPack(
      JSON.stringify({
        format: AUTEUR_AGENT_CONTEXT_PACK_FORMAT,
        packVersion: 1,
        skills: {
          toolOverrides: {
            fake_tool_xyz: {activationMode: 'disabled'},
            ask_question: {activationMode: 'disabled'},
          },
        },
      })
    );
    expect(withUnknownTool.ok).toBe(true);
    if (withUnknownTool.ok) {
      expect(withUnknownTool.warnings).toEqual([
        'Ignored 1 unrecognized function tool override.',
      ]);
      expect(Object.keys(withUnknownTool.pack.skills?.toolOverrides ?? {})).toEqual([
        'ask_question',
      ]);
    }

    // Selective Merge: include only ask_question override, skip protocol & propose_text_replace
    const localSkills: AiSkillsState = {
      ...DEFAULT_AI_SKILLS_STATE,
      toolProtocolOverride: '- Keep local core protocol.',
      toolOverrides: {
        propose_script_title: {activationMode: 'disabled'},
      },
    };
    const analysis = analyzeAgentContextImport(
      parsed.pack,
      localSkills,
      DEFAULT_QUICK_SCAN_RULES_STATE
    );
    expect(analysis.toolProtocol?.willOverwrite).toBe(true);
    expect(analysis.toolOverrides).toHaveLength(2);

    const mergeSel = {
      ...createDefaultImportSelection(analysis),
      includeToolProtocol: false,
      toolOverrideNames: ['ask_question' as const],
    };
    const merged = applyAgentContextImport(
      parsed.pack,
      mergeSel,
      'merge',
      localSkills,
      DEFAULT_QUICK_SCAN_RULES_STATE
    );
    expect(merged.skills.toolProtocolOverride).toBe('- Keep local core protocol.');
    expect(merged.skills.enforceToolLinterGate).toBe(true);
    expect(merged.skills.toolOverrides).toEqual({
      propose_script_title: {activationMode: 'disabled'},
      ask_question: {activationMode: 'enabled'},
    });

    // Replace mode resets unselected local tool/protocol overrides
    const replaceImpact = summarizeAgentContextImportImpact(
      parsed.pack,
      mergeSel,
      'replace',
      localSkills,
      DEFAULT_QUICK_SCAN_RULES_STATE
    );
    expect(replaceImpact.toolProtocolCleared).toBe(true);
    expect(replaceImpact.toolOverridesReset).toBe(1);
    expect(replaceImpact.hasDestructiveRemovals).toBe(true);

    // Regression: Merge mode preserves local toolProtocolOverride when incoming pack only bypasses linter gate
    const gateOnlyPack = buildAgentContextPackExport(
      {...DEFAULT_AI_SKILLS_STATE, enforceToolLinterGate: false},
      DEFAULT_QUICK_SCAN_RULES_STATE
    ).pack;
    const gateOnlyAnalysis = analyzeAgentContextImport(
      gateOnlyPack,
      localSkills,
      DEFAULT_QUICK_SCAN_RULES_STATE
    );
    expect(gateOnlyAnalysis.toolProtocol?.willOverwrite).toBe(false);
    const gateMerged = applyAgentContextImport(
      gateOnlyPack,
      createDefaultImportSelection(gateOnlyAnalysis),
      'merge',
      localSkills,
      DEFAULT_QUICK_SCAN_RULES_STATE
    );
    expect(gateMerged.skills.toolProtocolOverride).toBe('- Keep local core protocol.');
    expect(gateMerged.skills.enforceToolLinterGate).toBe(false);

    // Regression: Merge mode preserves local enforceToolLinterGate=false when incoming pack only sets protocol text
    const localBypassedSkills: AiSkillsState = {
      ...DEFAULT_AI_SKILLS_STATE,
      enforceToolLinterGate: false,
    };
    const textOnlyPack = buildAgentContextPackExport(
      {...DEFAULT_AI_SKILLS_STATE, toolProtocolOverride: '- Pack protocol text.'},
      DEFAULT_QUICK_SCAN_RULES_STATE
    ).pack;
    const textOnlyAnalysis = analyzeAgentContextImport(
      textOnlyPack,
      localBypassedSkills,
      DEFAULT_QUICK_SCAN_RULES_STATE
    );
    expect(textOnlyAnalysis.toolProtocol?.willOverwrite).toBe(false);
    const textMerged = applyAgentContextImport(
      textOnlyPack,
      createDefaultImportSelection(textOnlyAnalysis),
      'merge',
      localBypassedSkills,
      DEFAULT_QUICK_SCAN_RULES_STATE
    );
    expect(textMerged.skills.toolProtocolOverride).toBe('- Pack protocol text.');
    expect(textMerged.skills.enforceToolLinterGate).toBe(false);
  });

  it('maintains backward compatibility when importing legacy k1-k3 packs and on_demand pinMode aliases', () => {
    const legacyJson = JSON.stringify({
      format: AUTEUR_AGENT_CONTEXT_PACK_FORMAT,
      packVersion: 1,
      skills: {
        knowledgeVersion: '0.4.0-k1',
        foundationalCraftOverride: 'Legacy noir craft.',
        skillOverrides: {
          [FIRST_BUILTIN_SKILL_ID]: {pinMode: 'auto', bodyOverride: 'Legacy skill override.'},
          [SECOND_BUILTIN_SKILL_ID]: {pinMode: 'on_demand'},
        },
        customSkills: [
          {
            id: 'legacy_custom_skill',
            name: 'Legacy Custom',
            triggerHint: 'Legacy trigger hint.',
            body: 'Legacy custom instructions.',
          },
        ],
      },
    });

    const parsed = parseAgentContextPack(legacyJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.warnings).toEqual([]);
    expect(parsed.pack.skills?.enforceToolLinterGate).toBe(true);
    expect(parsed.pack.skills?.toolProtocolOverride).toBeNull();
    expect(parsed.pack.skills?.toolOverrides).toEqual({});
    expect(parsed.pack.skills?.skillOverrides[FIRST_BUILTIN_SKILL_ID]).toEqual({
      bodyOverride: 'Legacy skill override.',
    });
    expect(parsed.pack.skills?.skillOverrides[SECOND_BUILTIN_SKILL_ID]).toBeUndefined();

    const analysis = analyzeAgentContextImport(
      parsed.pack,
      DEFAULT_AI_SKILLS_STATE,
      DEFAULT_QUICK_SCAN_RULES_STATE
    );
    const applied = applyAgentContextImport(
      parsed.pack,
      createDefaultImportSelection(analysis),
      'merge',
      DEFAULT_AI_SKILLS_STATE,
      DEFAULT_QUICK_SCAN_RULES_STATE
    );
    expect(applied.skillsChanged).toBe(true);
    expect(applied.skills.foundationalCraftOverride).toBe('Legacy noir craft.');
    expect(applied.skills.customSkills.map((s) => s.id)).toEqual(['legacy_custom_skill']);

    const reExported = buildAgentContextPackExport(applied.skills, applied.quickScanRules, {
      exportedAt: '2026-11-26T09:00:00.000Z',
    });
    expect(reExported.pack.packVersion).toBe(1);
    expect(reExported.pack.skills?.knowledgeVersion).toBe('0.4.0-k5');
  });
});
