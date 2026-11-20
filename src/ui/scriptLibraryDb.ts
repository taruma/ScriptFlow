import {exportPlainText} from '../core/index.ts';
import {BUNDLED_EXAMPLES, type BundledExample} from '../data/examples/index.ts';
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
export const SCRIPT_LIBRARY_DB_VERSION = 1;
export const SCRIPT_LIBRARY_STORE_NAME = 'scripts';
export const SCRIPT_LIBRARY_UPDATED_AT_INDEX = 'updatedAt';

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

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_LIBRARY_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SCRIPT_LIBRARY_STORE_NAME);
    store.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete script record.'));
    tx.onabort = () => reject(tx.error ?? new Error('Script delete transaction aborted.'));
  });
}

function idbBulkDelete(db: IDBDatabase, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_LIBRARY_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SCRIPT_LIBRARY_STORE_NAME);
    for (const id of ids) {
      store.delete(id);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete script records.'));
    tx.onabort = () => reject(tx.error ?? new Error('Script bulk delete transaction aborted.'));
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

  const ensureFallbackMap = (): Map<string, ScriptRecord> => {
    if (!fallbackMap) {
      fallbackMap = readFallbackMap(fallbackStorageKey);
    }
    return fallbackMap;
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
