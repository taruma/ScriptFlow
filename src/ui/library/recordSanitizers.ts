import {isValidSnapshotTrigger, type ScriptSnapshot} from '../scriptSnapshots.ts';
import type {ScriptRecord} from './dbTypes.ts';

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

  if (typeof record.branchNote === 'string') {
    const cleanNote = record.branchNote.trim().replace(/\s+/g, ' ').slice(0, 160);
    if (cleanNote.length > 0) {
      sanitized.branchNote = cleanNote;
    }
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

export function isValidStoredRecord(value: unknown): value is ScriptRecord {
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

export function isValidStoredSnapshot(value: unknown): value is ScriptSnapshot {
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

export function sanitizeSnapshot(snapshot: ScriptSnapshot): ScriptSnapshot {
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
