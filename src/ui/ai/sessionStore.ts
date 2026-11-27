import type {BundledExample} from '../../data/examples/index.ts';
import type {AssistantFocus} from '../../services/auteurKnowledge.ts';
import type {PendingQuestionPause} from '../../services/gemini/interactionTypes.ts';
import type {QuestionSuggestion, StagedSuggestion} from '../../services/scriptTools.ts';
import {aggregateSessionCost, estimateTraceCost} from '../aiPricing.ts';
import type {GeminiModelId} from '../aiSettings.ts';
import type {ScriptRecord} from '../library/dbTypes.ts';
import {formatExportTimestamp, slugifyFilename} from '../scriptLibraryCodec.ts';
import {
  formatChatAttachmentSummary,
  sanitizeChatAttachmentForStorage,
} from './chatAttachments.ts';
import {
  formatAttachmentTag,
  formatSceneBriefContext,
  isReferenceAttachmentExpired,
} from './draftBrief.ts';
import {
  EMPTY_DRAFT_BRIEF,
  type AiChatMessage,
  type AiLoadedSkillItem,
  type ChatMessageAttachment,
  type DraftBriefState,
  type QuestionResponseRecord,
  type ReferenceAttachment,
  type ReferenceEntry,
} from './types.ts';

export const AI_SESSION_SCHEMA_VERSION = 1;
export const AI_SESSION_EXPORT_FORMAT = 'auteur-ai-session-export';
export const AI_SESSION_CONVERSATION_EXPORT_FORMAT = 'auteur-ai-conversation-export';
export const AI_SESSION_EXPORT_VERSION = 1;
export const MAX_AUTO_AI_SESSIONS = 100;
export const RECENT_AI_SESSIONS_LIMIT = 5;

const TRACE_SYS_REF_PREFIX = '__ref:';
const TRACE_DEDUP_MIN_LENGTH = 120;
const PATCH_DIFF_EXPORT_MAX_LINES = 120;

export type AiSessionScriptStatus = 'current' | 'other_exists' | 'deleted';
export type AiSessionFilterTab = 'all' | 'current_script' | 'pinned';

export interface AiSessionPendingQuestion extends PendingQuestionPause {
  messageId: string;
  suggestion: QuestionSuggestion;
}

export interface AiSessionContinuityState {
  lastInteractionId?: string;
  lastTurnSnapshotHash?: string;
  lastTurnRawText?: string;
  lastTurnSceneTitle?: string;
  lastTurnDiagnosticsFingerprint?: string;
  lastTurnBriefContext?: string;
  sentAttachmentFingerprints?: string[];
  pendingQuestion?: AiSessionPendingQuestion;
}

export interface AiSessionRecord {
  id: string;
  schemaVersion: number;
  title: string;
  titleIsCustom?: boolean;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
  scriptSessionKey: string;
  scriptId: string;
  scriptKind: 'custom' | 'example';
  scriptTitleSnapshot: string;
  focus: AssistantFocus;
  selectedTargetKey: string;
  model: GeminiModelId;
  messageCount: number;
  turnCount: number;
  estimatedCostUsd: number;
  hasOmittedMedia?: boolean;
  messages: AiChatMessage[];
  traceSystemInstructions?: Record<string, string>;
  brief: DraftBriefState;
  continuity: AiSessionContinuityState;
}

export interface ResolvedAiSessionSummary {
  session: AiSessionRecord;
  scriptStatus: AiSessionScriptStatus;
  resolvedScriptTitle: string;
  liveCustomScript?: ScriptRecord;
  liveExample?: BundledExample;
}

export function createAiSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `aisess-${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to timestamp + random ID
  }
  const timePart = Date.now().toString(36);
  const randPart = Math.random().toString(36).slice(2, 10);
  return `aisess-${timePart}-${randPart}`;
}

export function deriveAiSessionTitle(
  messages: readonly AiChatMessage[],
  fallbackTitle?: string
): string {
  for (const msg of messages) {
    if (msg.role !== 'user') continue;
    const normalized = msg.text.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    if (normalized.length <= 72) return normalized;
    return `${normalized.slice(0, 71).trimEnd()}…`;
  }
  const cleanFallback = fallbackTitle?.replace(/\s+/g, ' ').trim();
  return cleanFallback || 'AI Session';
}

export function parseScriptSessionKey(key: string): {kind: 'custom' | 'example'; id: string} {
  const trimmed = key.trim();
  if (trimmed.startsWith('example:')) {
    return {kind: 'example', id: trimmed.slice('example:'.length)};
  }
  if (trimmed.startsWith('custom:')) {
    return {kind: 'custom', id: trimmed.slice('custom:'.length)};
  }
  return {kind: 'custom', id: trimmed};
}

function isPersistableRemoteUrl(url?: string): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

/**
 * Strips heavy binary/inline media payloads (`inlineBase64`, `inlineText`, `blob:`/`data:` URLs)
 * from DraftBriefState so persisted history stays compact while keeping `omittedAttachmentTag`
 * aligned with `formatSceneBriefContext`. Lightweight remote references (`youtube` URLs and
 * `files_api` URIs with expiration metadata) are preserved without `localMediaUrl` / binary blobs
 * so they survive reloads and exports with byte-identical `formatSceneBriefContext()` output.
 */
export function stripBriefMediaForStorage(
  brief: DraftBriefState,
  nowMs: number = Date.now()
): {
  brief: DraftBriefState;
  hadMedia: boolean;
} {
  let hadMedia = false;
  const cleanRefs: ReferenceEntry[] = [];

  for (const entry of brief.references) {
    const att = entry.attachment;
    const remoteUri = att?.uri?.trim() ?? '';
    if (att && (att.source === 'youtube' || att.source === 'files_api') && remoteUri.length > 0) {
      const persistedAttachment: ReferenceAttachment = {
        source: att.source,
        mimeType: att.mimeType,
        uri: remoteUri,
        fingerprint: att.fingerprint,
        ...(att.fileName ? {fileName: att.fileName} : {}),
        ...(att.sizeBytes !== undefined ? {sizeBytes: att.sizeBytes} : {}),
        ...(att.width ? {width: att.width} : {}),
        ...(att.height ? {height: att.height} : {}),
        ...(isPersistableRemoteUrl(att.previewUrl) ? {previewUrl: att.previewUrl!.trim()} : {}),
        ...(att.filesApiName ? {filesApiName: att.filesApiName} : {}),
        ...(att.expirationTime ? {expirationTime: att.expirationTime} : {}),
        ...(att.processingMode ? {processingMode: att.processingMode} : {}),
      };

      if (isReferenceAttachmentExpired(persistedAttachment, nowMs)) {
        hadMedia = true;
      }

      cleanRefs.push({
        id: entry.id,
        handle: entry.handle,
        kind: entry.kind,
        label: entry.label,
        ...(entry.note !== undefined ? {note: entry.note} : {}),
        attachment: persistedAttachment,
      });
      continue;
    }

    const hasAttachment = Boolean(att);
    const preservedTag = hasAttachment
      ? formatAttachmentTag(entry)
      : entry.omittedAttachmentTag?.trim() ?? '';
    if (hasAttachment || preservedTag.length > 0) {
      hadMedia = true;
    }

    const cleanEntry: ReferenceEntry = {
      id: entry.id,
      handle: entry.handle,
      kind: entry.kind,
      label: entry.label,
      ...(entry.note !== undefined ? {note: entry.note} : {}),
      ...(preservedTag.length > 0 ? {omittedAttachmentTag: preservedTag} : {}),
    };
    cleanRefs.push(cleanEntry);
  }

  return {
    hadMedia,
    brief: {
      enabled: brief.enabled,
      references: cleanRefs,
      specs: brief.specs,
      subtext: brief.subtext,
    },
  };
}

export function normalizeMessagesForStorage(messages: readonly AiChatMessage[]): AiChatMessage[] {
  return messages.map((msg) => {
    const normalizedToolCalls = msg.toolCalls?.map((call) =>
      call.status === 'running' ? {...call, status: 'stopped' as const} : {...call}
    );
    return {
      ...msg,
      isStreaming: false,
      ...(normalizedToolCalls ? {toolCalls: normalizedToolCalls} : {}),
    };
  });
}

/**
 * Strips heavy binary/inline payloads from per-turn `AiChatMessage.attachments`
 * while preserving lightweight `youtube` and `files_api` URI metadata.
 */
export function stripMessageAttachmentsForStorage(
  messages: readonly AiChatMessage[],
  nowMs: number = Date.now()
): {
  messages: AiChatMessage[];
  hadMedia: boolean;
} {
  let hadMedia = false;
  const cleanMessages = messages.map((msg) => {
    if (!msg.attachments || msg.attachments.length === 0) {
      return msg;
    }
    const cleanAttachments: ChatMessageAttachment[] = msg.attachments.map((att) => {
      const sanitized = sanitizeChatAttachmentForStorage(att, nowMs);
      if (sanitized.hadOmittedMedia) {
        hadMedia = true;
      }
      return sanitized.item;
    });
    return {
      ...msg,
      attachments: cleanAttachments,
    };
  });
  return {messages: cleanMessages, hadMedia};
}

/**
 * Normalizes messages, strips Brief & message attachments, and deduplicates identical `systemInstruction`
 * strings across multi-round traces into `traceSystemInstructions` for compact IndexedDB storage
 * while keeping 100% Trace Inspector parity after hydration.
 */
export function compactSessionForStorage(record: AiSessionRecord): AiSessionRecord {
  const {messages: strippedMessages, hadMedia: hadMessageMedia} = stripMessageAttachmentsForStorage(
    normalizeMessagesForStorage(record.messages)
  );
  const {brief: strippedBrief, hadMedia: hadBriefMedia} = stripBriefMediaForStorage(
    record.brief ?? EMPTY_DRAFT_BRIEF
  );

  const dict: Record<string, string> = {};
  const textToKey = new Map<string, string>();
  let nextIndex = 0;

  if (record.traceSystemInstructions) {
    for (const [key, value] of Object.entries(record.traceSystemInstructions)) {
      if (typeof value === 'string' && value.length > 0) {
        dict[key] = value;
        textToKey.set(value, key);
        const match = /^sys_(\d+)$/.exec(key);
        if (match) {
          nextIndex = Math.max(nextIndex, Number.parseInt(match[1], 10) + 1);
        }
      }
    }
  }

  const internSystemInstruction = (rawSys: string): string => {
    if (rawSys.startsWith(TRACE_SYS_REF_PREFIX)) {
      const refKey = rawSys.slice(TRACE_SYS_REF_PREFIX.length);
      if (dict[refKey] !== undefined) {
        return rawSys;
      }
      return rawSys;
    }
    if (rawSys.length <= TRACE_DEDUP_MIN_LENGTH) {
      return rawSys;
    }
    const existingKey = textToKey.get(rawSys);
    if (existingKey) {
      return `${TRACE_SYS_REF_PREFIX}${existingKey}`;
    }
    const key = `sys_${nextIndex++}`;
    dict[key] = rawSys;
    textToKey.set(rawSys, key);
    return `${TRACE_SYS_REF_PREFIX}${key}`;
  };

  const compactedMessages = strippedMessages.map((msg) => {
    if (!msg.trace || !Array.isArray(msg.trace.rounds) || msg.trace.rounds.length === 0) {
      return msg;
    }
    return {
      ...msg,
      trace: {
        ...msg.trace,
        rounds: msg.trace.rounds.map((round) => ({
          ...round,
          request: {
            ...round.request,
            systemInstruction:
              typeof round.request.systemInstruction === 'string'
                ? internSystemInstruction(round.request.systemInstruction)
                : '',
          },
        })),
      },
    };
  });

  const costSummary = aggregateSessionCost(compactedMessages);
  const preservedCostUsd =
    typeof record.estimatedCostUsd === 'number' &&
    Number.isFinite(record.estimatedCostUsd) &&
    record.estimatedCostUsd >= 0
      ? record.estimatedCostUsd
      : 0;
  const userTurnCount = compactedMessages.filter((msg) => msg.role === 'user').length;
  const hasDictEntries = Object.keys(dict).length > 0;
  const hasOmittedMedia = Boolean(record.hasOmittedMedia || hadBriefMedia || hadMessageMedia);

  const clean: AiSessionRecord = {
    ...record,
    schemaVersion: AI_SESSION_SCHEMA_VERSION,
    title: record.title.trim() || deriveAiSessionTitle(compactedMessages, record.scriptTitleSnapshot),
    scriptTitleSnapshot: record.scriptTitleSnapshot.trim() || 'Untitled Scene',
    messageCount: compactedMessages.length,
    turnCount: userTurnCount > 0 ? userTurnCount : costSummary.turnCount,
    estimatedCostUsd: costSummary.turnCount > 0 ? costSummary.totalCostUsd : preservedCostUsd,
    messages: compactedMessages,
    brief: strippedBrief,
    ...(hasOmittedMedia ? {hasOmittedMedia: true} : {}),
    ...(hasDictEntries ? {traceSystemInstructions: dict} : {}),
  };

  if (!clean.hasOmittedMedia) delete clean.hasOmittedMedia;
  if (!hasDictEntries) delete clean.traceSystemInstructions;
  if (!clean.pinned) delete clean.pinned;
  if (!clean.titleIsCustom) delete clean.titleIsCustom;

  return clean;
}

/**
 * Rehydrates compacted trace `systemInstruction` references back to full strings so
 * `AiTraceModal` renders identically to a live session.
 */
export function hydrateSessionFromStorage(record: AiSessionRecord): AiSessionRecord {
  const dict = record.traceSystemInstructions ?? {};
  const hydratedMessages = (Array.isArray(record.messages) ? record.messages : []).map((msg) => {
    const baseMsg: AiChatMessage = {
      ...msg,
      isStreaming: false,
    };
    if (!baseMsg.trace || !Array.isArray(baseMsg.trace.rounds) || baseMsg.trace.rounds.length === 0) {
      return baseMsg;
    }
    return {
      ...baseMsg,
      trace: {
        ...baseMsg.trace,
        rounds: baseMsg.trace.rounds.map((round) => {
          const rawSys = round.request?.systemInstruction;
          const resolvedSys =
            typeof rawSys === 'string' && rawSys.startsWith(TRACE_SYS_REF_PREFIX)
              ? (dict[rawSys.slice(TRACE_SYS_REF_PREFIX.length)] ?? rawSys)
              : (rawSys ?? '');
          return {
            ...round,
            request: {
              ...round.request,
              systemInstruction: resolvedSys,
            },
          };
        }),
      },
    };
  });

  const hydratedBrief: DraftBriefState = record.brief
    ? {
        enabled: record.brief.enabled !== false,
        references: Array.isArray(record.brief.references) ? record.brief.references : [],
        specs: typeof record.brief.specs === 'string' ? record.brief.specs : '',
        subtext: typeof record.brief.subtext === 'string' ? record.brief.subtext : '',
      }
    : {...EMPTY_DRAFT_BRIEF};

  return {
    ...record,
    messages: hydratedMessages,
    brief: hydratedBrief,
    continuity: record.continuity ?? {},
  };
}

export function isValidStoredAiSession(value: unknown): value is AiSessionRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.scriptSessionKey === 'string' &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    typeof candidate.updatedAt === 'number' &&
    Number.isFinite(candidate.updatedAt) &&
    Array.isArray(candidate.messages)
  );
}

export function sanitizeAiSessionRecord(record: AiSessionRecord): AiSessionRecord {
  const id = record.id.trim();
  const createdAt =
    typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) && record.createdAt >= 0
      ? record.createdAt
      : Date.now();
  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) && record.updatedAt >= 0
      ? record.updatedAt
      : createdAt;
  const parsedKey = parseScriptSessionKey(record.scriptSessionKey);
  const scriptKind = record.scriptKind === 'example' ? 'example' : parsedKey.kind;
  const scriptId = record.scriptId?.trim() || parsedKey.id;
  const scriptSessionKey = record.scriptSessionKey.trim() || `${scriptKind}:${scriptId}`;
  const messages = normalizeMessagesForStorage(Array.isArray(record.messages) ? record.messages : []);

  const sanitized: AiSessionRecord = {
    id,
    schemaVersion:
      typeof record.schemaVersion === 'number' && Number.isFinite(record.schemaVersion)
        ? record.schemaVersion
        : AI_SESSION_SCHEMA_VERSION,
    title:
      typeof record.title === 'string' && record.title.trim().length > 0
        ? record.title.trim()
        : deriveAiSessionTitle(messages, record.scriptTitleSnapshot),
    ...(record.titleIsCustom === true ? {titleIsCustom: true} : {}),
    ...(record.pinned === true ? {pinned: true} : {}),
    createdAt,
    updatedAt,
    scriptSessionKey,
    scriptId,
    scriptKind,
    scriptTitleSnapshot:
      typeof record.scriptTitleSnapshot === 'string' && record.scriptTitleSnapshot.trim().length > 0
        ? record.scriptTitleSnapshot.trim()
        : 'Untitled Scene',
    focus: record.focus ?? 'auto',
    selectedTargetKey:
      typeof record.selectedTargetKey === 'string' && record.selectedTargetKey.trim().length > 0
        ? record.selectedTargetKey
        : 'whole',
    model: record.model ?? 'gemini-4-hydrogen',
    messageCount:
      typeof record.messageCount === 'number' && Number.isFinite(record.messageCount)
        ? record.messageCount
        : messages.length,
    turnCount:
      typeof record.turnCount === 'number' && Number.isFinite(record.turnCount)
        ? record.turnCount
        : messages.filter((msg) => msg.role === 'user').length,
    estimatedCostUsd:
      typeof record.estimatedCostUsd === 'number' && Number.isFinite(record.estimatedCostUsd)
        ? record.estimatedCostUsd
        : 0,
    ...(record.hasOmittedMedia === true ? {hasOmittedMedia: true} : {}),
    messages,
    ...(record.traceSystemInstructions ? {traceSystemInstructions: record.traceSystemInstructions} : {}),
    brief: record.brief
      ? {
          enabled: record.brief.enabled !== false,
          references: Array.isArray(record.brief.references) ? record.brief.references : [],
          specs: typeof record.brief.specs === 'string' ? record.brief.specs : '',
          subtext: typeof record.brief.subtext === 'string' ? record.brief.subtext : '',
        }
      : {...EMPTY_DRAFT_BRIEF},
    continuity:
      record.continuity && typeof record.continuity === 'object' ? {...record.continuity} : {},
  };

  return sanitized;
}

export function sortAiSessions(sessions: readonly AiSessionRecord[]): AiSessionRecord[] {
  return [...sessions].sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id)
  );
}

/**
 * Protects pinned and user-renamed sessions from automatic FIFO pruning.
 */
export function selectAiSessionsToPrune(
  sessions: readonly AiSessionRecord[],
  maxAuto: number = MAX_AUTO_AI_SESSIONS
): string[] {
  const limit = Math.max(0, Math.floor(maxAuto));
  const sorted = sortAiSessions(sessions);
  const unprotected = sorted.filter((session) => !session.pinned && !session.titleIsCustom);
  if (unprotected.length <= limit) return [];
  return unprotected.slice(limit).map((session) => session.id);
}

export function resolveSessionScriptStatus(
  session: AiSessionRecord,
  currentScriptSessionKey: string,
  customScripts: readonly ScriptRecord[],
  examples: readonly BundledExample[]
): ResolvedAiSessionSummary {
  const isCurrent = session.scriptSessionKey === currentScriptSessionKey;

  if (session.scriptKind === 'example') {
    const matchedExample = examples.find((ex) => ex.id === session.scriptId);
    if (matchedExample) {
      return {
        session,
        scriptStatus: isCurrent ? 'current' : 'other_exists',
        resolvedScriptTitle: matchedExample.title,
        liveExample: matchedExample,
      };
    }
  } else {
    const matchedCustom = customScripts.find((rec) => rec.id === session.scriptId);
    if (matchedCustom) {
      return {
        session,
        scriptStatus: isCurrent ? 'current' : 'other_exists',
        resolvedScriptTitle: matchedCustom.title,
        liveCustomScript: matchedCustom,
      };
    }
  }

  return {
    session,
    scriptStatus: isCurrent ? 'current' : 'deleted',
    resolvedScriptTitle: session.scriptTitleSnapshot || 'Untitled Scene',
  };
}

/**
 * Prioritizes sessions belonging to `currentScriptSessionKey` first (newest updatedAt),
 * then backfills remaining slots up to `limit` with newest sessions from other scripts.
 */
export function selectRecentSessionsForScript(
  sessions: readonly AiSessionRecord[],
  currentScriptSessionKey: string,
  customScripts: readonly ScriptRecord[],
  examples: readonly BundledExample[],
  limit: number = RECENT_AI_SESSIONS_LIMIT
): ResolvedAiSessionSummary[] {
  if (limit <= 0 || sessions.length === 0) return [];
  const sorted = sortAiSessions(sessions);
  const sameScript: AiSessionRecord[] = [];
  const otherScripts: AiSessionRecord[] = [];

  for (const session of sorted) {
    if (session.scriptSessionKey === currentScriptSessionKey) {
      sameScript.push(session);
    } else {
      otherScripts.push(session);
    }
  }

  const combined = [...sameScript, ...otherScripts].slice(0, limit);
  return combined.map((session) =>
    resolveSessionScriptStatus(session, currentScriptSessionKey, customScripts, examples)
  );
}

export function filterAiSessions(
  resolvedSessions: readonly ResolvedAiSessionSummary[],
  options: {query: string; filter: AiSessionFilterTab}
): ResolvedAiSessionSummary[] {
  const needle = options.query.trim().toLowerCase();

  return resolvedSessions.filter((item) => {
    const {session, scriptStatus, resolvedScriptTitle} = item;
    if (options.filter === 'current_script' && scriptStatus !== 'current') {
      return false;
    }
    if (options.filter === 'pinned' && !session.pinned) {
      return false;
    }
    if (!needle) return true;

    if (
      session.title.toLowerCase().includes(needle) ||
      resolvedScriptTitle.toLowerCase().includes(needle) ||
      session.scriptTitleSnapshot.toLowerCase().includes(needle) ||
      session.brief.specs.toLowerCase().includes(needle) ||
      session.brief.subtext.toLowerCase().includes(needle)
    ) {
      return true;
    }

    return session.messages.some(
      (msg) =>
        msg.text.toLowerCase().includes(needle) ||
        (msg.attachments ?? []).some(
          (att) =>
            att.label.toLowerCase().includes(needle) ||
            (att.fileName?.toLowerCase().includes(needle) ?? false)
        )
    );
  });
}

export function describeStagedSuggestion(suggestion: StagedSuggestion): string {
  switch (suggestion.kind) {
    case 'patch':
      return suggestion.summary.trim() || 'Script patch';
    case 'draft':
      return suggestion.title?.trim() || suggestion.summary.trim() || 'Script draft';
    case 'audit_review':
      return (
        suggestion.overallSummary.trim() ||
        `${suggestion.issues.length} ${suggestion.issues.length === 1 ? 'issue' : 'issues'}`
      );
    case 'question':
      return (
        suggestion.intro?.trim() ||
        `${suggestion.questions.length} clarifying ${suggestion.questions.length === 1 ? 'question' : 'questions'}`
      );
    case 'title':
      return suggestion.title.trim() || 'Scene title';
  }
}

function buildXmlCodeFence(body: string): string {
  let maxBacktickRun = 2;
  const matches = body.match(/`+/g);
  if (matches) {
    for (const run of matches) {
      if (run.length > maxBacktickRun) maxBacktickRun = run.length;
    }
  }
  return '`'.repeat(maxBacktickRun + 1);
}

export function formatAiSessionAsMarkdown(
  session: AiSessionRecord,
  scriptStatusLabel?: string
): string {
  const lines: string[] = [
    `# ${session.title}`,
    '',
    `- **Script:** ${session.scriptTitleSnapshot}${scriptStatusLabel ? ` (${scriptStatusLabel})` : ''}`,
    `- **Model:** \`${session.model}\` · **Focus:** ${session.focus}`,
    `- **Updated:** ${new Date(session.updatedAt).toISOString()}`,
    `- **Turns:** ${session.turnCount}`,
  ];

  const briefText = formatSceneBriefContext(session.brief);
  if (briefText.length > 0) {
    lines.push('', '## Saved Scene Brief (Text-Only)', '', briefText);
  }

  lines.push('', '## Conversation');

  for (const msg of session.messages) {
    lines.push('');
    if (msg.role === 'user') {
      lines.push(`### User (${msg.focus})`);
      if (msg.attachments && msg.attachments.length > 0) {
        lines.push(`- **Attachments:** ${msg.attachments.map(formatChatAttachmentSummary).join(', ')}`);
        for (const att of msg.attachments) {
          const sectionTag = (att.sectionTag || att.attachment?.sectionTag)?.trim();
          const sectionBody = att.attachment?.inlineText;
          if (sectionTag && typeof sectionBody === 'string') {
            const wrapped = `<${sectionTag}>\n${sectionBody}\n</${sectionTag}>`;
            const fence = buildXmlCodeFence(wrapped);
            lines.push('', `${fence}xml`, wrapped, fence);
          }
        }
      }
      lines.push(msg.text || '_Empty prompt_');
      continue;
    }

    lines.push('### Assistant');
    if (msg.text.trim().length > 0) {
      lines.push(msg.text.trim());
    }
    if (msg.suggestions && msg.suggestions.length > 0) {
      const applied = new Set(msg.appliedSuggestionIds ?? []);
      const dismissed = new Set(msg.dismissedSuggestionIds ?? []);
      lines.push('');
      for (const s of msg.suggestions) {
        const status = applied.has(s.id)
          ? 'Applied'
          : dismissed.has(s.id)
            ? 'Dismissed'
            : 'Staged';
        lines.push(`- [${status}] ${s.kind}: ${describeStagedSuggestion(s)}`);
      }
    }
    if (msg.error) {
      lines.push('', `> Error (${msg.error.code}): ${msg.error.message}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export interface AiSessionToolUsageStat {
  name: string;
  calls: number;
  okCount: number;
  errorCount: number;
}

export interface BuiltAiSessionExport {
  filename: string;
  content: string;
  mimeType: string;
}

export interface AiSessionJsonExportPayload {
  format: typeof AI_SESSION_EXPORT_FORMAT;
  exportVersion: typeof AI_SESSION_EXPORT_VERSION;
  exportedAt: string;
  session: {
    id: string;
    schemaVersion: number;
    title: string;
    titleIsCustom?: boolean;
    pinned?: boolean;
    createdAt: string;
    updatedAt: string;
    scriptSessionKey: string;
    scriptId: string;
    scriptKind: 'custom' | 'example';
    scriptTitleSnapshot: string;
    resolvedScriptTitle?: string;
    scriptStatus?: AiSessionScriptStatus;
    focus: AssistantFocus;
    selectedTargetKey: string;
    model: GeminiModelId;
    messageCount: number;
    turnCount: number;
    estimatedCostUsd: number;
    hasOmittedMedia?: boolean;
  };
  brief: DraftBriefState;
  systemInstructions: Record<string, string>;
  toolsSummary: {
    declaredTools: string[];
    invokedTools: AiSessionToolUsageStat[];
  };
  messages: unknown[];
  continuity: AiSessionContinuityState;
}

export function buildAiSessionMarkdownExport(
  session: AiSessionRecord,
  options?: {scriptStatusLabel?: string; now?: Date}
): BuiltAiSessionExport {
  const slug = slugifyFilename(session.title || session.scriptTitleSnapshot || 'ai-chat');
  const stamp = formatExportTimestamp(options?.now);
  return {
    filename: `${slug}-ai-chat-${stamp}.md`,
    content: formatAiSessionAsMarkdown(session, options?.scriptStatusLabel),
    mimeType: 'text/markdown;charset=utf-8',
  };
}

/**
 * Exports a complete, self-describing JSON payload for an AI session with top-level
 * deduplicated `systemInstructions` (referenced via `systemInstructionRef` inside trace rounds),
 * a `toolsSummary` of declared and invoked tools, text-only Brief, full messages/traces,
 * and continuity metadata—strictly excluding any API keys.
 */
export function buildAiSessionJsonExport(
  session: AiSessionRecord,
  options?: {
    scriptStatus?: AiSessionScriptStatus;
    resolvedScriptTitle?: string;
    now?: Date;
  }
): BuiltAiSessionExport {
  const now = options?.now ?? new Date();
  const compacted = compactSessionForStorage(hydrateSessionFromStorage(session));
  const systemInstructions = {...(compacted.traceSystemInstructions ?? {})};

  const declaredToolsSet = new Set<string>();
  const toolStats = new Map<string, AiSessionToolUsageStat>();

  const recordToolStat = (name: string, ok: boolean) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const prev = toolStats.get(cleanName) ?? {
      name: cleanName,
      calls: 0,
      okCount: 0,
      errorCount: 0,
    };
    prev.calls += 1;
    if (ok) prev.okCount += 1;
    else prev.errorCount += 1;
    toolStats.set(cleanName, prev);
  };

  const exportMessages = compacted.messages.map((msg) => {
    if (!msg.trace || !Array.isArray(msg.trace.rounds)) {
      if (msg.toolCalls) {
        for (const call of msg.toolCalls) {
          recordToolStat(call.name, call.status === 'ok');
        }
      }
      return msg;
    }

    const rounds = msg.trace.rounds.map((round) => {
      for (const toolName of round.request.toolNames ?? []) {
        if (toolName.trim()) {
          declaredToolsSet.add(toolName.trim());
        }
      }
      for (const call of round.toolCalls ?? []) {
        recordToolStat(call.name, call.ok);
      }

      const rawSys = round.request.systemInstruction;
      if (typeof rawSys === 'string' && rawSys.startsWith(TRACE_SYS_REF_PREFIX)) {
        const refKey = rawSys.slice(TRACE_SYS_REF_PREFIX.length);
        if (systemInstructions[refKey] !== undefined) {
          const {systemInstruction: _omitted, ...restRequest} = round.request;
          return {
            ...round,
            request: {
              ...restRequest,
              systemInstructionRef: refKey,
            },
          };
        }
      }
      return round;
    });

    return {
      ...msg,
      trace: {
        ...msg.trace,
        rounds,
      },
    };
  });

  const payload: AiSessionJsonExportPayload = {
    format: AI_SESSION_EXPORT_FORMAT,
    exportVersion: AI_SESSION_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    session: {
      id: compacted.id,
      schemaVersion: compacted.schemaVersion,
      title: compacted.title,
      ...(compacted.titleIsCustom ? {titleIsCustom: true} : {}),
      ...(compacted.pinned ? {pinned: true} : {}),
      createdAt: new Date(compacted.createdAt).toISOString(),
      updatedAt: new Date(compacted.updatedAt).toISOString(),
      scriptSessionKey: compacted.scriptSessionKey,
      scriptId: compacted.scriptId,
      scriptKind: compacted.scriptKind,
      scriptTitleSnapshot: compacted.scriptTitleSnapshot,
      ...(options?.resolvedScriptTitle ? {resolvedScriptTitle: options.resolvedScriptTitle} : {}),
      ...(options?.scriptStatus ? {scriptStatus: options.scriptStatus} : {}),
      focus: compacted.focus,
      selectedTargetKey: compacted.selectedTargetKey,
      model: compacted.model,
      messageCount: compacted.messageCount,
      turnCount: compacted.turnCount,
      estimatedCostUsd: compacted.estimatedCostUsd,
      ...(compacted.hasOmittedMedia ? {hasOmittedMedia: true} : {}),
    },
    brief: compacted.brief,
    systemInstructions,
    toolsSummary: {
      declaredTools: Array.from(declaredToolsSet).sort((a, b) => a.localeCompare(b)),
      invokedTools: Array.from(toolStats.values()).sort((a, b) => a.name.localeCompare(b.name)),
    },
    messages: exportMessages,
    continuity: compacted.continuity,
  };

  const slug = slugifyFilename(compacted.title || compacted.scriptTitleSnapshot || 'ai-session');
  const stamp = formatExportTimestamp(now);
  return {
    filename: `${slug}-ai-session-${stamp}.json`,
    content: `${JSON.stringify(payload, null, 2)}\n`,
    mimeType: 'application/json;charset=utf-8',
  };
}

export interface AiSessionConversationToolFailure {
  error?: string;
  errors?: string[];
  repairHints?: string[];
}

export interface AiSessionConversationTurnMetrics {
  toolRounds: number;
  durationMs: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  estimatedCostUsd: number;
}

export type AiSessionConversationSuggestionDetails =
  | {
      affectedIds: string[];
      opsCount: number;
      addedCount: number;
      removedCount: number;
      diffLines: string[];
      diffTruncated?: boolean;
      lintDelta: {
        beforeErrors: number;
        afterErrors: number;
        beforeWarnings: number;
        afterWarnings: number;
        introducedErrorCount: number;
        introducedWarningCount: number;
        resolvedCount: number;
      };
    }
  | {
      sceneTopology: string;
      stagingBlockCount: number;
      beatCount: number;
      errorCount: number;
      warningCount: number;
      candidateRawText: string;
    }
  | {
      errorCount: number;
      warningCount: number;
      issues: Array<{
        lens: string;
        severity: string;
        targetLevel: string;
        targetId: string;
        message: string;
        rationale: string;
        repairHint: string;
        hasSuggestedPatch: boolean;
        patchValidationErrors?: string[];
      }>;
    }
  | {
      title: string;
      previousTitle?: string;
      rationale?: string;
    }
  | {
      questions: Extract<StagedSuggestion, {kind: 'question'}>['questions'];
    };

export interface AiSessionConversationTurnSuggestion {
  kind: StagedSuggestion['kind'];
  summary: string;
  status: 'applied' | 'dismissed' | 'staged' | 'answered' | 'skipped';
  questionResponse?: QuestionResponseRecord;
  details?: AiSessionConversationSuggestionDetails;
}

export interface AiSessionConversationTurn {
  role: 'user' | 'assistant';
  focus: AssistantFocus;
  text: string;
  scopeLabel?: string;
  briefSummary?: string;
  attachments?: Array<{
    kind: string;
    label: string;
    fileName?: string;
    mimeType: string;
    source: string;
    sectionTag?: string;
    content?: string;
    uri?: string;
    expirationTime?: string;
    processingMode?: string;
    omitted?: boolean;
  }>;
  askFirst?: boolean;
  thoughtSummary?: string;
  skillsLoaded?: AiLoadedSkillItem[];
  toolCalls?: Array<{
    name: string;
    status: 'ok' | 'error' | 'stopped' | 'running';
    arguments: Record<string, unknown>;
    failure?: AiSessionConversationToolFailure;
  }>;
  suggestions?: AiSessionConversationTurnSuggestion[];
  quickScan?: {
    flaggedCount: number;
    borderlineCount: number;
    cleanCount: number;
    totalQuestions: number;
    suspectBeatCount: number;
  };
  metrics?: AiSessionConversationTurnMetrics;
  bridgedFromHistory?: 'expired_chain' | 'cross_script';
  error?: {
    code: string;
    message: string;
  };
}

export interface AiSessionConversationJsonPayload {
  format: typeof AI_SESSION_CONVERSATION_EXPORT_FORMAT;
  exportVersion: typeof AI_SESSION_EXPORT_VERSION;
  exportedAt: string;
  session: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    scriptTitleSnapshot: string;
    resolvedScriptTitle?: string;
    scriptStatus?: AiSessionScriptStatus;
    focus: AssistantFocus;
    model: GeminiModelId;
    turnCount: number;
    estimatedCostUsd: number;
    hasOmittedMedia?: boolean;
  };
  scriptSnapshot?: string;
  brief: DraftBriefState;
  skillsUsed: AiLoadedSkillItem[];
  toolsUsed: AiSessionToolUsageStat[];
  conversation: AiSessionConversationTurn[];
}

function extractToolFailure(
  result: Record<string, unknown> | undefined
): AiSessionConversationToolFailure | undefined {
  if (!result || typeof result !== 'object') return undefined;

  const rawError =
    typeof result.error === 'string' && result.error.trim().length > 0
      ? result.error.trim()
      : typeof result.message === 'string' && result.message.trim().length > 0
        ? result.message.trim()
        : undefined;

  const errorsSet = new Set<string>();
  const repairHintsSet = new Set<string>();

  if (typeof result.repairHint === 'string' && result.repairHint.trim().length > 0) {
    repairHintsSet.add(result.repairHint.trim());
  }

  if (Array.isArray(result.errors)) {
    for (const entry of result.errors) {
      if (typeof entry === 'string') {
        const clean = entry.trim();
        if (clean) errorsSet.add(clean);
      } else if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const msg = typeof obj.message === 'string' ? obj.message.trim() : '';
        const targetId = typeof obj.targetId === 'string' ? obj.targetId.trim() : '';
        const hint = typeof obj.repairHint === 'string' ? obj.repairHint.trim() : '';
        if (msg) {
          errorsSet.add(targetId && !msg.includes(targetId) ? `${targetId}: ${msg}` : msg);
        }
        if (hint) {
          repairHintsSet.add(hint);
        }
      }
    }
  }

  const errors = errorsSet.size > 0 ? Array.from(errorsSet) : undefined;
  const repairHints = repairHintsSet.size > 0 ? Array.from(repairHintsSet) : undefined;

  if (!rawError && !errors && !repairHints) {
    return undefined;
  }

  return {
    ...(rawError ? {error: rawError} : {}),
    ...(errors ? {errors} : {}),
    ...(repairHints ? {repairHints} : {}),
  };
}

function buildSuggestionDetails(suggestion: StagedSuggestion): AiSessionConversationSuggestionDetails {
  switch (suggestion.kind) {
    case 'patch': {
      const formattedLines = suggestion.diff.lines
        .slice(0, PATCH_DIFF_EXPORT_MAX_LINES)
        .map((line) => {
          const prefix = line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  ';
          return `${prefix}${line.text}`;
        });
      return {
        affectedIds: suggestion.affectedIds,
        opsCount: suggestion.opsCount,
        addedCount: suggestion.diff.addedCount,
        removedCount: suggestion.diff.removedCount,
        diffLines: formattedLines,
        ...(suggestion.diff.lines.length > PATCH_DIFF_EXPORT_MAX_LINES ? {diffTruncated: true} : {}),
        lintDelta: {
          beforeErrors: suggestion.lintDelta.beforeErrors,
          afterErrors: suggestion.lintDelta.afterErrors,
          beforeWarnings: suggestion.lintDelta.beforeWarnings,
          afterWarnings: suggestion.lintDelta.afterWarnings,
          introducedErrorCount: suggestion.lintDelta.introducedErrors.length,
          introducedWarningCount: suggestion.lintDelta.introducedWarnings.length,
          resolvedCount: suggestion.lintDelta.resolvedDiagnostics.length,
        },
      };
    }
    case 'draft':
      return {
        sceneTopology: suggestion.sceneTopology,
        stagingBlockCount: suggestion.stagingBlockCount,
        beatCount: suggestion.beatCount,
        errorCount: suggestion.errorCount,
        warningCount: suggestion.warningCount,
        candidateRawText: suggestion.candidateRawText,
      };
    case 'audit_review':
      return {
        errorCount: suggestion.errorCount,
        warningCount: suggestion.warningCount,
        issues: suggestion.issues.map((issue) => ({
          lens: issue.lens,
          severity: issue.severity,
          targetLevel: issue.targetLevel,
          targetId: issue.targetId,
          message: issue.message,
          rationale: issue.rationale,
          repairHint: issue.repairHint,
          hasSuggestedPatch: Boolean(issue.patchSuggestion),
          ...(issue.patchValidationErrors && issue.patchValidationErrors.length > 0
            ? {patchValidationErrors: issue.patchValidationErrors.map((err) => err.message)}
            : {}),
        })),
      };
    case 'title':
      return {
        title: suggestion.title,
        ...(suggestion.previousTitle ? {previousTitle: suggestion.previousTitle} : {}),
        ...(suggestion.rationale ? {rationale: suggestion.rationale} : {}),
      };
    case 'question':
      return {
        questions: suggestion.questions,
      };
  }
}

function buildTurnMetrics(
  msg: AiChatMessage,
  fallbackNowMs: number
): AiSessionConversationTurnMetrics | undefined {
  if (msg.trace) {
    const est = estimateTraceCost(msg.trace, fallbackNowMs);
    return {
      toolRounds: msg.trace.toolRounds,
      durationMs: msg.trace.durationMs,
      inputTokens: est?.usage.inputTokens ?? 0,
      cachedTokens: est?.usage.cachedTokens ?? 0,
      outputTokens: est?.usage.outputTokens ?? 0,
      thoughtTokens: est?.usage.thoughtTokens ?? 0,
      estimatedCostUsd: est?.totalCostUsd ?? 0,
    };
  }
  if (msg.quickScanTrace) {
    const est = estimateTraceCost(msg.quickScanTrace, fallbackNowMs);
    return {
      toolRounds: 0,
      durationMs: msg.quickScanTrace.durationMs,
      inputTokens: est?.usage.inputTokens ?? 0,
      cachedTokens: est?.usage.cachedTokens ?? 0,
      outputTokens: est?.usage.outputTokens ?? 0,
      thoughtTokens: est?.usage.thoughtTokens ?? 0,
      estimatedCostUsd: est?.totalCostUsd ?? 0,
    };
  }
  return undefined;
}

/**
 * Exports a clean, evaluation-ready JSON focused on the conversation, script snapshot,
 * text-only Brief, loaded skills, invoked tools (with arguments/status and failed-call
 * repair diagnostics), suggestion diffs/issues, and per-turn token/cache metrics—omitting
 * raw API trace rounds, frozen system instructions, and continuity internals.
 */
export function buildAiSessionConversationJsonExport(
  session: AiSessionRecord,
  options?: {
    scriptStatus?: AiSessionScriptStatus;
    resolvedScriptTitle?: string;
    now?: Date;
  }
): BuiltAiSessionExport {
  const now = options?.now ?? new Date();
  const fallbackNowMs = now.getTime();
  const hydrated = hydrateSessionFromStorage(sanitizeAiSessionRecord(session));
  const {brief: cleanBrief, hadMedia: hadBriefMedia} = stripBriefMediaForStorage(
    hydrated.brief,
    fallbackNowMs
  );
  const {messages: normalizedMessages, hadMedia: hadMessageMedia} = stripMessageAttachmentsForStorage(
    normalizeMessagesForStorage(hydrated.messages),
    fallbackNowMs
  );

  const skillsMap = new Map<string, AiLoadedSkillItem>();
  const toolStats = new Map<string, AiSessionToolUsageStat>();

  const recordToolStat = (name: string, ok: boolean) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const prev = toolStats.get(cleanName) ?? {
      name: cleanName,
      calls: 0,
      okCount: 0,
      errorCount: 0,
    };
    prev.calls += 1;
    if (ok) prev.okCount += 1;
    else prev.errorCount += 1;
    toolStats.set(cleanName, prev);
  };

  const conversation: AiSessionConversationTurn[] = normalizedMessages.map((msg) => {
    if (msg.role === 'user') {
      return {
        role: 'user',
        focus: msg.focus,
        text: msg.text,
        ...(msg.scopeLabel ? {scopeLabel: msg.scopeLabel} : {}),
        ...(msg.briefSummary ? {briefSummary: msg.briefSummary} : {}),
        ...(msg.attachments && msg.attachments.length > 0
          ? {
              attachments: msg.attachments.map((att) => {
                const sectionTag = (att.sectionTag || att.attachment?.sectionTag)?.trim();
                const sectionContent =
                  sectionTag && typeof att.attachment?.inlineText === 'string'
                    ? att.attachment.inlineText
                    : undefined;
                return {
                  kind: att.kind,
                  label: att.label,
                  ...(att.fileName ? {fileName: att.fileName} : {}),
                  mimeType: att.mimeType,
                  source: att.source,
                  ...(sectionTag ? {sectionTag} : {}),
                  ...(sectionContent !== undefined ? {content: sectionContent} : {}),
                  ...(att.attachment?.uri ? {uri: att.attachment.uri} : {}),
                  ...(att.attachment?.expirationTime
                    ? {expirationTime: att.attachment.expirationTime}
                    : {}),
                  ...(att.attachment?.processingMode
                    ? {processingMode: att.attachment.processingMode}
                    : {}),
                  ...(att.omitted ? {omitted: true} : {}),
                };
              }),
            }
          : {}),
        ...(msg.askFirst ? {askFirst: true} : {}),
      };
    }

    if (msg.loadedSkills) {
      for (const skill of msg.loadedSkills) {
        if (!skillsMap.has(skill.id)) {
          skillsMap.set(skill.id, skill);
        }
      }
    }

    const failedResultByCallId = new Map<string, Record<string, unknown>>();
    if (msg.trace?.rounds) {
      for (const round of msg.trace.rounds) {
        for (const call of round.toolCalls ?? []) {
          if (!call.ok && call.result) {
            failedResultByCallId.set(call.callId, call.result);
          }
        }
      }
    }

    const turnToolCalls: NonNullable<AiSessionConversationTurn['toolCalls']> = [];
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const call of msg.toolCalls) {
        recordToolStat(call.name, call.status === 'ok');
        const failure =
          call.status === 'error'
            ? extractToolFailure(failedResultByCallId.get(call.callId))
            : undefined;
        turnToolCalls.push({
          name: call.name,
          status: call.status,
          arguments: call.arguments,
          ...(failure ? {failure} : {}),
        });
      }
    } else if (msg.trace?.rounds) {
      for (const round of msg.trace.rounds) {
        for (const call of round.toolCalls ?? []) {
          recordToolStat(call.name, call.ok);
          const failure = !call.ok ? extractToolFailure(call.result) : undefined;
          turnToolCalls.push({
            name: call.name,
            status: call.ok ? 'ok' : 'error',
            arguments: call.arguments,
            ...(failure ? {failure} : {}),
          });
        }
      }
    }

    const applied = new Set(msg.appliedSuggestionIds ?? []);
    const dismissed = new Set(msg.dismissedSuggestionIds ?? []);
    const turnSuggestions: AiSessionConversationTurnSuggestion[] = (msg.suggestions ?? []).map(
      (s) => {
        const qResp = s.kind === 'question' ? msg.questionResponses?.[s.id] : undefined;
        const status: AiSessionConversationTurnSuggestion['status'] = qResp
          ? qResp.status
          : applied.has(s.id)
            ? 'applied'
            : dismissed.has(s.id)
              ? 'dismissed'
              : 'staged';
        return {
          kind: s.kind,
          summary: describeStagedSuggestion(s),
          status,
          ...(qResp ? {questionResponse: qResp} : {}),
          details: buildSuggestionDetails(s),
        };
      }
    );

    const thoughtText = msg.thoughtSummary?.trim() ?? '';
    const metrics = buildTurnMetrics(msg, fallbackNowMs);
    return {
      role: 'assistant',
      focus: msg.focus,
      text: msg.text,
      ...(thoughtText.length > 0 ? {thoughtSummary: thoughtText} : {}),
      ...(msg.loadedSkills && msg.loadedSkills.length > 0
        ? {skillsLoaded: msg.loadedSkills}
        : {}),
      ...(turnToolCalls.length > 0 ? {toolCalls: turnToolCalls} : {}),
      ...(turnSuggestions.length > 0 ? {suggestions: turnSuggestions} : {}),
      ...(msg.quickScan
        ? {
            quickScan: {
              flaggedCount: msg.quickScan.flaggedCount,
              borderlineCount: msg.quickScan.borderlineCount,
              cleanCount: msg.quickScan.cleanCount,
              totalQuestions: msg.quickScan.totalQuestions,
              suspectBeatCount: msg.quickScan.suspectBeats.length,
            },
          }
        : {}),
      ...(metrics ? {metrics} : {}),
      ...(msg.bridgedFromHistory ? {bridgedFromHistory: msg.bridgedFromHistory} : {}),
      ...(msg.error ? {error: {code: msg.error.code, message: msg.error.message}} : {}),
    };
  });

  const costSummary = aggregateSessionCost(normalizedMessages, fallbackNowMs);
  const turnCount = normalizedMessages.filter((m) => m.role === 'user').length;
  const hasOmittedMedia = Boolean(hydrated.hasOmittedMedia || hadBriefMedia || hadMessageMedia);
  const scriptSnapshot =
    typeof hydrated.continuity.lastTurnRawText === 'string' &&
    hydrated.continuity.lastTurnRawText.trim().length > 0
      ? hydrated.continuity.lastTurnRawText
      : undefined;

  const payload: AiSessionConversationJsonPayload = {
    format: AI_SESSION_CONVERSATION_EXPORT_FORMAT,
    exportVersion: AI_SESSION_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    session: {
      id: hydrated.id,
      title: hydrated.title,
      createdAt: new Date(hydrated.createdAt).toISOString(),
      updatedAt: new Date(hydrated.updatedAt).toISOString(),
      scriptTitleSnapshot: hydrated.scriptTitleSnapshot,
      ...(options?.resolvedScriptTitle ? {resolvedScriptTitle: options.resolvedScriptTitle} : {}),
      ...(options?.scriptStatus ? {scriptStatus: options.scriptStatus} : {}),
      focus: hydrated.focus,
      model: hydrated.model,
      turnCount: turnCount > 0 ? turnCount : costSummary.turnCount,
      estimatedCostUsd: costSummary.totalCostUsd,
      ...(hasOmittedMedia ? {hasOmittedMedia: true} : {}),
    },
    ...(scriptSnapshot ? {scriptSnapshot} : {}),
    brief: cleanBrief,
    skillsUsed: Array.from(skillsMap.values()),
    toolsUsed: Array.from(toolStats.values()).sort((a, b) => a.name.localeCompare(b.name)),
    conversation,
  };

  const slug = slugifyFilename(hydrated.title || hydrated.scriptTitleSnapshot || 'ai-conversation');
  const stamp = formatExportTimestamp(now);
  return {
    filename: `${slug}-ai-conversation-${stamp}.json`,
    content: `${JSON.stringify(payload, null, 2)}\n`,
    mimeType: 'application/json;charset=utf-8',
  };
}
