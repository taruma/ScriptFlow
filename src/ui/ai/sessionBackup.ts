import {z} from 'zod';
import {computeSnapshotHash, type ValidationIssue} from '../../core/index.ts';
import type {BundledExample} from '../../data/examples/index.ts';
import type {ScriptRecord} from '../library/dbTypes.ts';
import {formatExportTimestamp} from '../scriptLibraryCodec.ts';
import {
  AI_SESSION_CONVERSATION_EXPORT_FORMAT,
  AI_SESSION_EXPORT_FORMAT,
  AI_SESSION_SCHEMA_VERSION,
  compactSessionForStorage,
  createAiSessionId,
  hydrateSessionFromStorage,
  isValidStoredAiSession,
  resolveSessionScriptStatus,
  sanitizeAiSessionRecord,
  sortAiSessions,
  type AiSessionRecord,
  type ResolvedAiSessionSummary,
} from './sessionStore.ts';
import {EMPTY_DRAFT_BRIEF, type AiChatMessage} from './types.ts';

export const AI_SESSIONS_BACKUP_FORMAT = 'auteur-ai-sessions-backup' as const;
export const AI_SESSIONS_BACKUP_VERSION = 1 as const;

export type AiSessionBackupScope = 'all' | 'current_script' | 'pinned' | 'selected';

const BackupFileSchema = z.object({
  format: z.literal(AI_SESSIONS_BACKUP_FORMAT),
  backupVersion: z.literal(AI_SESSIONS_BACKUP_VERSION),
  exportedAt: z.string().trim().min(1).optional(),
  includesTraces: z.boolean().optional(),
  sessionCount: z.number().int().nonnegative().optional(),
  sessions: z.array(z.unknown()),
});

const SingleSessionExportSchema = z.object({
  format: z.literal(AI_SESSION_EXPORT_FORMAT),
  exportVersion: z.number().int().positive(),
  exportedAt: z.string().trim().min(1).optional(),
  session: z.object({
    id: z.string().trim().min(1),
    schemaVersion: z.number().optional(),
    title: z.string().optional(),
    titleIsCustom: z.boolean().optional(),
    pinned: z.boolean().optional(),
    createdAt: z.union([z.string(), z.number()]).optional(),
    updatedAt: z.union([z.string(), z.number()]).optional(),
    scriptSessionKey: z.string(),
    scriptId: z.string().optional(),
    scriptKind: z.enum(['custom', 'example']).optional(),
    scriptTitleSnapshot: z.string().optional(),
    focus: z.string().optional(),
    selectedTargetKey: z.string().optional(),
    model: z.string().optional(),
    messageCount: z.number().optional(),
    turnCount: z.number().optional(),
    estimatedCostUsd: z.number().optional(),
    hasOmittedMedia: z.boolean().optional(),
  }),
  brief: z.unknown().optional(),
  systemInstructions: z.record(z.string(), z.string()).optional(),
  messages: z.array(z.unknown()),
  continuity: z.unknown().optional(),
});

export interface AuteurAiSessionsBackupPayload {
  format: typeof AI_SESSIONS_BACKUP_FORMAT;
  backupVersion: typeof AI_SESSIONS_BACKUP_VERSION;
  exportedAt: string;
  includesTraces: boolean;
  sessionCount: number;
  sessions: AiSessionRecord[];
}

export interface BuiltAiSessionsBackupExport {
  filename: string;
  mimeType: string;
  content: string;
  byteSize: number;
  sessionCount: number;
  includesTraces: boolean;
  payload: AuteurAiSessionsBackupPayload;
}

export type ParseAiSessionsImportResult =
  | {
      ok: true;
      sourceFormat: 'sessions-backup' | 'single-session-export';
      exportedAt?: string;
      includesTraces: boolean;
      sessions: AiSessionRecord[];
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      issues?: ValidationIssue[];
    };

export type AiSessionImportStatus = 'new' | 'conflict' | 'duplicate';

export interface AnalyzedAiSessionImportItem {
  session: AiSessionRecord;
  status: AiSessionImportStatus;
  defaultSelected: boolean;
  hasTraces: boolean;
  resolvedSummary: ResolvedAiSessionSummary;
  matchedExisting?: {
    id: string;
    title: string;
    updatedAt: number;
    messageCount: number;
  };
}

export interface AiSessionsImportAnalysis {
  sourceFormat: 'sessions-backup' | 'single-session-export';
  exportedAt?: string;
  warnings: string[];
  items: AnalyzedAiSessionImportItem[];
  newCount: number;
  conflictCount: number;
  duplicateCount: number;
  withTracesCount: number;
  withoutTracesCount: number;
  orphanedScriptCount: number;
}

export interface PreparedAiSessionsImport {
  recordsToWrite: AiSessionRecord[];
  addedCount: number;
  forkedCount: number;
  skippedCount: number;
}

function formatZodIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function measureUtf8Bytes(text: string): number {
  try {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(text).length;
    }
  } catch {
    // Fall back to UTF-16 code unit count
  }
  return text.length;
}

export function formatBackupByteSize(bytes: number): string {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safe < 1024) return `${Math.round(safe)} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB`;
  return `${(safe / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Returns true when a session contains raw API trace rounds, Quick Scan traces,
 * or deduplicated system instruction entries.
 */
export function hasSessionTraces(record: AiSessionRecord): boolean {
  if (record.traceSystemInstructions && Object.keys(record.traceSystemInstructions).length > 0) {
    return true;
  }
  return record.messages.some((msg) => Boolean(msg.trace || msg.quickScanTrace));
}

/**
 * Removes raw API traces (`trace`, `quickScanTrace`, `traceSystemInstructions`) while
 * preserving conversation text, thinking summaries, tool calls, suggestions, Brief,
 * continuity, and previously recorded `estimatedCostUsd`.
 */
export function stripTracesFromSession(record: AiSessionRecord): AiSessionRecord {
  const sanitized = sanitizeAiSessionRecord(record);
  const strippedMessages: AiChatMessage[] = sanitized.messages.map((msg) => {
    const {trace: _trace, quickScanTrace: _qsTrace, ...rest} = msg;
    return rest;
  });

  const {traceSystemInstructions: _sysDict, ...restRecord} = sanitized;
  return compactSessionForStorage({
    ...restRecord,
    messages: strippedMessages,
  });
}

export function selectSessionsForBackup(
  resolvedSessions: readonly ResolvedAiSessionSummary[],
  scope: AiSessionBackupScope,
  selectedIds?: ReadonlySet<string>
): AiSessionRecord[] {
  const list = resolvedSessions.filter((item) => {
    switch (scope) {
      case 'all':
        return true;
      case 'current_script':
        return item.scriptStatus === 'current';
      case 'pinned':
        return Boolean(item.session.pinned);
      case 'selected':
        return Boolean(selectedIds?.has(item.session.id));
    }
  });
  return sortAiSessions(list.map((item) => item.session));
}

export function buildAiSessionsBackupExport(
  sessions: readonly AiSessionRecord[],
  options: {includeTraces?: boolean; now?: Date} = {}
): BuiltAiSessionsBackupExport {
  const includeTraces = options.includeTraces ?? true;
  const now = options.now ?? new Date();

  const prepared = sortAiSessions(sessions).map((session) => {
    const hydrated = hydrateSessionFromStorage(sanitizeAiSessionRecord(session));
    return includeTraces ? compactSessionForStorage(hydrated) : stripTracesFromSession(hydrated);
  });

  const payload: AuteurAiSessionsBackupPayload = {
    format: AI_SESSIONS_BACKUP_FORMAT,
    backupVersion: AI_SESSIONS_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    includesTraces: includeTraces,
    sessionCount: prepared.length,
    sessions: prepared,
  };

  const content = `${JSON.stringify(payload, null, 2)}\n`;
  const stamp = formatExportTimestamp(now);
  return {
    filename: `auteur-ai-chat-history-${stamp}.json`,
    mimeType: 'application/json;charset=utf-8',
    content,
    byteSize: measureUtf8Bytes(content),
    sessionCount: prepared.length,
    includesTraces: includeTraces,
    payload,
  };
}

function parseTimestampMs(raw: string | number | undefined, fallbackMs: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return fallbackMs;
}

function reconstructRecordFromSingleSessionExport(
  data: z.infer<typeof SingleSessionExportSchema>
): AiSessionRecord | null {
  const nowMs = Date.now();
  const createdAt = parseTimestampMs(data.session.createdAt, nowMs);
  const updatedAt = parseTimestampMs(data.session.updatedAt, createdAt);
  const sysDict = data.systemInstructions ?? {};

  const restoredMessages = data.messages
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((msgObj) => {
      const traceObj = msgObj.trace;
      if (traceObj && typeof traceObj === 'object') {
        const traceRecord = traceObj as Record<string, unknown>;
        if (Array.isArray(traceRecord.rounds)) {
          const restoredRounds = traceRecord.rounds.map((roundEntry) => {
            if (!roundEntry || typeof roundEntry !== 'object') return roundEntry;
            const roundObj = roundEntry as Record<string, unknown>;
            const req = roundObj.request;
            if (!req || typeof req !== 'object') return roundEntry;
            const reqObj = req as Record<string, unknown>;
            const refKey =
              typeof reqObj.systemInstructionRef === 'string' ? reqObj.systemInstructionRef : '';
            if (refKey && typeof reqObj.systemInstruction !== 'string') {
              const {systemInstructionRef: _ref, ...restReq} = reqObj;
              return {
                ...roundObj,
                request: {
                  ...restReq,
                  systemInstruction: `__ref:${refKey}`,
                },
              };
            }
            return roundEntry;
          });
          return {
            ...msgObj,
            trace: {
              ...traceRecord,
              rounds: restoredRounds,
            },
          };
        }
      }
      return msgObj;
    });

  const candidate: AiSessionRecord = {
    id: data.session.id,
    schemaVersion: data.session.schemaVersion ?? AI_SESSION_SCHEMA_VERSION,
    title: data.session.title ?? '',
    ...(data.session.titleIsCustom ? {titleIsCustom: true} : {}),
    ...(data.session.pinned ? {pinned: true} : {}),
    createdAt,
    updatedAt,
    scriptSessionKey: data.session.scriptSessionKey,
    scriptId: data.session.scriptId ?? '',
    scriptKind: data.session.scriptKind ?? 'custom',
    scriptTitleSnapshot: data.session.scriptTitleSnapshot ?? 'Untitled Scene',
    focus: (data.session.focus as AiSessionRecord['focus']) ?? 'auto',
    selectedTargetKey: data.session.selectedTargetKey ?? 'whole',
    model: (data.session.model as AiSessionRecord['model']) ?? 'gemini-4-hydrogen',
    messageCount: data.session.messageCount ?? restoredMessages.length,
    turnCount: data.session.turnCount ?? 0,
    estimatedCostUsd: data.session.estimatedCostUsd ?? 0,
    ...(data.session.hasOmittedMedia ? {hasOmittedMedia: true} : {}),
    messages: restoredMessages as unknown as AiChatMessage[],
    ...(Object.keys(sysDict).length > 0 ? {traceSystemInstructions: sysDict} : {}),
    brief:
      data.brief && typeof data.brief === 'object'
        ? (data.brief as AiSessionRecord['brief'])
        : {...EMPTY_DRAFT_BRIEF},
    continuity:
      data.continuity && typeof data.continuity === 'object'
        ? (data.continuity as AiSessionRecord['continuity'])
        : {},
  };

  if (!isValidStoredAiSession(candidate)) {
    return null;
  }
  return hydrateSessionFromStorage(sanitizeAiSessionRecord(candidate));
}

export function parseAiSessionsImport(input: string): ParseAiSessionsImportResult {
  const cleaned = input.replace(/^\uFEFF/, '').trim();
  if (!cleaned) {
    return {ok: false, error: 'Imported JSON file is empty.'};
  }

  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Syntax error';
    return {ok: false, error: `Malformed JSON file: ${detail}`};
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {ok: false, error: 'Expected a JSON object for AI chat history import.'};
  }

  const record = raw as Record<string, unknown>;
  if (record.format === AI_SESSION_CONVERSATION_EXPORT_FORMAT) {
    return {
      ok: false,
      error:
        'Conversation-only exports omit internal session state and cannot be imported. Export a Chat History Backup or Full Payload (.json) instead.',
    };
  }

  if (record.format === AI_SESSIONS_BACKUP_FORMAT) {
    const parsed = BackupFileSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Invalid AI Chat History Backup file.',
        issues: formatZodIssues(parsed.error.issues),
      };
    }

    const warnings: string[] = [];
    const seenIds = new Set<string>();
    const sessions: AiSessionRecord[] = [];
    let skippedInvalid = 0;
    let skippedDuplicateIds = 0;

    for (const entry of parsed.data.sessions) {
      if (!isValidStoredAiSession(entry)) {
        skippedInvalid += 1;
        continue;
      }
      const hydrated = hydrateSessionFromStorage(sanitizeAiSessionRecord(entry));
      if (seenIds.has(hydrated.id)) {
        skippedDuplicateIds += 1;
        continue;
      }
      seenIds.add(hydrated.id);
      sessions.push(hydrated);
    }

    if (skippedInvalid > 0) {
      warnings.push(
        `Skipped ${skippedInvalid} malformed session ${skippedInvalid === 1 ? 'entry' : 'entries'}.`
      );
    }
    if (skippedDuplicateIds > 0) {
      warnings.push(
        `Skipped ${skippedDuplicateIds} duplicate session ${
          skippedDuplicateIds === 1 ? 'ID' : 'IDs'
        } inside the backup file.`
      );
    }
    if (sessions.length === 0) {
      return {
        ok: false,
        error: 'Backup file does not contain any valid AI chat sessions.',
      };
    }

    const sorted = sortAiSessions(sessions);
    return {
      ok: true,
      sourceFormat: 'sessions-backup',
      exportedAt: parsed.data.exportedAt,
      includesTraces: sorted.some(hasSessionTraces),
      sessions: sorted,
      warnings,
    };
  }

  if (record.format === AI_SESSION_EXPORT_FORMAT) {
    const parsed = SingleSessionExportSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Invalid single-session AI export payload.',
        issues: formatZodIssues(parsed.error.issues),
      };
    }

    const restored = reconstructRecordFromSingleSessionExport(parsed.data);
    if (!restored) {
      return {
        ok: false,
        error: 'Single-session AI export payload is missing required session fields.',
      };
    }

    return {
      ok: true,
      sourceFormat: 'single-session-export',
      exportedAt: parsed.data.exportedAt,
      includesTraces: hasSessionTraces(restored),
      sessions: [restored],
      warnings: [],
    };
  }

  return {
    ok: false,
    error:
      'Unrecognized JSON format. Choose an AI Chat History Backup (.json) or single-session Full Payload (.json).',
  };
}

/**
 * Computes a deterministic content fingerprint ignoring raw API traces so a trace-free
 * backup of an unmodified session is still recognized as a duplicate rather than a conflict.
 */
function computeSessionContentFingerprint(session: AiSessionRecord): string {
  const normalized = sanitizeAiSessionRecord(session);
  const summary = {
    title: normalized.title.trim(),
    pinned: Boolean(normalized.pinned),
    scriptSessionKey: normalized.scriptSessionKey,
    updatedAt: normalized.updatedAt,
    messageCount: normalized.messages.length,
    briefSpecs: normalized.brief.specs,
    briefSubtext: normalized.brief.subtext,
    briefRefCount: normalized.brief.references.length,
    messages: normalized.messages.map((msg) => ({
      role: msg.role,
      focus: msg.focus,
      text: msg.text,
      applied: msg.appliedSuggestionIds ?? [],
      dismissed: msg.dismissedSuggestionIds ?? [],
      suggestionsCount: msg.suggestions?.length ?? 0,
      hasQuickScan: Boolean(msg.quickScan),
    })),
  };
  return computeSnapshotHash(JSON.stringify(summary));
}

export function analyzeAiSessionsImport(
  parsed: Extract<ParseAiSessionsImportResult, {ok: true}>,
  existingSessions: readonly AiSessionRecord[],
  options: {
    currentScriptSessionKey: string;
    customScripts: readonly ScriptRecord[];
    examples: readonly BundledExample[];
  }
): AiSessionsImportAnalysis {
  const existingById = new Map(existingSessions.map((sess) => [sess.id, sess]));
  const existingFingerprints = new Map(
    existingSessions.map((sess) => [sess.id, computeSessionContentFingerprint(sess)])
  );

  let newCount = 0;
  let conflictCount = 0;
  let duplicateCount = 0;
  let withTracesCount = 0;
  let withoutTracesCount = 0;
  let orphanedScriptCount = 0;

  const items: AnalyzedAiSessionImportItem[] = sortAiSessions(parsed.sessions).map((session) => {
    const existing = existingById.get(session.id);
    const hasTraces = hasSessionTraces(session);
    if (hasTraces) withTracesCount += 1;
    else withoutTracesCount += 1;

    const resolvedSummary = resolveSessionScriptStatus(
      session,
      options.currentScriptSessionKey,
      options.customScripts,
      options.examples
    );
    if (resolvedSummary.scriptStatus === 'deleted') {
      orphanedScriptCount += 1;
    }

    if (!existing) {
      newCount += 1;
      return {
        session,
        status: 'new',
        defaultSelected: true,
        hasTraces,
        resolvedSummary,
      };
    }

    const sameContent =
      existingFingerprints.get(session.id) === computeSessionContentFingerprint(session);
    if (sameContent) {
      duplicateCount += 1;
      return {
        session,
        status: 'duplicate',
        defaultSelected: false,
        hasTraces,
        resolvedSummary,
        matchedExisting: {
          id: existing.id,
          title: existing.title,
          updatedAt: existing.updatedAt,
          messageCount: existing.messageCount,
        },
      };
    }

    conflictCount += 1;
    return {
      session,
      status: 'conflict',
      defaultSelected: true,
      hasTraces,
      resolvedSummary,
      matchedExisting: {
        id: existing.id,
        title: existing.title,
        updatedAt: existing.updatedAt,
        messageCount: existing.messageCount,
      },
    };
  });

  return {
    sourceFormat: parsed.sourceFormat,
    exportedAt: parsed.exportedAt,
    warnings: parsed.warnings,
    items,
    newCount,
    conflictCount,
    duplicateCount,
    withTracesCount,
    withoutTracesCount,
    orphanedScriptCount,
  };
}

function disambiguateImportedTitle(
  baseTitle: string,
  takenTitles: Set<string>
): string {
  const clean = baseTitle.trim() || 'AI Session';
  if (!takenTitles.has(clean)) {
    takenTitles.add(clean);
    return clean;
  }
  let candidate = `${clean} (Imported)`;
  let counter = 2;
  while (takenTitles.has(candidate)) {
    candidate = `${clean} (Imported ${counter})`;
    counter += 1;
  }
  takenTitles.add(candidate);
  return candidate;
}

export function prepareSelectedAiSessionsImport(
  analysis: AiSessionsImportAnalysis,
  selectedIds: ReadonlySet<string>,
  existingSessions: readonly AiSessionRecord[],
  options: {generateId?: () => string} = {}
): PreparedAiSessionsImport {
  const generateId = options.generateId ?? createAiSessionId;
  const takenIds = new Set(existingSessions.map((s) => s.id));
  const takenTitles = new Set(existingSessions.map((s) => s.title.trim()));

  const recordsToWrite: AiSessionRecord[] = [];
  let addedCount = 0;
  let forkedCount = 0;
  let skippedCount = 0;

  for (const item of analysis.items) {
    if (!selectedIds.has(item.session.id)) {
      skippedCount += 1;
      continue;
    }

    if (item.status === 'new' && !takenIds.has(item.session.id)) {
      takenIds.add(item.session.id);
      takenTitles.add(item.session.title.trim());
      recordsToWrite.push(hydrateSessionFromStorage(sanitizeAiSessionRecord(item.session)));
      addedCount += 1;
      continue;
    }

    // Conflict or duplicate explicitly selected: fork under a fresh ID so existing local history is untouched
    let nextId = generateId();
    while (takenIds.has(nextId)) {
      nextId = generateId();
    }
    takenIds.add(nextId);

    const nextTitle = disambiguateImportedTitle(item.session.title, takenTitles);
    const forked = hydrateSessionFromStorage(
      sanitizeAiSessionRecord({
        ...item.session,
        id: nextId,
        title: nextTitle,
        titleIsCustom: true,
      })
    );
    recordsToWrite.push(forked);
    forkedCount += 1;
  }

  return {
    recordsToWrite,
    addedCount,
    forkedCount,
    skippedCount,
  };
}
