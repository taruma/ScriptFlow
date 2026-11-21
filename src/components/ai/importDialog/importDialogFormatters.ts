import type {AgentContextImportImpact} from '../../../ui/agentContextCodec.ts';

export function toggleIdInList(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function formatAppliedParts(impact: AgentContextImportImpact): string[] {
  const parts: string[] = [];
  if (impact.craftApplied) {
    parts.push(impact.craftOverwritten ? 'Foundational Craft (overwrite)' : 'Foundational Craft');
  }
  if (impact.customSkillsAdded > 0) {
    parts.push(
      `+${impact.customSkillsAdded} new custom ${impact.customSkillsAdded === 1 ? 'skill' : 'skills'}`
    );
  }
  if (impact.customSkillsOverwritten > 0) {
    parts.push(
      `${impact.customSkillsOverwritten} custom ${
        impact.customSkillsOverwritten === 1 ? 'skill' : 'skills'
      } overwritten`
    );
  }
  if (impact.builtInSkillOverridesApplied > 0) {
    parts.push(
      `${impact.builtInSkillOverridesApplied} built-in skill ${
        impact.builtInSkillOverridesApplied === 1 ? 'override' : 'overrides'
      }`
    );
  }
  if (impact.customRulesAdded > 0) {
    parts.push(
      `+${impact.customRulesAdded} new Quick Scan ${impact.customRulesAdded === 1 ? 'rule' : 'rules'}`
    );
  }
  if (impact.customRulesOverwritten > 0) {
    parts.push(
      `${impact.customRulesOverwritten} custom Quick Scan ${
        impact.customRulesOverwritten === 1 ? 'rule' : 'rules'
      } overwritten`
    );
  }
  if (impact.builtInRuleOverridesApplied > 0) {
    parts.push(
      `${impact.builtInRuleOverridesApplied} built-in rule ${
        impact.builtInRuleOverridesApplied === 1 ? 'override' : 'overrides'
      }`
    );
  }
  return parts;
}

export function formatRemovalParts(impact: AgentContextImportImpact): string[] {
  const parts: string[] = [];
  if (impact.craftCleared) {
    parts.push('Foundational Craft edit');
  }
  if (impact.customSkillsRemoved > 0) {
    parts.push(
      `${impact.customSkillsRemoved} local custom ${
        impact.customSkillsRemoved === 1 ? 'skill' : 'skills'
      }`
    );
  }
  if (impact.builtInSkillOverridesReset > 0) {
    parts.push(
      `${impact.builtInSkillOverridesReset} built-in skill ${
        impact.builtInSkillOverridesReset === 1 ? 'override' : 'overrides'
      }`
    );
  }
  if (impact.customRulesRemoved > 0) {
    parts.push(
      `${impact.customRulesRemoved} local custom Quick Scan ${
        impact.customRulesRemoved === 1 ? 'rule' : 'rules'
      }`
    );
  }
  if (impact.builtInRuleOverridesReset > 0) {
    parts.push(
      `${impact.builtInRuleOverridesReset} built-in Quick Scan ${
        impact.builtInRuleOverridesReset === 1 ? 'override' : 'overrides'
      }`
    );
  }
  return parts;
}

export function formatExportedDate(iso: string): string | null {
  if (!iso.trim()) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
