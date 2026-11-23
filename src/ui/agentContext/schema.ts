import {z} from 'zod';
import type {ValidationIssue} from '../../core/index.ts';
import {BUNDLED_QUICK_SCAN_RULES} from '../../data/knowledge/index.ts';
import {
  BUILTIN_AUTEUR_SKILLS,
  BUILTIN_SCRIPT_TOOLS,
  type CustomAuteurSkill,
  type ScriptToolName,
  type ScriptToolOverride,
  type SkillOverride,
  type SkillPinMode,
  type ToolActivationMode,
} from '../../services/auteurKnowledge.ts';
import type {
  CustomQuickScanRule,
  QuickScanRuleOverride,
} from '../../services/geminiDecisions.ts';
import type {AiSkillsState} from '../aiSkillsStore.ts';
import type {QuickScanRulesState} from '../quickScanRulesStore.ts';

export const AUTEUR_AGENT_CONTEXT_PACK_FORMAT = 'auteur-agent-context-pack' as const;
export const AUTEUR_AGENT_CONTEXT_PACK_VERSION = 1 as const;

export const BUILTIN_SKILL_BY_ID = new Map(BUILTIN_AUTEUR_SKILLS.map((skill) => [skill.id, skill]));
export const BUILTIN_TOOL_BY_NAME = new Map(BUILTIN_SCRIPT_TOOLS.map((tool) => [tool.name, tool]));
export const BUILTIN_RULE_BY_ID = new Map(BUNDLED_QUICK_SCAN_RULES.map((rule) => [rule.id, rule]));

const RawSkillsSectionSchema = z.object({
  knowledgeVersion: z.string().optional(),
  foundationalCraftOverride: z.string().nullable().optional(),
  skillOverrides: z.record(z.string(), z.unknown()).optional(),
  customSkills: z.array(z.unknown()).optional(),
  toolProtocolOverride: z.string().nullable().optional(),
  enforceToolLinterGate: z.boolean().optional(),
  toolOverrides: z.record(z.string(), z.unknown()).optional(),
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

export interface AnalyzedToolProtocolImport {
  text: string | null;
  charCount: number;
  preview: string;
  enforceToolLinterGate: boolean;
  willOverwrite: boolean;
}

export interface AnalyzedScriptToolOverrideImport {
  name: ScriptToolName;
  label: string;
  override: ScriptToolOverride;
  activationMode?: ToolActivationMode;
  hasDescriptionOverride: boolean;
  hasProtocolGuidanceOverride: boolean;
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
  toolProtocol: AnalyzedToolProtocolImport | null;
  toolOverrides: AnalyzedScriptToolOverrideImport[];
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
  includeToolProtocol?: boolean;
  toolOverrideNames?: ScriptToolName[];
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
  toolProtocolApplied: boolean;
  toolProtocolOverwritten: boolean;
  toolProtocolCleared: boolean;
  toolOverridesApplied: number;
  toolOverridesReset: number;
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

export function formatZodIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function buildCompactPreview(text: string, maxLength = 120): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}
