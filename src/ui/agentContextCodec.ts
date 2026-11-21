import {z} from 'zod';
import type {ValidationIssue} from '../core/index.ts';
import {
  BUNDLED_QUICK_SCAN_RULES,
  QUICK_SCAN_RULES_VERSION,
} from '../data/knowledge/index.ts';
import {
  AUTEUR_KNOWLEDGE_VERSION,
  BUILTIN_AUTEUR_SKILLS,
  type CustomAuteurSkill,
  type SkillOverride,
  type SkillPinMode,
} from '../services/auteurKnowledge.ts';
import type {
  CustomQuickScanRule,
  QuickScanRuleOverride,
} from '../services/geminiDecisions.ts';
import {
  DEFAULT_AI_SKILLS_STATE,
  sanitizeAiSkillsState,
  type AiSkillsState,
} from './aiSkillsStore.ts';
import {
  DEFAULT_QUICK_SCAN_RULES_STATE,
  sanitizeQuickScanRulesState,
  type QuickScanRulesState,
} from './quickScanRulesStore.ts';

export const AUTEUR_AGENT_CONTEXT_PACK_FORMAT = 'auteur-agent-context-pack' as const;
export const AUTEUR_AGENT_CONTEXT_PACK_VERSION = 1 as const;

const BUILTIN_SKILL_BY_ID = new Map(BUILTIN_AUTEUR_SKILLS.map((skill) => [skill.id, skill]));
const BUILTIN_RULE_BY_ID = new Map(BUNDLED_QUICK_SCAN_RULES.map((rule) => [rule.id, rule]));

const RawSkillsSectionSchema = z.object({
  knowledgeVersion: z.string().optional(),
  foundationalCraftOverride: z.string().nullable().optional(),
  skillOverrides: z.record(z.string(), z.unknown()).optional(),
  customSkills: z.array(z.unknown()).optional(),
});

const RawQuickScanSectionSchema = z.object({
  rulesVersion: z.string().optional(),
  ruleOverrides: z.record(z.string(), z.unknown()).optional(),
  customRules: z.array(z.unknown()).optional(),
});

export const AuteurAgentContextPackSchema = z
  .object({
    format: z.literal(AUTEUR_AGENT_CONTEXT_PACK_FORMAT),
    packVersion: z.literal(AUTEUR_AGENT_CONTEXT_PACK_VERSION),
    exportedAt: z.string().trim().optional(),
    skills: RawSkillsSectionSchema.optional(),
    quickScanRules: RawQuickScanSectionSchema.optional(),
  })
  .refine((value) => value.skills !== undefined || value.quickScanRules !== undefined, {
    message: 'Pack must contain at least a "skills" or "quickScanRules" section.',
    path: [],
  });

export interface AuteurAgentContextPack {
  format: typeof AUTEUR_AGENT_CONTEXT_PACK_FORMAT;
  packVersion: typeof AUTEUR_AGENT_CONTEXT_PACK_VERSION;
  exportedAt: string;
  skills?: AiSkillsState;
  quickScanRules?: QuickScanRulesState;
}

export interface BuiltAgentContextPackExport {
  filename: string;
  mimeType: string;
  content: string;
  pack: AuteurAgentContextPack;
}

export type ParseAgentContextPackResult =
  | {
      ok: true;
      pack: AuteurAgentContextPack;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      issues?: ValidationIssue[];
    };

export type AgentContextImportMode = 'merge' | 'replace';

export interface AnalyzedFoundationalCraftImport {
  text: string;
  charCount: number;
  preview: string;
  willOverwrite: boolean;
}

export interface AnalyzedBuiltInSkillOverrideImport {
  id: string;
  name: string;
  override: SkillOverride;
  pinMode?: SkillPinMode;
  hasBodyOverride: boolean;
  willOverwrite: boolean;
}

export interface AnalyzedCustomSkillImport {
  skill: CustomAuteurSkill;
  pinMode: SkillPinMode;
  willOverwrite: boolean;
}

export interface AnalyzedBuiltInQuickScanOverrideImport {
  id: string;
  label: string;
  override: QuickScanRuleOverride;
  enabledOverride?: boolean;
  hasTextOverride: boolean;
  willOverwrite: boolean;
}

export interface AnalyzedCustomQuickScanRuleImport {
  rule: CustomQuickScanRule;
  enabled: boolean;
  willOverwrite: boolean;
}

export interface AgentContextImportAnalysis {
  hasSkillsSection: boolean;
  hasQuickScanSection: boolean;
  foundationalCraft: AnalyzedFoundationalCraftImport | null;
  builtInSkillOverrides: AnalyzedBuiltInSkillOverrideImport[];
  customSkills: AnalyzedCustomSkillImport[];
  builtInQuickScanOverrides: AnalyzedBuiltInQuickScanOverrideImport[];
  customQuickScanRules: AnalyzedCustomQuickScanRuleImport[];
  totalSelectableItems: number;
}

export interface AgentContextImportSelection {
  applySkills: boolean;
  applyQuickScan: boolean;
  includeFoundationalCraft: boolean;
  builtInSkillOverrideIds: string[];
  customSkillIds: string[];
  builtInQuickScanOverrideIds: string[];
  customQuickScanRuleIds: string[];
}

export interface AgentContextImportImpact {
  selectedItemCount: number;
  craftApplied: boolean;
  craftOverwritten: boolean;
  craftCleared: boolean;
  builtInSkillOverridesApplied: number;
  builtInSkillOverridesReset: number;
  customSkillsAdded: number;
  customSkillsOverwritten: number;
  customSkillsRemoved: number;
  builtInRuleOverridesApplied: number;
  builtInRuleOverridesReset: number;
  customRulesAdded: number;
  customRulesOverwritten: number;
  customRulesRemoved: number;
  hasDestructiveRemovals: boolean;
  canApply: boolean;
}

export interface AppliedAgentContextImportResult {
  skills: AiSkillsState;
  quickScanRules: QuickScanRulesState;
  skillsChanged: boolean;
  quickScanChanged: boolean;
}

function formatZodIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function buildCompactPreview(text: string, maxLength = 120): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Builds a unified, human-editable JSON export pack containing all customized
 * Foundational Craft, Skills & Extensions, and Quick Scan Rules state.
 * Never exports locked Grammar Core, API keys, model preferences, or scripts.
 */
export function buildAgentContextPackExport(
  skillsState: AiSkillsState,
  quickScanRulesState: QuickScanRulesState,
  options: {exportedAt?: string} = {}
): BuiltAgentContextPackExport {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const pack: AuteurAgentContextPack = {
    format: AUTEUR_AGENT_CONTEXT_PACK_FORMAT,
    packVersion: AUTEUR_AGENT_CONTEXT_PACK_VERSION,
    exportedAt,
    skills: sanitizeAiSkillsState(skillsState),
    quickScanRules: sanitizeQuickScanRulesState(quickScanRulesState),
  };

  const dateStamp = exportedAt.slice(0, 10).replace(/[^0-9-]/g, '') || 'export';
  return {
    filename: `auteur-agent-context-${dateStamp}.json`,
    mimeType: 'application/json;charset=utf-8',
    content: JSON.stringify(pack, null, 2),
    pack,
  };
}

/**
 * Parses and validates an imported Agent Context & Skills JSON pack (full or partial).
 * Sanitizes both sections through the store validators and reports non-fatal skip warnings
 * when hand-edited JSON contains invalid IDs or reserved built-in collisions.
 */
export function parseAgentContextPack(input: unknown): ParseAgentContextPackResult {
  let candidate: unknown = input;
  if (typeof input === 'string') {
    const cleaned = input.replace(/^\uFEFF/, '').trim();
    if (!cleaned) {
      return {ok: false, error: 'Imported JSON file is empty.'};
    }
    try {
      candidate = JSON.parse(cleaned);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Syntax error';
      return {ok: false, error: `Malformed JSON file: ${detail}`};
    }
  }

  const parsed = AuteurAgentContextPackSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid Agent Context & Skills JSON pack.',
      issues: formatZodIssues(parsed.error.issues),
    };
  }

  const warnings: string[] = [];
  let skills: AiSkillsState | undefined;
  let quickScanRules: QuickScanRulesState | undefined;

  if (parsed.data.skills !== undefined) {
    const rawSkills = parsed.data.skills;
    skills = sanitizeAiSkillsState(rawSkills);

    const rawCustomCount = Array.isArray(rawSkills.customSkills)
      ? rawSkills.customSkills.length
      : 0;
    const droppedCustomSkills = rawCustomCount - skills.customSkills.length;
    if (droppedCustomSkills > 0) {
      warnings.push(
        `Skipped ${droppedCustomSkills} invalid or colliding custom ${
          droppedCustomSkills === 1 ? 'skill' : 'skills'
        }.`
      );
    }

    if (rawSkills.skillOverrides) {
      const customIdSet = new Set(skills.customSkills.map((item) => item.id));
      let unknownOverrides = 0;
      for (const rawId of Object.keys(rawSkills.skillOverrides)) {
        const id = rawId.trim().toLowerCase();
        if (id && !BUILTIN_SKILL_BY_ID.has(id) && !customIdSet.has(id)) {
          unknownOverrides += 1;
        }
      }
      if (unknownOverrides > 0) {
        warnings.push(
          `Ignored ${unknownOverrides} unrecognized skill ${
            unknownOverrides === 1 ? 'override' : 'overrides'
          }.`
        );
      }
    }
  }

  if (parsed.data.quickScanRules !== undefined) {
    const rawRules = parsed.data.quickScanRules;
    quickScanRules = sanitizeQuickScanRulesState(rawRules);

    const rawCustomCount = Array.isArray(rawRules.customRules) ? rawRules.customRules.length : 0;
    const droppedCustomRules = rawCustomCount - quickScanRules.customRules.length;
    if (droppedCustomRules > 0) {
      warnings.push(
        `Skipped ${droppedCustomRules} invalid or colliding custom Quick Scan ${
          droppedCustomRules === 1 ? 'rule' : 'rules'
        }.`
      );
    }

    if (rawRules.ruleOverrides) {
      const customIdSet = new Set(quickScanRules.customRules.map((item) => item.id));
      let unknownOverrides = 0;
      for (const rawId of Object.keys(rawRules.ruleOverrides)) {
        const id = rawId.trim().toLowerCase();
        if (id && !BUILTIN_RULE_BY_ID.has(id) && !customIdSet.has(id)) {
          unknownOverrides += 1;
        }
      }
      if (unknownOverrides > 0) {
        warnings.push(
          `Ignored ${unknownOverrides} unrecognized Quick Scan rule ${
            unknownOverrides === 1 ? 'override' : 'overrides'
          }.`
        );
      }
    }
  }

  return {
    ok: true,
    pack: {
      format: AUTEUR_AGENT_CONTEXT_PACK_FORMAT,
      packVersion: AUTEUR_AGENT_CONTEXT_PACK_VERSION,
      exportedAt: parsed.data.exportedAt ?? '',
      ...(skills ? {skills} : {}),
      ...(quickScanRules ? {quickScanRules} : {}),
    },
    warnings,
  };
}

/**
 * Inspects a validated pack against the user's current local state so the
 * selective Import Dialog can show exact items, changes, and overwrite badges.
 */
export function analyzeAgentContextImport(
  pack: AuteurAgentContextPack,
  currentSkills: AiSkillsState,
  currentQuickScanRules: QuickScanRulesState
): AgentContextImportAnalysis {
  const hasSkillsSection = pack.skills !== undefined;
  const hasQuickScanSection = pack.quickScanRules !== undefined;

  const existingCustomSkillIds = new Set(
    currentSkills.customSkills.map((item) => item.id.toLowerCase())
  );
  const existingCustomRuleIds = new Set(
    currentQuickScanRules.customRules.map((item) => item.id.toLowerCase())
  );

  let foundationalCraft: AnalyzedFoundationalCraftImport | null = null;
  const builtInSkillOverrides: AnalyzedBuiltInSkillOverrideImport[] = [];
  const customSkills: AnalyzedCustomSkillImport[] = [];

  if (pack.skills) {
    if (pack.skills.foundationalCraftOverride !== null) {
      const text = pack.skills.foundationalCraftOverride;
      foundationalCraft = {
        text,
        charCount: text.length,
        preview: buildCompactPreview(text),
        willOverwrite: currentSkills.foundationalCraftOverride !== null,
      };
    }

    for (const [id, override] of Object.entries(pack.skills.skillOverrides)) {
      const builtIn = BUILTIN_SKILL_BY_ID.get(id);
      if (!builtIn) continue;
      builtInSkillOverrides.push({
        id,
        name: builtIn.name,
        override,
        pinMode: override.pinMode,
        hasBodyOverride: Boolean(override.bodyOverride && override.bodyOverride.trim().length > 0),
        willOverwrite: Boolean(currentSkills.skillOverrides[id]),
      });
    }

    for (const skill of pack.skills.customSkills) {
      const pinMode: SkillPinMode = pack.skills.skillOverrides[skill.id]?.pinMode ?? 'auto';
      customSkills.push({
        skill,
        pinMode,
        willOverwrite: existingCustomSkillIds.has(skill.id.toLowerCase()),
      });
    }
  }

  const builtInQuickScanOverrides: AnalyzedBuiltInQuickScanOverrideImport[] = [];
  const customQuickScanRules: AnalyzedCustomQuickScanRuleImport[] = [];

  if (pack.quickScanRules) {
    for (const [id, override] of Object.entries(pack.quickScanRules.ruleOverrides)) {
      const builtIn = BUILTIN_RULE_BY_ID.get(id);
      if (!builtIn) continue;
      builtInQuickScanOverrides.push({
        id,
        label: builtIn.label,
        override,
        enabledOverride: override.enabled,
        hasTextOverride: Boolean(
          override.instructionsOverride ||
            override.trueDescriptionOverride ||
            override.falseDescriptionOverride
        ),
        willOverwrite: Boolean(currentQuickScanRules.ruleOverrides[id]),
      });
    }

    for (const rule of pack.quickScanRules.customRules) {
      const enabled = pack.quickScanRules.ruleOverrides[rule.id]?.enabled ?? true;
      customQuickScanRules.push({
        rule,
        enabled,
        willOverwrite: existingCustomRuleIds.has(rule.id.toLowerCase()),
      });
    }
  }

  const totalSelectableItems =
    (foundationalCraft ? 1 : 0) +
    builtInSkillOverrides.length +
    customSkills.length +
    builtInQuickScanOverrides.length +
    customQuickScanRules.length;

  return {
    hasSkillsSection,
    hasQuickScanSection,
    foundationalCraft,
    builtInSkillOverrides,
    customSkills,
    builtInQuickScanOverrides,
    customQuickScanRules,
    totalSelectableItems,
  };
}

/**
 * Defaults every present section and selectable item to checked so a full import
 * takes one click while selective pick-and-choose unchecks specific items/sections.
 */
export function createDefaultImportSelection(
  analysis: AgentContextImportAnalysis
): AgentContextImportSelection {
  return {
    applySkills: analysis.hasSkillsSection,
    applyQuickScan: analysis.hasQuickScanSection,
    includeFoundationalCraft: analysis.foundationalCraft !== null,
    builtInSkillOverrideIds: analysis.builtInSkillOverrides.map((item) => item.id),
    customSkillIds: analysis.customSkills.map((item) => item.skill.id),
    builtInQuickScanOverrideIds: analysis.builtInQuickScanOverrides.map((item) => item.id),
    customQuickScanRuleIds: analysis.customQuickScanRules.map((item) => item.rule.id),
  };
}

/**
 * Computes exact counts of additions, overwrites, and (in Replace mode) removals
 * before the user commits an import.
 */
export function summarizeAgentContextImportImpact(
  pack: AuteurAgentContextPack,
  selection: AgentContextImportSelection,
  mode: AgentContextImportMode,
  currentSkills: AiSkillsState,
  currentQuickScanRules: QuickScanRulesState
): AgentContextImportImpact {
  const applySkills = selection.applySkills && pack.skills !== undefined;
  const applyQuickScan = selection.applyQuickScan && pack.quickScanRules !== undefined;

  const existingCustomSkillIds = new Set(
    currentSkills.customSkills.map((item) => item.id.toLowerCase())
  );
  const existingCustomRuleIds = new Set(
    currentQuickScanRules.customRules.map((item) => item.id.toLowerCase())
  );

  const selectedBuiltInSkillIds = new Set(
    applySkills && pack.skills
      ? selection.builtInSkillOverrideIds.filter(
          (id) => BUILTIN_SKILL_BY_ID.has(id) && Boolean(pack.skills?.skillOverrides[id])
        )
      : []
  );
  const selectedCustomSkillIds = new Set(
    applySkills && pack.skills
      ? selection.customSkillIds.filter((id) =>
          pack.skills?.customSkills.some((item) => item.id === id)
        )
      : []
  );
  const craftApplied = Boolean(
    applySkills &&
      selection.includeFoundationalCraft &&
      pack.skills?.foundationalCraftOverride !== null &&
      pack.skills?.foundationalCraftOverride !== undefined
  );
  const craftOverwritten = craftApplied && currentSkills.foundationalCraftOverride !== null;
  const craftCleared =
    mode === 'replace' &&
    applySkills &&
    !craftApplied &&
    currentSkills.foundationalCraftOverride !== null;

  let customSkillsAdded = 0;
  let customSkillsOverwritten = 0;
  for (const id of selectedCustomSkillIds) {
    if (existingCustomSkillIds.has(id.toLowerCase())) customSkillsOverwritten += 1;
    else customSkillsAdded += 1;
  }

  let customSkillsRemoved = 0;
  let builtInSkillOverridesReset = 0;
  if (mode === 'replace' && applySkills) {
    for (const existing of currentSkills.customSkills) {
      if (!selectedCustomSkillIds.has(existing.id)) {
        customSkillsRemoved += 1;
      }
    }
    for (const existingId of Object.keys(currentSkills.skillOverrides)) {
      if (BUILTIN_SKILL_BY_ID.has(existingId) && !selectedBuiltInSkillIds.has(existingId)) {
        builtInSkillOverridesReset += 1;
      }
    }
  }

  const selectedBuiltInRuleIds = new Set(
    applyQuickScan && pack.quickScanRules
      ? selection.builtInQuickScanOverrideIds.filter(
          (id) => BUILTIN_RULE_BY_ID.has(id) && Boolean(pack.quickScanRules?.ruleOverrides[id])
        )
      : []
  );
  const selectedCustomRuleIds = new Set(
    applyQuickScan && pack.quickScanRules
      ? selection.customQuickScanRuleIds.filter((id) =>
          pack.quickScanRules?.customRules.some((item) => item.id === id)
        )
      : []
  );

  let customRulesAdded = 0;
  let customRulesOverwritten = 0;
  for (const id of selectedCustomRuleIds) {
    if (existingCustomRuleIds.has(id.toLowerCase())) customRulesOverwritten += 1;
    else customRulesAdded += 1;
  }

  let customRulesRemoved = 0;
  let builtInRuleOverridesReset = 0;
  if (mode === 'replace' && applyQuickScan) {
    for (const existing of currentQuickScanRules.customRules) {
      if (!selectedCustomRuleIds.has(existing.id)) {
        customRulesRemoved += 1;
      }
    }
    for (const existingId of Object.keys(currentQuickScanRules.ruleOverrides)) {
      if (BUILTIN_RULE_BY_ID.has(existingId) && !selectedBuiltInRuleIds.has(existingId)) {
        builtInRuleOverridesReset += 1;
      }
    }
  }

  const selectedItemCount =
    (craftApplied ? 1 : 0) +
    selectedBuiltInSkillIds.size +
    selectedCustomSkillIds.size +
    selectedBuiltInRuleIds.size +
    selectedCustomRuleIds.size;

  const hasDestructiveRemovals =
    craftCleared ||
    customSkillsRemoved > 0 ||
    builtInSkillOverridesReset > 0 ||
    customRulesRemoved > 0 ||
    builtInRuleOverridesReset > 0;

  const canApply =
    mode === 'merge' ? selectedItemCount > 0 : applySkills || applyQuickScan;

  return {
    selectedItemCount,
    craftApplied,
    craftOverwritten,
    craftCleared,
    builtInSkillOverridesApplied: selectedBuiltInSkillIds.size,
    builtInSkillOverridesReset,
    customSkillsAdded,
    customSkillsOverwritten,
    customSkillsRemoved,
    builtInRuleOverridesApplied: selectedBuiltInRuleIds.size,
    builtInRuleOverridesReset,
    customRulesAdded,
    customRulesOverwritten,
    customRulesRemoved,
    hasDestructiveRemovals,
    canApply,
  };
}

/**
 * Purely applies the user's selective import choices in either 'merge' or 'replace' mode.
 * Unchecked domains remain untouched in both modes.
 */
export function applyAgentContextImport(
  pack: AuteurAgentContextPack,
  selection: AgentContextImportSelection,
  mode: AgentContextImportMode,
  currentSkills: AiSkillsState,
  currentQuickScanRules: QuickScanRulesState
): AppliedAgentContextImportResult {
  let nextSkills = currentSkills;
  let skillsChanged = false;

  if (selection.applySkills && pack.skills) {
    const incomingSkills = pack.skills;
    const selectedBuiltInSkillIds = new Set(selection.builtInSkillOverrideIds);
    const selectedCustomSkillIds = new Set(selection.customSkillIds);

    const baseSkills: AiSkillsState =
      mode === 'replace'
        ? {
            ...DEFAULT_AI_SKILLS_STATE,
            knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
            skillOverrides: {},
            customSkills: [],
          }
        : {
            ...currentSkills,
            knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
            skillOverrides: {...currentSkills.skillOverrides},
            customSkills: [...currentSkills.customSkills],
          };

    if (selection.includeFoundationalCraft && incomingSkills.foundationalCraftOverride !== null) {
      baseSkills.foundationalCraftOverride = incomingSkills.foundationalCraftOverride;
    }

    for (const [id, override] of Object.entries(incomingSkills.skillOverrides)) {
      if (BUILTIN_SKILL_BY_ID.has(id) && selectedBuiltInSkillIds.has(id)) {
        baseSkills.skillOverrides[id] = {...override};
      }
    }

    for (const incomingCustom of incomingSkills.customSkills) {
      if (!selectedCustomSkillIds.has(incomingCustom.id)) continue;
      const existingIndex = baseSkills.customSkills.findIndex(
        (item) => item.id.toLowerCase() === incomingCustom.id.toLowerCase()
      );
      if (existingIndex >= 0) {
        baseSkills.customSkills[existingIndex] = {...incomingCustom};
      } else {
        baseSkills.customSkills.push({...incomingCustom});
      }

      const incomingPinOverride = incomingSkills.skillOverrides[incomingCustom.id];
      if (incomingPinOverride?.pinMode && incomingPinOverride.pinMode !== 'auto') {
        baseSkills.skillOverrides[incomingCustom.id] = {pinMode: incomingPinOverride.pinMode};
      } else {
        delete baseSkills.skillOverrides[incomingCustom.id];
      }
    }

    nextSkills = sanitizeAiSkillsState(baseSkills);
    skillsChanged = true;
  }

  let nextQuickScanRules = currentQuickScanRules;
  let quickScanChanged = false;

  if (selection.applyQuickScan && pack.quickScanRules) {
    const incomingRules = pack.quickScanRules;
    const selectedBuiltInRuleIds = new Set(selection.builtInQuickScanOverrideIds);
    const selectedCustomRuleIds = new Set(selection.customQuickScanRuleIds);

    const baseRules: QuickScanRulesState =
      mode === 'replace'
        ? {
            ...DEFAULT_QUICK_SCAN_RULES_STATE,
            rulesVersion: QUICK_SCAN_RULES_VERSION,
            ruleOverrides: {},
            customRules: [],
          }
        : {
            ...currentQuickScanRules,
            rulesVersion: QUICK_SCAN_RULES_VERSION,
            ruleOverrides: {...currentQuickScanRules.ruleOverrides},
            customRules: [...currentQuickScanRules.customRules],
          };

    for (const [id, override] of Object.entries(incomingRules.ruleOverrides)) {
      if (BUILTIN_RULE_BY_ID.has(id) && selectedBuiltInRuleIds.has(id)) {
        baseRules.ruleOverrides[id] = {...override};
      }
    }

    for (const incomingCustom of incomingRules.customRules) {
      if (!selectedCustomRuleIds.has(incomingCustom.id)) continue;
      const existingIndex = baseRules.customRules.findIndex(
        (item) => item.id.toLowerCase() === incomingCustom.id.toLowerCase()
      );
      if (existingIndex >= 0) {
        baseRules.customRules[existingIndex] = {...incomingCustom};
      } else {
        baseRules.customRules.push({...incomingCustom});
      }

      const incomingRuleOverride = incomingRules.ruleOverrides[incomingCustom.id];
      if (incomingRuleOverride?.enabled === false) {
        baseRules.ruleOverrides[incomingCustom.id] = {enabled: false};
      } else {
        delete baseRules.ruleOverrides[incomingCustom.id];
      }
    }

    nextQuickScanRules = sanitizeQuickScanRulesState(baseRules);
    quickScanChanged = true;
  }

  return {
    skills: nextSkills,
    quickScanRules: nextQuickScanRules,
    skillsChanged,
    quickScanChanged,
  };
}
