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
  readMirrorUpdatedAt,
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

export interface PersistCurrentCustomOverride {
  rawText?: string;
  title?: string;
}

export interface HydrationMirrorState {
  activeScriptId: string | null;
  rawText: string | null;
  title: string | null;
  updatedAt: number | null;
}

export type HydratedScriptResolution =
  | {
      kind: 'custom';
      record: ScriptRecord;
      /** True when the localStorage mirror is newer than or missing from IndexedDB and must be saved back. */
      needsPersist: boolean;
    }
  | {
      kind: 'example';
      example: BundledExample;
    };

export interface ReconcileHydratedScriptOptions {
  loadedRecords: readonly ScriptRecord[];
  targetId: string | null;
  mirror: HydrationMirrorState;
  bundledExamples?: readonly BundledExample[];
  defaultExample?: BundledExample;
  defaultTitle?: string;
  now?: number;
}

/**
 * Pure hydration reconciliation between IndexedDB records and the synchronous
 * localStorage mirror. Prevents stale or missing IndexedDB writes (e.g. tab discard
 * within the 350ms autosave window or an interrupted transaction) from clobbering
 * newer user/AI edits or silently resetting a custom script back to a bundled example.
 */
export function reconcileHydratedScript({
  loadedRecords,
  targetId,
  mirror,
  bundledExamples = BUNDLED_EXAMPLES,
  defaultExample = DEFAULT_PRESET,
  defaultTitle = APP_META.untitledScene,
  now = Date.now(),
}: ReconcileHydratedScriptOptions): HydratedScriptResolution {
  const cleanTargetId = targetId?.trim() || null;

  if (cleanTargetId) {
    const matchedExample = bundledExamples.find((example) => example.id === cleanTargetId);
    if (matchedExample) {
      return {kind: 'example', example: matchedExample};
    }

    const matchedCustom = loadedRecords.find((record) => record.id === cleanTargetId);
    if (matchedCustom) {
      if (mirror.activeScriptId === matchedCustom.id && mirror.rawText !== null) {
        const mirrorTitle = mirror.title?.trim() || matchedCustom.title;
        const hasDiff =
          mirror.rawText !== matchedCustom.rawText || mirrorTitle !== matchedCustom.title;
        const mirrorUpdatedAt = mirror.updatedAt;

        if (hasDiff && mirrorUpdatedAt !== null && mirrorUpdatedAt > matchedCustom.updatedAt) {
          return {
            kind: 'custom',
            record: {
              ...matchedCustom,
              title: mirrorTitle,
              rawText: mirror.rawText,
              updatedAt: mirrorUpdatedAt,
            },
            needsPersist: true,
          };
        }
      }

      return {kind: 'custom', record: matchedCustom, needsPersist: false};
    }

    // Target is a custom ID missing from IndexedDB: rescue from the localStorage mirror
    // instead of silently discarding user work and falling back to a bundled example.
    const canRescueFromMirror =
      mirror.activeScriptId === cleanTargetId &&
      mirror.rawText !== null &&
      (mirror.rawText.trim().length > 0 || mirror.updatedAt !== null);

    if (canRescueFromMirror) {
      const timestamp = mirror.updatedAt ?? now;
      return {
        kind: 'custom',
        record: {
          id: cleanTargetId,
          title: mirror.title?.trim() || defaultTitle,
          rawText: mirror.rawText!,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        needsPersist: true,
      };
    }
  }

  return {kind: 'example', example: defaultExample};
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
  persistCurrentCustomIfDirty: (
    override?: PersistCurrentCustomOverride
  ) => Promise<ScriptRecord | null>;
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
      mirrorActiveScriptToLocalStorage(record.id, record.rawText, record.title, record.updatedAt);
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

  const persistCurrentCustomIfDirty = useCallback(
    async (override?: PersistCurrentCustomOverride): Promise<ScriptRecord | null> => {
      cancelPendingSave();

      if (!isLibraryHydratedRef.current) return null;
      const currentRef = activeScriptRef.current;
      if (currentRef.kind !== 'custom') return null;

      const startingRawRef = rawTextRef.current;
      const startingTitleRef = sceneTitleRef.current;
      const currentRaw = override?.rawText ?? startingRawRef;
      const currentTitle = override?.title ?? startingTitleRef;
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
        ...(existing?.branchNote ? {branchNote: existing.branchNote} : {}),
        ...(existing?.pinned ? {pinned: true} : {}),
        ...(existing?.folder ? {folder: existing.folder} : {}),
        ...(existing?.tags && existing.tags.length > 0 ? {tags: existing.tags} : {}),
      };

      try {
        const saved = await scriptLibraryDb.put(recordToSave);
        // Mark clean only after persistence succeeds so failed/aborted writes are retried.
        if (activeScriptRef.current.kind === 'custom' && activeScriptRef.current.id === saved.id) {
          lastSavedSnapshotRef.current = {
            id: saved.id,
            rawText: currentRaw,
            title: currentTitle,
          };
          const rawUnchangedSinceStart =
            rawTextRef.current === currentRaw ||
            (override?.rawText !== undefined && rawTextRef.current === startingRawRef);
          const titleUnchangedSinceStart =
            sceneTitleRef.current === currentTitle ||
            (override?.title !== undefined && sceneTitleRef.current === startingTitleRef);
          if (rawUnchangedSinceStart && titleUnchangedSinceStart) {
            mirrorActiveScriptToLocalStorage(
              saved.id,
              saved.rawText,
              saved.title,
              saved.updatedAt
            );
          }
        }
        customScriptsRef.current = upsertSortedScript(customScriptsRef.current, saved);
        setCustomScripts((prev) => upsertSortedScript(prev, saved));
        return saved;
      } catch {
        return null;
      }
    },
    [cancelPendingSave, activeScriptRef, rawTextRef, sceneTitleRef, customScriptsRef, setCustomScripts]
  );

  // Mount lifecycle: reconcile fallback storage, migrate legacy localStorage once, hydrate IndexedDB library, open active script
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      // Snapshot the synchronous localStorage mirror before any migration or list call runs
      const initialMirror: HydrationMirrorState = {
        activeScriptId: readActiveScriptId(),
        rawText: readSavedScriptRaw(),
        title: readSavedTitle(),
        updatedAt: readMirrorUpdatedAt(),
      };

      await scriptLibraryDb.reconcileFallbackStorage();
      const migration = await scriptLibraryDb.migrateFromLegacyLocalStorage({
        defaultTitle: APP_META.untitledScene,
      });
      let loadedRecords = await scriptLibraryDb.list();
      if (cancelled) return;

      const targetId = migration.activeScriptId ?? initialMirror.activeScriptId;
      const resolution = reconcileHydratedScript({
        loadedRecords,
        targetId,
        mirror: initialMirror,
        bundledExamples: BUNDLED_EXAMPLES,
        defaultExample: DEFAULT_PRESET,
        defaultTitle: APP_META.untitledScene,
      });

      if (resolution.kind === 'custom') {
        let recordToActivate = resolution.record;
        if (resolution.needsPersist) {
          try {
            recordToActivate = await scriptLibraryDb.put(resolution.record);
            if (cancelled) return;
            loadedRecords = upsertSortedScript(loadedRecords, recordToActivate);
          } catch {
            // Keep the reconciled custom script active in memory even if put() fails
          }
        }
        setCustomScripts(loadedRecords);
        customScriptsRef.current = loadedRecords;
        activateCustomScript(recordToActivate);
      } else {
        setCustomScripts(loadedRecords);
        customScriptsRef.current = loadedRecords;
        activateExample(resolution.example);
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

    if (activeScript.kind !== 'custom') {
      mirrorActiveScriptToLocalStorage(activeScript.id, rawText, sceneTitle);
      return;
    }

    const last = lastSavedSnapshotRef.current;
    if (
      last &&
      last.id === activeScript.id &&
      last.rawText === rawText &&
      last.title === sceneTitle
    ) {
      return;
    }

    mirrorActiveScriptToLocalStorage(activeScript.id, rawText, sceneTitle, Date.now());

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
