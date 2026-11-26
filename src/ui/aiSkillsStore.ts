import {useCallback, useState} from 'react';
import {
  AUTEUR_KNOWLEDGE_VERSION,
  BUILTIN_AUTEUR_SKILLS,
  BUILTIN_SCRIPT_TOOLS,
  DEFAULT_FOUNDATIONAL_CRAFT,
  DEFAULT_TOOL_PROTOCOL_CORE,
  type CustomAuteurSkill,
  type ScriptToolDefinition,
  type ScriptToolName,
  type ScriptToolOverride,
  type SkillOverride,
  type SkillPinMode,
  type ToolActivationMode,
} from '../services/auteurKnowledge.ts';
import type {KeyValueStorageLike} from './aiSettings.ts';

export const AI_SKILLS_STORAGE_KEY = 'auteur-editor-ai-skills-v1';

const BUILTIN_SKILL_BY_ID = new Map(BUILTIN_AUTEUR_SKILLS.map((skill) => [skill.id, skill]));
const BUILTIN_TOOL_BY_NAME = new Map<ScriptToolName, ScriptToolDefinition>(
  BUILTIN_SCRIPT_TOOLS.map((tool) => [tool.name, tool])
);
const VALID_PIN_MODES = new Set<SkillPinMode>(['auto', 'pinned', 'muted']);
const VALID_TOOL_ACTIVATION_MODES = new Set<ToolActivationMode>(['auto', 'enabled', 'disabled']);
const CUSTOM_SKILL_ID_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export interface AiSkillsState {
  knowledgeVersion: string;
  foundationalCraftOverride: string | null;
  skillOverrides: Record<string, SkillOverride>;
  customSkills: CustomAuteurSkill[];
  toolProtocolOverride: string | null;
  enforceToolLinterGate: boolean;
  toolOverrides: Partial<Record<ScriptToolName, ScriptToolOverride>>;
}

export const DEFAULT_AI_SKILLS_STATE: AiSkillsState = {
  knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
  foundationalCraftOverride: null,
  skillOverrides: {},
  customSkills: [],
  toolProtocolOverride: null,
  enforceToolLinterGate: true,
  toolOverrides: {},
};

export interface CustomSkillValidationResult {
  ok: boolean;
  errors: Partial<Record<'id' | 'name' | 'triggerHint' | 'body', string>>;
  normalized?: CustomAuteurSkill;
}

function getDefaultLocalStorage(): KeyValueStorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(storage?: KeyValueStorageLike | null): KeyValueStorageLike | null {
  return storage === undefined ? getDefaultLocalStorage() : storage;
}

function safeGet(storage: KeyValueStorageLike | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: KeyValueStorageLike | null, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore quota or restricted-environment errors
  }
}

export function isBuiltinSkillId(id: string): boolean {
  return BUILTIN_SKILL_BY_ID.has(id.trim().toLowerCase());
}

export function isBuiltinToolName(name: string): name is ScriptToolName {
  return BUILTIN_TOOL_BY_NAME.has(name.trim() as ScriptToolName);
}

/**
 * Normalizes a custom skill name or ID into lowercase snake_case and guarantees
 * zero collisions with built-in skill IDs or existing custom skill IDs.
 */
export function slugifyCustomSkillId(
  nameOrId: string,
  existingIds: ReadonlySet<string> = new Set()
): string {
  const normalizedBase = nameOrId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const base = normalizedBase.length > 0 ? normalizedBase : 'custom_skill';
  const normalizedExisting = new Set<string>();
  for (const id of existingIds) {
    normalizedExisting.add(id.trim().toLowerCase());
  }

  let candidate = BUILTIN_SKILL_BY_ID.has(base) ? `${base}_custom` : base;
  if (!BUILTIN_SKILL_BY_ID.has(candidate) && !normalizedExisting.has(candidate)) {
    return candidate;
  }

  let suffix = 2;
  const stem = candidate;
  while (BUILTIN_SKILL_BY_ID.has(candidate) || normalizedExisting.has(candidate)) {
    candidate = `${stem}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Validates user-authored custom skill fields and blocks collisions with both
 * built-in extension skills and other custom skills.
 */
export function validateCustomSkillInput(
  input: CustomAuteurSkill,
  existingCustomSkills: readonly CustomAuteurSkill[],
  editingId?: string
): CustomSkillValidationResult {
  const errors: CustomSkillValidationResult['errors'] = {};
  const id = input.id.trim().toLowerCase();
  const name = input.name.trim();
  const triggerHint = input.triggerHint.trim();
  const body = input.body.trim();
  const normalizedEditingId = editingId?.trim().toLowerCase();

  if (name.length === 0) {
    errors.name = 'Skill name is required.';
  }

  if (id.length === 0) {
    errors.id = 'Skill ID is required.';
  } else if (!CUSTOM_SKILL_ID_PATTERN.test(id)) {
    errors.id = 'Use lowercase letters, numbers, and underscores only (snake_case).';
  } else if (BUILTIN_SKILL_BY_ID.has(id)) {
    errors.id = 'This ID is reserved by a built-in skill. Choose a distinct ID.';
  } else {
    const duplicate = existingCustomSkills.some(
      (skill) => skill.id.toLowerCase() === id && skill.id.toLowerCase() !== normalizedEditingId
    );
    if (duplicate) {
      errors.id = 'Another custom skill already uses this ID.';
    }
  }

  if (triggerHint.length === 0) {
    errors.triggerHint = 'Add a short trigger hint describing when to load this skill.';
  }

  if (body.length === 0) {
    errors.body = 'Skill instructions cannot be empty.';
  }

  if (Object.keys(errors).length > 0) {
    return {ok: false, errors};
  }

  return {
    ok: true,
    errors: {},
    normalized: {id, name, triggerHint, body},
  };
}

function normalizeSkillOverride(skillId: string, raw: unknown): SkillOverride | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const rawPinMode = typeof record.pinMode === 'string' ? record.pinMode.trim().toLowerCase() : undefined;
  const pinMode: SkillPinMode | undefined =
    rawPinMode === 'on_demand'
      ? 'auto'
      : rawPinMode && VALID_PIN_MODES.has(rawPinMode as SkillPinMode)
        ? (rawPinMode as SkillPinMode)
        : undefined;

  const builtInDefaultBody = BUILTIN_SKILL_BY_ID.get(skillId)?.body;
  let bodyOverride: string | undefined;
  if (typeof record.bodyOverride === 'string' && record.bodyOverride.trim().length > 0) {
    if (!builtInDefaultBody || record.bodyOverride.trim() !== builtInDefaultBody.trim()) {
      bodyOverride = record.bodyOverride;
    }
  }

  const effectivePinMode = pinMode && pinMode !== 'auto' ? pinMode : undefined;
  if (!effectivePinMode && !bodyOverride) {
    return null;
  }

  return {
    ...(effectivePinMode ? {pinMode: effectivePinMode} : {}),
    ...(bodyOverride ? {bodyOverride} : {}),
  };
}

function normalizeToolOverride(
  toolName: ScriptToolName,
  raw: unknown
): ScriptToolOverride | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const def = BUILTIN_TOOL_BY_NAME.get(toolName);
  if (!def) return null;

  const record = raw as Record<string, unknown>;
  const activationMode =
    typeof record.activationMode === 'string' &&
    VALID_TOOL_ACTIVATION_MODES.has(record.activationMode as ToolActivationMode)
      ? (record.activationMode as ToolActivationMode)
      : undefined;

  let descriptionOverride: string | undefined;
  if (typeof record.descriptionOverride === 'string' && record.descriptionOverride.trim().length > 0) {
    if (record.descriptionOverride.trim() !== def.defaultDescription.trim()) {
      descriptionOverride = record.descriptionOverride;
    }
  }

  let protocolGuidanceOverride: string | undefined;
  if (
    typeof record.protocolGuidanceOverride === 'string' &&
    record.protocolGuidanceOverride.trim().length > 0
  ) {
    if (record.protocolGuidanceOverride.trim() !== def.defaultProtocolGuidance.trim()) {
      protocolGuidanceOverride = record.protocolGuidanceOverride;
    }
  }

  const effectiveMode = activationMode && activationMode !== 'auto' ? activationMode : undefined;
  if (!effectiveMode && !descriptionOverride && !protocolGuidanceOverride) {
    return null;
  }

  return {
    ...(effectiveMode ? {activationMode: effectiveMode} : {}),
    ...(descriptionOverride ? {descriptionOverride} : {}),
    ...(protocolGuidanceOverride ? {protocolGuidanceOverride} : {}),
  };
}

export function sanitizeAiSkillsState(input: unknown): AiSkillsState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ...DEFAULT_AI_SKILLS_STATE,
      skillOverrides: {},
      customSkills: [],
      toolOverrides: {},
    };
  }

  const record = input as Record<string, unknown>;
  const knowledgeVersion =
    typeof record.knowledgeVersion === 'string' && record.knowledgeVersion.trim().length > 0
      ? record.knowledgeVersion.trim()
      : AUTEUR_KNOWLEDGE_VERSION;

  const foundationalCraftOverride =
    typeof record.foundationalCraftOverride === 'string' &&
    record.foundationalCraftOverride.trim().length > 0 &&
    record.foundationalCraftOverride.trim() !== DEFAULT_FOUNDATIONAL_CRAFT.trim()
      ? record.foundationalCraftOverride
      : null;

  const toolProtocolOverride =
    typeof record.toolProtocolOverride === 'string' &&
    record.toolProtocolOverride.trim().length > 0 &&
    record.toolProtocolOverride.trim() !== DEFAULT_TOOL_PROTOCOL_CORE.trim()
      ? record.toolProtocolOverride
      : null;

  const enforceToolLinterGate = record.enforceToolLinterGate === false ? false : true;

  const customSkills: CustomAuteurSkill[] = [];
  const seenCustomIds = new Set<string>();
  if (Array.isArray(record.customSkills)) {
    for (const item of record.customSkills) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.id !== 'string' ||
        typeof candidate.name !== 'string' ||
        typeof candidate.triggerHint !== 'string' ||
        typeof candidate.body !== 'string'
      ) {
        continue;
      }
      const id = candidate.id.trim().toLowerCase();
      const name = candidate.name.trim();
      const triggerHint = candidate.triggerHint.trim();
      const body = candidate.body.trim();
      if (
        !id ||
        !CUSTOM_SKILL_ID_PATTERN.test(id) ||
        !name ||
        !triggerHint ||
        !body ||
        BUILTIN_SKILL_BY_ID.has(id) ||
        seenCustomIds.has(id)
      ) {
        continue;
      }
      seenCustomIds.add(id);
      customSkills.push({id, name, triggerHint, body});
    }
  }

  const skillOverrides: Record<string, SkillOverride> = {};
  if (
    record.skillOverrides &&
    typeof record.skillOverrides === 'object' &&
    !Array.isArray(record.skillOverrides)
  ) {
    for (const [rawId, rawOverride] of Object.entries(
      record.skillOverrides as Record<string, unknown>
    )) {
      const id = rawId.trim().toLowerCase();
      if (!id) continue;
      if (!BUILTIN_SKILL_BY_ID.has(id) && !seenCustomIds.has(id)) continue;
      const normalized = normalizeSkillOverride(id, rawOverride);
      if (normalized) {
        skillOverrides[id] = normalized;
      }
    }
  }

  const toolOverrides: Partial<Record<ScriptToolName, ScriptToolOverride>> = {};
  if (
    record.toolOverrides &&
    typeof record.toolOverrides === 'object' &&
    !Array.isArray(record.toolOverrides)
  ) {
    for (const [rawName, rawOverride] of Object.entries(
      record.toolOverrides as Record<string, unknown>
    )) {
      const name = rawName.trim();
      if (!isBuiltinToolName(name)) continue;
      const normalized = normalizeToolOverride(name, rawOverride);
      if (normalized) {
        toolOverrides[name] = normalized;
      }
    }
  }

  return {
    knowledgeVersion,
    foundationalCraftOverride,
    skillOverrides,
    customSkills,
    toolProtocolOverride,
    enforceToolLinterGate,
    toolOverrides,
  };
}

export function loadStoredAiSkills(storage?: KeyValueStorageLike | null): AiSkillsState {
  const store = resolveStorage(storage);
  const raw = safeGet(store, AI_SKILLS_STORAGE_KEY);
  if (!raw) {
    return {
      ...DEFAULT_AI_SKILLS_STATE,
      skillOverrides: {},
      customSkills: [],
      toolOverrides: {},
    };
  }
  try {
    return sanitizeAiSkillsState(JSON.parse(raw));
  } catch {
    return {
      ...DEFAULT_AI_SKILLS_STATE,
      skillOverrides: {},
      customSkills: [],
      toolOverrides: {},
    };
  }
}

export function saveStoredAiSkills(
  state: AiSkillsState,
  storage?: KeyValueStorageLike | null
): AiSkillsState {
  const store = resolveStorage(storage);
  const normalized = sanitizeAiSkillsState(state);
  safeSet(store, AI_SKILLS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

// ---------------------------------------------------------------------------
// Pure Mutation & Inspection Helpers
// ---------------------------------------------------------------------------

export function setFoundationalCraftOverride(
  state: AiSkillsState,
  value: string | null
): AiSkillsState {
  const nextValue =
    value !== null &&
    value.trim().length > 0 &&
    value.trim() !== DEFAULT_FOUNDATIONAL_CRAFT.trim()
      ? value
      : null;

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    foundationalCraftOverride: nextValue,
  };
}

export function setSkillPinMode(
  state: AiSkillsState,
  skillId: string,
  pinMode: SkillPinMode
): AiSkillsState {
  const id = skillId.trim().toLowerCase();
  const nextOverrides = {...state.skillOverrides};
  const current = nextOverrides[id] ?? {};
  const normalized = normalizeSkillOverride(id, {...current, pinMode});

  if (normalized) {
    nextOverrides[id] = normalized;
  } else {
    delete nextOverrides[id];
  }

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    skillOverrides: nextOverrides,
  };
}

export function setSkillBodyOverride(
  state: AiSkillsState,
  skillId: string,
  bodyOverride: string | null
): AiSkillsState {
  const id = skillId.trim().toLowerCase();
  const nextOverrides = {...state.skillOverrides};
  const current = nextOverrides[id] ?? {};
  const normalized = normalizeSkillOverride(id, {
    ...current,
    bodyOverride: bodyOverride ?? undefined,
  });

  if (normalized) {
    nextOverrides[id] = normalized;
  } else {
    delete nextOverrides[id];
  }

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    skillOverrides: nextOverrides,
  };
}

export function resetSkillOverride(state: AiSkillsState, skillId: string): AiSkillsState {
  const id = skillId.trim().toLowerCase();
  if (!(id in state.skillOverrides)) return state;
  const nextOverrides = {...state.skillOverrides};
  delete nextOverrides[id];
  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    skillOverrides: nextOverrides,
  };
}

/**
 * Bulk-sets `pinMode` (`'auto'` or `'muted'`) across every built-in and custom skill
 * while preserving all custom skill definitions, body overrides, and Foundational Craft edits.
 */
export function setAllSkillsPinMode(
  state: AiSkillsState,
  pinMode: 'auto' | 'muted'
): AiSkillsState {
  const allIds = new Set<string>();
  for (const skill of BUILTIN_AUTEUR_SKILLS) {
    allIds.add(skill.id);
  }
  for (const custom of state.customSkills) {
    allIds.add(custom.id.trim().toLowerCase());
  }

  const nextOverrides: Record<string, SkillOverride> = {...state.skillOverrides};
  for (const id of allIds) {
    const existing = nextOverrides[id];
    if (pinMode === 'auto') {
      if (!existing) continue;
      if (existing.bodyOverride) {
        nextOverrides[id] = {bodyOverride: existing.bodyOverride};
      } else {
        delete nextOverrides[id];
      }
    } else {
      nextOverrides[id] = {
        ...(existing?.bodyOverride ? {bodyOverride: existing.bodyOverride} : {}),
        pinMode: 'muted',
      };
    }
  }

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    skillOverrides: nextOverrides,
  };
}

export function upsertCustomSkill(
  state: AiSkillsState,
  skill: CustomAuteurSkill,
  editingId?: string
): AiSkillsState {
  const validation = validateCustomSkillInput(skill, state.customSkills, editingId);
  if (!validation.ok || !validation.normalized) {
    return state;
  }

  const normalizedSkill = validation.normalized;
  const normalizedEditingId = editingId?.trim().toLowerCase();
  const nextCustomSkills = [...state.customSkills];
  const existingIndex = nextCustomSkills.findIndex(
    (item) => item.id.toLowerCase() === (normalizedEditingId ?? normalizedSkill.id)
  );

  if (existingIndex >= 0) {
    nextCustomSkills[existingIndex] = normalizedSkill;
  } else {
    nextCustomSkills.push(normalizedSkill);
  }

  const nextOverrides = {...state.skillOverrides};
  if (normalizedEditingId && normalizedEditingId !== normalizedSkill.id) {
    const existingOverride = nextOverrides[normalizedEditingId];
    if (existingOverride) {
      delete nextOverrides[normalizedEditingId];
      nextOverrides[normalizedSkill.id] = existingOverride;
    }
  }

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    customSkills: nextCustomSkills,
    skillOverrides: nextOverrides,
  };
}

export function deleteCustomSkill(state: AiSkillsState, skillId: string): AiSkillsState {
  const id = skillId.trim().toLowerCase();
  const nextCustomSkills = state.customSkills.filter((skill) => skill.id.toLowerCase() !== id);
  const nextOverrides = {...state.skillOverrides};
  delete nextOverrides[id];

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    customSkills: nextCustomSkills,
    skillOverrides: nextOverrides,
  };
}

export function setToolProtocolOverride(
  state: AiSkillsState,
  value: string | null
): AiSkillsState {
  const nextValue =
    value !== null &&
    value.trim().length > 0 &&
    value.trim() !== DEFAULT_TOOL_PROTOCOL_CORE.trim()
      ? value
      : null;

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    toolProtocolOverride: nextValue,
  };
}

export function setEnforceToolLinterGate(
  state: AiSkillsState,
  enforce: boolean
): AiSkillsState {
  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    enforceToolLinterGate: enforce,
  };
}

export function setToolActivationMode(
  state: AiSkillsState,
  toolName: ScriptToolName,
  activationMode: ToolActivationMode
): AiSkillsState {
  const nextOverrides = {...state.toolOverrides};
  const current = nextOverrides[toolName] ?? {};
  const normalized = normalizeToolOverride(toolName, {...current, activationMode});

  if (normalized) {
    nextOverrides[toolName] = normalized;
  } else {
    delete nextOverrides[toolName];
  }

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    toolOverrides: nextOverrides,
  };
}

/**
 * Bulk-sets `activationMode` (`'auto'` or `'disabled'`) across every function tool
 * while preserving per-tool description and protocol guidance overrides.
 */
export function setAllToolsActivationMode(
  state: AiSkillsState,
  activationMode: 'auto' | 'disabled'
): AiSkillsState {
  const nextOverrides: Partial<Record<ScriptToolName, ScriptToolOverride>> = {
    ...state.toolOverrides,
  };
  for (const def of BUILTIN_SCRIPT_TOOLS) {
    const existing = nextOverrides[def.name];
    const normalized = normalizeToolOverride(def.name, {
      ...existing,
      activationMode,
    });
    if (normalized) {
      nextOverrides[def.name] = normalized;
    } else {
      delete nextOverrides[def.name];
    }
  }

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    toolOverrides: nextOverrides,
  };
}

export function setToolDescriptionOverride(
  state: AiSkillsState,
  toolName: ScriptToolName,
  descriptionOverride: string | null
): AiSkillsState {
  const nextOverrides = {...state.toolOverrides};
  const current = nextOverrides[toolName] ?? {};
  const normalized = normalizeToolOverride(toolName, {
    ...current,
    descriptionOverride: descriptionOverride ?? undefined,
  });

  if (normalized) {
    nextOverrides[toolName] = normalized;
  } else {
    delete nextOverrides[toolName];
  }

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    toolOverrides: nextOverrides,
  };
}

export function setToolProtocolGuidanceOverride(
  state: AiSkillsState,
  toolName: ScriptToolName,
  protocolGuidanceOverride: string | null
): AiSkillsState {
  const nextOverrides = {...state.toolOverrides};
  const current = nextOverrides[toolName] ?? {};
  const normalized = normalizeToolOverride(toolName, {
    ...current,
    protocolGuidanceOverride: protocolGuidanceOverride ?? undefined,
  });

  if (normalized) {
    nextOverrides[toolName] = normalized;
  } else {
    delete nextOverrides[toolName];
  }

  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    toolOverrides: nextOverrides,
  };
}

export function resetToolOverride(
  state: AiSkillsState,
  toolName: ScriptToolName
): AiSkillsState {
  if (!(toolName in state.toolOverrides)) return state;
  const nextOverrides = {...state.toolOverrides};
  delete nextOverrides[toolName];
  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    toolOverrides: nextOverrides,
  };
}

export function resetAllToolsAndProtocol(state: AiSkillsState): AiSkillsState {
  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    toolProtocolOverride: null,
    enforceToolLinterGate: true,
    toolOverrides: {},
  };
}

export function resetAllAiSkills(): AiSkillsState {
  return {
    ...DEFAULT_AI_SKILLS_STATE,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    skillOverrides: {},
    customSkills: [],
    toolOverrides: {},
  };
}

export function acknowledgeUpstreamKnowledgeUpdate(state: AiSkillsState): AiSkillsState {
  return {
    ...state,
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
  };
}

export function countToolCustomizations(state: AiSkillsState): number {
  let count = 0;
  if (state.toolProtocolOverride !== null) count += 1;
  if (state.enforceToolLinterGate === false) count += 1;

  for (const override of Object.values(state.toolOverrides)) {
    if (!override) continue;
    const hasCustomMode = Boolean(override.activationMode && override.activationMode !== 'auto');
    const hasCustomDesc = Boolean(
      override.descriptionOverride && override.descriptionOverride.trim().length > 0
    );
    const hasCustomGuidance = Boolean(
      override.protocolGuidanceOverride && override.protocolGuidanceOverride.trim().length > 0
    );
    if (hasCustomMode || hasCustomDesc || hasCustomGuidance) {
      count += 1;
    }
  }

  return count;
}

export function countCustomizations(state: AiSkillsState): number {
  let count = 0;
  if (state.foundationalCraftOverride !== null) count += 1;

  for (const override of Object.values(state.skillOverrides)) {
    const hasCustomPin = Boolean(override.pinMode && override.pinMode !== 'auto');
    const hasCustomBody = Boolean(override.bodyOverride && override.bodyOverride.trim().length > 0);
    if (hasCustomPin || hasCustomBody) {
      count += 1;
    }
  }

  count += state.customSkills.length;
  count += countToolCustomizations(state);
  return count;
}

/**
 * Detects when built-in Auteur knowledge defaults have advanced since the user
 * last saved craft, template, or skill overrides.
 */
export function hasUpstreamKnowledgeUpdate(state: AiSkillsState): boolean {
  return (
    state.knowledgeVersion !== AUTEUR_KNOWLEDGE_VERSION &&
    countCustomizations(state) > 0
  );
}

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------

export function useAiSkills(): {
  skillsState: AiSkillsState;
  customizationCount: number;
  toolCustomizationCount: number;
  hasUpstreamUpdate: boolean;
  setFoundationalCraft: (value: string | null) => void;
  setPinMode: (skillId: string, pinMode: SkillPinMode) => void;
  setAllPinModes: (pinMode: 'auto' | 'muted') => void;
  setBodyOverride: (skillId: string, bodyOverride: string | null) => void;
  resetSkill: (skillId: string) => void;
  saveCustomSkill: (skill: CustomAuteurSkill, editingId?: string) => void;
  removeCustomSkill: (skillId: string) => void;
  setToolProtocol: (value: string | null) => void;
  setEnforceLinterGate: (enforce: boolean) => void;
  setToolMode: (toolName: ScriptToolName, mode: ToolActivationMode) => void;
  setAllToolModes: (mode: 'auto' | 'disabled') => void;
  setToolDescription: (toolName: ScriptToolName, description: string | null) => void;
  setToolGuidance: (toolName: ScriptToolName, guidance: string | null) => void;
  resetTool: (toolName: ScriptToolName) => void;
  resetAllTools: () => void;
  replaceSkillsState: (nextState: AiSkillsState) => void;
  resetAll: () => void;
  acknowledgeUpdate: () => void;
} {
  const [skillsState, setSkillsState] = useState<AiSkillsState>(() => loadStoredAiSkills());

  const setFoundationalCraft = useCallback((value: string | null) => {
    setSkillsState((prev) => saveStoredAiSkills(setFoundationalCraftOverride(prev, value)));
  }, []);

  const setPinMode = useCallback((skillId: string, pinMode: SkillPinMode) => {
    setSkillsState((prev) => saveStoredAiSkills(setSkillPinMode(prev, skillId, pinMode)));
  }, []);

  const setAllPinModes = useCallback((pinMode: 'auto' | 'muted') => {
    setSkillsState((prev) => saveStoredAiSkills(setAllSkillsPinMode(prev, pinMode)));
  }, []);

  const setBodyOverride = useCallback((skillId: string, bodyOverride: string | null) => {
    setSkillsState((prev) => saveStoredAiSkills(setSkillBodyOverride(prev, skillId, bodyOverride)));
  }, []);

  const resetSkill = useCallback((skillId: string) => {
    setSkillsState((prev) => saveStoredAiSkills(resetSkillOverride(prev, skillId)));
  }, []);

  const saveCustomSkill = useCallback((skill: CustomAuteurSkill, editingId?: string) => {
    setSkillsState((prev) => saveStoredAiSkills(upsertCustomSkill(prev, skill, editingId)));
  }, []);

  const removeCustomSkill = useCallback((skillId: string) => {
    setSkillsState((prev) => saveStoredAiSkills(deleteCustomSkill(prev, skillId)));
  }, []);

  const setToolProtocol = useCallback((value: string | null) => {
    setSkillsState((prev) => saveStoredAiSkills(setToolProtocolOverride(prev, value)));
  }, []);

  const setEnforceLinterGate = useCallback((enforce: boolean) => {
    setSkillsState((prev) => saveStoredAiSkills(setEnforceToolLinterGate(prev, enforce)));
  }, []);

  const setToolMode = useCallback((toolName: ScriptToolName, mode: ToolActivationMode) => {
    setSkillsState((prev) => saveStoredAiSkills(setToolActivationMode(prev, toolName, mode)));
  }, []);

  const setAllToolModes = useCallback((mode: 'auto' | 'disabled') => {
    setSkillsState((prev) => saveStoredAiSkills(setAllToolsActivationMode(prev, mode)));
  }, []);

  const setToolDescription = useCallback(
    (toolName: ScriptToolName, description: string | null) => {
      setSkillsState((prev) =>
        saveStoredAiSkills(setToolDescriptionOverride(prev, toolName, description))
      );
    },
    []
  );

  const setToolGuidance = useCallback((toolName: ScriptToolName, guidance: string | null) => {
    setSkillsState((prev) =>
      saveStoredAiSkills(setToolProtocolGuidanceOverride(prev, toolName, guidance))
    );
  }, []);

  const resetTool = useCallback((toolName: ScriptToolName) => {
    setSkillsState((prev) => saveStoredAiSkills(resetToolOverride(prev, toolName)));
  }, []);

  const resetAllTools = useCallback(() => {
    setSkillsState((prev) => saveStoredAiSkills(resetAllToolsAndProtocol(prev)));
  }, []);

  const replaceSkillsState = useCallback((nextState: AiSkillsState) => {
    setSkillsState(() => saveStoredAiSkills(nextState));
  }, []);

  const resetAll = useCallback(() => {
    setSkillsState(() => saveStoredAiSkills(resetAllAiSkills()));
  }, []);

  const acknowledgeUpdate = useCallback(() => {
    setSkillsState((prev) => saveStoredAiSkills(acknowledgeUpstreamKnowledgeUpdate(prev)));
  }, []);

  return {
    skillsState,
    customizationCount: countCustomizations(skillsState),
    toolCustomizationCount: countToolCustomizations(skillsState),
    hasUpstreamUpdate: hasUpstreamKnowledgeUpdate(skillsState),
    setFoundationalCraft,
    setPinMode,
    setAllPinModes,
    setBodyOverride,
    resetSkill,
    saveCustomSkill,
    removeCustomSkill,
    setToolProtocol,
    setEnforceLinterGate,
    setToolMode,
    setAllToolModes,
    setToolDescription,
    setToolGuidance,
    resetTool,
    resetAllTools,
    replaceSkillsState,
    resetAll,
    acknowledgeUpdate,
  };
}
