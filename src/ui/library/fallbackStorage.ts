import {sortScriptSnapshots, type ScriptSnapshot} from '../scriptSnapshots.ts';
import type {ScriptRecord} from './dbTypes.ts';
import {
  isValidStoredRecord,
  isValidStoredSnapshot,
  sanitizeScriptRecord,
  sanitizeSnapshot,
  sortScriptRecords,
} from './recordSanitizers.ts';

export function getSnapshotsFallbackKey(storageKey: string | null): string | null {
  return storageKey ? `${storageKey}-snapshots` : null;
}

export function readFallbackMap(storageKey: string | null): Map<string, ScriptRecord> {
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

export function persistFallbackMap(storageKey: string | null, map: Map<string, ScriptRecord>): void {
  if (!storageKey) return;
  try {
    const payload = JSON.stringify(sortScriptRecords(Array.from(map.values())));
    window.localStorage.setItem(storageKey, payload);
  } catch {
    // Ignore storage quota or restricted environment errors
  }
}

export function readFallbackSnapshotsMap(storageKey: string | null): Map<string, ScriptSnapshot> {
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

export function persistFallbackSnapshotsMap(
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
