import type {BundledExample} from '../../data/examples/index.ts';
import type {ScriptSnapshot, SnapshotTrigger} from '../scriptSnapshots.ts';

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
  branchNote?: string;
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

export interface FallbackReconcileResult {
  mergedScripts: number;
  mergedSnapshots: number;
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
  reconcileFallbackStorage(): Promise<FallbackReconcileResult>;
  migrateFromLegacyLocalStorage(options?: LegacyMigrationOptions): Promise<LegacyMigrationResult>;
}

export interface CreateScriptLibraryStoreOptions {
  dbName?: string;
  /** Optional custom IndexedDB factory; pass null to force the graceful fallback backend. */
  indexedDB?: IDBFactory | null;
  /** Optional key for localStorage fallback persistence; pass null for pure in-memory fallback. */
  fallbackStorageKey?: string | null;
}
