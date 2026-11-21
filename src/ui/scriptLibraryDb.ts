import {exportPlainText} from '../core/index.ts';
import {BUNDLED_EXAMPLES, type BundledExample} from '../data/examples/index.ts';
import {
  isValidSnapshotTrigger,
  MAX_AUTO_SNAPSHOTS_PER_SCRIPT,
  selectSnapshotsToPrune,
  shouldSkipAutoSnapshot,
  sortScriptSnapshots,
  type ScriptSnapshot,
  type SnapshotTrigger,
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

export const SCRIPT_LIBRARY_DB_NAME = 'auteur-script-library-v1';
export const SCRIPT_LIBRARY_DB_VERSION = 2;
export const SCRIPT_LIBRARY_STORE_NAME = 'scripts';
export const SCRIPT_LIBRARY_UPDATED_AT_INDEX = 'updatedAt';
export const SCRIPT_SNAPSHOTS_STORE_NAME = 'snapshots';
export const SCRIPT_SNAPSHOTS_SCRIPT_ID_INDEX = 'scriptId';

export interface SaveSnapshotInput {
  scriptId: string;
  trigger: SnapshotTrigger;
  label: string;
  rawText: string;
  pinned?: boolean;
  createdAt?: number;
  id?: string;
  maxAuto?: number;
}

export interface ScriptRecord {
  id: string;
  title: string;
  rawText: string;
  createdAt: number;
  updatedAt: number;
  forkedFromId?: string;
  pinned?: boolean;
  folder?: string;
  tags?: string[];
}

export interface LegacyLocalStorageAdapter {
  readSavedScript: () => string | null;
  writeSavedScript: (rawText: string) => void;
  readSavedTitle: () => string | null;
  writeSavedTitle: (title: string) => void;
  readActiveScriptId: () => string | null;
  writeActiveScriptId: (id: string | null) => void;
  readMigratedFlag: () => boolean;
  writeMigratedFlag: (migrated: boolean) => void;
}

export interface LegacyMigrationOptions {
  /** Bundled examples checked so unmodified starter scripts point to the example rather than duplicating it. Pass [] to force migration. */
  bundledExamples?: readonly Pick<BundledExample, 'id' | 'title' | 'content'>[];
  /** Default title when legacy script has no saved title. */
  defaultTitle?: string;
  /** Injectable storage adapter (defaults to browser localStorage helpers). */
  legacyStorage?: LegacyLocalStorageAdapter;
  /** Injectable clock (defaults to Date.now). */
  now?: () => number;
  /** Injectable ID generator (defaults to createScriptId). */
  generateId?: () => string;
}

export type LegacyMigrationStatus =
  | 'already-migrated'
  | 'nothing-to-migrate'
  | 'matched-bundled'
  | 'migrated';

export interface LegacyMigrationResult {
  status: LegacyMigrationStatus;
  migratedRecord: ScriptRecord | null;
  activeScriptId: string | null;
}

export interface ScriptLibraryStore {
  readonly backend: 'indexeddb' | 'fallback';
  get(id: string): Promise<ScriptRecord | null>;
  list(): Promise<ScriptRecord[]>;
  put(record: ScriptRecord): Promise<ScriptRecord>;
  bulkPut(records: readonly ScriptRecord[]): Promise<ScriptRecord[]>;
  delete(id: string): Promise<void>;
  bulkDelete(ids: readonly string[]): Promise<void>;
  clearAll(): Promise<void>;
  listSnapshots(scriptId: string): Promise<ScriptSnapshot[]>;
  saveSnapshot(input: SaveSnapshotInput): Promise<ScriptSnapshot | null>;
  updateSnapshot(
    id: string,
    patch: {label?: string; pinned?: boolean}
  ): Promise<ScriptSnapshot | null>;
  deleteSnapshot(id: string): Promise<void>;
  clearSnapshotsForScript(scriptId: string): Promise<void>;
  migrateFromLegacyLocalStorage(options?: LegacyMigrationOptions): Promise<LegacyMigrationResult>;
}

export interface CreateScriptLibraryStoreOptions {
  dbName?: string;
  /** Optional custom IndexedDB factory; pass null to force the graceful fallback backend. */
  indexedDB?: IDBFactory | null;
  /** Optional key for localStorage fallback persistence; pass null for pure in-memory fallback. */
  fallbackStorageKey?: string | null;
}

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

export function createScriptId(prefix = 'script'): string {
  const cleanPrefix = prefix.trim().replace(/[^a-z0-9_-]/gi, '') || 'script';
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${cleanPrefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to timestamp + random ID
  }
  const timePart = Date.now().toString(36);
  const randPart = Math.random().toString(36).slice(2, 10);
  return `${cleanPrefix}-${timePart}-${randPart}`;
}

export function normalizeScriptTags(tags?: readonly string[]): string[] {
  if (!Array.isArray(tags) || tags.length === 0) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim().replace(/\s+/g, ' ').toLowerCase();
    if (clean.length === 0 || seen.has(clean)) continue;
    seen.add(clean);
    normalized.push(clean);
  }
  return normalized;
}

export function sanitizeScriptRecord(record: ScriptRecord): ScriptRecord {
  const id = record.id.trim();
  const title = record.title.trim() || 'Untitled Scene';
  const createdAt =
    typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) && record.createdAt >= 0
      ? record.createdAt
      : Date.now();
  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) && record.updatedAt >= 0
      ? record.updatedAt
      : createdAt;

  const sanitized: ScriptRecord = {
    id,
    title,
    rawText: record.rawText,
    createdAt,
    updatedAt,
  };

  if (typeof record.forkedFromId === 'string' && record.forkedFromId.trim().length > 0) {
    sanitized.forkedFromId = record.forkedFromId.trim();
  }

  if (record.pinned === true) {
    sanitized.pinned = true;
  }

  if (typeof record.folder === 'string') {
    const cleanFolder = record.folder.trim().replace(/\s+/g, ' ');
    if (cleanFolder.length > 0) {
      sanitized.folder = cleanFolder;
    }
  }

  const cleanTags = normalizeScriptTags(record.tags);
  if (cleanTags.length > 0) {
    sanitized.tags = cleanTags;
  }

  return sanitized;
}

export function sortScriptRecords(records: readonly ScriptRecord[]): ScriptRecord[] {
  return [...records].sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id)
  );
}

function isValidStoredRecord(value: unknown): value is ScriptRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.title === 'string' &&
    typeof candidate.rawText === 'string' &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    typeof candidate.updatedAt === 'number' &&
    Number.isFinite(candidate.updatedAt)
  );
}

function getDefaultIndexedDB(): IDBFactory | null {
  try {
    if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && globalThis.indexedDB) {
      return globalThis.indexedDB;
    }
  } catch {
    // Restricted environments (e.g. sandboxed iframes) may throw on property access
  }
  return null;
}

function readFallbackMap(storageKey: string | null): Map<string, ScriptRecord> {
  const map = new Map<string, ScriptRecord>();
  if (!storageKey) return map;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return map;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return map;
    for (const item of parsed) {
      if (isValidStoredRecord(item)) {
        const clean = sanitizeScriptRecord(item);
        map.set(clean.id, clean);
      }
    }
  } catch {
    // Ignore storage read/parse failures
  }
  return map;
}

function persistFallbackMap(storageKey: string | null, map: Map<string, ScriptRecord>): void {
  if (!storageKey) return;
  try {
    const payload = JSON.stringify(sortScriptRecords(Array.from(map.values())));
    window.localStorage.setItem(storageKey, payload);
  } catch {
    // Ignore storage quota or restricted environment errors
  }
}

function isValidStoredSnapshot(value: unknown): value is ScriptSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.scriptId === 'string' &&
    candidate.scriptId.trim().length > 0 &&
    isValidSnapshotTrigger(candidate.trigger) &&
    typeof candidate.label === 'string' &&
    typeof candidate.rawText === 'string' &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt)
  );
}

function sanitizeSnapshot(snapshot: ScriptSnapshot): ScriptSnapshot {
  const createdAt =
    typeof snapshot.createdAt === 'number' &&
    Number.isFinite(snapshot.createdAt) &&
    snapshot.createdAt >= 0
      ? snapshot.createdAt
      : Date.now();
  const clean: ScriptSnapshot = {
    id: snapshot.id.trim(),
    scriptId: snapshot.scriptId.trim(),
    trigger: snapshot.trigger,
    label: snapshot.label.trim() || 'Snapshot',
    rawText: snapshot.rawText,
    createdAt,
  };
  if (snapshot.pinned === true) {
    clean.pinned = true;
  }
  return clean;
}

function getSnapshotsFallbackKey(storageKey: string | null): string | null {
  return storageKey ? `${storageKey}-snapshots` : null;
}

function readFallbackSnapshotsMap(storageKey: string | null): Map<string, ScriptSnapshot> {
  const map = new Map<string, ScriptSnapshot>();
  const key = getSnapshotsFallbackKey(storageKey);
  if (!key) return map;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return map;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return map;
    for (const item of parsed) {
      if (isValidStoredSnapshot(item)) {
        const clean = sanitizeSnapshot(item);
        map.set(clean.id, clean);
      }
    }
  } catch {
    // Ignore storage read/parse failures
  }
  return map;
}

function persistFallbackSnapshotsMap(
  storageKey: string | null,
  map: Map<string, ScriptSnapshot>
): void {
  const key = getSnapshotsFallbackKey(storageKey);
  if (!key) return;
  try {
    const payload = JSON.stringify(sortScriptSnapshots(Array.from(map.values())));
    window.localStorage.setItem(key, payload);
  } catch {
    // Ignore storage quota or restricted environment errors
  }
}

function openIndexedDb(factory: IDBFactory, dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(dbName, SCRIPT_LIBRARY_DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(SCRIPT_LIBRARY_STORE_NAME)) {
        store = db.createObjectStore(SCRIPT_LIBRARY_STORE_NAME, {keyPath: 'id'});
      } else {
        store = request.transaction!.objectStore(SCRIPT_LIBRARY_STORE_NAME);
      }

      if (!store.indexNames.contains(SCRIPT_LIBRARY_UPDATED_AT_INDEX)) {
        store.createIndex(
          SCRIPT_LIBRARY_UPDATED_AT_INDEX,
          SCRIPT_LIBRARY_UPDATED_AT_INDEX,
          {unique: false}
        );
      }

      let snapshotStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(SCRIPT_SNAPSHOTS_STORE_NAME)) {
        snapshotStore = db.createObjectStore(SCRIPT_SNAPSHOTS_STORE_NAME, {keyPath: 'id'});
      } else {
        snapshotStore = request.transaction!.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME);
      }

      if (!snapshotStore.indexNames.contains(SCRIPT_SNAPSHOTS_SCRIPT_ID_INDEX)) {
        snapshotStore.createIndex(
          SCRIPT_SNAPSHOTS_SCRIPT_ID_INDEX,
          SCRIPT_SNAPSHOTS_SCRIPT_ID_INDEX,
          {unique: false}
        );
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB open request was blocked.'));
  });
}

function idbGet(db: IDBDatabase, id: string): Promise<ScriptRecord | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_LIBRARY_STORE_NAME, 'readonly');
    const store = tx.objectStore(SCRIPT_LIBRARY_STORE_NAME);
    const req = store.get(id);

    req.onsuccess = () => {
      resolve(isValidStoredRecord(req.result) ? sanitizeScriptRecord(req.result) : null);
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to read script record.'));
  });
}

function idbList(db: IDBDatabase): Promise<ScriptRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_LIBRARY_STORE_NAME, 'readonly');
    const store = tx.objectStore(SCRIPT_LIBRARY_STORE_NAME);
    const index = store.index(SCRIPT_LIBRARY_UPDATED_AT_INDEX);
    const req = index.openCursor(null, 'prev');
    const results: ScriptRecord[] = [];

    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (isValidStoredRecord(cursor.value)) {
          results.push(sanitizeScriptRecord(cursor.value));
        }
        cursor.continue();
      } else {
        resolve(sortScriptRecords(results));
      }
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to list script records.'));
  });
}

function idbBulkPut(db: IDBDatabase, records: readonly ScriptRecord[]): Promise<ScriptRecord[]> {
  const sanitized = records.map(sanitizeScriptRecord);
  if (sanitized.length === 0) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_LIBRARY_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SCRIPT_LIBRARY_STORE_NAME);

    for (const record of sanitized) {
      store.put(record);
    }

    tx.oncomplete = () => resolve(sanitized);
    tx.onerror = () => reject(tx.error ?? new Error('Failed to persist script records.'));
    tx.onabort = () => reject(tx.error ?? new Error('Script library transaction aborted.'));
  });
}

function deleteSnapshotsForScriptInTx(snapshotStore: IDBObjectStore, scriptId: string): void {
  const index = snapshotStore.index(SCRIPT_SNAPSHOTS_SCRIPT_ID_INDEX);
  const req = index.openCursor(IDBKeyRange.only(scriptId));
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const storeNames = db.objectStoreNames.contains(SCRIPT_SNAPSHOTS_STORE_NAME)
      ? [SCRIPT_LIBRARY_STORE_NAME, SCRIPT_SNAPSHOTS_STORE_NAME]
      : [SCRIPT_LIBRARY_STORE_NAME];
    const tx = db.transaction(storeNames, 'readwrite');
    tx.objectStore(SCRIPT_LIBRARY_STORE_NAME).delete(id);
    if (storeNames.includes(SCRIPT_SNAPSHOTS_STORE_NAME)) {
      deleteSnapshotsForScriptInTx(tx.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME), id);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete script record.'));
    tx.onabort = () => reject(tx.error ?? new Error('Script delete transaction aborted.'));
  });
}

function idbBulkDelete(db: IDBDatabase, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const storeNames = db.objectStoreNames.contains(SCRIPT_SNAPSHOTS_STORE_NAME)
      ? [SCRIPT_LIBRARY_STORE_NAME, SCRIPT_SNAPSHOTS_STORE_NAME]
      : [SCRIPT_LIBRARY_STORE_NAME];
    const tx = db.transaction(storeNames, 'readwrite');
    const store = tx.objectStore(SCRIPT_LIBRARY_STORE_NAME);
    const snapshotStore = storeNames.includes(SCRIPT_SNAPSHOTS_STORE_NAME)
      ? tx.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME)
      : null;
    for (const id of ids) {
      store.delete(id);
      if (snapshotStore) {
        deleteSnapshotsForScriptInTx(snapshotStore, id);
      }
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete script records.'));
    tx.onabort = () => reject(tx.error ?? new Error('Script bulk delete transaction aborted.'));
  });
}

function idbClearAll(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const storeNames = db.objectStoreNames.contains(SCRIPT_SNAPSHOTS_STORE_NAME)
      ? [SCRIPT_LIBRARY_STORE_NAME, SCRIPT_SNAPSHOTS_STORE_NAME]
      : [SCRIPT_LIBRARY_STORE_NAME];
    const tx = db.transaction(storeNames, 'readwrite');
    tx.objectStore(SCRIPT_LIBRARY_STORE_NAME).clear();
    if (storeNames.includes(SCRIPT_SNAPSHOTS_STORE_NAME)) {
      tx.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME).clear();
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear script library.'));
    tx.onabort = () => reject(tx.error ?? new Error('Script library clear transaction aborted.'));
  });
}

function idbListSnapshots(db: IDBDatabase, scriptId: string): Promise<ScriptSnapshot[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_SNAPSHOTS_STORE_NAME, 'readonly');
    const store = tx.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME);
    const index = store.index(SCRIPT_SNAPSHOTS_SCRIPT_ID_INDEX);
    const req = index.getAll(IDBKeyRange.only(scriptId));

    req.onsuccess = () => {
      const rows = Array.isArray(req.result) ? req.result : [];
      const valid = rows.filter(isValidStoredSnapshot).map(sanitizeSnapshot);
      resolve(sortScriptSnapshots(valid));
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to list script snapshots.'));
  });
}

function idbPutSnapshotAndPrune(
  db: IDBDatabase,
  snapshot: ScriptSnapshot,
  pruneIds: readonly string[]
): Promise<ScriptSnapshot> {
  const clean = sanitizeSnapshot(snapshot);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_SNAPSHOTS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME);
    store.put(clean);
    for (const id of pruneIds) {
      store.delete(id);
    }

    tx.oncomplete = () => resolve(clean);
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save script snapshot.'));
    tx.onabort = () => reject(tx.error ?? new Error('Snapshot save transaction aborted.'));
  });
}

function idbUpdateSnapshot(
  db: IDBDatabase,
  id: string,
  patch: {label?: string; pinned?: boolean}
): Promise<ScriptSnapshot | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_SNAPSHOTS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME);
    const req = store.get(id);
    let updated: ScriptSnapshot | null = null;

    req.onsuccess = () => {
      if (!isValidStoredSnapshot(req.result)) {
        return;
      }
      const existing = sanitizeSnapshot(req.result);
      const next: ScriptSnapshot = sanitizeSnapshot({
        ...existing,
        ...(patch.label !== undefined ? {label: patch.label} : {}),
        ...(patch.pinned !== undefined ? {pinned: patch.pinned} : {}),
      });
      if (patch.pinned === false) {
        delete next.pinned;
      }
      updated = next;
      store.put(next);
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to update script snapshot.'));
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => reject(tx.error ?? new Error('Failed to update script snapshot.'));
    tx.onabort = () => reject(tx.error ?? new Error('Snapshot update transaction aborted.'));
  });
}

function idbDeleteSnapshot(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_SNAPSHOTS_STORE_NAME, 'readwrite');
    tx.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete script snapshot.'));
    tx.onabort = () => reject(tx.error ?? new Error('Snapshot delete transaction aborted.'));
  });
}

function idbClearSnapshotsForScript(db: IDBDatabase, scriptId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_SNAPSHOTS_STORE_NAME, 'readwrite');
    deleteSnapshotsForScriptInTx(tx.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME), scriptId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear script snapshots.'));
    tx.onabort = () => reject(tx.error ?? new Error('Snapshot clear transaction aborted.'));
  });
}

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

      const candidate: ScriptSnapshot = sanitizeSnapshot({
        id: input.id?.trim() || createScriptId('snap'),
        scriptId: cleanScriptId,
        trigger: input.trigger,
        label: input.label,
        rawText: input.rawText,
        createdAt: input.createdAt ?? Date.now(),
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
