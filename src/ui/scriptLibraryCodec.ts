import {z} from 'zod';
import {
  AUTEUR_IR_SCHEMA_VERSION,
  AuteurEnvelopeSchema,
  AuteurScriptIRSchema,
  compileAuteurDraft,
  exportPlainText,
  exportTagless,
  fromAuteurIR,
  normalizeLineEndings,
  toAuteurEnvelope,
  type AuteurEnvelope,
  type LintRuleOverrides,
  type ValidationIssue,
} from '../core/index.ts';
import {
  createScriptId,
  sanitizeScriptRecord,
  sortScriptRecords,
  type ScriptRecord,
} from './scriptLibraryDb.ts';

export const AUTEUR_LIBRARY_BACKUP_FORMAT = 'auteur-script-library-backup' as const;
export const AUTEUR_LIBRARY_BACKUP_VERSION = 1 as const;

const BackupScriptRecordSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string(),
  rawText: z.string(),
  createdAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
  forkedFromId: z.string().trim().min(1).optional(),
  branchNote: z.string().optional(),
  pinned: z.boolean().optional(),
  folder: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const AuteurLibraryBackupSchema = z.object({
  format: z.literal(AUTEUR_LIBRARY_BACKUP_FORMAT),
  backupVersion: z.literal(AUTEUR_LIBRARY_BACKUP_VERSION),
  schemaVersion: z.string().trim().min(1).default(AUTEUR_IR_SCHEMA_VERSION),
  exportedAt: z.string().trim().min(1),
  activeScriptId: z.string().trim().min(1).nullable().optional(),
  scripts: z.array(BackupScriptRecordSchema),
});

export type AuteurLibraryBackup = z.infer<typeof AuteurLibraryBackupSchema>;

export interface BuiltFileExport {
  filename: string;
  mimeType: string;
  content: string;
}

export interface BuiltJsonEnvelopeExport extends BuiltFileExport {
  envelope: AuteurEnvelope;
}

export type ParsedImportSourceFormat =
  | 'plain-text'
  | 'auteur-envelope'
  | 'auteur-ir'
  | 'auteur-draft'
  | 'library-backup';

export type ParsedImportResult =
  | {
      ok: true;
      kind: 'single-script';
      sourceFormat: 'plain-text' | 'auteur-envelope' | 'auteur-ir' | 'auteur-draft';
      title: string;
      rawText: string;
      warnings: string[];
    }
  | {
      ok: true;
      kind: 'library-backup';
      sourceFormat: 'library-backup';
      backup: AuteurLibraryBackup;
    }
  | {
      ok: false;
      error: string;
      issues?: ValidationIssue[];
    };

export type ParseLibraryBackupResult =
  | {
      ok: true;
      backup: AuteurLibraryBackup;
    }
  | {
      ok: false;
      error: string;
      issues?: ValidationIssue[];
    };

export interface MergeLibraryBackupOptions {
  /** Clock function used if needed for metadata normalization (defaults to Date.now). */
  now?: () => number;
  /** Deterministic or custom fresh ID generator for ID conflicts with differing content. */
  generateId?: (conflictingRecord: ScriptRecord, existingIds: ReadonlySet<string>) => string;
  /** Optional title formatter when a forked conflict shares the exact same title as the existing script. */
  formatForkTitle?: (originalTitle: string, existingTitles: ReadonlySet<string>) => string;
}

export interface ForkedMergeEntry {
  originalId: string;
  forkedRecord: ScriptRecord;
}

export interface LibraryMergeResult {
  /** Complete resulting library (all existing records preserved + added + forked), sorted by updatedAt desc. */
  merged: ScriptRecord[];
  /** New records to persist (added + forked); existing records are never overwritten or deleted. */
  recordsToWrite: ScriptRecord[];
  /** Incoming scripts added verbatim because their ID was not present in the existing library. */
  added: ScriptRecord[];
  /** Incoming scripts skipped because an existing record with the same ID matched both title and canonical content. */
  skipped: ScriptRecord[];
  /** Incoming scripts forked under a fresh ID because their ID collided with differing content or title. */
  forked: ForkedMergeEntry[];
}

function formatZodIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Converts a scene title into a clean, portable, ASCII-safe filename stem.
 */
export function slugifyFilename(title: string, fallback = 'untitled-scene'): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');

  return slug.length > 0 ? slug : fallback;
}

/**
 * Derives a clean human-readable scene title from an imported filename.
 */
export function deriveTitleFromFilename(filename: string, fallback = 'Untitled Scene'): string {
  const baseName = filename.split(/[\\/]/).pop()?.trim() ?? '';
  if (!baseName) return fallback;

  const withoutExt = baseName
    .replace(/\.(auteur|envelope)\.json$/i, '')
    .replace(/[-_.]tagless\.txt$/i, '')
    .replace(/\.(txt|md|markdown|json)$/i, '')
    .replace(/\.[^.]+$/, '');

  const spaced = withoutExt.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!spaced) return fallback;

  // Title-case purely lowercase slug filenames while preserving user-provided mixed casing.
  if (spaced === spaced.toLowerCase()) {
    return spaced.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  }

  return spaced;
}

export function buildCanonicalTxtExport(title: string, rawText: string): BuiltFileExport {
  return {
    filename: `${slugifyFilename(title)}.txt`,
    mimeType: 'text/plain;charset=utf-8',
    content: exportPlainText(rawText),
  };
}

export function buildTaglessTxtExport(title: string, rawText: string): BuiltFileExport {
  return {
    filename: `${slugifyFilename(title)}-tagless.txt`,
    mimeType: 'text/plain;charset=utf-8',
    content: exportTagless(rawText),
  };
}

export function buildJsonEnvelopeExport(
  title: string,
  rawText: string,
  ruleOverrides?: LintRuleOverrides
): BuiltJsonEnvelopeExport {
  const envelope = toAuteurEnvelope(rawText, ruleOverrides);
  return {
    filename: `${slugifyFilename(title)}.json`,
    mimeType: 'application/json;charset=utf-8',
    content: JSON.stringify(envelope, null, 2),
    envelope,
  };
}

export function createLibraryBackup(
  scripts: readonly ScriptRecord[],
  options: {activeScriptId?: string | null; exportedAt?: string} = {}
): AuteurLibraryBackup {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const normalizedScripts = sortScriptRecords(scripts.map(sanitizeScriptRecord));

  return {
    format: AUTEUR_LIBRARY_BACKUP_FORMAT,
    backupVersion: AUTEUR_LIBRARY_BACKUP_VERSION,
    schemaVersion: AUTEUR_IR_SCHEMA_VERSION,
    exportedAt,
    ...(options.activeScriptId !== undefined ? {activeScriptId: options.activeScriptId} : {}),
    scripts: normalizedScripts,
  };
}

export function buildLibraryBackupExport(
  scripts: readonly ScriptRecord[],
  options: {activeScriptId?: string | null; exportedAt?: string} = {}
): BuiltFileExport & {backup: AuteurLibraryBackup} {
  const backup = createLibraryBackup(scripts, options);
  const dateStamp = backup.exportedAt.slice(0, 10).replace(/[^0-9-]/g, '') || 'backup';
  return {
    filename: `auteur-library-backup-${dateStamp}.json`,
    mimeType: 'application/json;charset=utf-8',
    content: JSON.stringify(backup, null, 2),
    backup,
  };
}

export function parseLibraryBackup(input: unknown): ParseLibraryBackupResult {
  let candidate: unknown = input;
  if (typeof input === 'string') {
    const cleaned = input.replace(/^\uFEFF/, '').trim();
    if (!cleaned) {
      return {ok: false, error: 'Backup JSON is empty.'};
    }
    try {
      candidate = JSON.parse(cleaned);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Syntax error';
      return {ok: false, error: `Malformed JSON backup: ${detail}`};
    }
  }

  const parsed = AuteurLibraryBackupSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid Auteur Script library backup payload.',
      issues: formatZodIssues(parsed.error.issues),
    };
  }

  return {
    ok: true,
    backup: {
      ...parsed.data,
      scripts: parsed.data.scripts.map(sanitizeScriptRecord),
    },
  };
}

function defaultFormatForkTitle(
  originalTitle: string,
  existingTitles: ReadonlySet<string>
): string {
  const base = originalTitle.trim() || 'Untitled Scene';
  const candidate = `${base} (Imported)`;
  if (!existingTitles.has(candidate.toLowerCase())) {
    return candidate;
  }
  let suffix = 2;
  while (existingTitles.has(`${base} (Imported ${suffix})`.toLowerCase())) {
    suffix += 1;
  }
  return `${base} (Imported ${suffix})`;
}

function allocateUniqueId(
  conflictingRecord: ScriptRecord,
  usedIds: ReadonlySet<string>,
  generateId?: (conflictingRecord: ScriptRecord, existingIds: ReadonlySet<string>) => string
): string {
  if (generateId) {
    const proposed = generateId(conflictingRecord, usedIds).trim();
    if (proposed.length > 0 && !usedIds.has(proposed)) {
      return proposed;
    }
  }
  let candidate = createScriptId('script');
  while (usedIds.has(candidate)) {
    candidate = createScriptId('script');
  }
  return candidate;
}

/**
 * Pure non-destructive merge of incoming backup scripts into an existing script library:
 * - Never deletes or overwrites any existing script record.
 * - Adds missing scripts verbatim when their ID does not exist locally.
 * - Skips exact unchanged duplicates (same ID, same trimmed title, and same canonical content).
 * - Forks conflicting IDs with differing content or title under a fresh unique ID with forkedFromId set.
 */
export function mergeLibraryBackup(
  existing: readonly ScriptRecord[],
  incoming: readonly ScriptRecord[],
  options: MergeLibraryBackupOptions = {}
): LibraryMergeResult {
  const existingSanitized = existing.map(sanitizeScriptRecord);
  const byId = new Map<string, ScriptRecord>();
  const usedIds = new Set<string>();
  const existingTitlesLower = new Set<string>();

  for (const record of existingSanitized) {
    byId.set(record.id, record);
    usedIds.add(record.id);
    existingTitlesLower.add(record.title.trim().toLowerCase());
  }

  const added: ScriptRecord[] = [];
  const skipped: ScriptRecord[] = [];
  const forked: ForkedMergeEntry[] = [];
  const formatForkTitle = options.formatForkTitle ?? defaultFormatForkTitle;

  for (const rawIncoming of incoming) {
    const candidate = sanitizeScriptRecord(rawIncoming);
    if (!candidate.id) continue;

    const match = byId.get(candidate.id);
    if (!match) {
      byId.set(candidate.id, candidate);
      usedIds.add(candidate.id);
      existingTitlesLower.add(candidate.title.trim().toLowerCase());
      added.push(candidate);
      continue;
    }

    const sameTitle = match.title.trim() === candidate.title.trim();
    const sameContent = exportPlainText(match.rawText) === exportPlainText(candidate.rawText);

    if (sameTitle && sameContent) {
      skipped.push(candidate);
      continue;
    }

    const freshId = allocateUniqueId(candidate, usedIds, options.generateId);
    const nextTitle = sameTitle
      ? formatForkTitle(candidate.title, existingTitlesLower)
      : candidate.title;

    const forkedRecord: ScriptRecord = sanitizeScriptRecord({
      ...candidate,
      id: freshId,
      title: nextTitle,
      forkedFromId: candidate.id,
    });

    byId.set(forkedRecord.id, forkedRecord);
    usedIds.add(forkedRecord.id);
    existingTitlesLower.add(forkedRecord.title.trim().toLowerCase());
    forked.push({
      originalId: candidate.id,
      forkedRecord,
    });
  }

  const recordsToWrite = [...added, ...forked.map((entry) => entry.forkedRecord)];
  const merged = sortScriptRecords(Array.from(byId.values()));

  return {
    merged,
    recordsToWrite,
    added,
    skipped,
    forked,
  };
}

function getFileExtension(filename: string): string {
  const baseName = filename.split(/[\\/]/).pop() ?? '';
  const dotIndex = baseName.lastIndexOf('.');
  return dotIndex >= 0 ? baseName.slice(dotIndex).toLowerCase() : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pure single-file import parser supporting:
 * - Plain text / Markdown (.txt, .md, .markdown): canonical plain text with title derived from filename.
 * - JSON (.json): intelligently detects full-library Backup, AuteurEnvelope, AuteurScriptIR, or AuteurScriptDraft.
 */
export function parseImportedFile(filename: string, content: string): ParsedImportResult {
  const cleaned = content.replace(/^\uFEFF/, '');
  if (cleaned.trim().length === 0) {
    return {ok: false, error: 'Imported file is empty.'};
  }

  const ext = getFileExtension(filename);
  const title = deriveTitleFromFilename(filename);

  const isExplicitText = ext === '.txt' || ext === '.md' || ext === '.markdown';
  const isExplicitJson = ext === '.json';
  const looksLikeJson = !isExplicitText && (isExplicitJson || cleaned.trimStart().startsWith('{'));

  if (!looksLikeJson) {
    return {
      ok: true,
      kind: 'single-script',
      sourceFormat: 'plain-text',
      title,
      rawText: normalizeLineEndings(cleaned).replace(/\n+$/, ''),
      warnings: [],
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Syntax error';
    return {ok: false, error: `Malformed JSON file: ${detail}`};
  }

  if (!isPlainObject(parsedJson)) {
    return {
      ok: false,
      error: 'Unsupported JSON payload. Expected a JSON object.',
    };
  }

  // 1. Full-library backup envelope
  if (
    parsedJson.format === AUTEUR_LIBRARY_BACKUP_FORMAT ||
    ('backupVersion' in parsedJson && 'scripts' in parsedJson)
  ) {
    const backupResult = parseLibraryBackup(parsedJson);
    if (!backupResult.ok) {
      return {
        ok: false,
        error: backupResult.error,
        ...(backupResult.issues ? {issues: backupResult.issues} : {}),
      };
    }
    return {
      ok: true,
      kind: 'library-backup',
      sourceFormat: 'library-backup',
      backup: backupResult.backup,
    };
  }

  // 2. AuteurEnvelope (snapshotHash + document + derived)
  if ('document' in parsedJson && ('snapshotHash' in parsedJson || 'derived' in parsedJson)) {
    const envelopeResult = AuteurEnvelopeSchema.safeParse(parsedJson);
    if (envelopeResult.success) {
      return {
        ok: true,
        kind: 'single-script',
        sourceFormat: 'auteur-envelope',
        title,
        rawText: fromAuteurIR(envelopeResult.data.document),
        warnings: [],
      };
    }
    return {
      ok: false,
      error: 'Invalid Auteur Envelope JSON file.',
      issues: formatZodIssues(envelopeResult.error.issues),
    };
  }

  // 3. Addressed AuteurScriptIR
  const irResult = AuteurScriptIRSchema.safeParse(parsedJson);
  if (irResult.success) {
    return {
      ok: true,
      kind: 'single-script',
      sourceFormat: 'auteur-ir',
      title,
      rawText: fromAuteurIR(irResult.data),
      warnings: [],
    };
  }

  // 4. ID-less or partial AuteurScriptDraft
  if ('stagingMacroBlocks' in parsedJson || 'executionMacroBlock' in parsedJson) {
    const draftResult = compileAuteurDraft(parsedJson);
    if (draftResult.ok) {
      return {
        ok: true,
        kind: 'single-script',
        sourceFormat: 'auteur-draft',
        title,
        rawText: draftResult.rawText,
        warnings: [],
      };
    }
    return {
      ok: false,
      error: 'Invalid Auteur Script IR or Draft JSON file.',
      issues: draftResult.errors,
    };
  }

  return {
    ok: false,
    error:
      'Unsupported JSON format. Expected an Auteur Envelope, Script IR, Script Draft, or Library Backup.',
  };
}
