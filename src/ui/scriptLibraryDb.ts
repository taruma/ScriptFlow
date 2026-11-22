import {exportPlainText} from '../core/index.ts';
import {BUNDLED_EXAMPLES} from '../data/examples/index.ts';
import {
  MAX_AUTO_SNAPSHOTS_PER_SCRIPT,
  selectSnapshotsToPrune,
  shouldSkipAutoSnapshot,
  sortScriptSnapshots,
  type ScriptSnapshot,
} from './scriptSnapshots.ts';
import {
  LIBRARY_FALLBACK_STORAGE_KEY,
  readActiveScriptId,
  readLibraryMigratedFlag,
  readSavedScript,
  readSavedTitle,
  writeActiveScriptId,
  writeLibraryMigratedFlag,
  writeSavedScript,
  writeSavedTitle,
} from './scriptStorage.ts';
import {
  SCRIPT_LIBRARY_DB_NAME,
  SCRIPT_LIBRARY_DB_VERSION,
  SCRIPT_LIBRARY_STORE_NAME,
  SCRIPT_LIBRARY_UPDATED_AT_INDEX,
  SCRIPT_SNAPSHOTS_SCRIPT_ID_INDEX,
  SCRIPT_SNAPSHOTS_STORE_NAME,
  type CreateScriptLibraryStoreOptions,
  type LegacyLocalStorageAdapter,
  type LegacyMigrationOptions,
  type LegacyMigrationResult,
  type LegacyMigrationStatus,
  type SaveSnapshotInput,
  type ScriptLibraryStore,
  type ScriptRecord,
} from './library/dbTypes.ts';
import {
  persistFallbackMap,
  persistFallbackSnapshotsMap,
  readFallbackMap,
  readFallbackSnapshotsMap,
} from './library/fallbackStorage.ts';
import {
  getDefaultIndexedDB,
  idbBulkDelete,
  idbBulkPut,
  idbClearAll,
  idbClearSnapshotsForScript,
  idbDelete,
  idbDeleteSnapshot,
  idbGet,
  idbList,
  idbListSnapshots,
  idbPutSnapshotAndPrune,
  idbUpdateSnapshot,
  openIndexedDb,
} from './library/idbTransactions.ts';
import {
  createScriptId,
  normalizeScriptTags,
  sanitizeScriptRecord,
  sanitizeSnapshot,
  sortScriptRecords,
} from './library/recordSanitizers.ts';

export {
  SCRIPT_LIBRARY_DB_NAME,
  SCRIPT_LIBRARY_DB_VERSION,
  SCRIPT_LIBRARY_STORE_NAME,
  SCRIPT_LIBRARY_UPDATED_AT_INDEX,
  SCRIPT_SNAPSHOTS_STORE_NAME,
  SCRIPT_SNAPSHOTS_SCRIPT_ID_INDEX,
  createScriptId,
  normalizeScriptTags,
  sanitizeScriptRecord,
  sortScriptRecords,
};

export type {
  SaveSnapshotInput,
  ScriptRecord,
  LegacyLocalStorageAdapter,
  LegacyMigrationOptions,
  LegacyMigrationStatus,
  LegacyMigrationResult,
  ScriptLibraryStore,
  CreateScriptLibraryStoreOptions,
};

const DEFAULT_LEGACY_ADAPTER: LegacyLocalStorageAdapter = {
  readSavedScript,
  writeSavedScript,
  readSavedTitle,
  writeSavedTitle,
  readActiveScriptId,
  writeActiveScriptId,
  readMigratedFlag: readLibraryMigratedFlag,
  writeMigratedFlag: writeLibraryMigratedFlag,
};

/**
 * Creates a lightweight, zero-dependency IndexedDB script library store with
 * automatic graceful fallback when IndexedDB is unavailable or restricted.
 */
export function createScriptLibraryStore(
  options: CreateScriptLibraryStoreOptions = {}
): ScriptLibraryStore {
  const dbName = options.dbName ?? SCRIPT_LIBRARY_DB_NAME;
  const idbFactory = options.indexedDB !== undefined ? options.indexedDB : getDefaultIndexedDB();
  const fallbackStorageKey =
    options.fallbackStorageKey !== undefined
      ? options.fallbackStorageKey
      : LIBRARY_FALLBACK_STORAGE_KEY;

  let activeBackend: 'indexeddb' | 'fallback' = idbFactory ? 'indexeddb' : 'fallback';
  let dbPromise: Promise<IDBDatabase> | null = null;
  let fallbackMap: Map<string, ScriptRecord> | null = null;
  let fallbackSnapshotsMap: Map<string, ScriptSnapshot> | null = null;

  const ensureFallbackMap = (): Map<string, ScriptRecord> => {
    if (!fallbackMap) {
      fallbackMap = readFallbackMap(fallbackStorageKey);
    }
    return fallbackMap;
  };

  const ensureFallbackSnapshotsMap = (): Map<string, ScriptSnapshot> => {
    if (!fallbackSnapshotsMap) {
      fallbackSnapshotsMap = readFallbackSnapshotsMap(fallbackStorageKey);
    }
    return fallbackSnapshotsMap;
  };

  const deleteFallbackSnapshotsForScripts = (scriptIds: ReadonlySet<string>): void => {
    const snapMap = ensureFallbackSnapshotsMap();
    let changed = false;
    for (const [snapId, snap] of snapMap.entries()) {
      if (scriptIds.has(snap.scriptId)) {
        snapMap.delete(snapId);
        changed = true;
      }
    }
    if (changed) {
      persistFallbackSnapshotsMap(fallbackStorageKey, snapMap);
    }
  };

  const tryOpenDb = async (): Promise<IDBDatabase | null> => {
    if (!idbFactory || activeBackend === 'fallback') {
      activeBackend = 'fallback';
      return null;
    }

    if (!dbPromise) {
      dbPromise = openIndexedDb(idbFactory, dbName).then((db) => {
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        return db;
      });
    }

    try {
      return await dbPromise;
    } catch {
      dbPromise = null;
      activeBackend = 'fallback';
      return null;
    }
  };

  const runWithFallback = async <T>(
    idbOp: (db: IDBDatabase) => Promise<T>,
    fallbackOp: (map: Map<string, ScriptRecord>) => T
  ): Promise<T> => {
    const db = await tryOpenDb();
    if (db) {
      try {
        return await idbOp(db);
      } catch {
        dbPromise = null;
        activeBackend = 'fallback';
      }
    }
    return fallbackOp(ensureFallbackMap());
  };

  const store: ScriptLibraryStore = {
    get backend() {
      return activeBackend;
    },

    async get(id: string): Promise<ScriptRecord | null> {
      const cleanId = id.trim();
      if (!cleanId) return null;
      return runWithFallback(
        (db) => idbGet(db, cleanId),
        (map) => {
          const found = map.get(cleanId);
          return found ? {...found} : null;
        }
      );
    },

    async list(): Promise<ScriptRecord[]> {
      return runWithFallback(
        (db) => idbList(db),
        (map) => sortScriptRecords(Array.from(map.values()).map((record) => ({...record})))
      );
    },

    async put(record: ScriptRecord): Promise<ScriptRecord> {
      const clean = sanitizeScriptRecord(record);
      if (!clean.id) {
        throw new Error('Cannot store a ScriptRecord with an empty id.');
      }
      return runWithFallback(
        async (db) => {
          const [saved] = await idbBulkPut(db, [clean]);
          return saved;
        },
        (map) => {
          map.set(clean.id, clean);
          persistFallbackMap(fallbackStorageKey, map);
          return {...clean};
        }
      );
    },

    async bulkPut(records: readonly ScriptRecord[]): Promise<ScriptRecord[]> {
      if (records.length === 0) return [];
      const sanitized = records.map(sanitizeScriptRecord);
      for (const record of sanitized) {
        if (!record.id) {
          throw new Error('Cannot store a ScriptRecord with an empty id.');
        }
      }
      return runWithFallback(
        (db) => idbBulkPut(db, sanitized),
        (map) => {
          for (const record of sanitized) {
            map.set(record.id, record);
          }
          persistFallbackMap(fallbackStorageKey, map);
          return sanitized.map((record) => ({...record}));
        }
      );
    },

    async delete(id: string): Promise<void> {
      const cleanId = id.trim();
      if (!cleanId) return;
      return runWithFallback(
        (db) => idbDelete(db, cleanId),
        (map) => {
          map.delete(cleanId);
          persistFallbackMap(fallbackStorageKey, map);
          deleteFallbackSnapshotsForScripts(new Set([cleanId]));
        }
      );
    },

    async bulkDelete(ids: readonly string[]): Promise<void> {
      const cleanIds = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)));
      if (cleanIds.length === 0) return;
      return runWithFallback(
        (db) => idbBulkDelete(db, cleanIds),
        (map) => {
          for (const id of cleanIds) {
            map.delete(id);
          }
          persistFallbackMap(fallbackStorageKey, map);
          deleteFallbackSnapshotsForScripts(new Set(cleanIds));
        }
      );
    },

    async clearAll(): Promise<void> {
      return runWithFallback(
        (db) => idbClearAll(db),
        (map) => {
          map.clear();
          persistFallbackMap(fallbackStorageKey, map);
          const snapMap = ensureFallbackSnapshotsMap();
          snapMap.clear();
          persistFallbackSnapshotsMap(fallbackStorageKey, snapMap);
        }
      );
    },

    async listSnapshots(scriptId: string): Promise<ScriptSnapshot[]> {
      const cleanScriptId = scriptId.trim();
      if (!cleanScriptId) return [];
      return runWithFallback(
        (db) => idbListSnapshots(db, cleanScriptId),
        () => {
          const snapMap = ensureFallbackSnapshotsMap();
          const matching: ScriptSnapshot[] = [];
          for (const snap of snapMap.values()) {
            if (snap.scriptId === cleanScriptId) {
              matching.push({...snap});
            }
          }
          return sortScriptSnapshots(matching);
        }
      );
    },

    async saveSnapshot(input: SaveSnapshotInput): Promise<ScriptSnapshot | null> {
      const cleanScriptId = input.scriptId.trim();
      if (!cleanScriptId) return null;

      const existing = await store.listSnapshots(cleanScriptId);
      if (shouldSkipAutoSnapshot(existing[0], input.rawText, input.trigger)) {
        return null;
      }

      const latestCreatedAt = existing[0]?.createdAt ?? 0;
      const resolvedCreatedAt =
        input.createdAt !== undefined
          ? input.createdAt
          : Math.max(Date.now(), latestCreatedAt + 1);

      const candidate: ScriptSnapshot = sanitizeSnapshot({
        id: input.id?.trim() || createScriptId('snap'),
        scriptId: cleanScriptId,
        trigger: input.trigger,
        label: input.label,
        rawText: input.rawText,
        createdAt: resolvedCreatedAt,
        ...(input.pinned ? {pinned: true} : {}),
      });

      const pruneIds = selectSnapshotsToPrune(
        [candidate, ...existing],
        input.maxAuto ?? MAX_AUTO_SNAPSHOTS_PER_SCRIPT
      );

      return runWithFallback(
        (db) => idbPutSnapshotAndPrune(db, candidate, pruneIds),
        () => {
          const snapMap = ensureFallbackSnapshotsMap();
          snapMap.set(candidate.id, candidate);
          for (const pruneId of pruneIds) {
            snapMap.delete(pruneId);
          }
          persistFallbackSnapshotsMap(fallbackStorageKey, snapMap);
          return {...candidate};
        }
      );
    },

    async updateSnapshot(
      id: string,
      patch: {label?: string; pinned?: boolean}
    ): Promise<ScriptSnapshot | null> {
      const cleanId = id.trim();
      if (!cleanId) return null;
      return runWithFallback(
        (db) => idbUpdateSnapshot(db, cleanId, patch),
        () => {
          const snapMap = ensureFallbackSnapshotsMap();
          const existing = snapMap.get(cleanId);
          if (!existing) return null;
          const next: ScriptSnapshot = sanitizeSnapshot({
            ...existing,
            ...(patch.label !== undefined ? {label: patch.label} : {}),
            ...(patch.pinned !== undefined ? {pinned: patch.pinned} : {}),
          });
          if (patch.pinned === false) {
            delete next.pinned;
          }
          snapMap.set(cleanId, next);
          persistFallbackSnapshotsMap(fallbackStorageKey, snapMap);
          return {...next};
        }
      );
    },

    async deleteSnapshot(id: string): Promise<void> {
      const cleanId = id.trim();
      if (!cleanId) return;
      return runWithFallback(
        (db) => idbDeleteSnapshot(db, cleanId),
        () => {
          const snapMap = ensureFallbackSnapshotsMap();
          if (snapMap.delete(cleanId)) {
            persistFallbackSnapshotsMap(fallbackStorageKey, snapMap);
          }
        }
      );
    },

    async clearSnapshotsForScript(scriptId: string): Promise<void> {
      const cleanScriptId = scriptId.trim();
      if (!cleanScriptId) return;
      return runWithFallback(
        (db) => idbClearSnapshotsForScript(db, cleanScriptId),
        () => {
          deleteFallbackSnapshotsForScripts(new Set([cleanScriptId]));
        }
      );
    },

    async migrateFromLegacyLocalStorage(
      migrationOptions: LegacyMigrationOptions = {}
    ): Promise<LegacyMigrationResult> {
      const storage = migrationOptions.legacyStorage ?? DEFAULT_LEGACY_ADAPTER;
      if (storage.readMigratedFlag()) {
        return {
          status: 'already-migrated',
          migratedRecord: null,
          activeScriptId: storage.readActiveScriptId(),
        };
      }

      const legacyScript = storage.readSavedScript();
      const legacyTitle = storage.readSavedTitle();

      if (!legacyScript || legacyScript.trim().length === 0) {
        storage.writeMigratedFlag(true);
        return {
          status: 'nothing-to-migrate',
          migratedRecord: null,
          activeScriptId: storage.readActiveScriptId(),
        };
      }

      const normalizedLegacy = exportPlainText(legacyScript);
      const effectiveTitle = legacyTitle?.trim() || migrationOptions.defaultTitle || 'Untitled Scene';

      // If an identical custom record already exists in the library, reuse it without duplicating.
      const existingRecords = await store.list();
      const existingMatch = existingRecords.find(
        (record) =>
          record.title.trim() === effectiveTitle &&
          exportPlainText(record.rawText) === normalizedLegacy
      );
      if (existingMatch) {
        storage.writeActiveScriptId(existingMatch.id);
        storage.writeSavedScript(existingMatch.rawText);
        storage.writeSavedTitle(existingMatch.title);
        storage.writeMigratedFlag(true);
        return {
          status: 'already-migrated',
          migratedRecord: existingMatch,
          activeScriptId: existingMatch.id,
        };
      }

      // If the legacy script is an unmodified bundled example, point activeScriptId at it cleanly.
      const bundledExamples = migrationOptions.bundledExamples ?? BUNDLED_EXAMPLES;
      const bundledMatch = bundledExamples.find(
        (example) =>
          exportPlainText(example.content) === normalizedLegacy &&
          (!legacyTitle || legacyTitle.trim() === example.title.trim())
      );
      if (bundledMatch) {
        storage.writeActiveScriptId(bundledMatch.id);
        storage.writeSavedScript(bundledMatch.content);
        storage.writeSavedTitle(bundledMatch.title);
        storage.writeMigratedFlag(true);
        return {
          status: 'matched-bundled',
          migratedRecord: null,
          activeScriptId: bundledMatch.id,
        };
      }

      const now = (migrationOptions.now ?? Date.now)();
      const generateId = migrationOptions.generateId ?? (() => createScriptId('script'));
      const migratedRecord = await store.put({
        id: generateId(),
        title: effectiveTitle,
        rawText: legacyScript,
        createdAt: now,
        updatedAt: now,
      });

      // Keep localStorage mirrored so ErrorBoundary crash recovery stays intact.
      storage.writeActiveScriptId(migratedRecord.id);
      storage.writeSavedScript(migratedRecord.rawText);
      storage.writeSavedTitle(migratedRecord.title);
      storage.writeMigratedFlag(true);

      return {
        status: 'migrated',
        migratedRecord,
        activeScriptId: migratedRecord.id,
      };
    },
  };

  return store;
}

export const scriptLibraryDb: ScriptLibraryStore = createScriptLibraryStore();
