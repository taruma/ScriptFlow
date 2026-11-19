import catalogManifest from './catalog.json';

export interface ExampleCatalogEntry {
  id: string;
  title: string;
  topology: string;
  summary: string;
  file: string;
  category?: string;
}

export interface BundledExample extends ExampleCatalogEntry {
  content: string;
}

const RAW_EXAMPLE_FILES = import.meta.glob<string>('./*.txt', {
  query: '?raw',
  eager: true,
  import: 'default',
});

function normalizeExampleContent(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
}

/**
 * Pure resolver that binds catalog manifest entries to raw .txt file contents.
 * Accepts Vite import.meta.glob keys (e.g. "./interrogation-coverage.txt") or bare filenames.
 */
export function resolveExampleCatalog(
  manifest: readonly ExampleCatalogEntry[],
  rawFiles: Readonly<Record<string, string>>
): BundledExample[] {
  const seenIds = new Set<string>();

  return manifest.map((entry) => {
    const id = entry.id.trim();
    if (id.length === 0) {
      throw new Error('Bundled example catalog entry is missing a non-empty "id".');
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate bundled example id "${id}" in catalog.json.`);
    }
    seenIds.add(id);

    const normalizedFile = entry.file.replace(/^\.\//, '');
    const raw =
      rawFiles[`./${normalizedFile}`] ??
      rawFiles[entry.file] ??
      rawFiles[normalizedFile];

    if (typeof raw !== 'string') {
      throw new Error(
        `Missing bundled example script file "${entry.file}" referenced by "${id}" in catalog.json.`
      );
    }

    return {
      id,
      title: entry.title,
      topology: entry.topology,
      summary: entry.summary,
      file: normalizedFile,
      ...(entry.category ? {category: entry.category} : {}),
      content: normalizeExampleContent(raw),
    };
  });
}

export const EXAMPLE_CATALOG_MANIFEST: readonly ExampleCatalogEntry[] =
  catalogManifest as ExampleCatalogEntry[];

export const BUNDLED_EXAMPLES: readonly BundledExample[] = resolveExampleCatalog(
  EXAMPLE_CATALOG_MANIFEST,
  RAW_EXAMPLE_FILES
);

export function getBundledExampleById(id: string): BundledExample | null {
  return BUNDLED_EXAMPLES.find((example) => example.id === id) ?? null;
}
