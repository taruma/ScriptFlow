import {sortScriptSnapshots, type ScriptSnapshot} from '../scriptSnapshots.ts';
import {
  SCRIPT_LIBRARY_DB_VERSION,
  SCRIPT_LIBRARY_STORE_NAME,
  SCRIPT_LIBRARY_UPDATED_AT_INDEX,
  SCRIPT_SNAPSHOTS_SCRIPT_ID_INDEX,
  SCRIPT_SNAPSHOTS_STORE_NAME,
  type ScriptRecord,
} from './dbTypes.ts';
import {
  isValidStoredRecord,
  isValidStoredSnapshot,
  sanitizeScriptRecord,
  sanitizeSnapshot,
  sortScriptRecords,
} from './recordSanitizers.ts';

export function getDefaultIndexedDB(): IDBFactory | null {
  try {
    if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && globalThis.indexedDB) {
      return globalThis.indexedDB;
    }
  } catch {
    // Restricted environments (e.g. sandboxed iframes) may throw on property access
  }
  return null;
}

export function openIndexedDb(factory: IDBFactory, dbName: string): Promise<IDBDatabase> {
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

export function idbGet(db: IDBDatabase, id: string): Promise<ScriptRecord | null> {
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

export function idbList(db: IDBDatabase): Promise<ScriptRecord[]> {
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

export function idbBulkPut(
  db: IDBDatabase,
  records: readonly ScriptRecord[]
): Promise<ScriptRecord[]> {
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

export function deleteSnapshotsForScriptInTx(
  snapshotStore: IDBObjectStore,
  scriptId: string
): void {
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

export function idbDelete(db: IDBDatabase, id: string): Promise<void> {
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

export function idbBulkDelete(db: IDBDatabase, ids: readonly string[]): Promise<void> {
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

export function idbClearAll(db: IDBDatabase): Promise<void> {
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

export function idbListSnapshots(db: IDBDatabase, scriptId: string): Promise<ScriptSnapshot[]> {
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

export function idbPutSnapshotAndPrune(
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

export function idbUpdateSnapshot(
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

export function idbDeleteSnapshot(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_SNAPSHOTS_STORE_NAME, 'readwrite');
    tx.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete script snapshot.'));
    tx.onabort = () => reject(tx.error ?? new Error('Snapshot delete transaction aborted.'));
  });
}

export function idbClearSnapshotsForScript(db: IDBDatabase, scriptId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_SNAPSHOTS_STORE_NAME, 'readwrite');
    deleteSnapshotsForScriptInTx(tx.objectStore(SCRIPT_SNAPSHOTS_STORE_NAME), scriptId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear script snapshots.'));
    tx.onabort = () => reject(tx.error ?? new Error('Snapshot clear transaction aborted.'));
  });
}
