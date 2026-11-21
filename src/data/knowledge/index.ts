import foundationalCraftRaw from './foundational-craft.md?raw';
import draftWrapperTemplateRaw from './draft-wrapper-template.md?raw';
import skillCatalogManifest from './skills/catalog.json';

export type KnowledgeSkillCategory = 'workflow' | 'module';

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

export const DRAFT_WRAPPER_TEMPLATE_MD: string = normalizeMarkdownContent(draftWrapperTemplateRaw);

export const KNOWLEDGE_SKILL_MANIFEST: readonly KnowledgeSkillCatalogEntry[] =
  skillCatalogManifest as KnowledgeSkillCatalogEntry[];

export const BUNDLED_KNOWLEDGE_SKILLS: readonly BundledKnowledgeSkill[] = resolveSkillCatalog(
  KNOWLEDGE_SKILL_MANIFEST,
  RAW_SKILL_FILES
);
