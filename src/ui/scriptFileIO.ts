import {
  buildCanonicalTxtExport,
  buildJsonEnvelopeExport,
  buildLibraryBackupExport,
  buildTaglessTxtExport,
  parseImportedFile,
  type ParsedImportResult,
} from './scriptLibraryCodec.ts';
import type {ScriptRecord} from './scriptLibraryDb.ts';

export {
  AUTEUR_LIBRARY_BACKUP_FORMAT,
  AUTEUR_LIBRARY_BACKUP_VERSION,
  AuteurLibraryBackupSchema,
  buildCanonicalTxtExport,
  buildJsonEnvelopeExport,
  buildLibraryBackupExport,
  buildTaglessTxtExport,
  createLibraryBackup,
  deriveTitleFromFilename,
  mergeLibraryBackup,
  parseImportedFile,
  parseLibraryBackup,
  slugifyFilename,
  type AuteurLibraryBackup,
  type BuiltFileExport,
  type BuiltJsonEnvelopeExport,
  type ForkedMergeEntry,
  type LibraryMergeResult,
  type MergeLibraryBackupOptions,
  type ParsedImportResult,
  type ParsedImportSourceFormat,
  type ParseLibraryBackupResult,
} from './scriptLibraryCodec.ts';

/**
 * Triggers a client-side browser file download using a temporary object URL.
 * Returns false gracefully in non-DOM environments.
 */
export function triggerTextFileDownload(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8'
): boolean {
  if (
    typeof document === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false;
  }

  const blob = new Blob([content], {type: mimeType});
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return true;
  } catch {
    return false;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function downloadCanonicalTxt(title: string, rawText: string): boolean {
  const file = buildCanonicalTxtExport(title, rawText);
  return triggerTextFileDownload(file.filename, file.content, file.mimeType);
}

export function downloadTaglessTxt(title: string, rawText: string): boolean {
  const file = buildTaglessTxtExport(title, rawText);
  return triggerTextFileDownload(file.filename, file.content, file.mimeType);
}

export function downloadJsonEnvelope(title: string, rawText: string): boolean {
  const file = buildJsonEnvelopeExport(title, rawText);
  return triggerTextFileDownload(file.filename, file.content, file.mimeType);
}

export function downloadLibraryBackup(
  scripts: readonly ScriptRecord[],
  options?: {activeScriptId?: string | null; exportedAt?: string}
): boolean {
  const file = buildLibraryBackupExport(scripts, options);
  return triggerTextFileDownload(file.filename, file.content, file.mimeType);
}

/**
 * Reads a browser File as UTF-8 text and parses it via parseImportedFile.
 */
export async function readAndParseBrowserFile(file: File): Promise<ParsedImportResult> {
  const content = await file.text();
  return parseImportedFile(file.name, content);
}
