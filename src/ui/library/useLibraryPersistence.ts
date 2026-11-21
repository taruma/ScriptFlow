import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  createDocumentHistory,
  exportPlainText,
  type DocumentHistoryState,
} from '../../core/index.ts';
import {
  BUNDLED_EXAMPLES,
  getBundledExampleById,
  type BundledExample,
} from '../../data/examples/index.ts';
import {DEFAULT_PRESET} from '../../data/presets.ts';
import {APP_META} from '../labels.ts';
import {scriptLibraryDb, sortScriptRecords, type ScriptRecord} from '../scriptLibraryDb.ts';
import type {ActiveScriptRef} from '../scriptLibraryView.ts';
import {
  mirrorActiveScriptToLocalStorage,
  readActiveScriptId,
  readSavedScript,
  readSavedScriptRaw,
  readSavedTitle,
} from '../scriptStorage.ts';

const AUTOSAVE_DEBOUNCE_MS = 350;

export interface InitialEditorState {
  activeScript: ActiveScriptRef;
  rawText: string;
  title: string;
}

export interface SavedScriptSnapshot {
  id: string;
  rawText: string;
  title: string;
}

export function resolveInitialEditorState(): InitialEditorState {
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

    const savedScript = readSavedScriptRaw();
    if (savedScript !== null) {
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

export function upsertSortedScript(
  list: readonly ScriptRecord[],
  record: ScriptRecord
): ScriptRecord[] {
  const withoutTarget = list.filter((item) => item.id !== record.id);
  return sortScriptRecords([record, ...withoutTarget]);
}

export interface UseLibraryPersistenceOptions {
  initial: InitialEditorState;
  activeScript: ActiveScriptRef;
  rawText: string;
  sceneTitle: string;
  activeScriptRef: RefObject<ActiveScriptRef>;
  rawTextRef: RefObject<string>;
  sceneTitleRef: RefObject<string>;
  customScriptsRef: RefObject<ScriptRecord[]>;
  setActiveScript: Dispatch<SetStateAction<ActiveScriptRef>>;
  setHistory: Dispatch<SetStateAction<DocumentHistoryState>>;
  setSceneTitle: Dispatch<SetStateAction<string>>;
  setCustomScripts: Dispatch<SetStateAction<ScriptRecord[]>>;
  onSwitchToLive: () => void;
}

export interface UseLibraryPersistenceResult {
  activateCustomScript: (record: ScriptRecord, options?: {switchToLive?: boolean}) => void;
  activateExample: (example: BundledExample, options?: {switchToLive?: boolean}) => void;
  persistCurrentCustomIfDirty: () => Promise<ScriptRecord | null>;
  cancelPendingSave: () => void;
  markSavedSnapshot: (snapshot: SavedScriptSnapshot) => void;
}

/**
 * Manages mount hydration + one-time legacy migration, active script activation,
 * 350ms debounced IndexedDB persistence, visibilitychange/pagehide/unmount flush,
 * and immediate localStorage crash-recovery mirroring.
 */
export function useLibraryPersistence({
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
}: UseLibraryPersistenceOptions): UseLibraryPersistenceResult {
  const isLibraryHydratedRef = useRef<boolean>(false);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedSnapshotRef = useRef<SavedScriptSnapshot | null>({
    id: initial.activeScript.id,
    rawText: initial.rawText,
    title: initial.title,
  });

  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const markSavedSnapshot = useCallback((snapshot: SavedScriptSnapshot) => {
    lastSavedSnapshotRef.current = snapshot;
  }, []);

  const activateCustomScript = useCallback(
    (record: ScriptRecord, options?: {switchToLive?: boolean}) => {
      cancelPendingSave();
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
    [
      cancelPendingSave,
      activeScriptRef,
      rawTextRef,
      sceneTitleRef,
      setActiveScript,
      setHistory,
      setSceneTitle,
      onSwitchToLive,
    ]
  );

  const activateExample = useCallback(
    (example: BundledExample, options?: {switchToLive?: boolean}) => {
      cancelPendingSave();
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
    [
      cancelPendingSave,
      activeScriptRef,
      rawTextRef,
      sceneTitleRef,
      setActiveScript,
      setHistory,
      setSceneTitle,
      onSwitchToLive,
    ]
  );

  const persistCurrentCustomIfDirty = useCallback(async (): Promise<ScriptRecord | null> => {
    cancelPendingSave();

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
      ...(existing?.pinned ? {pinned: true} : {}),
      ...(existing?.folder ? {folder: existing.folder} : {}),
      ...(existing?.tags && existing.tags.length > 0 ? {tags: existing.tags} : {}),
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
  }, [cancelPendingSave, activeScriptRef, rawTextRef, sceneTitleRef, customScriptsRef, setCustomScripts]);

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
  }, [
    activateCustomScript,
    activateExample,
    persistCurrentCustomIfDirty,
    setCustomScripts,
    customScriptsRef,
  ]);

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

  return {
    activateCustomScript,
    activateExample,
    persistCurrentCustomIfDirty,
    cancelPendingSave,
    markSavedSnapshot,
  };
}
