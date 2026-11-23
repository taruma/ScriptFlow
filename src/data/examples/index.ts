import catalogManifest from './catalog.json';

export interface ExampleScriptOverride {
  title?: string;
  topology?: string;
  summary?: string;
  category?: string;
  folder?: string | null;
  tags?: string[];
  branchNote?: string | null;
}

export interface ExampleCatalogEntry {
  file: string;
  topology: string;
  summary: string;
  category?: string;
  folder?: string;
  tags?: string[];
  overridesById?: Record<string, ExampleScriptOverride | undefined>;
}

export interface BundledExample {
  id: string;
  title: string;
  topology: string;
  summary: string;
  file: string;
  category?: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  forkedFromId?: string;
  branchNote?: string;
  folder?: string;
  tags?: string[];
}

interface RawExampleScriptRecord {
  id: string;
  title?: string;
  rawText: string;
  createdAt?: number;
  updatedAt?: number;
  forkedFromId?: string;
  branchNote?: string;
  folder?: string;
  tags?: string[];
}

const RAW_EXAMPLE_FILES = import.meta.glob<string>('./*.json', {
  query: '?raw',
  eager: true,
  import: 'default',
});

function normalizeExampleContent(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
}

function normalizeExampleBranchNote(note?: string | null): string | undefined {
  if (typeof note !== 'string') return undefined;
  const cleaned = note.trim().replace(/\s+/g, ' ').slice(0, 160);
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeExampleTags(tags?: readonly string[]): string[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const cleaned = tag.trim().replace(/^#+/, '').toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    normalized.push(cleaned);
  }
  return normalized.length > 0 ? normalized : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractRawScripts(
  fileName: string,
  payload: unknown
): RawExampleScriptRecord[] {
  let parsed: unknown = payload;
  if (typeof payload === 'string') {
    const cleaned = payload.replace(/^\uFEFF/, '').trim();
    if (!cleaned) {
      throw new Error(`Bundled example JSON file "${fileName}" is empty.`);
    }
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Syntax error';
      throw new Error(`Malformed JSON in bundled example "${fileName}": ${detail}`);
    }
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`Bundled example "${fileName}" must contain a JSON object.`);
  }

  let rawList: unknown[];
  if (Array.isArray(parsed.scripts)) {
    rawList = parsed.scripts;
  } else if (typeof parsed.id === 'string' && typeof parsed.rawText === 'string') {
    rawList = [parsed];
  } else {
    throw new Error(
      `Unsupported bundled example payload in "${fileName}". Expected a library backup with "scripts[]" or a script record.`
    );
  }

  if (rawList.length === 0) {
    throw new Error(`Bundled example "${fileName}" contains zero scripts.`);
  }

  return rawList.map((item, idx) => {
    if (!isPlainObject(item) || typeof item.id !== 'string' || typeof item.rawText !== 'string') {
      throw new Error(
        `Invalid script entry at index ${idx} in bundled example "${fileName}".`
      );
    }
    return {
      id: item.id,
      title: typeof item.title === 'string' ? item.title : undefined,
      rawText: item.rawText,
      createdAt:
        typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
          ? item.createdAt
          : undefined,
      updatedAt:
        typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
          ? item.updatedAt
          : undefined,
      forkedFromId: typeof item.forkedFromId === 'string' ? item.forkedFromId : undefined,
      branchNote: typeof item.branchNote === 'string' ? item.branchNote : undefined,
      folder: typeof item.folder === 'string' ? item.folder : undefined,
      tags: Array.isArray(item.tags)
        ? item.tags.filter((t): t is string => typeof t === 'string')
        : undefined,
    };
  });
}

/**
 * Pure resolver that binds catalog manifest entries to verbatim .json example files,
 * preserving literal script contents and lineage pointers while merging display metadata.
 * Accepts Vite import.meta.glob keys (e.g. "./scriptflow_the-grand-continental.json") or bare filenames.
 */
export function resolveExampleCatalog(
  manifest: readonly ExampleCatalogEntry[],
  rawFiles: Readonly<Record<string, unknown>>
): BundledExample[] {
  const seenIds = new Set<string>();
  const resolved: BundledExample[] = [];

  for (const entry of manifest) {
    const normalizedFile = entry.file.replace(/^\.\//, '');
    const raw =
      rawFiles[`./${normalizedFile}`] ??
      rawFiles[entry.file] ??
      rawFiles[normalizedFile];

    if (raw === undefined) {
      throw new Error(
        `Missing bundled example JSON file "${entry.file}" referenced in catalog.json.`
      );
    }

    const scripts = extractRawScripts(normalizedFile, raw);
    // Order chronologically (roots / earliest-created first) so multi-part series list Part 1 -> Part N.
    const orderedScripts = [...scripts].sort(
      (a, b) =>
        (a.createdAt ?? 0) - (b.createdAt ?? 0) ||
        (a.title ?? '').localeCompare(b.title ?? '') ||
        a.id.localeCompare(b.id)
    );

    for (const rawScript of orderedScripts) {
      const id = rawScript.id.trim();
      if (id.length === 0) {
        throw new Error(`Bundled example "${normalizedFile}" contains a script with an empty "id".`);
      }
      if (seenIds.has(id)) {
        throw new Error(`Duplicate bundled example id "${id}" in "${normalizedFile}".`);
      }
      seenIds.add(id);

      const override = entry.overridesById?.[id];
      const title = (override?.title ?? rawScript.title ?? '').trim() || 'Untitled Example';
      const topology = (override?.topology ?? entry.topology).trim();
      const summary = (override?.summary ?? entry.summary).trim();
      const category = (override?.category ?? entry.category)?.trim() || undefined;

      const rawFolder =
        override?.folder !== undefined
          ? override.folder
          : entry.folder !== undefined
            ? entry.folder
            : rawScript.folder;
      const folder = typeof rawFolder === 'string' && rawFolder.trim().length > 0 ? rawFolder.trim() : undefined;

      const tags = normalizeExampleTags(override?.tags ?? entry.tags ?? rawScript.tags);
      const branchNote = normalizeExampleBranchNote(
        override?.branchNote !== undefined ? override.branchNote : rawScript.branchNote
      );
      const forkedFromId = rawScript.forkedFromId?.trim() || undefined;
      const createdAt = rawScript.createdAt ?? 0;
      const updatedAt = rawScript.updatedAt ?? createdAt;

      resolved.push({
        id,
        title,
        topology,
        summary,
        file: normalizedFile,
        ...(category ? {category} : {}),
        content: normalizeExampleContent(rawScript.rawText),
        createdAt,
        updatedAt,
        ...(forkedFromId ? {forkedFromId} : {}),
        ...(branchNote ? {branchNote} : {}),
        ...(folder ? {folder} : {}),
        ...(tags ? {tags} : {}),
      });
    }
  }

  return resolved;
}

export const EXAMPLE_CATALOG_MANIFEST: readonly ExampleCatalogEntry[] =
  catalogManifest as unknown as ExampleCatalogEntry[];

export const BUNDLED_EXAMPLES: readonly BundledExample[] = resolveExampleCatalog(
  EXAMPLE_CATALOG_MANIFEST,
  RAW_EXAMPLE_FILES
);

export function getBundledExampleById(id: string): BundledExample | null {
  return BUNDLED_EXAMPLES.find((example) => example.id === id) ?? null;
}
