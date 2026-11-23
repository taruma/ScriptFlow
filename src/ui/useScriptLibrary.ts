import {
  useCallback,
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
  redoDocumentHistory,
  undoDocumentHistory,
  type DocumentHistoryState,
  type HistoryCommitOptions,
  type LintRuleOverrides,
} from '../core/index.ts';
import type {ConfirmDialogRequest} from '../components/ConfirmDialog.tsx';
import {getBundledExampleById, type BundledExample} from '../data/examples/index.ts';
import {BLANK_SCRIPT_TEMPLATE, DEFAULT_PRESET} from '../data/presets.ts';
import {APP_META, UI_LABELS} from './labels.ts';
import {createScriptId, scriptLibraryDb, type ScriptRecord} from './scriptLibraryDb.ts';
import {
  buildDuplicatedScriptRecord,
  createCopyTitle,
  repairLineageOnDelete,
  type ActiveScriptRef,
} from './scriptLibraryView.ts';
import type {ScriptSnapshot, SnapshotTrigger} from './scriptSnapshots.ts';
import type {AnalyzedBackupScriptItem} from './scriptFileIO.ts';
import {mirrorActiveScriptToLocalStorage} from './scriptStorage.ts';
import {
  useLibraryFileIO,
  type SingleScriptImportCommitOptions,
} from './library/useLibraryFileIO.ts';
import {
  reconcileHydratedScript,
  resolveInitialEditorState,
  upsertSortedScript,
  useLibraryPersistence,
  type HydratedScriptResolution,
  type HydrationMirrorState,
  type InitialEditorState,
  type PersistCurrentCustomOverride,
  type ReconcileHydratedScriptOptions,
} from './library/useLibraryPersistence.ts';
import {useLibrarySnapshots} from './library/useLibrarySnapshots.ts';

export {reconcileHydratedScript};
export type {
  HydratedScriptResolution,
  HydrationMirrorState,
  PersistCurrentCustomOverride,
  ReconcileHydratedScriptOptions,
};

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
  handleForkCurrentExampleWithContent: (
    nextRawText: string,
    options?: {
      title?: string;
      toastMessage?: string;
      snapshotMeta?: {
        trigger: 'ai_draft' | 'ai_patch' | 'ai_fix';
        beforeLabel: string;
        afterLabel: string;
      };
    }
  ) => Promise<boolean>;
  handleCreateSnapshot: (options: {
    trigger: SnapshotTrigger;
    label: string;
    rawText?: string;
    scriptId?: string;
  }) => Promise<ScriptSnapshot | null>;
  handleRestoreSnapshot: (snapshot: ScriptSnapshot) => Promise<boolean>;
  handleForkSnapshotAsNewScript: (snapshot: ScriptSnapshot) => Promise<ScriptRecord | null>;
  handleNewBlank: () => Promise<void>;
  handleDuplicateScript: (
    record: ScriptRecord,
    options?: {title?: string; branchNote?: string; suffix?: string; activate?: boolean}
  ) => Promise<ScriptRecord>;
  handleDuplicateActiveScript: (options?: {
    title?: string;
    branchNote?: string;
    suffix?: string;
  }) => Promise<ScriptRecord | null>;
  handleRenameScript: (record: ScriptRecord, nextTitle: string) => Promise<void>;
  handleTogglePinScript: (record: ScriptRecord) => Promise<void>;
  handleUpdateScriptMetadata: (
    record: ScriptRecord,
    patch: {folder?: string | null; tags?: string[]; branchNote?: string | null}
  ) => Promise<void>;
  handleUpdateActiveBranchNote: (nextBranchNote: string) => Promise<void>;
  handleExportScriptTxt: (record: ScriptRecord) => Promise<void>;
  handleBulkExportScripts: (records: readonly ScriptRecord[]) => Promise<void>;
  handleRequestDeleteScript: (record: ScriptRecord) => void;
  handleRequestBulkDeleteScripts: (
    records: readonly ScriptRecord[],
    onDeleted?: () => void
  ) => void;
  handleRequestClearLibrary: (onCleared?: () => void) => void;
  handleDownloadCanonical: () => void;
  handleDownloadTagless: () => void;
  handleDownloadJsonEnvelope: () => void;
  handleBackupAll: () => Promise<void>;
  handleCommitSingleScriptImport: (options: SingleScriptImportCommitOptions) => Promise<void>;
  handleCommitLibraryBackupImport: (
    items: readonly AnalyzedBackupScriptItem[],
    selectedIds: ReadonlySet<string>
  ) => Promise<void>;
  handleTriggerImportFile: () => void;
  handleTriggerRestoreBackup: () => void;
  handleImportFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRestoreBackupChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  flushPendingSave: (override?: PersistCurrentCustomOverride) => Promise<ScriptRecord | null>;
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

  activeScriptRef.current = activeScript;
  rawTextRef.current = rawText;
  sceneTitleRef.current = sceneTitle;
  customScriptsRef.current = customScripts;

  const {
    activateCustomScript,
    activateExample,
    persistCurrentCustomIfDirty,
    cancelPendingSave,
    markSavedSnapshot,
  } = useLibraryPersistence({
    initial,
    activeScript,
    rawText,
    sceneTitle,
    activeScriptRef,
    rawTextRef,
    sceneTitleRef,
    customScriptsRef,
    setActiveScript,
    setHistory,
    setSceneTitle,
    setCustomScripts,
    onSwitchToLive,
  });

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

  const {
    handleCreateSnapshot,
    handleRestoreSnapshot,
    handleForkSnapshotAsNewScript,
  } = useLibrarySnapshots({
    activeScriptRef,
    rawTextRef,
    sceneTitleRef,
    customScriptsRef,
    setCustomScripts,
    commitRawText,
    persistCurrentCustomIfDirty,
    activateCustomScript,
    onToast,
  });

  const {
    importFileInputRef,
    restoreBackupInputRef,
    handleExportScriptTxt,
    handleBulkExportScripts,
    handleDownloadCanonical,
    handleDownloadTagless,
    handleDownloadJsonEnvelope,
    handleBackupAll,
    handleCommitSingleScriptImport,
    handleCommitLibraryBackupImport,
    handleTriggerImportFile,
    handleTriggerRestoreBackup,
    handleImportFileChange,
    handleRestoreBackupChange,
  } = useLibraryFileIO({
    sceneTitle,
    rawText,
    ruleOverrides,
    activeScriptRef,
    rawTextRef,
    sceneTitleRef,
    customScriptsRef,
    setCustomScripts,
    commitRawText,
    onTitleChange: handleTitleChange,
    onSwitchToLive,
    persistCurrentCustomIfDirty,
    activateCustomScript,
    onToast,
  });

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
      customScriptsRef.current = upsertSortedScript(customScriptsRef.current, saved);
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

  const handleForkCurrentExampleWithContent = useCallback(
    async (
      nextRawText: string,
      options?: {
        title?: string;
        toastMessage?: string;
        snapshotMeta?: {
          trigger: 'ai_draft' | 'ai_patch' | 'ai_fix';
          beforeLabel: string;
          afterLabel: string;
        };
      }
    ): Promise<boolean> => {
      const current = activeScriptRef.current;
      if (current.kind !== 'example') return false;
      await persistCurrentCustomIfDirty();

      const example = getBundledExampleById(current.id) ?? DEFAULT_PRESET;
      const existingTitles = new Set(customScriptsRef.current.map((s) => s.title));
      const requestedTitle = options?.title?.trim();
      const title = requestedTitle
        ? existingTitles.has(requestedTitle)
          ? createCopyTitle(requestedTitle, existingTitles, 'Copy')
          : requestedTitle
        : createCopyTitle(example.title, existingTitles, 'Fork');

      const now = Date.now();
      const forked: ScriptRecord = {
        id: createScriptId('script'),
        title,
        rawText: nextRawText,
        createdAt: now,
        updatedAt: now,
        forkedFromId: example.id,
      };
      const saved = await scriptLibraryDb.put(forked);
      customScriptsRef.current = upsertSortedScript(customScriptsRef.current, saved);
      setCustomScripts((prev) => upsertSortedScript(prev, saved));

      if (options?.snapshotMeta) {
        if (example.content.trim().length > 0 && example.content !== nextRawText) {
          await scriptLibraryDb.saveSnapshot({
            scriptId: saved.id,
            trigger: options.snapshotMeta.trigger,
            label: options.snapshotMeta.beforeLabel,
            rawText: example.content,
            createdAt: now,
          });
        }
        await scriptLibraryDb.saveSnapshot({
          scriptId: saved.id,
          trigger: options.snapshotMeta.trigger,
          label: options.snapshotMeta.afterLabel,
          rawText: nextRawText,
          createdAt: now + 1,
        });
      }

      cancelPendingSave();

      const nextRef: ActiveScriptRef = {kind: 'custom', id: saved.id};
      activeScriptRef.current = nextRef;
      rawTextRef.current = saved.rawText;
      sceneTitleRef.current = saved.title;
      markSavedSnapshot({
        id: saved.id,
        rawText: saved.rawText,
        title: saved.title,
      });

      setActiveScript(nextRef);
      setSceneTitle(saved.title);
      setHistory(() =>
        commitDocumentHistory(createDocumentHistory(example.content), saved.rawText, {
          mode: 'checkpoint',
          timestamp: null,
        })
      );
      mirrorActiveScriptToLocalStorage(saved.id, saved.rawText, saved.title, saved.updatedAt);
      onToast(options?.toastMessage ?? UI_LABELS.toasts.aiForkedAndApplied(saved.title));
      return true;
    },
    [persistCurrentCustomIfDirty, cancelPendingSave, markSavedSnapshot, onToast]
  );

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
    customScriptsRef.current = upsertSortedScript(customScriptsRef.current, saved);
    setCustomScripts((prev) => upsertSortedScript(prev, saved));
    activateCustomScript(saved, {switchToLive: true});
    onToast(UI_LABELS.toasts.createdBlankScript);
  }, [persistCurrentCustomIfDirty, activateCustomScript, onToast]);

  const handleDuplicateScript = useCallback(
    async (
      record: ScriptRecord,
      options?: {title?: string; branchNote?: string; suffix?: string; activate?: boolean}
    ): Promise<ScriptRecord> => {
      await persistCurrentCustomIfDirty();
      const source = (await scriptLibraryDb.get(record.id)) ?? record;
      const existingTitles = new Set(customScriptsRef.current.map((s) => s.title));
      const duplicated = buildDuplicatedScriptRecord({
        id: createScriptId('script'),
        sourceId: source.id,
        sourceTitle: source.title,
        rawText: source.rawText,
        existingTitles,
        now: Date.now(),
        folder: source.folder,
        tags: source.tags,
        branchNote: options?.branchNote,
        explicitTitle: options?.title,
        suffix: options?.suffix ?? 'Branch',
      });
      const saved = await scriptLibraryDb.put(duplicated);
      customScriptsRef.current = upsertSortedScript(customScriptsRef.current, saved);
      setCustomScripts((prev) => upsertSortedScript(prev, saved));
      if (options?.activate) {
        activateCustomScript(saved);
      }
      onToast(UI_LABELS.toasts.branchedScript(saved.title));
      return saved;
    },
    [persistCurrentCustomIfDirty, activateCustomScript, onToast]
  );

  const handleDuplicateActiveScript = useCallback(
    async (options?: {
      title?: string;
      branchNote?: string;
      suffix?: string;
    }): Promise<ScriptRecord | null> => {
      await persistCurrentCustomIfDirty();
      const current = activeScriptRef.current;
      const existingTitles = new Set(customScriptsRef.current.map((s) => s.title));
      const currentCustom =
        current.kind === 'custom'
          ? customScriptsRef.current.find((item) => item.id === current.id)
          : undefined;
      const currentExample =
        current.kind === 'example'
          ? (getBundledExampleById(current.id) ?? DEFAULT_PRESET)
          : undefined;

      const duplicated = buildDuplicatedScriptRecord({
        id: createScriptId('script'),
        sourceId: current.id,
        sourceTitle:
          currentCustom?.title ??
          (sceneTitleRef.current.trim() || currentExample?.title || APP_META.untitledScene),
        rawText:
          current.kind === 'example' ? (currentExample?.content ?? rawTextRef.current) : rawTextRef.current,
        existingTitles,
        now: Date.now(),
        folder: currentCustom?.folder,
        tags: currentCustom?.tags,
        branchNote: options?.branchNote,
        explicitTitle: options?.title,
        suffix: options?.suffix ?? 'Branch',
      });
      const saved = await scriptLibraryDb.put(duplicated);
      customScriptsRef.current = upsertSortedScript(customScriptsRef.current, saved);
      setCustomScripts((prev) => upsertSortedScript(prev, saved));
      activateCustomScript(saved);
      onToast(UI_LABELS.toasts.branchedScript(saved.title));
      return saved;
    },
    [persistCurrentCustomIfDirty, activateCustomScript, onToast]
  );

  const handleRenameScript = useCallback(
    async (record: ScriptRecord, nextTitle: string) => {
      const cleaned = nextTitle.trim();
      if (!cleaned || cleaned === record.title) return;

      const isRenamingActive =
        activeScriptRef.current.kind === 'custom' && activeScriptRef.current.id === record.id;

      if (isRenamingActive) {
        cancelPendingSave();
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
      customScriptsRef.current = upsertSortedScript(customScriptsRef.current, saved);
      setCustomScripts((prev) => upsertSortedScript(prev, saved));

      if (isRenamingActive) {
        sceneTitleRef.current = saved.title;
        markSavedSnapshot({
          id: saved.id,
          rawText: saved.rawText,
          title: saved.title,
        });
        setSceneTitle(saved.title);
        mirrorActiveScriptToLocalStorage(saved.id, saved.rawText, saved.title, saved.updatedAt);
      }

      onToast(UI_LABELS.toasts.renamedScript(saved.title));
    },
    [cancelPendingSave, markSavedSnapshot, onToast]
  );

  const handleTogglePinScript = useCallback(async (record: ScriptRecord) => {
    const latest = customScriptsRef.current.find((item) => item.id === record.id) ?? record;
    const updated: ScriptRecord = {
      ...latest,
      pinned: !latest.pinned,
    };
    const saved = await scriptLibraryDb.put(updated);
    setCustomScripts((prev) => upsertSortedScript(prev, saved));
  }, []);

  const handleUpdateScriptMetadata = useCallback(
    async (
      record: ScriptRecord,
      patch: {folder?: string | null; tags?: string[]; branchNote?: string | null}
    ) => {
      const isUpdatingActive =
        activeScriptRef.current.kind === 'custom' && activeScriptRef.current.id === record.id;

      if (isUpdatingActive) {
        cancelPendingSave();
      }

      const latest = customScriptsRef.current.find((item) => item.id === record.id) ?? record;
      const nextFolder =
        patch.folder !== undefined ? (patch.folder?.trim() || undefined) : latest.folder;
      const nextTags = patch.tags !== undefined ? patch.tags : latest.tags;
      const nextBranchNote =
        patch.branchNote !== undefined
          ? (patch.branchNote?.trim().replace(/\s+/g, ' ').slice(0, 160) || undefined)
          : latest.branchNote;
      const nextTitle = isUpdatingActive
        ? sceneTitleRef.current.trim() || latest.title
        : latest.title;
      const nextRawText = isUpdatingActive ? rawTextRef.current : latest.rawText;
      const hasPendingContentChange =
        isUpdatingActive && (nextTitle !== latest.title || nextRawText !== latest.rawText);

      const updated: ScriptRecord = {
        ...latest,
        title: nextTitle,
        rawText: nextRawText,
        folder: nextFolder,
        tags: nextTags,
        branchNote: nextBranchNote,
        ...(hasPendingContentChange ? {updatedAt: Date.now()} : {}),
      };
      const saved = await scriptLibraryDb.put(updated);
      customScriptsRef.current = upsertSortedScript(customScriptsRef.current, saved);
      setCustomScripts((prev) => upsertSortedScript(prev, saved));

      if (isUpdatingActive) {
        markSavedSnapshot({
          id: saved.id,
          rawText: saved.rawText,
          title: saved.title,
        });
        mirrorActiveScriptToLocalStorage(saved.id, saved.rawText, saved.title, saved.updatedAt);
      }
    },
    [cancelPendingSave, markSavedSnapshot]
  );

  const handleUpdateActiveBranchNote = useCallback(
    async (nextBranchNote: string) => {
      const current = activeScriptRef.current;
      if (current.kind !== 'custom') return;
      const latest =
        customScriptsRef.current.find((item) => item.id === current.id) ??
        (await scriptLibraryDb.get(current.id));
      if (!latest) return;
      await handleUpdateScriptMetadata(latest, {branchNote: nextBranchNote});
    },
    [handleUpdateScriptMetadata]
  );

  const handleRequestBulkDeleteScripts = useCallback(
    (records: readonly ScriptRecord[], onDeleted?: () => void) => {
      if (records.length === 0) return;
      const ids = records.map((r) => r.id);
      const idSet = new Set(ids);

      onRequestConfirm({
        title: UI_LABELS.confirm.deleteMultipleScriptsTitle(ids.length),
        description: UI_LABELS.confirm.deleteMultipleScriptsDesc,
        confirmLabel: UI_LABELS.confirm.delete,
        cancelLabel: UI_LABELS.confirm.cancel,
        tone: 'danger',
        onConfirm: () => {
          void (async () => {
            const wasActiveDeleted =
              activeScriptRef.current.kind === 'custom' && idSet.has(activeScriptRef.current.id);

            if (wasActiveDeleted) {
              cancelPendingSave();
            }

            const previousScripts = customScriptsRef.current;
            await scriptLibraryDb.bulkDelete(ids);
            let remaining = previousScripts.filter((item) => !idSet.has(item.id));
            const repaired = repairLineageOnDelete(remaining, idSet, previousScripts);
            if (repaired.length > 0) {
              const savedRepaired = await scriptLibraryDb.bulkPut(repaired);
              const repairedById = new Map(savedRepaired.map((item) => [item.id, item]));
              remaining = remaining.map((item) => repairedById.get(item.id) ?? item);
            }

            setCustomScripts(remaining);
            customScriptsRef.current = remaining;

            if (wasActiveDeleted) {
              if (remaining.length > 0) {
                activateCustomScript(remaining[0]);
              } else {
                activateExample(DEFAULT_PRESET);
              }
            }

            onDeleted?.();
            onToast(UI_LABELS.toasts.deletedMultipleScripts(ids.length));
          })();
        },
      });
    },
    [onRequestConfirm, cancelPendingSave, activateCustomScript, activateExample, onToast]
  );

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

            if (wasActive) {
              cancelPendingSave();
            }

            const previousScripts = customScriptsRef.current;
            const deletedIdSet = new Set([record.id]);
            await scriptLibraryDb.delete(record.id);
            let remaining = previousScripts.filter((item) => item.id !== record.id);
            const repaired = repairLineageOnDelete(remaining, deletedIdSet, previousScripts);
            if (repaired.length > 0) {
              const savedRepaired = await scriptLibraryDb.bulkPut(repaired);
              const repairedById = new Map(savedRepaired.map((item) => [item.id, item]));
              remaining = remaining.map((item) => repairedById.get(item.id) ?? item);
            }

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
    [onRequestConfirm, cancelPendingSave, activateCustomScript, activateExample, onToast]
  );

  const handleRequestClearLibrary = useCallback(
    (onCleared?: () => void) => {
      const count = customScriptsRef.current.length;
      if (count === 0) return;

      onRequestConfirm({
        title: UI_LABELS.confirm.clearLibraryTitle(count),
        description: UI_LABELS.confirm.clearLibraryDesc,
        confirmLabel: UI_LABELS.confirm.clearLibraryConfirm,
        cancelLabel: UI_LABELS.confirm.cancel,
        tone: 'danger',
        auxiliaryAction: {
          label: UI_LABELS.confirm.clearLibraryBackupAction,
          completedLabel: UI_LABELS.confirm.clearLibraryBackupDone,
          onAction: () => handleBackupAll(),
        },
        onConfirm: () => {
          void (async () => {
            cancelPendingSave();

            await scriptLibraryDb.clearAll();
            setCustomScripts([]);
            customScriptsRef.current = [];

            if (activeScriptRef.current.kind === 'custom') {
              activateExample(DEFAULT_PRESET);
            }

            onCleared?.();
            onToast(UI_LABELS.toasts.clearedLibrary(count));
          })();
        },
      });
    },
    [onRequestConfirm, handleBackupAll, cancelPendingSave, activateExample, onToast]
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
    handleForkCurrentExampleWithContent,
    handleCreateSnapshot,
    handleRestoreSnapshot,
    handleForkSnapshotAsNewScript,
    handleNewBlank,
    handleDuplicateScript,
    handleDuplicateActiveScript,
    handleRenameScript,
    handleTogglePinScript,
    handleUpdateScriptMetadata,
    handleUpdateActiveBranchNote,
    handleExportScriptTxt,
    handleBulkExportScripts,
    handleRequestDeleteScript,
    handleRequestBulkDeleteScripts,
    handleRequestClearLibrary,
    handleDownloadCanonical,
    handleDownloadTagless,
    handleDownloadJsonEnvelope,
    handleBackupAll,
    handleCommitSingleScriptImport,
    handleCommitLibraryBackupImport,
    handleTriggerImportFile,
    handleTriggerRestoreBackup,
    handleImportFileChange,
    handleRestoreBackupChange,
    flushPendingSave: persistCurrentCustomIfDirty,
  };
}
