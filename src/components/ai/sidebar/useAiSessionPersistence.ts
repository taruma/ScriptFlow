import {useCallback, useEffect, useMemo, useState} from 'react';
import type {BundledExample} from '../../../data/examples/index.ts';
import {
  RECENT_AI_SESSIONS_LIMIT,
  selectRecentSessionsForScript,
  type AiSessionRecord,
  type ResolvedAiSessionSummary,
} from '../../../ui/aiSessions.ts';
import {scriptLibraryDb, type ScriptRecord} from '../../../ui/scriptLibraryDb.ts';

export interface UseAiSessionPersistenceOptions {
  scriptSessionKey: string;
  customScripts: readonly ScriptRecord[];
  examples: readonly BundledExample[];
  refreshNonce?: number;
  onSessionsChanged?: () => void;
}

export interface AiSessionPersistence {
  allSessions: AiSessionRecord[];
  recentSessions: ResolvedAiSessionSummary[];
  isLoadingSessions: boolean;
  reloadSessions: () => Promise<void>;
  saveSession: (record: AiSessionRecord) => Promise<AiSessionRecord | null>;
  renameSession: (id: string, title: string) => Promise<AiSessionRecord | null>;
  togglePinSession: (id: string, nextPinned: boolean) => Promise<AiSessionRecord | null>;
  deleteSession: (id: string) => Promise<void>;
}

export function useAiSessionPersistence({
  scriptSessionKey,
  customScripts,
  examples,
  refreshNonce = 0,
  onSessionsChanged,
}: UseAiSessionPersistenceOptions): AiSessionPersistence {
  const [allSessions, setAllSessions] = useState<AiSessionRecord[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(true);

  const reloadSessions = useCallback(async () => {
    try {
      const list = await scriptLibraryDb.listAiSessions();
      setAllSessions(list);
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[AiSessions] Failed to load AI sessions from storage:', error);
      }
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void reloadSessions();
  }, [reloadSessions, refreshNonce]);

  const saveSession = useCallback(
    async (record: AiSessionRecord): Promise<AiSessionRecord | null> => {
      try {
        const saved = await scriptLibraryDb.saveAiSession(record);
        const refreshed = await scriptLibraryDb.listAiSessions();
        setAllSessions(refreshed);
        onSessionsChanged?.();
        return saved;
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('[AiSessions] Failed to persist AI session:', error);
        }
        return null;
      }
    },
    [onSessionsChanged]
  );

  const renameSession = useCallback(
    async (id: string, title: string): Promise<AiSessionRecord | null> => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      try {
        const updated = await scriptLibraryDb.updateAiSessionMeta(id, {title: trimmed});
        if (updated) {
          setAllSessions((prev) => prev.map((item) => (item.id === id ? updated : item)));
          onSessionsChanged?.();
        }
        return updated;
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('[AiSessions] Failed to rename AI session:', error);
        }
        return null;
      }
    },
    [onSessionsChanged]
  );

  const togglePinSession = useCallback(
    async (id: string, nextPinned: boolean): Promise<AiSessionRecord | null> => {
      try {
        const updated = await scriptLibraryDb.updateAiSessionMeta(id, {pinned: nextPinned});
        if (updated) {
          setAllSessions((prev) => prev.map((item) => (item.id === id ? updated : item)));
          onSessionsChanged?.();
        }
        return updated;
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('[AiSessions] Failed to update AI session pin state:', error);
        }
        return null;
      }
    },
    [onSessionsChanged]
  );

  const deleteSession = useCallback(
    async (id: string): Promise<void> => {
      try {
        await scriptLibraryDb.deleteAiSession(id);
        setAllSessions((prev) => prev.filter((item) => item.id !== id));
        onSessionsChanged?.();
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('[AiSessions] Failed to delete AI session:', error);
        }
      }
    },
    [onSessionsChanged]
  );

  const recentSessions = useMemo(
    () =>
      selectRecentSessionsForScript(
        allSessions,
        scriptSessionKey,
        customScripts,
        examples,
        RECENT_AI_SESSIONS_LIMIT
      ),
    [allSessions, scriptSessionKey, customScripts, examples]
  );

  return {
    allSessions,
    recentSessions,
    isLoadingSessions,
    reloadSessions,
    saveSession,
    renameSession,
    togglePinSession,
    deleteSession,
  };
}
