import {computeSnapshotHash} from '../core/index.ts';
import {
  sanitizeAiSkillsState,
  type AiSkillsState,
} from './aiSkillsStore.ts';
import {
  sanitizeQuickScanRulesState,
  type QuickScanRulesState,
} from './quickScanRulesStore.ts';
import {formatExportTimestamp} from './scriptLibraryCodec.ts';
import {
  AUTEUR_AGENT_CONTEXT_PACK_FORMAT,
  AUTEUR_AGENT_CONTEXT_PACK_VERSION,
  AuteurAgentContextPackSchema,
  BUILTIN_RULE_BY_ID,
  BUILTIN_SKILL_BY_ID,
  formatZodIssues,
  type AuteurAgentContextPack,
  type BuiltAgentContextPackExport,
  type ParseAgentContextPackResult,
} from './agentContext/schema.ts';

export {
  AUTEUR_AGENT_CONTEXT_PACK_FORMAT,
  AUTEUR_AGENT_CONTEXT_PACK_VERSION,
  AuteurAgentContextPackSchema,
  type AgentContextImportAnalysis,
  type AgentContextImportImpact,
  type AgentContextImportMode,
  type AgentContextImportSelection,
  type AnalyzedBuiltInQuickScanOverrideImport,
  type AnalyzedBuiltInSkillOverrideImport,
  type AnalyzedCustomQuickScanRuleImport,
  type AnalyzedCustomSkillImport,
  type AnalyzedFoundationalCraftImport,
  type AppliedAgentContextImportResult,
  type AuteurAgentContextPack,
  type BuiltAgentContextPackExport,
  type ParseAgentContextPackResult,
} from './agentContext/schema.ts';

export {
  analyzeAgentContextImport,
  applyAgentContextImport,
  createDefaultImportSelection,
  summarizeAgentContextImportImpact,
} from './agentContext/importEngine.ts';

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

  const stamp = formatExportTimestamp(options.exportedAt ?? new Date());
  const hash = computeSnapshotHash(
    JSON.stringify({skills: pack.skills, quickScanRules: pack.quickScanRules})
  );
  return {
    filename: `auteur-agent-context-${stamp}-${hash}.json`,
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
