import type {AuteurLensPresetId} from '../../core/index.ts';
import forestPovHorrorExemplarRaw from './exemplars/forest-pov-horror.txt?raw';
import heistMontageExemplarRaw from './exemplars/heist-montage.txt?raw';
import interrogationCoverageExemplarRaw from './exemplars/interrogation-coverage.txt?raw';
import foundationalCraftRaw from './foundational-craft.md?raw';
import quickScanRulesManifest from './quick-scan-rules.json';
import skillCatalogManifest from './skills/catalog.json';

export type KnowledgeSkillCategory = 'workflow' | 'module';

export type QuickScanRuleScope = 'document' | 'macro_state' | 'sub_state';
export type QuickScanRuleLens = AuteurLensPresetId | 'brief';
export type QuickScanRulePredicate =
  | 'all'
  | 'continuous'
  | 'oner'
  | 'montage'
  | 'has_opening'
  | 'has_intent'
  | 'has_aesthetic'
  | 'has_dialogue'
  | 'has_foley'
  | 'has_action_or_prop'
  | 'has_action'
  | 'has_brief_text'
  | 'has_brief_media'
  | 'sub_is_action'
  | 'sub_is_camera'
  | 'sub_is_foley'
  | 'sub_is_dialogue'
  | 'sub_is_action_or_prop';

export interface QuickScanRuleDefinition {
  id: string;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  label: string;
  when: QuickScanRulePredicate[];
  instructions: string;
  trueDescription: string;
  falseDescription: string;
  escalationHint?: string;
  defaultEnabled?: boolean;
}

export const QUICK_SCAN_RULES_VERSION = '0.4.0-qs2';

export const QUICK_SCAN_RULE_LENSES: readonly QuickScanRuleLens[] = [
  'lens1_spatial_optics',
  'lens2_temporal_pacing_wear',
  'lens3_props_inventory',
  'lens4_acoustics_voice',
  'lens5_blocks_grammar',
  'brief',
] as const;

export const QUICK_SCAN_RULE_SCOPES: readonly QuickScanRuleScope[] = [
  'document',
  'macro_state',
  'sub_state',
] as const;

export const QUICK_SCAN_RULE_PREDICATES: readonly QuickScanRulePredicate[] = [
  'all',
  'continuous',
  'oner',
  'montage',
  'has_opening',
  'has_intent',
  'has_aesthetic',
  'has_dialogue',
  'has_foley',
  'has_action_or_prop',
  'has_action',
  'has_brief_text',
  'has_brief_media',
  'sub_is_action',
  'sub_is_camera',
  'sub_is_foley',
  'sub_is_dialogue',
  'sub_is_action_or_prop',
] as const;

const VALID_QUICK_SCAN_LENSES = new Set<string>(QUICK_SCAN_RULE_LENSES);
const VALID_QUICK_SCAN_SCOPES = new Set<string>(QUICK_SCAN_RULE_SCOPES);
const VALID_QUICK_SCAN_PREDICATES = new Set<string>(QUICK_SCAN_RULE_PREDICATES);

export interface KnowledgeSkillCatalogEntry {
  id: string;
  name: string;
  category: KnowledgeSkillCategory;
  triggerHint: string;
  file: string;
}

export interface BundledKnowledgeSkill extends KnowledgeSkillCatalogEntry {
  body: string;
}

const RAW_SKILL_FILES = import.meta.glob<string>('./skills/*.md', {
  query: '?raw',
  eager: true,
  import: 'default',
});

export function normalizeMarkdownContent(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
}

/**
 * Pure resolver that binds skill catalog manifest entries to raw .md file contents.
 * Accepts Vite import.meta.glob keys (e.g. "./skills/draft_craft.md"), "./draft_craft.md",
 * or bare filenames.
 */
export function resolveSkillCatalog(
  manifest: readonly KnowledgeSkillCatalogEntry[],
  rawFiles: Readonly<Record<string, string>>
): BundledKnowledgeSkill[] {
  const seenIds = new Set<string>();

  return manifest.map((entry) => {
    const id = entry.id.trim();
    if (id.length === 0) {
      throw new Error('Bundled knowledge skill entry is missing a non-empty "id".');
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate bundled knowledge skill id "${id}" in skills/catalog.json.`);
    }
    seenIds.add(id);

    const normalizedFile = entry.file.replace(/^\.\//, '');
    const raw =
      rawFiles[`./skills/${normalizedFile}`] ??
      rawFiles[`./${normalizedFile}`] ??
      rawFiles[entry.file] ??
      rawFiles[normalizedFile];

    if (typeof raw !== 'string') {
      throw new Error(
        `Missing bundled knowledge skill markdown file "${entry.file}" referenced by "${id}" in skills/catalog.json.`
      );
    }

    return {
      id,
      name: entry.name.trim() || id,
      category: entry.category,
      triggerHint: entry.triggerHint.trim(),
      file: normalizedFile,
      body: normalizeMarkdownContent(raw),
    };
  });
}

export const FOUNDATIONAL_CRAFT_MD: string = normalizeMarkdownContent(foundationalCraftRaw);

export const KNOWLEDGE_SKILL_MANIFEST: readonly KnowledgeSkillCatalogEntry[] =
  skillCatalogManifest as KnowledgeSkillCatalogEntry[];

export const BUNDLED_KNOWLEDGE_SKILLS: readonly BundledKnowledgeSkill[] = resolveSkillCatalog(
  KNOWLEDGE_SKILL_MANIFEST,
  RAW_SKILL_FILES
);

/**
 * Pure validator and normalizer for the declarative Quick Scan rule catalog.
 */
export function resolveQuickScanRuleCatalog(
  manifest: readonly QuickScanRuleDefinition[]
): QuickScanRuleDefinition[] {
  const seenIds = new Set<string>();

  return manifest.map((entry) => {
    const id = entry.id.trim().toLowerCase();
    if (id.length === 0) {
      throw new Error('Quick Scan rule entry is missing a non-empty "id".');
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate Quick Scan rule id "${id}" in quick-scan-rules.json.`);
    }
    seenIds.add(id);

    if (!VALID_QUICK_SCAN_LENSES.has(entry.lens)) {
      throw new Error(`Invalid Quick Scan rule lens "${entry.lens}" for rule "${id}".`);
    }
    if (!VALID_QUICK_SCAN_SCOPES.has(entry.scope)) {
      throw new Error(`Invalid Quick Scan rule scope "${entry.scope}" for rule "${id}".`);
    }

    const predicates = (Array.isArray(entry.when) ? entry.when : ['all']).filter(
      (p): p is QuickScanRulePredicate => VALID_QUICK_SCAN_PREDICATES.has(p)
    );
    const when: QuickScanRulePredicate[] = predicates.length > 0 ? predicates : ['all'];

    const label = entry.label.trim();
    const instructions = entry.instructions.trim();
    const trueDescription = entry.trueDescription.trim();
    const falseDescription = entry.falseDescription.trim();
    if (!label || !instructions || !trueDescription || !falseDescription) {
      throw new Error(`Quick Scan rule "${id}" is missing required text fields.`);
    }

    const escalationHint = entry.escalationHint?.trim();

    return {
      id,
      lens: entry.lens,
      scope: entry.scope,
      label,
      when,
      instructions,
      trueDescription,
      falseDescription,
      ...(escalationHint ? {escalationHint} : {}),
      defaultEnabled: entry.defaultEnabled ?? true,
    };
  });
}

export interface CraftExemplarEntry {
  id: 'forest-pov-horror' | 'interrogation-coverage' | 'heist-montage';
  title: string;
  topology: string;
  content: string;
}

export const BUNDLED_CRAFT_EXEMPLARS: Readonly<
  Record<CraftExemplarEntry['id'], CraftExemplarEntry>
> = {
  'forest-pov-horror': {
    id: 'forest-pov-horror',
    title: 'POV Forest Horror',
    topology: 'POV Handheld Oner',
    content: normalizeMarkdownContent(forestPovHorrorExemplarRaw),
  },
  'interrogation-coverage': {
    id: 'interrogation-coverage',
    title: 'Interrogation Room Coverage',
    topology: 'Multi-Cam Coverage',
    content: normalizeMarkdownContent(interrogationCoverageExemplarRaw),
  },
  'heist-montage': {
    id: 'heist-montage',
    title: '1970s Heist Montage',
    topology: 'Discontinuous Montage',
    content: normalizeMarkdownContent(heistMontageExemplarRaw),
  },
};

export const BUNDLED_QUICK_SCAN_RULES: readonly QuickScanRuleDefinition[] =
  resolveQuickScanRuleCatalog(quickScanRulesManifest as QuickScanRuleDefinition[]);
