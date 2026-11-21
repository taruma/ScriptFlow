import {describe, expect, it} from 'vitest';
import {
  BUNDLED_KNOWLEDGE_SKILLS,
  FOUNDATIONAL_CRAFT_MD,
  KNOWLEDGE_SKILL_MANIFEST,
  normalizeMarkdownContent,
  resolveSkillCatalog,
} from '../../src/data/knowledge/index.ts';
import {
  AUTEUR_KNOWLEDGE_VERSION,
  BUILTIN_AUTEUR_SKILLS,
  composeAgentContext,
  DEFAULT_FOUNDATIONAL_CRAFT,
} from '../../src/services/auteurKnowledge.ts';
import {
  buildBriefSummaryBadge,
  clampComposerHeight,
  EMPTY_DRAFT_BRIEF,
  focusToLegacyMode,
  formatReferenceEntriesForPrompt,
  formatSceneBriefContext,
  formatToolCallTooltip,
  formatToolDisplayName,
  getBriefReferenceHandles,
  getNextReferenceHandle,
  hasDraftBriefContent,
  isDraftBriefActive,
  isNearScrollBottom,
  MAX_COMPOSER_HEIGHT,
  MIN_COMPOSER_HEIGHT,
  upsertLoadedSkill,
  type DraftBriefState,
} from '../../src/ui/aiAssistant.ts';
import {UI_LABELS} from '../../src/ui/labels.ts';
import type {KeyValueStorageLike} from '../../src/ui/aiSettings.ts';
import {
  acknowledgeUpstreamKnowledgeUpdate,
  AI_SKILLS_STORAGE_KEY,
  countCustomizations,
  DEFAULT_AI_SKILLS_STATE,
  deleteCustomSkill,
  hasUpstreamKnowledgeUpdate,
  isBuiltinSkillId,
  loadStoredAiSkills,
  resetAllAiSkills,
  resetSkillOverride,
  sanitizeAiSkillsState,
  saveStoredAiSkills,
  setFoundationalCraftOverride,
  setSkillBodyOverride,
  setSkillPinMode,
  slugifyCustomSkillId,
  upsertCustomSkill,
  validateCustomSkillInput,
} from '../../src/ui/aiSkillsStore.ts';

function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorageLike & {
  dump: () => Record<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    dump: () => Object.fromEntries(store.entries()),
  };
}

describe('aiSkillsStore persistence & sanitization', () => {
  it('returns default state for null storage, empty storage, or corrupt JSON', () => {
    expect(loadStoredAiSkills(null)).toEqual(DEFAULT_AI_SKILLS_STATE);
    expect(loadStoredAiSkills(createMemoryStorage())).toEqual(DEFAULT_AI_SKILLS_STATE);
    expect(
      loadStoredAiSkills(createMemoryStorage({[AI_SKILLS_STORAGE_KEY]: '{not-valid-json'}))
    ).toEqual(DEFAULT_AI_SKILLS_STATE);
  });

  it('round-trips overrides and custom skills through storage while dropping no-op overrides', () => {
    const storage = createMemoryStorage();
    let state = DEFAULT_AI_SKILLS_STATE;
    state = setFoundationalCraftOverride(state, 'Custom directorial craft rules.');
    state = setSkillPinMode(state, 'draft_craft', 'pinned');
    state = setSkillBodyOverride(state, 'temporal_calibration', 'Tight 4s cadence.');
    state = upsertCustomSkill(state, {
      id: 'noir_lighting',
      name: 'Noir Lighting',
      triggerHint: 'When the user asks for chiaroscuro low-key lighting.',
      body: 'Use crisp venetian blind shadow slats and hard motivated key light.',
    });

    saveStoredAiSkills(state, storage);
    const loaded = loadStoredAiSkills(storage);

    expect(loaded.foundationalCraftOverride).toBe('Custom directorial craft rules.');
    expect(loaded.skillOverrides.draft_craft).toEqual({pinMode: 'pinned'});
    expect(loaded.skillOverrides.temporal_calibration).toEqual({
      bodyOverride: 'Tight 4s cadence.',
    });
    expect(loaded.customSkills).toHaveLength(1);
    expect(loaded.customSkills[0]?.id).toBe('noir_lighting');
    expect(countCustomizations(loaded)).toBe(4);
  });

  it('drops custom skills colliding with built-in IDs, strips orphaned overrides, and ignores legacy template keys on sanitize', () => {
    const builtInId = BUILTIN_AUTEUR_SKILLS[0]!.id;
    const sanitized = sanitizeAiSkillsState({
      knowledgeVersion: '0.3.9-old',
      foundationalCraftOverride: DEFAULT_FOUNDATIONAL_CRAFT,
      draftWrapperTemplateOverride: 'Legacy template override',
      customSkills: [
        {
          id: builtInId,
          name: 'Shadow Attempt',
          triggerHint: 'Should be rejected',
          body: 'Should not override built-in',
        },
        {
          id: 'valid_custom',
          name: 'Valid Custom',
          triggerHint: 'Valid hint',
          body: 'Valid body',
        },
        {
          id: 'valid_custom',
          name: 'Duplicate Custom',
          triggerHint: 'Duplicate',
          body: 'Duplicate',
        },
      ],
      skillOverrides: {
        non_existent_skill: {pinMode: 'pinned'},
        [builtInId]: {pinMode: 'auto', bodyOverride: BUILTIN_AUTEUR_SKILLS[0]!.body},
        valid_custom: {pinMode: 'pinned'},
      },
    });

    expect(sanitized.foundationalCraftOverride).toBeNull();
    expect('draftWrapperTemplateOverride' in sanitized).toBe(false);
    expect(sanitized.customSkills.map((s) => s.id)).toEqual(['valid_custom']);
    expect(Object.keys(sanitized.skillOverrides)).toEqual(['valid_custom']);
  });
});

describe('slugifyCustomSkillId & validateCustomSkillInput', () => {
  it('normalizes to snake_case and avoids built-in and existing custom collisions', () => {
    expect(isBuiltinSkillId('draft_craft')).toBe(true);
    expect(isBuiltinSkillId('non_builtin_id')).toBe(false);

    expect(slugifyCustomSkillId('Action Beat Polish!')).toBe('action_beat_polish');
    expect(slugifyCustomSkillId('draft craft')).toBe('draft_craft_custom');
    expect(slugifyCustomSkillId('draft_craft', new Set(['draft_craft_custom']))).toBe(
      'draft_craft_custom_2'
    );
    expect(slugifyCustomSkillId('   ', new Set(['custom_skill']))).toBe('custom_skill_2');
  });

  it('rejects empty fields, invalid IDs, built-in ID collisions, and duplicate custom IDs', () => {
    const existing = [
      {
        id: 'action_polish',
        name: 'Action Polish',
        triggerHint: 'Kinetic sequences',
        body: 'Keep blocking grounded.',
      },
    ];

    const emptyResult = validateCustomSkillInput(
      {id: '', name: '', triggerHint: '', body: ''},
      existing
    );
    expect(emptyResult.ok).toBe(false);
    expect(emptyResult.errors.name).toBeTruthy();
    expect(emptyResult.errors.id).toBeTruthy();
    expect(emptyResult.errors.triggerHint).toBeTruthy();
    expect(emptyResult.errors.body).toBeTruthy();

    const builtInCollision = validateCustomSkillInput(
      {
        id: 'draft_craft',
        name: 'My Draft Craft',
        triggerHint: 'Always',
        body: 'Body text',
      },
      existing
    );
    expect(builtInCollision.ok).toBe(false);
    expect(builtInCollision.errors.id).toContain('built-in');

    const dupCustom = validateCustomSkillInput(
      {
        id: 'action_polish',
        name: 'Another Action',
        triggerHint: 'When editing fights',
        body: 'Body text',
      },
      existing
    );
    expect(dupCustom.ok).toBe(false);
    expect(dupCustom.errors.id).toContain('already uses');

    // Editing the same custom skill retains its own ID cleanly
    const selfEdit = validateCustomSkillInput(
      {
        id: 'action_polish',
        name: 'Action Polish v2',
        triggerHint: 'Kinetic blocking',
        body: 'Updated body',
      },
      existing,
      'action_polish'
    );
    expect(selfEdit.ok).toBe(true);
    expect(selfEdit.normalized?.name).toBe('Action Polish v2');
  });
});

describe('aiSkillsStore mutations & upstream version detection', () => {
  it('clears overrides back to null/default when matching built-in defaults', () => {
    let state = setFoundationalCraftOverride(DEFAULT_AI_SKILLS_STATE, 'Custom craft');
    expect(state.foundationalCraftOverride).toBe('Custom craft');
    state = setFoundationalCraftOverride(state, DEFAULT_FOUNDATIONAL_CRAFT);
    expect(state.foundationalCraftOverride).toBeNull();
  });

  it('migrates pin overrides when renaming a custom skill and removes them on delete', () => {
    let state = upsertCustomSkill(DEFAULT_AI_SKILLS_STATE, {
      id: 'rain_continuity',
      name: 'Rain Continuity',
      triggerHint: 'Wet weather scenes',
      body: 'Track soaked clothing and puddle reflections across every beat.',
    });
    state = setSkillPinMode(state, 'rain_continuity', 'pinned');
    expect(state.skillOverrides.rain_continuity?.pinMode).toBe('pinned');

    // Rename custom skill ID
    state = upsertCustomSkill(
      state,
      {
        id: 'weather_continuity',
        name: 'Weather Continuity',
        triggerHint: 'Rain and snow scenes',
        body: 'Track soaked clothing and wet hair across every beat.',
      },
      'rain_continuity'
    );
    expect(state.customSkills.map((s) => s.id)).toEqual(['weather_continuity']);
    expect(state.skillOverrides.rain_continuity).toBeUndefined();
    expect(state.skillOverrides.weather_continuity?.pinMode).toBe('pinned');

    // Feed into composeAgentContext to verify end-to-end integration
    const composed = composeAgentContext({
      focus: 'refine',
      rawText: '[OPENING]\nWet alley.\n\n1. Rain hits glass.',
      skillOverrides: state.skillOverrides,
      customSkills: state.customSkills,
    });
    expect(composed.activeSkills.some((s) => s.id === 'weather_continuity')).toBe(true);

    state = deleteCustomSkill(state, 'weather_continuity');
    expect(state.customSkills).toHaveLength(0);
    expect(state.skillOverrides.weather_continuity).toBeUndefined();
  });

  it('supports resetting individual skill overrides and resetting all customizations', () => {
    let state = setSkillPinMode(DEFAULT_AI_SKILLS_STATE, 'draft_craft', 'muted');
    state = setSkillBodyOverride(state, 'draft_craft', 'Custom body');
    expect(countCustomizations(state)).toBe(1);

    state = resetSkillOverride(state, 'draft_craft');
    expect(state.skillOverrides.draft_craft).toBeUndefined();
    expect(countCustomizations(state)).toBe(0);

    state = setFoundationalCraftOverride(state, 'Override');
    state = setSkillPinMode(state, 'spatial_fences', 'pinned');
    expect(countCustomizations(state)).toBe(2);

    const reset = resetAllAiSkills();
    expect(reset).toEqual(DEFAULT_AI_SKILLS_STATE);
    expect(countCustomizations(reset)).toBe(0);
  });

  it('detects upstream knowledge version drift only when user customizations exist', () => {
    const cleanOld = sanitizeAiSkillsState({knowledgeVersion: '0.3.0-old'});
    expect(hasUpstreamKnowledgeUpdate(cleanOld)).toBe(false);

    const customizedOld = sanitizeAiSkillsState({
      knowledgeVersion: '0.3.0-old',
      foundationalCraftOverride: 'Custom craft text',
    });
    expect(hasUpstreamKnowledgeUpdate(customizedOld)).toBe(true);

    const acknowledged = acknowledgeUpstreamKnowledgeUpdate(customizedOld);
    expect(acknowledged.knowledgeVersion).toBe(AUTEUR_KNOWLEDGE_VERSION);
    expect(hasUpstreamKnowledgeUpdate(acknowledged)).toBe(false);
  });
});

describe('aiAssistant Phase 2 skill helpers', () => {
  it('formats load_auteur_skill cleanly and deduplicates loaded skills while preserving tool source', () => {
    expect(formatToolDisplayName('load_auteur_skill')).toBe('Load skill');

    const first = upsertLoadedSkill([], {
      id: 'draft_craft',
      name: 'Draft Craft',
      source: 'passive',
    });
    expect(first).toEqual([{id: 'draft_craft', name: 'Draft Craft', source: 'passive'}]);

    const upgraded = upsertLoadedSkill(first, {
      id: 'draft_craft',
      name: 'Draft Craft',
      source: 'tool',
    });
    expect(upgraded).toEqual([{id: 'draft_craft', name: 'Draft Craft', source: 'tool'}]);

    const preserved = upsertLoadedSkill(upgraded, {
      id: 'draft_craft',
      name: 'Draft Craft',
      source: 'pinned',
    });
    expect(preserved).toEqual([{id: 'draft_craft', name: 'Draft Craft', source: 'tool'}]);

    const withSecond = upsertLoadedSkill(preserved, {
      id: 'dialogue_acoustics',
      name: 'Dialogue & Acoustics',
      source: 'pinned',
    });
    expect(withSecond).toHaveLength(2);
  });
});

describe('Phase 3 unified Focus & mode-agnostic Scene Brief / References helpers', () => {
  it('maps AssistantFocus to legacy AssistantMode accurately for empty and non-empty scripts', () => {
    expect(focusToLegacyMode('draft', false)).toBe('draft');
    expect(focusToLegacyMode('audit', false)).toBe('check');
    expect(focusToLegacyMode('refine', false)).toBe('refine');
    expect(focusToLegacyMode('auto', true)).toBe('draft');
    expect(focusToLegacyMode('auto', false)).toBe('refine');
  });

  it('extracts normalized reference handles, formats reference lines, and computes next @imageN handle', () => {
    const brief: DraftBriefState = {
      enabled: true,
      references: [
        {id: 'r1', handle: 'image1', kind: 'text', label: 'Mark', note: 'voice: @audio1'},
        {id: 'r2', handle: '@video1', kind: 'text', label: 'Clip 1 terminal frame'},
        {id: 'r3', handle: '   ', kind: 'text', label: '', note: ''},
      ],
      specs: '',
      subtext: '',
    };

    expect(hasDraftBriefContent(EMPTY_DRAFT_BRIEF)).toBe(false);
    expect(isDraftBriefActive(EMPTY_DRAFT_BRIEF)).toBe(false);
    expect(hasDraftBriefContent(brief)).toBe(true);
    expect(isDraftBriefActive(brief)).toBe(true);
    expect(getBriefReferenceHandles(brief)).toEqual(['@image1', '@audio1', '@video1']);
    expect(getNextReferenceHandle(brief.references)).toBe('@image2');
    expect(formatReferenceEntriesForPrompt(brief.references)).toBe(
      '@image1 as Mark (voice: @audio1)\n@video1: Clip 1 terminal frame'
    );
    expect(buildBriefSummaryBadge(EMPTY_DRAFT_BRIEF)).toBeUndefined();
    expect(buildBriefSummaryBadge(brief)).toBe('Brief · 2 refs');
    expect(
      buildBriefSummaryBadge({enabled: true, references: [], specs: '1-take oner', subtext: ''})
    ).toBe('Brief');

    // Pausing Brief suppresses active state and badge while keeping stored content intact
    const pausedBrief: DraftBriefState = {...brief, enabled: false};
    expect(hasDraftBriefContent(pausedBrief)).toBe(true);
    expect(isDraftBriefActive(pausedBrief)).toBe(false);
    expect(buildBriefSummaryBadge(pausedBrief)).toBeUndefined();
    expect(formatSceneBriefContext(pausedBrief)).toBe('');
  });

  it('formats Scene Brief context cleanly when active and returns empty string when empty or paused', () => {
    expect(formatSceneBriefContext(EMPTY_DRAFT_BRIEF)).toBe('');

    const richBrief: DraftBriefState = {
      enabled: true,
      references: [{id: 'r1', handle: '@image1', kind: 'text', label: 'Elena', note: 'voice: @audio1'}],
      specs: 'Handheld 35mm oner, no music',
      subtext: 'She knows he hid the key',
    };
    const formatted = formatSceneBriefContext(richBrief);
    expect(formatted).toContain('### Cast & References\n- @image1 as Elena (voice: @audio1)');
    expect(formatted).toContain('### Format & Specs\nHandheld 35mm oner, no music');
    expect(formatted).toContain('### Subtext & Additional Instructions\nShe knows he hid the key');

    // Partial brief omits empty sections cleanly
    const partial = formatSceneBriefContext({
      enabled: true,
      references: [],
      specs: 'Continuous oner',
      subtext: '',
    });
    expect(partial).toBe('### Format & Specs\nContinuous oner');
    expect(partial).not.toContain('Cast & References');
    expect(partial).not.toContain('Subtext & Additional Instructions');
  });

  it('injects Scene Brief into system_instruction across all focus modes when provided and omits it when empty', () => {
    const briefContext = formatSceneBriefContext({
      enabled: true,
      references: [{id: 'r1', handle: '@image1', kind: 'text', label: 'Mark'}],
      specs: 'Single handheld take',
      subtext: 'Robert only speaks once',
    });

    for (const focus of ['auto', 'draft', 'refine', 'audit'] as const) {
      const withBrief = composeAgentContext({
        focus,
        rawText: '[OPENING]\nRainy cafe.\n\n[EXECUTION]\n1. Mark waits.',
        briefContext,
        referenceHandles: ['@image1'],
      });
      expect(withBrief.sections.sceneBrief.isActive).toBe(true);
      expect(withBrief.sections.sceneBrief.text).toContain('Scene Brief & References');
      expect(withBrief.sections.sceneBrief.text).toContain('@image1 as Mark');
      expect(withBrief.sections.sceneBrief.text).toContain('Robert only speaks once');
      expect(withBrief.systemInstruction).toContain(withBrief.sections.sceneBrief.text);
      expect(withBrief.activeSkills.map((s) => s.id)).toContain('character_reference');

      const withoutBrief = composeAgentContext({
        focus,
        rawText: '[OPENING]\nRainy cafe.\n\n[EXECUTION]\n1. Mark waits.',
      });
      expect(withoutBrief.sections.sceneBrief.isActive).toBe(false);
      expect(withoutBrief.sections.sceneBrief.text).toBe('');
      expect(withoutBrief.systemInstruction).not.toContain('Scene Brief & References');
    }
  });

  it('passively activates video_continuation and character_reference from referenceHandles on an empty script while respecting muted overrides', () => {
    const composed = composeAgentContext({
      focus: 'auto',
      rawText: '',
      referenceHandles: ['@video1', '@image1'],
    });

    const activeIds = composed.activeSkills.map((s) => s.id);
    expect(activeIds).toContain('draft_craft');
    expect(activeIds).toContain('video_continuation');
    expect(activeIds).toContain('character_reference');

    // Muted override must suppress passive activation even when handle is declared
    const muted = composeAgentContext({
      focus: 'auto',
      rawText: '',
      referenceHandles: ['@video1', '@image1'],
      skillOverrides: {
        video_continuation: {pinMode: 'muted'},
      },
    });
    expect(muted.activeSkills.map((s) => s.id)).not.toContain('video_continuation');
    expect(muted.mutedSkills.map((s) => s.id)).toContain('video_continuation');
    expect(muted.activeSkills.map((s) => s.id)).toContain('character_reference');
  });

  it('keeps Phase 2/3 craft prompts and UI labels 100% platform- and model-agnostic', () => {
    const serialized = JSON.stringify({
      focuses: UI_LABELS.ai.focuses,
      briefTray: UI_LABELS.ai.briefTray,
      contextInspector: {
        title: UI_LABELS.ai.contextInspector.title,
        subtitle: UI_LABELS.ai.contextInspector.subtitle,
        foundationalCraftDesc: UI_LABELS.ai.contextInspector.foundationalCraftDesc,
        emptySceneBrief: UI_LABELS.ai.contextInspector.emptySceneBrief,
      },
    });

    expect(serialized).not.toMatch(/\b(seedance|kling|sora|veo|runway|pika|luma|midjourney)\b/i);
  });

  it('clamps resized composer height safely within min/max and available sidebar height', () => {
    expect(clampComposerHeight(10)).toBe(MIN_COMPOSER_HEIGHT);
    expect(clampComposerHeight(999)).toBe(MAX_COMPOSER_HEIGHT);
    expect(clampComposerHeight(140.4)).toBe(140);
    expect(clampComposerHeight(Number.NaN)).toBe(MIN_COMPOSER_HEIGHT);
    // Short sidebar caps height at 48% of available sidebar height while respecting MIN_COMPOSER_HEIGHT
    expect(clampComposerHeight(300, 400)).toBe(192);
    expect(clampComposerHeight(300, 100)).toBe(MIN_COMPOSER_HEIGHT);
  });

  it('detects sticky-bottom scroll proximity and formats concise tool call hover tooltips', () => {
    expect(isNearScrollBottom({scrollTop: 500, clientHeight: 300, scrollHeight: 800})).toBe(true);
    expect(isNearScrollBottom({scrollTop: 460, clientHeight: 300, scrollHeight: 800})).toBe(true);
    expect(isNearScrollBottom({scrollTop: 300, clientHeight: 300, scrollHeight: 800})).toBe(false);

    const lensTip = formatToolCallTooltip({
      callId: 'c1',
      name: 'inspect_lens_slice',
      arguments: {preset: 'lens1_spatial_optics'},
      status: 'ok',
    });
    expect(lensTip.title).toBe('Inspect lens slice');
    expect(lensTip.statusLabel).toBe('Done');
    expect(lensTip.detail).toBe('Preset: lens1_spatial_optics');

    const patchTip = formatToolCallTooltip({
      callId: 'c2',
      name: 'propose_script_patch',
      arguments: {ops: [{op: 'replace_macro_state'}, {op: 'insert_sub_state'}], summary: 'Tighten S2 framing'},
      status: 'running',
    });
    expect(patchTip.statusLabel).toBe('Running');
    expect(patchTip.detail).toBe('2 ops · Tighten S2 framing');

    const skillTip = formatToolCallTooltip({
      callId: 'c3',
      name: 'load_auteur_skill',
      arguments: {skillId: 'temporal_calibration'},
      status: 'error',
    });
    expect(skillTip.statusLabel).toContain('Retrying');
    expect(skillTip.detail).toBe('Skill: temporal_calibration');
  });
});

describe('src/data/knowledge markdown catalog loader', () => {
  it('loads foundational craft and all 6 built-in skills cleanly from markdown', () => {
    expect(FOUNDATIONAL_CRAFT_MD).toBe(DEFAULT_FOUNDATIONAL_CRAFT);
    expect(FOUNDATIONAL_CRAFT_MD).not.toContain('\r');
    expect(FOUNDATIONAL_CRAFT_MD).toContain('Macro-Block');
    expect(FOUNDATIONAL_CRAFT_MD).toContain('Macro-State');
    expect(FOUNDATIONAL_CRAFT_MD).toContain('Sub-State');

    expect(BUNDLED_KNOWLEDGE_SKILLS).toHaveLength(KNOWLEDGE_SKILL_MANIFEST.length);
    expect(BUNDLED_KNOWLEDGE_SKILLS.map((s) => s.id)).toEqual(
      BUILTIN_AUTEUR_SKILLS.map((s) => s.id)
    );
    for (const skill of BUNDLED_KNOWLEDGE_SKILLS) {
      expect(skill.body.length).toBeGreaterThan(20);
      expect(skill.body).not.toContain('\r');
    }
  });

  it('normalizes BOM/CRLF and validates missing or duplicate skill manifest entries', () => {
    expect(normalizeMarkdownContent('\uFEFFLine 1\r\nLine 2\r\n\r\n')).toBe('Line 1\nLine 2');

    const resolved = resolveSkillCatalog(
      [
        {
          id: 'custom_check',
          name: 'Custom Check',
          category: 'module',
          triggerHint: 'Test hint',
          file: 'custom_check.md',
        },
      ],
      {'./skills/custom_check.md': '\uFEFFBody line\r\n'}
    );
    expect(resolved[0]?.body).toBe('Body line');

    expect(() =>
      resolveSkillCatalog(
        [
          {
            id: 'missing_skill',
            name: 'Missing',
            category: 'module',
            triggerHint: 'Missing',
            file: 'does_not_exist.md',
          },
        ],
        {}
      )
    ).toThrow(/Missing bundled knowledge skill markdown file/);

    expect(() =>
      resolveSkillCatalog(
        [
          {id: 'dup', name: 'A', category: 'module', triggerHint: 'A', file: 'a.md'},
          {id: 'dup', name: 'B', category: 'module', triggerHint: 'B', file: 'b.md'},
        ],
        {'./skills/a.md': 'A', './skills/b.md': 'B'}
      )
    ).toThrow(/Duplicate bundled knowledge skill id/);
  });
});

