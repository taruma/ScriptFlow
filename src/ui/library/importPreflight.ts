import {
  computeSnapshotHash,
  exportPlainText,
  extractMetadata,
  inferSceneTopologyFromDocument,
  lintDocument,
  parseAuteurScript,
  type LintDiagnostic,
  type LintRuleOverrides,
  type SceneTopology,
  type ValidationIssue,
} from '../../core/index.ts';
import type {BundledExample} from '../../data/examples/index.ts';
import {
  mergeLibraryBackup,
  parseImportedFile,
  type AuteurLibraryBackup,
  type LibraryMergeResult,
  type MergeLibraryBackupOptions,
  type ParsedImportSourceFormat,
} from '../scriptLibraryCodec.ts';
import {createScriptId, sanitizeScriptRecord, sortScriptRecords, type ScriptRecord} from '../scriptLibraryDb.ts';
import {createCopyTitle, type ActiveScriptRef} from '../scriptLibraryView.ts';

export type ImportFitStatus = 'ready' | 'warnings' | 'unstructured';

export type ImportCompatibilityNoteKind =
  | 'unstructured_text'
  | 'tagless_export'
  | 'legacy_syntax'
  | 'preamble_text';

export interface ImportCompatibilityNote {
  kind: ImportCompatibilityNoteKind;
  message: string;
}

export interface ContentDuplicateMatch {
  kind: 'custom' | 'example';
  id: string;
  title: string;
  isActive: boolean;
}

export interface SingleScriptValidationSummary {
  snapshotHash: string;
  canonicalText: string;
  fitStatus: ImportFitStatus;
  sceneTopology: SceneTopology;
  stagingBlockCount: number;
  stagingHeaders: string[];
  macroStateCount: number;
  subStateCount: number;
  castCount: number;
  tokenCount: number;
  errorCount: number;
  warningCount: number;
  diagnostics: LintDiagnostic[];
  compatibilityNotes: ImportCompatibilityNote[];
}

export interface SingleScriptImportPreflight {
  kind: 'single-script';
  filename: string;
  sourceFormat: Exclude<ParsedImportSourceFormat, 'library-backup'>;
  suggestedTitle: string;
  disambiguatedTitle: string;
  validation: SingleScriptValidationSummary;
  contentDuplicates: ContentDuplicateMatch[];
  hasTitleCollision: boolean;
}

export type BackupScriptImportStatus = 'new' | 'modified_conflict' | 'duplicate_content';

export interface AnalyzedBackupScriptItem {
  record: ScriptRecord;
  status: BackupScriptImportStatus;
  defaultSelected: boolean;
  validation: SingleScriptValidationSummary;
  disambiguatedTitle: string;
  matchedExisting?: {
    kind: 'custom';
    id: string;
    title: string;
    sameId: boolean;
  };
}

export interface LibraryBackupImportPreflight {
  kind: 'library-backup';
  filename: string;
  backup: AuteurLibraryBackup;
  items: AnalyzedBackupScriptItem[];
  newCount: number;
  modifiedCount: number;
  duplicateContentCount: number;
}

export interface ErrorImportPreflight {
  kind: 'error';
  filename: string;
  error: string;
  issues?: ValidationIssue[];
}

export type ImportPreflightResult =
  | SingleScriptImportPreflight
  | LibraryBackupImportPreflight
  | ErrorImportPreflight;

export interface InspectImportedFileOptions {
  customScripts: readonly ScriptRecord[];
  examples?: readonly BundledExample[];
  activeScript?: ActiveScriptRef;
  ruleOverrides?: LintRuleOverrides;
}

const LEGACY_TAG_REGEX = /\[(?:AUDIO|DIAL)\b[^\]]*\]/i;
const LEGACY_QUOTED_DIALOGUE_REGEX =
  /\b(?:says|whispers|shouts|mutters|asks|replies|yells|calls)\b(?:\s*\([^)\n]*\))?\s*"[^"\n]{2,}"/i;
const BRACKETED_SUBSTATE_TAG_REGEX = /^\[[A-Z0-9 _-]+\]/i;

/**
 * Evaluates a canonical Auteur Script against the v0.4.0 parser, metadata extractor,
 * deterministic Script Supervisor linter, and legacy/tagless compatibility heuristics.
 */
export function evaluateScriptFit(
  rawText: string,
  filename?: string,
  ruleOverrides?: LintRuleOverrides
): SingleScriptValidationSummary {
  const canonicalText = exportPlainText(rawText);
  const snapshotHash = computeSnapshotHash(canonicalText);
  const doc = parseAuteurScript(canonicalText);
  const metadata = extractMetadata(doc);
  const diagnostics = lintDocument(doc, metadata, ruleOverrides);

  const stagingHeaders = doc.stagingBlocks.map((b) => b.name);
  const macroStateCount = doc.execution?.beats.length ?? 0;
  const subStateCount = doc.execution
    ? doc.execution.beats.reduce((sum, beat) => sum + beat.subStates.length, 0)
    : 0;
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const compatibilityNotes: ImportCompatibilityNote[] = [];
  const isUnstructured = doc.stagingBlocks.length === 0 && macroStateCount === 0;

  if (isUnstructured) {
    compatibilityNotes.push({
      kind: 'unstructured_text',
      message:
        'No canonical v0.4.0 Macro-Blocks ([INTENT], [EXECUTION], etc.) were found. This file will load as plain preamble text until structured.',
    });
  } else if (doc.preambleLines.some((line) => line.trim().length > 0)) {
    compatibilityNotes.push({
      kind: 'preamble_text',
      message:
        'Text appears before the first [MACRO-BLOCK] header and will be kept as unparsed preamble.',
    });
  }

  const filenameLooksTagless = Boolean(filename && /[-_.]tagless\.(txt|md|markdown)$/i.test(filename));
  const hasChainedExecution = Boolean(
    doc.execution && doc.execution.beats.some((beat) => beat.subStates.length >= 2)
  );
  const hasAnySubStateTag = Boolean(
    doc.execution &&
      doc.execution.beats.some((beat) =>
        beat.subStates.some((sub) => BRACKETED_SUBSTATE_TAG_REGEX.test(sub.raw.trim()))
      )
  );

  if (filenameLooksTagless || (hasChainedExecution && !hasAnySubStateTag)) {
    compatibilityNotes.push({
      kind: 'tagless_export',
      message:
        'Tagless export detected: inline [CAM] / [ACT] / [BLOCK] Sub-State tags are stripped in this file.',
    });
  }

  const hasLegacyTag = LEGACY_TAG_REGEX.test(canonicalText);
  const hasLegacyQuotes = Boolean(
    doc.execution && doc.execution.beats.some((beat) => LEGACY_QUOTED_DIALOGUE_REGEX.test(beat.raw))
  );
  if (hasLegacyTag || hasLegacyQuotes) {
    compatibilityNotes.push({
      kind: 'legacy_syntax',
      message:
        'Legacy syntax detected ([AUDIO]/[DIAL] tags or quoted dialogue). Canonical v0.4.0 uses <foley> and {dialogue}.',
    });
  }

  const fitStatus: ImportFitStatus = isUnstructured
    ? 'unstructured'
    : errorCount > 0 || warningCount > 0 || compatibilityNotes.length > 0
      ? 'warnings'
      : 'ready';

  return {
    snapshotHash,
    canonicalText,
    fitStatus,
    sceneTopology: inferSceneTopologyFromDocument(doc, metadata),
    stagingBlockCount: doc.stagingBlocks.length,
    stagingHeaders,
    macroStateCount,
    subStateCount,
    castCount: metadata.characters.length,
    tokenCount: metadata.aestheticTokens.length,
    errorCount,
    warningCount,
    diagnostics,
    compatibilityNotes,
  };
}

function formatBackupForkTitle(originalTitle: string, existingTitlesLower: ReadonlySet<string>): string {
  const base = originalTitle.trim() || 'Untitled Scene';
  const candidate = `${base} (Imported)`;
  if (!existingTitlesLower.has(candidate.toLowerCase())) {
    return candidate;
  }
  let suffix = 2;
  while (existingTitlesLower.has(`${base} (Imported ${suffix})`.toLowerCase())) {
    suffix += 1;
  }
  return `${base} (Imported ${suffix})`;
}

/**
 * Parses and pre-flights any imported file (.txt, .md, .json script, or library backup)
 * without writing to IndexedDB. Evaluates v0.4.0 structural fit, deterministic lint,
 * and content-hash duplicates against the user's current library.
 */
export function inspectImportedFile(
  filename: string,
  content: string,
  options: InspectImportedFileOptions
): ImportPreflightResult {
  const parsed = parseImportedFile(filename, content);
  if (!parsed.ok) {
    return {
      kind: 'error',
      filename,
      error: parsed.error,
      ...(parsed.issues ? {issues: parsed.issues} : {}),
    };
  }

  const existingCustomTitles = new Set(options.customScripts.map((s) => s.title));
  const existingCustomTitlesLower = new Set(
    options.customScripts.map((s) => s.title.trim().toLowerCase())
  );

  if (parsed.kind === 'single-script') {
    const validation = evaluateScriptFit(parsed.rawText, filename, options.ruleOverrides);
    const contentDuplicates: ContentDuplicateMatch[] = [];

    for (const record of options.customScripts) {
      if (computeSnapshotHash(exportPlainText(record.rawText)) === validation.snapshotHash) {
        contentDuplicates.push({
          kind: 'custom',
          id: record.id,
          title: record.title,
          isActive:
            options.activeScript?.kind === 'custom' && options.activeScript.id === record.id,
        });
      }
    }

    for (const example of options.examples ?? []) {
      if (computeSnapshotHash(exportPlainText(example.content)) === validation.snapshotHash) {
        contentDuplicates.push({
          kind: 'example',
          id: example.id,
          title: example.title,
          isActive:
            options.activeScript?.kind === 'example' && options.activeScript.id === example.id,
        });
      }
    }

    const suggestedTitle = parsed.title;
    const hasTitleCollision = existingCustomTitlesLower.has(suggestedTitle.trim().toLowerCase());
    const disambiguatedTitle = hasTitleCollision
      ? createCopyTitle(suggestedTitle, existingCustomTitles, 'Imported')
      : suggestedTitle;

    return {
      kind: 'single-script',
      filename,
      sourceFormat: parsed.sourceFormat,
      suggestedTitle,
      disambiguatedTitle,
      validation,
      contentDuplicates,
      hasTitleCollision,
    };
  }

  const customById = new Map<string, ScriptRecord>();
  const customByHash = new Map<string, ScriptRecord>();
  for (const record of options.customScripts) {
    customById.set(record.id, record);
    const hash = computeSnapshotHash(exportPlainText(record.rawText));
    if (!customByHash.has(hash)) {
      customByHash.set(hash, record);
    }
  }

  const seenIncomingHashes = new Map<string, ScriptRecord>();
  const reservedTitlesLower = new Set(existingCustomTitlesLower);
  const items: AnalyzedBackupScriptItem[] = [];
  let newCount = 0;
  let modifiedCount = 0;
  let duplicateContentCount = 0;

  for (const rawRecord of parsed.backup.scripts) {
    const record = sanitizeScriptRecord(rawRecord);
    if (!record.id) continue;

    const validation = evaluateScriptFit(record.rawText, undefined, options.ruleOverrides);
    const idMatch = customById.get(record.id);
    const hashMatch = customByHash.get(validation.snapshotHash) ?? seenIncomingHashes.get(validation.snapshotHash);

    let status: BackupScriptImportStatus;
    let defaultSelected: boolean;
    let matchedExisting: AnalyzedBackupScriptItem['matchedExisting'];
    let disambiguatedTitle = record.title;

    if (hashMatch) {
      status = 'duplicate_content';
      defaultSelected = false;
      duplicateContentCount += 1;
      matchedExisting = {
        kind: 'custom',
        id: hashMatch.id,
        title: hashMatch.title,
        sameId: idMatch?.id === hashMatch.id,
      };
      if (reservedTitlesLower.has(record.title.trim().toLowerCase())) {
        disambiguatedTitle = formatBackupForkTitle(record.title, reservedTitlesLower);
      }
    } else if (idMatch) {
      status = 'modified_conflict';
      defaultSelected = true;
      modifiedCount += 1;
      matchedExisting = {
        kind: 'custom',
        id: idMatch.id,
        title: idMatch.title,
        sameId: true,
      };
      const sameTitle = idMatch.title.trim().toLowerCase() === record.title.trim().toLowerCase();
      if (sameTitle || reservedTitlesLower.has(record.title.trim().toLowerCase())) {
        disambiguatedTitle = formatBackupForkTitle(record.title, reservedTitlesLower);
      }
      reservedTitlesLower.add(disambiguatedTitle.trim().toLowerCase());
    } else {
      status = 'new';
      defaultSelected = true;
      newCount += 1;
      reservedTitlesLower.add(record.title.trim().toLowerCase());
    }

    if (!seenIncomingHashes.has(validation.snapshotHash)) {
      seenIncomingHashes.set(validation.snapshotHash, record);
    }

    items.push({
      record,
      status,
      defaultSelected,
      validation,
      disambiguatedTitle,
      ...(matchedExisting ? {matchedExisting} : {}),
    });
  }

  return {
    kind: 'library-backup',
    filename,
    backup: parsed.backup,
    items,
    newCount,
    modifiedCount,
    duplicateContentCount,
  };
}

/**
 * Applies only the user-selected backup items into the existing library non-destructively.
 * Explicitly selected duplicate-content items are forked cleanly with fresh IDs and
 * disambiguated titles so existing local scripts are never overwritten or deleted.
 */
export function applySelectedLibraryBackup(
  existing: readonly ScriptRecord[],
  items: readonly AnalyzedBackupScriptItem[],
  selectedIds: ReadonlySet<string>,
  options: MergeLibraryBackupOptions = {}
): LibraryMergeResult {
  const chosenItems = items.filter((item) => selectedIds.has(item.record.id));
  const nonDuplicateRecords = chosenItems
    .filter((item) => item.status !== 'duplicate_content')
    .map((item) => item.record);

  const baseMerge = mergeLibraryBackup(existing, nonDuplicateRecords, options);

  const explicitlySelectedDuplicates = chosenItems.filter(
    (item) => item.status === 'duplicate_content'
  );
  if (explicitlySelectedDuplicates.length === 0) {
    return baseMerge;
  }

  const usedIds = new Set(baseMerge.merged.map((r) => r.id));
  const existingTitlesLower = new Set(baseMerge.merged.map((r) => r.title.trim().toLowerCase()));
  const extraForked: LibraryMergeResult['forked'] = [];

  for (const item of explicitlySelectedDuplicates) {
    let freshId = options.generateId
      ? options.generateId(item.record, usedIds).trim()
      : createScriptId('script');
    while (!freshId || usedIds.has(freshId)) {
      freshId = createScriptId('script');
    }
    usedIds.add(freshId);

    const nextTitle = existingTitlesLower.has(item.record.title.trim().toLowerCase())
      ? (options.formatForkTitle ?? formatBackupForkTitle)(item.record.title, existingTitlesLower)
      : item.record.title;
    existingTitlesLower.add(nextTitle.trim().toLowerCase());

    const forkedRecord = sanitizeScriptRecord({
      ...item.record,
      id: freshId,
      title: nextTitle,
      forkedFromId: item.matchedExisting?.id ?? item.record.id,
    });

    extraForked.push({
      originalId: item.record.id,
      forkedRecord,
    });
  }

  const recordsToWrite = [
    ...baseMerge.recordsToWrite,
    ...extraForked.map((entry) => entry.forkedRecord),
  ];
  const merged = sortScriptRecords([
    ...baseMerge.merged,
    ...extraForked.map((entry) => entry.forkedRecord),
  ]);

  return {
    merged,
    recordsToWrite,
    added: baseMerge.added,
    skipped: baseMerge.skipped,
    forked: [...baseMerge.forked, ...extraForked],
  };
}
