import {useCallback, type Dispatch, type RefObject, type SetStateAction} from 'react';
import type {HistoryCommitOptions} from '../../core/index.ts';
import {APP_META, UI_LABELS} from '../labels.ts';
import {createScriptId, scriptLibraryDb, type ScriptRecord} from '../scriptLibraryDb.ts';
import {createCopyTitle, type ActiveScriptRef} from '../scriptLibraryView.ts';
import type {ScriptSnapshot, SnapshotTrigger} from '../scriptSnapshots.ts';
import {upsertSortedScript} from './useLibraryPersistence.ts';

export interface UseLibrarySnapshotsOptions {
  activeScriptRef: RefObject<ActiveScriptRef>;
  rawTextRef: RefObject<string>;
  sceneTitleRef: RefObject<string>;
  customScriptsRef: RefObject<ScriptRecord[]>;
  setCustomScripts: Dispatch<SetStateAction<ScriptRecord[]>>;
  commitRawText: (
    updater: string | ((prev: string) => string),
    options?: Omit<HistoryCommitOptions, 'timestamp'>
  ) => void;
  persistCurrentCustomIfDirty: () => Promise<ScriptRecord | null>;
  activateCustomScript: (record: ScriptRecord, options?: {switchToLive?: boolean}) => void;
  onToast: (message: string) => void;
}

export interface UseLibrarySnapshotsResult {
  handleListSnapshots: (scriptId?: string) => Promise<ScriptSnapshot[]>;
  handleCreateSnapshot: (options: {
    trigger: SnapshotTrigger;
    label: string;
    rawText?: string;
    scriptId?: string;
  }) => Promise<ScriptSnapshot | null>;
  handleUpdateSnapshot: (
    id: string,
    patch: {label?: string; pinned?: boolean}
  ) => Promise<ScriptSnapshot | null>;
  handleDeleteSnapshot: (id: string) => Promise<void>;
  handleRestoreSnapshot: (snapshot: ScriptSnapshot) => Promise<boolean>;
  handleForkSnapshotAsNewScript: (snapshot: ScriptSnapshot) => Promise<ScriptRecord | null>;
}

/**
 * Manages snapshot list loading, manual/AI snapshot creation, rename/pin/delete,
 * pre-restore checkpoint rollback, and forking a snapshot into a new custom script.
 */
export function useLibrarySnapshots({
  activeScriptRef,
  rawTextRef,
  sceneTitleRef,
  customScriptsRef,
  setCustomScripts,
  commitRawText,
  persistCurrentCustomIfDirty,
  activateCustomScript,
  onToast,
}: UseLibrarySnapshotsOptions): UseLibrarySnapshotsResult {
  const handleListSnapshots = useCallback(
    async (scriptId?: string): Promise<ScriptSnapshot[]> => {
      const targetScriptId =
        scriptId ??
        (activeScriptRef.current.kind === 'custom' ? activeScriptRef.current.id : null);
      if (!targetScriptId) return [];
      return scriptLibraryDb.listSnapshots(targetScriptId);
    },
    [activeScriptRef]
  );

  const handleCreateSnapshot = useCallback(
    async (options: {
      trigger: SnapshotTrigger;
      label: string;
      rawText?: string;
      scriptId?: string;
    }): Promise<ScriptSnapshot | null> => {
      const targetScriptId =
        options.scriptId ??
        (activeScriptRef.current.kind === 'custom' ? activeScriptRef.current.id : null);
      if (!targetScriptId) return null;
      const textToSave = options.rawText ?? rawTextRef.current;
      return scriptLibraryDb.saveSnapshot({
        scriptId: targetScriptId,
        trigger: options.trigger,
        label: options.label,
        rawText: textToSave,
      });
    },
    [activeScriptRef, rawTextRef]
  );

  const handleUpdateSnapshot = useCallback(
    async (
      id: string,
      patch: {label?: string; pinned?: boolean}
    ): Promise<ScriptSnapshot | null> => {
      return scriptLibraryDb.updateSnapshot(id, patch);
    },
    []
  );

  const handleDeleteSnapshot = useCallback(async (id: string): Promise<void> => {
    await scriptLibraryDb.deleteSnapshot(id);
  }, []);

  const handleRestoreSnapshot = useCallback(
    async (snapshot: ScriptSnapshot): Promise<boolean> => {
      const current = activeScriptRef.current;
      if (current.kind !== 'custom' || current.id !== snapshot.scriptId) {
        return false;
      }
      const beforeText = rawTextRef.current;
      if (beforeText === snapshot.rawText) {
        return false;
      }

      // Always protect current state with a pre-restore checkpoint before rolling back
      await scriptLibraryDb.saveSnapshot({
        scriptId: current.id,
        trigger: 'pre_restore',
        label: `Before restore: ${snapshot.label}`,
        rawText: beforeText,
      });

      commitRawText(snapshot.rawText, {mode: 'checkpoint'});
      onToast(UI_LABELS.toasts.snapshotRestored);
      return true;
    },
    [activeScriptRef, rawTextRef, commitRawText, onToast]
  );

  const handleForkSnapshotAsNewScript = useCallback(
    async (snapshot: ScriptSnapshot): Promise<ScriptRecord | null> => {
      await persistCurrentCustomIfDirty();
      const existingTitles = new Set(customScriptsRef.current.map((s) => s.title));
      const baseTitle = sceneTitleRef.current.trim() || APP_META.untitledScene;
      const title = createCopyTitle(baseTitle, existingTitles, 'Snapshot');
      const now = Date.now();
      const forked: ScriptRecord = {
        id: createScriptId('script'),
        title,
        rawText: snapshot.rawText,
        createdAt: now,
        updatedAt: now,
        forkedFromId: snapshot.scriptId,
      };
      const saved = await scriptLibraryDb.put(forked);
      setCustomScripts((prev) => upsertSortedScript(prev, saved));
      activateCustomScript(saved);
      onToast(UI_LABELS.toasts.snapshotForked(saved.title));
      return saved;
    },
    [
      persistCurrentCustomIfDirty,
      customScriptsRef,
      sceneTitleRef,
      setCustomScripts,
      activateCustomScript,
      onToast,
    ]
  );

  return {
    handleListSnapshots,
    handleCreateSnapshot,
    handleUpdateSnapshot,
    handleDeleteSnapshot,
    handleRestoreSnapshot,
    handleForkSnapshotAsNewScript,
  };
}
