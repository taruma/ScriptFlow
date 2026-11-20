import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {GitFork} from 'lucide-react';
import {
  breakHistoryCoalescing,
  canRedoDocument,
  canUndoDocument,
  commitDocumentHistory,
  createDocumentHistory,
  deleteExecutionBeat,
  deleteExecutionSubState,
  deleteStagingBlock,
  exportPlainText,
  exportTagless,
  extractMetadata,
  insertExecutionBeat,
  insertExecutionSubState,
  insertStagingBlock,
  isMultiBlockAuteurScript,
  lintDocument,
  mergeExecutionSubStateWithPrevious,
  parseAuteurScript,
  redoDocumentHistory,
  reorderExecutionBeats,
  reorderStagingBlocks,
  undoDocumentHistory,
  updateExecutionSubState,
  updateStagingBlock,
  type DocumentHistoryState,
  type HistoryCommitMode,
  type HistoryCommitOptions,
} from './core/index.ts';
import {ConfirmDialog, type ConfirmDialogRequest} from './components/ConfirmDialog.tsx';
import {LiveDocument} from './components/LiveDocument.tsx';
import type {ActiveScriptRef} from './components/ScriptLibraryModal.tsx';
import {SourceEditor} from './components/SourceEditor.tsx';
import type {StagingBlockCommitOptions} from './components/stagingBlockRegistry.ts';
import {TopSlateBar, type ViewMode} from './components/TopSlateBar.tsx';
import {
  BUNDLED_EXAMPLES,
  getBundledExampleById,
  type BundledExample,
} from './data/examples/index.ts';
import {BLANK_SCRIPT_TEMPLATE, DEFAULT_PRESET} from './data/presets.ts';
import {copyTextToClipboard} from './ui/clipboard.ts';
import {useEditorSettings} from './ui/editorSettings.ts';
import {matchHistoryShortcut} from './ui/historyShortcuts.ts';
import {APP_META, UI_LABELS} from './ui/labels.ts';
import {stabilizeAestheticTokens} from './ui/referenceStability.ts';
import {
  downloadCanonicalTxt,
  downloadJsonEnvelope,
  downloadLibraryBackup,
  downloadTaglessTxt,
  mergeLibraryBackup,
  parseLibraryBackup,
  readAndParseBrowserFile,
  type AuteurLibraryBackup,
} from './ui/scriptFileIO.ts';
import {
  createScriptId,
  scriptLibraryDb,
  sortScriptRecords,
  type ScriptRecord,
} from './ui/scriptLibraryDb.ts';
import {createCopyTitle} from './ui/scriptLibraryView.ts';
import {
  mirrorActiveScriptToLocalStorage,
  readActiveScriptId,
  readSavedScript,
  readSavedTitle,
} from './ui/scriptStorage.ts';
import {UI_TOKENS} from './ui/tokens/ui.ts';
import {useStableValue} from './ui/useStableValue.ts';

const JsonIrDebugDrawer = lazy(() =>
  import('./components/debug/JsonIrDebugDrawer.tsx').then((mod) => ({
    default: mod.JsonIrDebugDrawer,
  }))
);

const ScriptLibraryModal = lazy(() =>
  import('./components/ScriptLibraryModal.tsx').then((mod) => ({
    default: mod.ScriptLibraryModal,
  }))
);

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

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  return (el as HTMLElement).isContentEditable === true;
}

function isWritableEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    return !field.readOnly && !field.disabled;
  }
  return (el as HTMLElement).isContentEditable === true;
}

function upsertSortedScript(
  list: readonly ScriptRecord[],
  record: ScriptRecord
): ScriptRecord[] {
  const withoutTarget = list.filter((item) => item.id !== record.id);
  return sortScriptRecords([record, ...withoutTarget]);
}

export default function App() {
  const initialStateRef = useRef<InitialEditorState | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = resolveInitialEditorState();
  }
  const initial = initialStateRef.current;

  // Plain-Text-as-Truth: document-level Undo / Redo history over canonical raw Auteur Script
  const [history, setHistory] = useState<DocumentHistoryState>(() =>
    createDocumentHistory(initial.rawText)
  );
  const rawText = history.present;
  const canUndo = canUndoDocument(history);
  const canRedo = canRedoDocument(history);

  const [activeScript, setActiveScript] = useState<ActiveScriptRef>(initial.activeScript);
  const [sceneTitle, setSceneTitle] = useState<string>(initial.title);
  const [customScripts, setCustomScripts] = useState<ScriptRecord[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const {settings, updateSettings} = useEditorSettings();
  const [copiedKind, setCopiedKind] = useState<'plain' | 'tagless' | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);

  const isReadOnly = activeScript.kind === 'example';

  // Refs for synchronous access during debounced auto-save, flushes, and event listeners
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
        setViewMode('live');
      }
      mirrorActiveScriptToLocalStorage(record.id, record.rawText, record.title);
    },
    []
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
        setViewMode('live');
      }
      mirrorActiveScriptToLocalStorage(example.id, example.content, example.title);
    },
    []
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

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setHistory((prev) => breakHistoryCoalescing(prev));
  }, []);

  // Transient toast timer
  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!copiedKind) return;
    const timer = window.setTimeout(() => setCopiedKind(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedKind]);

  // Synchronous pure derivations from Plain-Text-as-Truth
  const doc = useMemo(() => parseAuteurScript(rawText), [rawText]);
  const metadata = useMemo(() => extractMetadata(doc), [doc]);
  const diagnostics = useMemo(
    () => lintDocument(doc, metadata, settings.lintRuleOverrides),
    [doc, metadata, settings.lintRuleOverrides]
  );
  const stableAestheticTokens = useStableValue(metadata.aestheticTokens, stabilizeAestheticTokens);

  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // Global Paste-and-Hydrate with Active-Editor & Read-Only Guards
  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      if (isDebugOpen || confirmRequest !== null || isLibraryOpen) return;
      if (document.querySelector('[aria-modal="true"]')) return;

      const pasted = event.clipboardData?.getData('text/plain');
      if (!pasted || pasted.trim().length === 0) return;

      const active = document.activeElement;
      const inEditable = isEditableElement(active);
      const inWritableEditable = isWritableEditableElement(active);
      const hasMultiBlockScript = isMultiBlockAuteurScript(pasted);

      if (isReadOnly) {
        // Allow normal paste inside any non-readOnly utility input outside modals if present
        if (inWritableEditable && !hasMultiBlockScript) {
          return;
        }
        event.preventDefault();
        setToastMessage(UI_LABELS.toasts.readOnlyPasteBlocked);
        return;
      }

      // In Source Mode inside the main textarea, let native paste work normally
      if (viewMode === 'source' && inEditable) {
        return;
      }

      // If focused inside an active block/beat editor or title input and pasting a normal inline snippet,
      // keep paste scoped normally to that active input so edits are never clobbered.
      if (inEditable && !hasMultiBlockScript) {
        return;
      }

      // Outside a focused input OR pasting a multi-block Auteur Script: hydrate immediately in place (undoable via Ctrl+Z)
      event.preventDefault();
      if (active instanceof HTMLElement) {
        active.blur();
      }
      commitRawText(pasted.replace(/\r\n?/g, '\n'), {mode: 'checkpoint'});
      setViewMode('live');
      setToastMessage(UI_LABELS.toasts.scriptHydrated);
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [viewMode, isReadOnly, isDebugOpen, confirmRequest, isLibraryOpen, commitRawText]);

  // Document-level Undo / Redo keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const action = matchHistoryShortcut(event);
      if (!action) return;

      // Never mutate read-only examples or interfere with open modals/dialogs
      if (isReadOnly || isDebugOpen || confirmRequest !== null || isLibraryOpen) return;
      if (document.querySelector('[aria-modal="true"]')) return;

      // Never interfere with non-document inputs (Scene Title, custom block header input, library search)
      const active = document.activeElement;
      if (active instanceof Element && active.closest('[data-native-undo="true"]')) {
        return;
      }

      event.preventDefault();
      if (action === 'undo') {
        handleUndo();
      } else {
        handleRedo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isReadOnly, isDebugOpen, confirmRequest, isLibraryOpen, handleUndo, handleRedo]);

  // Pure Serializer Mutations
  const handleUpdateStaging = useCallback(
    (blockIndex: number, nextBody: string, options?: StagingBlockCommitOptions) => {
      const mode = options?.mode ?? 'coalesce';
      const groupKey = options?.groupKey
        ? `staging:${blockIndex}:${options.groupKey}`
        : `staging:${blockIndex}`;
      commitRawText((prev) => updateStagingBlock(prev, blockIndex, nextBody), {
        mode,
        groupKey: mode === 'coalesce' ? groupKey : null,
      });
    },
    [commitRawText]
  );

  const handleInsertStaging = useCallback(
    (headerName: string, afterBlockIndex?: number) => {
      commitRawText((prev) => insertStagingBlock(prev, headerName, '', afterBlockIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleRequestDeleteStaging = useCallback(
    (blockIndex: number) => {
      if (activeScriptRef.current.kind === 'example') return;
      const target = docRef.current.stagingBlocks[blockIndex];
      if (!target) return;
      const excerpt = target.lines.find((line) => line.trim().length > 0)?.trim();
      setConfirmRequest({
        title: UI_LABELS.confirm.deleteMacroBlockTitle(target.name),
        description: UI_LABELS.confirm.deleteMacroBlockDesc,
        excerpt,
        confirmLabel: UI_LABELS.confirm.delete,
        cancelLabel: UI_LABELS.confirm.cancel,
        tone: 'danger',
        onConfirm: () => {
          commitRawText((prev) => deleteStagingBlock(prev, blockIndex), {mode: 'checkpoint'});
        },
      });
    },
    [commitRawText]
  );

  const handleReorderStaging = useCallback(
    (fromBlockIndex: number, toBlockIndex: number) => {
      commitRawText((prev) => reorderStagingBlocks(prev, fromBlockIndex, toBlockIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleUpdateSubState = useCallback(
    (
      beatIndex: number,
      subStateIndex: number,
      nextSubStateRaw: string,
      mode: HistoryCommitMode = 'coalesce'
    ) => {
      commitRawText(
        (prev) => updateExecutionSubState(prev, beatIndex, subStateIndex, nextSubStateRaw),
        {
          mode,
          groupKey: mode === 'coalesce' ? `beat:${beatIndex}:step:${subStateIndex}` : null,
        }
      );
    },
    [commitRawText]
  );

  const handleInsertSubState = useCallback(
    (
      beatIndex: number,
      afterSubStateIndex: number,
      starterText: string,
      mode: HistoryCommitMode = 'checkpoint'
    ) => {
      commitRawText(
        (prev) => insertExecutionSubState(prev, beatIndex, afterSubStateIndex, starterText),
        {
          mode,
          groupKey: mode === 'coalesce' ? `beat:${beatIndex}:step:${afterSubStateIndex + 1}` : null,
        }
      );
    },
    [commitRawText]
  );

  const handleDeleteSubState = useCallback(
    (beatIndex: number, subStateIndex: number) => {
      commitRawText((prev) => deleteExecutionSubState(prev, beatIndex, subStateIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleMergeSubState = useCallback(
    (beatIndex: number, subStateIndex: number) => {
      commitRawText((prev) => mergeExecutionSubStateWithPrevious(prev, beatIndex, subStateIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleInsertBeat = useCallback(
    (afterBeatIndex: number, starterLine: string) => {
      commitRawText((prev) => insertExecutionBeat(prev, afterBeatIndex, starterLine), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleRequestDeleteBeat = useCallback(
    (beatIndex: number) => {
      if (activeScriptRef.current.kind === 'example') return;
      const target = docRef.current.execution?.beats.find((b) => b.index === beatIndex);
      setConfirmRequest({
        title: UI_LABELS.confirm.deleteMacroStateTitle(beatIndex),
        description: UI_LABELS.confirm.deleteMacroStateDesc,
        excerpt: target?.raw,
        confirmLabel: UI_LABELS.confirm.delete,
        cancelLabel: UI_LABELS.confirm.cancel,
        tone: 'danger',
        onConfirm: () => {
          commitRawText((prev) => deleteExecutionBeat(prev, beatIndex), {mode: 'checkpoint'});
        },
      });
    },
    [commitRawText]
  );

  const handleReorderBeats = useCallback(
    (fromBeatIndex: number, toBeatIndex: number) => {
      commitRawText((prev) => reorderExecutionBeats(prev, fromBeatIndex, toBeatIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleUpdateSource = useCallback(
    (nextRawText: string) => {
      commitRawText(nextRawText, {mode: 'coalesce', groupKey: 'source'});
    },
    [commitRawText]
  );

  // Script Library Lifecycle Actions
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
      setToastMessage(UI_LABELS.toasts.forkedExample(saved.title));
    },
    [persistCurrentCustomIfDirty, activateCustomScript]
  );

  const handleForkCurrentExample = useCallback(() => {
    if (activeScript.kind !== 'example') return;
    const example = getBundledExampleById(activeScript.id) ?? DEFAULT_PRESET;
    void handleForkExample(example);
  }, [activeScript, handleForkExample]);

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
    setToastMessage(UI_LABELS.toasts.createdBlankScript);
  }, [persistCurrentCustomIfDirty, activateCustomScript]);

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
      setToastMessage(UI_LABELS.toasts.duplicatedScript(saved.title));
    },
    [persistCurrentCustomIfDirty]
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

      setToastMessage(UI_LABELS.toasts.renamedScript(saved.title));
    },
    []
  );

  const handleExportScriptTxt = useCallback(
    async (record: ScriptRecord) => {
      if (activeScriptRef.current.kind === 'custom' && activeScriptRef.current.id === record.id) {
        downloadCanonicalTxt(sceneTitleRef.current, rawTextRef.current);
        return;
      }
      const latest = (await scriptLibraryDb.get(record.id)) ?? record;
      downloadCanonicalTxt(latest.title, latest.rawText);
    },
    []
  );

  const handleRequestDeleteScript = useCallback(
    (record: ScriptRecord) => {
      setConfirmRequest({
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

            setToastMessage(UI_LABELS.toasts.deletedScript(record.title));
          })();
        },
      });
    },
    [activateCustomScript, activateExample]
  );

  // File I/O: Single-script downloads, Import, Full-Library Backup & Smart Merge Restore
  const handleDownloadCanonical = useCallback(() => {
    downloadCanonicalTxt(sceneTitle, rawText);
  }, [sceneTitle, rawText]);

  const handleDownloadTagless = useCallback(() => {
    downloadTaglessTxt(sceneTitle, rawText);
  }, [sceneTitle, rawText]);

  const handleDownloadJsonEnvelope = useCallback(() => {
    downloadJsonEnvelope(sceneTitle, rawText);
  }, [sceneTitle, rawText]);

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
      setToastMessage(
        UI_LABELS.toasts.backupRestored(
          mergeResult.added.length,
          mergeResult.forked.length,
          mergeResult.skipped.length
        )
      );
    },
    [persistCurrentCustomIfDirty]
  );

  const handleBackupAll = useCallback(async () => {
    await persistCurrentCustomIfDirty();
    const latestRecords = await scriptLibraryDb.list();
    setCustomScripts(latestRecords);
    customScriptsRef.current = latestRecords;

    if (latestRecords.length === 0) {
      setToastMessage(UI_LABELS.toasts.backupEmpty);
      return;
    }

    downloadLibraryBackup(latestRecords, {
      activeScriptId: activeScriptRef.current.id,
    });
    setToastMessage(UI_LABELS.toasts.backupExported(latestRecords.length));
  }, [persistCurrentCustomIfDirty]);

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
          setToastMessage(result.error);
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
        setToastMessage(UI_LABELS.toasts.importedScript(saved.title));
      } catch {
        setToastMessage(UI_LABELS.toasts.fileReadError);
      }
    },
    [applyLibraryBackupRestore, persistCurrentCustomIfDirty, activateCustomScript]
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
          setToastMessage(parsed.error);
          return;
        }
        await applyLibraryBackupRestore(parsed.backup);
      } catch {
        setToastMessage(UI_LABELS.toasts.fileReadError);
      }
    },
    [applyLibraryBackupRestore]
  );

  // Clipboard Export
  const handleCopyPlainText = useCallback(async () => {
    const text = exportPlainText(rawText);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKind('plain');
    }
  }, [rawText]);

  const handleCopyTagless = useCallback(async () => {
    const text = exportTagless(rawText);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKind('tagless');
    }
  }, [rawText]);

  const handleCommitFromDebug = useCallback(
    (nextRawText: string, message?: string) => {
      if (activeScriptRef.current.kind === 'example') return;
      commitRawText(nextRawText, {mode: 'checkpoint'});
      if (message) {
        setToastMessage(message);
      }
    },
    [commitRawText]
  );

  const handleJumpToFirstDiagnostic = useCallback(() => {
    const first = diagnostics[0];
    if (!first) return;
    if (viewMode !== 'live') {
      setViewMode('live');
    }

    requestAnimationFrame(() => {
      const targetId =
        first.target.phase === 'staging'
          ? `staging-block-${first.target.blockIndex}`
          : `execution-beat-${first.target.beatIndex}`;
      const el = document.getElementById(targetId);
      el?.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
  }, [diagnostics, viewMode]);

  const beatCount = doc.execution?.beats.length ?? 0;

  return (
    <div className="min-h-screen bg-app text-text-main flex flex-col">
      <TopSlateBar
        title={sceneTitle}
        onTitleChange={handleTitleChange}
        readOnly={isReadOnly}
        beatCount={beatCount}
        diagnostics={diagnostics}
        onJumpToFirstDiagnostic={handleJumpToFirstDiagnostic}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onNewBlank={() => void handleNewBlank()}
        onImportFile={handleTriggerImportFile}
        onDownloadCanonical={handleDownloadCanonical}
        onDownloadTagless={handleDownloadTagless}
        onDownloadJsonEnvelope={handleDownloadJsonEnvelope}
        onBackupAll={() => void handleBackupAll()}
        onRestoreBackup={handleTriggerRestoreBackup}
        onOpenLibrary={() => setIsLibraryOpen(true)}
        isLibraryOpen={isLibraryOpen}
        settings={settings}
        onUpdateSettings={updateSettings}
        onCopyPlainText={handleCopyPlainText}
        onCopyTagless={handleCopyTagless}
        copiedKind={copiedKind}
        onOpenDebug={() => setIsDebugOpen(true)}
        isDebugOpen={isDebugOpen}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Slim, calm Read-Only Bundled Example Indicator + Explicit Fork */}
      {isReadOnly && (
        <div
          role="region"
          aria-label={UI_LABELS.topBar.readOnlyExampleBadge}
          className="h-9 shrink-0 border-b border-border-subtle bg-surface-subtle/90 px-4 sm:px-5 flex items-center justify-between gap-3"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="auteur-phase-logic inline-flex shrink-0 items-center rounded border px-1.5 py-px font-mono text-[10px] font-semibold">
              {UI_LABELS.topBar.readOnlyExampleBadge}
            </span>
            <span className="hidden sm:inline truncate text-xs text-text-muted">
              {UI_LABELS.topBar.readOnlyBannerText}
            </span>
          </div>
          <button
            type="button"
            onClick={handleForkCurrentExample}
            title={UI_LABELS.topBar.forkToEditTitle}
            className={UI_TOKENS.button.actionPillActive}
          >
            <GitFork className="h-3.5 w-3.5" />
            <span>{UI_LABELS.topBar.forkToEditButton}</span>
          </button>
        </div>
      )}

      <div className="flex-1">
        {viewMode === 'live' ? (
          <LiveDocument
            doc={doc}
            metadata={metadata}
            diagnostics={diagnostics}
            historyRevision={history.revision}
            readOnly={isReadOnly}
            onUpdateStaging={handleUpdateStaging}
            onInsertStaging={handleInsertStaging}
            onDeleteStaging={handleRequestDeleteStaging}
            onReorderStaging={handleReorderStaging}
            onUpdateSubState={handleUpdateSubState}
            onInsertSubState={handleInsertSubState}
            onDeleteSubState={handleDeleteSubState}
            onMergeSubState={handleMergeSubState}
            onInsertBeat={handleInsertBeat}
            onDeleteBeat={handleRequestDeleteBeat}
            onReorderBeats={handleReorderBeats}
          />
        ) : (
          <SourceEditor
            rawText={rawText}
            aestheticTokens={stableAestheticTokens}
            readOnly={isReadOnly}
            onChange={handleUpdateSource}
          />
        )}
      </div>

      {/* Hidden File Pickers for Import (.txt / .md / .json) & Restore Backup (.json) */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".txt,.md,.markdown,.json"
        onChange={(e) => void handleImportFileChange(e)}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={restoreBackupInputRef}
        type="file"
        accept=".json"
        onChange={(e) => void handleRestoreBackupChange(e)}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      {isLibraryOpen && (
        <Suspense fallback={null}>
          <ScriptLibraryModal
            isOpen={isLibraryOpen}
            onClose={() => setIsLibraryOpen(false)}
            customScripts={customScripts}
            examples={BUNDLED_EXAMPLES}
            activeScript={activeScript}
            isConfirmDialogOpen={confirmRequest !== null}
            onOpenCustomScript={(record) => void handleOpenCustomScript(record)}
            onOpenExample={(example) => void handleOpenExample(example)}
            onForkExample={(example) => void handleForkExample(example)}
            onNewBlank={() => void handleNewBlank()}
            onImportFile={handleTriggerImportFile}
            onDuplicateScript={(record) => void handleDuplicateScript(record)}
            onRenameScript={(record, nextTitle) => void handleRenameScript(record, nextTitle)}
            onExportScriptTxt={(record) => void handleExportScriptTxt(record)}
            onRequestDeleteScript={handleRequestDeleteScript}
          />
        </Suspense>
      )}

      {isDebugOpen && (
        <Suspense fallback={null}>
          <JsonIrDebugDrawer
            isOpen={isDebugOpen}
            onClose={() => setIsDebugOpen(false)}
            rawText={rawText}
            readOnly={isReadOnly}
            onCommitRawText={handleCommitFromDebug}
          />
        </Suspense>
      )}

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />

      {/* Subtle transient feedback toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[120] rounded-xl border border-border-main bg-surface px-4 py-2 text-xs font-medium text-text-main shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
