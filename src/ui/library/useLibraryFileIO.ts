import {
  useCallback,
  useRef,
  type ChangeEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type {LintRuleOverrides} from '../../core/index.ts';
import {UI_LABELS} from '../labels.ts';
import {
  downloadCanonicalTxt,
  downloadJsonEnvelope,
  downloadLibraryBackup,
  downloadTaglessTxt,
  mergeLibraryBackup,
  parseLibraryBackup,
  readAndParseBrowserFile,
  type AuteurLibraryBackup,
} from '../scriptFileIO.ts';
import {createScriptId, scriptLibraryDb, type ScriptRecord} from '../scriptLibraryDb.ts';
import type {ActiveScriptRef} from '../scriptLibraryView.ts';
import {upsertSortedScript} from './useLibraryPersistence.ts';

export interface UseLibraryFileIOOptions {
  sceneTitle: string;
  rawText: string;
  ruleOverrides?: LintRuleOverrides;
  activeScriptRef: RefObject<ActiveScriptRef>;
  rawTextRef: RefObject<string>;
  sceneTitleRef: RefObject<string>;
  customScriptsRef: RefObject<ScriptRecord[]>;
  setCustomScripts: Dispatch<SetStateAction<ScriptRecord[]>>;
  persistCurrentCustomIfDirty: () => Promise<ScriptRecord | null>;
  activateCustomScript: (record: ScriptRecord, options?: {switchToLive?: boolean}) => void;
  onToast: (message: string) => void;
}

export interface UseLibraryFileIOResult {
  importFileInputRef: RefObject<HTMLInputElement | null>;
  restoreBackupInputRef: RefObject<HTMLInputElement | null>;
  handleExportScriptTxt: (record: ScriptRecord) => Promise<void>;
  handleBulkExportScripts: (records: readonly ScriptRecord[]) => Promise<void>;
  handleDownloadCanonical: () => void;
  handleDownloadTagless: () => void;
  handleDownloadJsonEnvelope: () => void;
  handleBackupAll: () => Promise<void>;
  handleTriggerImportFile: () => void;
  handleTriggerRestoreBackup: () => void;
  handleImportFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRestoreBackupChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

/**
 * Manages single-script downloads (.txt, tagless, JSON envelope), single-file import,
 * full-library JSON backup export, and smart non-destructive merge restore.
 */
export function useLibraryFileIO({
  sceneTitle,
  rawText,
  ruleOverrides,
  activeScriptRef,
  rawTextRef,
  sceneTitleRef,
  customScriptsRef,
  setCustomScripts,
  persistCurrentCustomIfDirty,
  activateCustomScript,
  onToast,
}: UseLibraryFileIOOptions): UseLibraryFileIOResult {
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const restoreBackupInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportScriptTxt = useCallback(
    async (record: ScriptRecord) => {
      if (activeScriptRef.current.kind === 'custom' && activeScriptRef.current.id === record.id) {
        downloadCanonicalTxt(sceneTitleRef.current, rawTextRef.current);
        return;
      }
      const latest = (await scriptLibraryDb.get(record.id)) ?? record;
      downloadCanonicalTxt(latest.title, latest.rawText);
    },
    [activeScriptRef, sceneTitleRef, rawTextRef]
  );

  const handleBulkExportScripts = useCallback(
    async (records: readonly ScriptRecord[]) => {
      if (records.length === 0) return;
      await persistCurrentCustomIfDirty();
      const ids = new Set(records.map((r) => r.id));
      const latestAll = await scriptLibraryDb.list();
      const toExport = latestAll.filter((r) => ids.has(r.id));
      if (toExport.length === 0) return;
      downloadLibraryBackup(toExport, {
        activeScriptId:
          activeScriptRef.current.kind === 'custom' && ids.has(activeScriptRef.current.id)
            ? activeScriptRef.current.id
            : null,
      });
      onToast(UI_LABELS.toasts.exportedSelectedScripts(toExport.length));
    },
    [persistCurrentCustomIfDirty, activeScriptRef, onToast]
  );

  const handleDownloadCanonical = useCallback(() => {
    downloadCanonicalTxt(sceneTitle, rawText);
  }, [sceneTitle, rawText]);

  const handleDownloadTagless = useCallback(() => {
    downloadTaglessTxt(sceneTitle, rawText);
  }, [sceneTitle, rawText]);

  const handleDownloadJsonEnvelope = useCallback(() => {
    downloadJsonEnvelope(sceneTitle, rawText, ruleOverrides);
  }, [sceneTitle, rawText, ruleOverrides]);

  const applyLibraryBackupRestore = useCallback(
    async (backup: AuteurLibraryBackup) => {
      await persistCurrentCustomIfDirty();
      const existing = await scriptLibraryDb.list();
      const mergeResult = mergeLibraryBackup(existing, backup.scripts);
      if (mergeResult.recordsToWrite.length > 0) {
        await scriptLibraryDb.bulkPut(mergeResult.recordsToWrite);
      }
      setCustomScripts(mergeResult.merged);
      customScriptsRef.current = mergeResult.merged;
      onToast(
        UI_LABELS.toasts.backupRestored(
          mergeResult.added.length,
          mergeResult.forked.length,
          mergeResult.skipped.length
        )
      );
    },
    [persistCurrentCustomIfDirty, setCustomScripts, customScriptsRef, onToast]
  );

  const handleBackupAll = useCallback(async () => {
    await persistCurrentCustomIfDirty();
    const latestRecords = await scriptLibraryDb.list();
    setCustomScripts(latestRecords);
    customScriptsRef.current = latestRecords;

    if (latestRecords.length === 0) {
      onToast(UI_LABELS.toasts.backupEmpty);
      return;
    }

    downloadLibraryBackup(latestRecords, {
      activeScriptId: activeScriptRef.current.id,
    });
    onToast(UI_LABELS.toasts.backupExported(latestRecords.length));
  }, [persistCurrentCustomIfDirty, setCustomScripts, customScriptsRef, activeScriptRef, onToast]);

  const handleTriggerImportFile = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  const handleTriggerRestoreBackup = useCallback(() => {
    restoreBackupInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        const result = await readAndParseBrowserFile(file);
        if (!result.ok) {
          onToast(result.error);
          return;
        }

        if (result.kind === 'library-backup') {
          await applyLibraryBackupRestore(result.backup);
          return;
        }

        await persistCurrentCustomIfDirty();
        const now = Date.now();
        const importedRecord: ScriptRecord = {
          id: createScriptId('script'),
          title: result.title,
          rawText: result.rawText,
          createdAt: now,
          updatedAt: now,
        };
        const saved = await scriptLibraryDb.put(importedRecord);
        setCustomScripts((prev) => upsertSortedScript(prev, saved));
        activateCustomScript(saved, {switchToLive: true});
        onToast(UI_LABELS.toasts.importedScript(saved.title));
      } catch {
        onToast(UI_LABELS.toasts.fileReadError);
      }
    },
    [
      applyLibraryBackupRestore,
      persistCurrentCustomIfDirty,
      setCustomScripts,
      activateCustomScript,
      onToast,
    ]
  );

  const handleRestoreBackupChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = parseLibraryBackup(text);
        if (!parsed.ok) {
          onToast(parsed.error);
          return;
        }
        await applyLibraryBackupRestore(parsed.backup);
      } catch {
        onToast(UI_LABELS.toasts.fileReadError);
      }
    },
    [applyLibraryBackupRestore, onToast]
  );

  return {
    importFileInputRef,
    restoreBackupInputRef,
    handleExportScriptTxt,
    handleBulkExportScripts,
    handleDownloadCanonical,
    handleDownloadTagless,
    handleDownloadJsonEnvelope,
    handleBackupAll,
    handleTriggerImportFile,
    handleTriggerRestoreBackup,
    handleImportFileChange,
    handleRestoreBackupChange,
  };
}
