import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react';
import {
  breakHistoryCoalescing,
  canRedoDocument,
  canUndoDocument,
  commitDocumentHistory,
  createDocumentHistory,
  exportPlainText,
  redoDocumentHistory,
  undoDocumentHistory,
  type DocumentHistoryState,
  type HistoryCommitOptions,
  type LintRuleOverrides,
} from '../core/index.ts';
import type {ConfirmDialogRequest} from '../components/ConfirmDialog.tsx';
import {
  BUNDLED_EXAMPLES,
  getBundledExampleById,
  type BundledExample,
} from '../data/examples/index.ts';
import {BLANK_SCRIPT_TEMPLATE, DEFAULT_PRESET} from '../data/presets.ts';
import {APP_META, UI_LABELS} from './labels.ts';
import {
  downloadCanonicalTxt,
  downloadJsonEnvelope,
  downloadLibraryBackup,
  downloadTaglessTxt,
  mergeLibraryBackup,
  parseLibraryBackup,
  readAndParseBrowserFile,
  type AuteurLibraryBackup,
} from './scriptFileIO.ts';
import {
  createScriptId,
  scriptLibraryDb,
  sortScriptRecords,
  type ScriptRecord,
} from './scriptLibraryDb.ts';
import {createCopyTitle, type ActiveScriptRef} from './scriptLibraryView.ts';
import {
  mirrorActiveScriptToLocalStorage,
  readActiveScriptId,
  readSavedScript,
  readSavedTitle,
} from './scriptStorage.ts';

const AUTOSAVE_DEBOUNCE_MS = 350;

interface InitialEditorState {
  activeScript: ActiveScriptRef;
  rawText: string;
  title: string;
}

function resolveInitialEditorState(): InitialEditorState {
  const savedActiveId = readActiveScriptId();
  if (savedActiveId) {
    const matchedExample = getBundledExampleById(savedActiveId);
    if (matchedExample) {
      return {
        activeScript: {kind: 'example', id: matchedExample.id},
        rawText: matchedExample.content,
        title: matchedExample.title,
      };
    }

    const savedScript = readSavedScript();
    if (savedScript) {
      return {
        activeScript: {kind: 'custom', id: savedActiveId},
        rawText: savedScript,
        title: readSavedTitle() ?? APP_META.untitledScene,
      };
    }
  }

  const legacyScript = readSavedScript();
  if (legacyScript) {
    const legacyTitle = readSavedTitle();
    const normalizedLegacy = exportPlainText(legacyScript);
    const matchedExample = BUNDLED_EXAMPLES.find(
      (example) =>
        exportPlainText(example.content) === normalizedLegacy &&
        (!legacyTitle || legacyTitle.trim() === example.title.trim())
    );
    if (matchedExample) {
      return {
        activeScript: {kind: 'example', id: matchedExample.id},
        rawText: matchedExample.content,
        title: matchedExample.title,
      };
    }
    return {
      activeScript: {kind: 'example', id: DEFAULT_PRESET.id},
      rawText: legacyScript,
      title: legacyTitle ?? APP_META.untitledScene,
    };
  }

  return {
    activeScript: {kind: 'example', id: DEFAULT_PRESET.id},
    rawText: DEFAULT_PRESET.content,
    title: DEFAULT_PRESET.title,
  };
}

function upsertSortedScript(
  list: readonly ScriptRecord[],
  record: ScriptRecord
): ScriptRecord[] {
  const withoutTarget = list.filter((item) => item.id !== record.id);
  return sortScriptRecords([record, ...withoutTarget]);
}

export interface UseScriptLibraryOptions {
  ruleOverrides?: LintRuleOverrides;
  onSwitchToLive: () => void;
  onRequestConfirm: (request: ConfirmDialogRequest) => void;
  onToast: (message: string) => void;
}

export interface UseScriptLibraryResult {
  history: DocumentHistoryState;
  rawText: string;
  canUndo: boolean;
  canRedo: boolean;
  activeScript: ActiveScriptRef;
  isReadOnly: boolean;
  sceneTitle: string;
  customScripts: ScriptRecord[];
  importFileInputRef: RefObject<HTMLInputElement | null>;
  restoreBackupInputRef: RefObject<HTMLInputElement | null>;
  commitRawText: (
    updater: string | ((prev: string) => string),
    options?: Omit<HistoryCommitOptions, 'timestamp'>
  ) => void;
  handleTitleChange: (nextTitle: string) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  breakCoalescing: () => void;
  handleOpenCustomScript: (record: ScriptRecord) => Promise<void>;
  handleOpenExample: (example: BundledExample) => Promise<void>;
  handleForkExample: (example: BundledExample) => Promise<void>;
  handleForkCurrentExample: () => void;
  handleNewBlank: () => Promise<void>;
  handleDuplicateScript: (record: ScriptRecord) => Promise<void>;
  handleRenameScript: (record: ScriptRecord, nextTitle: string) => Promise<void>;
  handleExportScriptTxt: (record: ScriptRecord) => Promise<void>;
  handleRequestDeleteScript: (record: ScriptRecord) => void;
  handleDownloadCanonical: () => void;
  handleDownloadTagless: () => void;
  handleDownloadJsonEnvelope: () => void;
  handleBackupAll: () => Promise<void>;
  handleTriggerImportFile: () => void;
  handleTriggerRestoreBackup: () => void;
  handleImportFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRestoreBackupChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  flushPendingSave: () => Promise<ScriptRecord | null>;
}

/**
 * Cohesive Script Library & File I/O lifecycle hook:
 * - One-time legacy localStorage migration & IndexedDB hydration
 * - Debounced autosave with synchronous flush on visibilitychange (hidden), pagehide, switch, backup, and unmount
 * - Immediate localStorage mirroring so ErrorBoundary crash recovery stays intact
 * - Document-level Undo/Redo history with clean reset on script switch, fork, import, or blank creation
 * - Read-only guard for bundled reference examples + explicit Fork to Edit
 * - Single-script downloads, smart import (.txt/.md/.json), and non-destructive full-library backup/restore
 */
export function useScriptLibrary({
  ruleOverrides,
  onSwitchToLive,
  onRequestConfirm,
  onToast,
}: UseScriptLibraryOptions): UseScriptLibraryResult {
  const initialStateRef = useRef<InitialEditorState | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = resolveInitialEditorState();
  }
  const initial = initialStateRef.current;

  const [history, setHistory] = useState<DocumentHistoryState>(() =>
    createDocumentHistory(initial.rawText)
  );
  const rawText = history.present;
  const canUndo = canUndoDocument(history);
  const canRedo = canRedoDocument(history);

  const [activeScript, setActiveScript] = useState<ActiveScriptRef>(initial.activeScript);
  const [sceneTitle, setSceneTitle] = useState<string>(initial.title);
  const [customScripts, setCustomScripts] = useState<ScriptRecord[]>([]);

  const isReadOnly = activeScript.kind === 'example';

  // Refs for synchronous access inside debounced autosave, flush events, and read-only guards
  const activeScriptRef = useRef<ActiveScriptRef>(activeScript);
  const rawTextRef = useRef<string>(rawText);
  const sceneTitleRef = useRef<string>(sceneTitle);
  const customScriptsRef = useRef<ScriptRecord[]>(customScripts);
  const isLibraryHydratedRef = useRef<boolean>(false);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedSnapshotRef = useRef<{id: string; rawText: string; title: string} | null>({
    id: initial.activeScript.id,
    rawText: initial.rawText,
    title: initial.title,
  });

  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const restoreBackupInputRef = useRef<HTMLInputElement | null>(null);

  activeScriptRef.current = activeScript;
  rawTextRef.current = rawText;
  sceneTitleRef.current = sceneTitle;
  customScriptsRef.current = customScripts;

  const activateCustomScript = useCallback(
    (record: ScriptRecord, options?: {switchToLive?: boolean}) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const nextRef: ActiveScriptRef = {kind: 'custom', id: record.id};
      activeScriptRef.current = nextRef;
      rawTextRef.current = record.rawText;
      sceneTitleRef.current = record.title;
      lastSavedSnapshotRef.current = {
        id: record.id,
        rawText: record.rawText,
        title: record.title,
      };
      setActiveScript(nextRef);
      setHistory(createDocumentHistory(record.rawText));
      setSceneTitle(record.title);
      if (options?.switchToLive) {
        onSwitchToLive();
      }
      mirrorActiveScriptToLocalStorage(record.id, record.rawText, record.title);
    },
    [onSwitchToLive]
  );

  const activateExample = useCallback(
    (example: BundledExample, options?: {switchToLive?: boolean}) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const nextRef: ActiveScriptRef = {kind: 'example', id: example.id};
      activeScriptRef.current = nextRef;
      rawTextRef.current = example.content;
      sceneTitleRef.current = example.title;
      lastSavedSnapshotRef.current = {
        id: example.id,
        rawText: example.content,
        title: example.title,
      };
      setActiveScript(nextRef);
      setHistory(createDocumentHistory(example.content));
      setSceneTitle(example.title);
      if (options?.switchToLive) {
        onSwitchToLive();
      }
      mirrorActiveScriptToLocalStorage(example.id, example.content, example.title);
    },
    [onSwitchToLive]
  );

  const persistCurrentCustomIfDirty = useCallback(async (): Promise<ScriptRecord | null> => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (!isLibraryHydratedRef.current) return null;
    const currentRef = activeScriptRef.current;
    if (currentRef.kind !== 'custom') return null;

    const currentRaw = rawTextRef.current;
    const currentTitle = sceneTitleRef.current;
    const last = lastSavedSnapshotRef.current;
    if (
      last &&
      last.id === currentRef.id &&
      last.rawText === currentRaw &&
      last.title === currentTitle
    ) {
      return null;
    }

    const existing = customScriptsRef.current.find((item) => item.id === currentRef.id);
    const now = Date.now();
    const recordToSave: ScriptRecord = {
      id: currentRef.id,
      title: currentTitle.trim() || APP_META.untitledScene,
      rawText: currentRaw,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(existing?.forkedFromId ? {forkedFromId: existing.forkedFromId} : {}),
    };

    lastSavedSnapshotRef.current = {
      id: currentRef.id,
      rawText: currentRaw,
      title: currentTitle,
    };

    try {
      const saved = await scriptLibraryDb.put(recordToSave);
      setCustomScripts((prev) => upsertSortedScript(prev, saved));
      return saved;
    } catch {
      return null;
    }
  }, []);

  // Mount lifecycle: migrate legacy localStorage once, hydrate IndexedDB library, open active script
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const migration = await scriptLibraryDb.migrateFromLegacyLocalStorage({
        defaultTitle: APP_META.untitledScene,
      });
      const loadedRecords = await scriptLibraryDb.list();
      if (cancelled) return;

      setCustomScripts(loadedRecords);
      customScriptsRef.current = loadedRecords;

      const targetId = migration.activeScriptId ?? readActiveScriptId();
      const matchedCustom = targetId
        ? loadedRecords.find((record) => record.id === targetId)
        : undefined;

      if (matchedCustom) {
        activateCustomScript(matchedCustom);
      } else {
        const matchedExample =
          (targetId ? getBundledExampleById(targetId) : undefined) ?? DEFAULT_PRESET;
        activateExample(matchedExample);
      }

      isLibraryHydratedRef.current = true;
    };

    void hydrate();

    return () => {
      cancelled = true;
      void persistCurrentCustomIfDirty();
    };
  }, [activateCustomScript, activateExample, persistCurrentCustomIfDirty]);

  // Harden autosave flush on tab hide / reload so refreshing within 350ms of typing never loses edits
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void persistCurrentCustomIfDirty();
      }
    };
    const handlePageHide = () => {
      void persistCurrentCustomIfDirty();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [persistCurrentCustomIfDirty]);

  // Mirror active script to localStorage immediately (ErrorBoundary safety) & debounce IndexedDB puts for custom scripts
  useEffect(() => {
    if (!isLibraryHydratedRef.current) return;

    mirrorActiveScriptToLocalStorage(activeScript.id, rawText, sceneTitle);

    if (activeScript.kind !== 'custom') return;

    const last = lastSavedSnapshotRef.current;
    if (
      last &&
      last.id === activeScript.id &&
      last.rawText === rawText &&
      last.title === sceneTitle
    ) {
      return;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistCurrentCustomIfDirty();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [activeScript, rawText, sceneTitle, persistCurrentCustomIfDirty]);

  // History & Title Mutations (read-only guarded)
  const commitRawText = useCallback(
    (
      updater: string | ((prev: string) => string),
      options: Omit<HistoryCommitOptions, 'timestamp'> = {mode: 'checkpoint'}
    ) => {
      if (activeScriptRef.current.kind === 'example') return;
      setHistory((prev) => {
        const nextText = typeof updater === 'function' ? updater(prev.present) : updater;
        return commitDocumentHistory(prev, nextText, {
          ...options,
          timestamp: options.mode === 'coalesce' ? Date.now() : null,
        });
      });
    },
    []
  );

  const handleTitleChange = useCallback((nextTitle: string) => {
    if (activeScriptRef.current.kind === 'example') return;
    setSceneTitle(nextTitle);
  }, []);

  const handleUndo = useCallback(() => {
    if (activeScriptRef.current.kind === 'example') return;
    setHistory((prev) => undoDocumentHistory(prev));
  }, []);

  const handleRedo = useCallback(() => {
    if (activeScriptRef.current.kind === 'example') return;
    setHistory((prev) => redoDocumentHistory(prev));
  }, []);

  const breakCoalescing = useCallback(() => {
    setHistory((prev) => breakHistoryCoalescing(prev));
  }, []);

  // Script Library CRUD Actions
  const handleOpenCustomScript = useCallback(
    async (record: ScriptRecord) => {
      await persistCurrentCustomIfDirty();
      const latest = (await scriptLibraryDb.get(record.id)) ?? record;
      activateCustomScript(latest);
    },
    [persistCurrentCustomIfDirty, activateCustomScript]
  );

  const handleOpenExample = useCallback(
    async (example: BundledExample) => {
      await persistCurrentCustomIfDirty();
      activateExample(example);
    },
    [persistCurrentCustomIfDirty, activateExample]
  );

  const handleForkExample = useCallback(
    async (example: BundledExample) => {
      await persistCurrentCustomIfDirty();
      const existingTitles = new Set(customScriptsRef.current.map((s) => s.title));
      const title = createCopyTitle(example.title, existingTitles, 'Fork');
      const now = Date.now();
      const forked: ScriptRecord = {
        id: createScriptId('script'),
        title,
        rawText: example.content,
        createdAt: now,
        updatedAt: now,
        forkedFromId: example.id,
      };
      const saved = await scriptLibraryDb.put(forked);
      setCustomScripts((prev) => upsertSortedScript(prev, saved));
      activateCustomScript(saved);
      onToast(UI_LABELS.toasts.forkedExample(saved.title));
    },
    [persistCurrentCustomIfDirty, activateCustomScript, onToast]
  );

  const handleForkCurrentExample = useCallback(() => {
    const current = activeScriptRef.current;
    if (current.kind !== 'example') return;
    const example = getBundledExampleById(current.id) ?? DEFAULT_PRESET;
    void handleForkExample(example);
  }, [handleForkExample]);

  const handleNewBlank = useCallback(async () => {
    await persistCurrentCustomIfDirty();
    const existingTitles = new Set(customScriptsRef.current.map((s) => s.title));
    const title = createCopyTitle(APP_META.untitledScene, existingTitles, 'Copy');
    const now = Date.now();
    const fresh: ScriptRecord = {
      id: createScriptId('script'),
      title,
      rawText: BLANK_SCRIPT_TEMPLATE,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await scriptLibraryDb.put(fresh);
    setCustomScripts((prev) => upsertSortedScript(prev, saved));
    activateCustomScript(saved, {switchToLive: true});
    onToast(UI_LABELS.toasts.createdBlankScript);
  }, [persistCurrentCustomIfDirty, activateCustomScript, onToast]);

  const handleDuplicateScript = useCallback(
    async (record: ScriptRecord) => {
      await persistCurrentCustomIfDirty();
      const source = (await scriptLibraryDb.get(record.id)) ?? record;
      const existingTitles = new Set(customScriptsRef.current.map((s) => s.title));
      const title = createCopyTitle(source.title, existingTitles, 'Copy');
      const now = Date.now();
      const duplicated: ScriptRecord = {
        id: createScriptId('script'),
        title,
        rawText: source.rawText,
        createdAt: now,
        updatedAt: now,
        forkedFromId: source.id,
      };
      const saved = await scriptLibraryDb.put(duplicated);
      setCustomScripts((prev) => upsertSortedScript(prev, saved));
      onToast(UI_LABELS.toasts.duplicatedScript(saved.title));
    },
    [persistCurrentCustomIfDirty, onToast]
  );

  const handleRenameScript = useCallback(
    async (record: ScriptRecord, nextTitle: string) => {
      const cleaned = nextTitle.trim();
      if (!cleaned || cleaned === record.title) return;

      const isRenamingActive =
        activeScriptRef.current.kind === 'custom' && activeScriptRef.current.id === record.id;

      if (isRenamingActive && saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const currentRaw = isRenamingActive
        ? rawTextRef.current
        : ((await scriptLibraryDb.get(record.id))?.rawText ?? record.rawText);

      const updated: ScriptRecord = {
        ...record,
        title: cleaned,
        rawText: currentRaw,
        updatedAt: Date.now(),
      };
      const saved = await scriptLibraryDb.put(updated);
      setCustomScripts((prev) => upsertSortedScript(prev, saved));

      if (isRenamingActive) {
        sceneTitleRef.current = saved.title;
        lastSavedSnapshotRef.current = {
          id: saved.id,
          rawText: saved.rawText,
          title: saved.title,
        };
        setSceneTitle(saved.title);
        mirrorActiveScriptToLocalStorage(saved.id, saved.rawText, saved.title);
      }

      onToast(UI_LABELS.toasts.renamedScript(saved.title));
    },
    [onToast]
  );

  const handleExportScriptTxt = useCallback(async (record: ScriptRecord) => {
    if (activeScriptRef.current.kind === 'custom' && activeScriptRef.current.id === record.id) {
      downloadCanonicalTxt(sceneTitleRef.current, rawTextRef.current);
      return;
    }
    const latest = (await scriptLibraryDb.get(record.id)) ?? record;
    downloadCanonicalTxt(latest.title, latest.rawText);
  }, []);

  const handleRequestDeleteScript = useCallback(
    (record: ScriptRecord) => {
      onRequestConfirm({
        title: UI_LABELS.confirm.deleteScriptTitle(record.title),
        description: UI_LABELS.confirm.deleteScriptDesc,
        confirmLabel: UI_LABELS.confirm.delete,
        cancelLabel: UI_LABELS.confirm.cancel,
        tone: 'danger',
        onConfirm: () => {
          void (async () => {
            const wasActive =
              activeScriptRef.current.kind === 'custom' &&
              activeScriptRef.current.id === record.id;

            if (wasActive && saveTimerRef.current !== null) {
              window.clearTimeout(saveTimerRef.current);
              saveTimerRef.current = null;
            }

            await scriptLibraryDb.delete(record.id);
            const remaining = customScriptsRef.current.filter((item) => item.id !== record.id);
            setCustomScripts(remaining);
            customScriptsRef.current = remaining;

            if (wasActive) {
              if (remaining.length > 0) {
                activateCustomScript(remaining[0]);
              } else {
                activateExample(DEFAULT_PRESET);
              }
            }

            onToast(UI_LABELS.toasts.deletedScript(record.title));
          })();
        },
      });
    },
    [onRequestConfirm, activateCustomScript, activateExample, onToast]
  );

  // File I/O: Single-script downloads, Import, Full-Library Backup & Smart Non-Destructive Restore
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
    [persistCurrentCustomIfDirty, onToast]
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
  }, [persistCurrentCustomIfDirty, onToast]);

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
    [applyLibraryBackupRestore, persistCurrentCustomIfDirty, activateCustomScript, onToast]
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
    history,
    rawText,
    canUndo,
    canRedo,
    activeScript,
    isReadOnly,
    sceneTitle,
    customScripts,
    importFileInputRef,
    restoreBackupInputRef,
    commitRawText,
    handleTitleChange,
    handleUndo,
    handleRedo,
    breakCoalescing,
    handleOpenCustomScript,
    handleOpenExample,
    handleForkExample,
    handleForkCurrentExample,
    handleNewBlank,
    handleDuplicateScript,
    handleRenameScript,
    handleExportScriptTxt,
    handleRequestDeleteScript,
    handleDownloadCanonical,
    handleDownloadTagless,
    handleDownloadJsonEnvelope,
    handleBackupAll,
    handleTriggerImportFile,
    handleTriggerRestoreBackup,
    handleImportFileChange,
    handleRestoreBackupChange,
    flushPendingSave: persistCurrentCustomIfDirty,
  };
}
