import guideCatalogManifest from './catalog.json';

export interface AiGuideSectionCatalogEntry {
  id: string;
  label: string;
  summary: string;
  file: string;
}

export interface BundledAiGuideSection extends AiGuideSectionCatalogEntry {
  body: string;
}

const RAW_GUIDE_FILES = import.meta.glob<string>('./*.md', {
  query: '?raw',
  eager: true,
  import: 'default',
});

export function normalizeGuideMarkdown(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
}

/**
 * Pure resolver that binds catalog.json entries to raw .md guide sections.
 */
export function resolveAiGuideCatalog(
  manifest: readonly AiGuideSectionCatalogEntry[],
  rawFiles: Readonly<Record<string, string>>
): BundledAiGuideSection[] {
  const seenIds = new Set<string>();

  return manifest.map((entry) => {
    const id = entry.id.trim();
    if (id.length === 0) {
      throw new Error('AI Guide catalog entry is missing a non-empty "id".');
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate AI Guide section id "${id}" in data/guide/catalog.json.`);
    }
    seenIds.add(id);

    const normalizedFile = entry.file.replace(/^\.\//, '');
    const raw =
      rawFiles[`./${normalizedFile}`] ??
      rawFiles[entry.file] ??
      rawFiles[normalizedFile];

    if (typeof raw !== 'string') {
      throw new Error(
        `Missing AI Guide markdown file "${entry.file}" referenced by "${id}" in data/guide/catalog.json.`
      );
    }

    return {
      id,
      label: entry.label.trim() || id,
      summary: entry.summary.trim(),
      file: normalizedFile,
      body: normalizeGuideMarkdown(raw),
    };
  });
}

export const AI_GUIDE_MANIFEST: readonly AiGuideSectionCatalogEntry[] =
  guideCatalogManifest as AiGuideSectionCatalogEntry[];

export const BUNDLED_AI_GUIDE_SECTIONS: readonly BundledAiGuideSection[] = resolveAiGuideCatalog(
  AI_GUIDE_MANIFEST,
  RAW_GUIDE_FILES
);
