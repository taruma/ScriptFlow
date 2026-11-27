import type {AgentMediaAttachment} from '../../services/geminiInteractions.ts';
import {isReferenceAttachmentExpired} from './draftBrief.ts';
import type {
  AiChatMessage,
  ChatMessageAttachment,
  ReferenceAttachment,
  ReferenceEntry,
  StagedComposerAttachment,
} from './types.ts';

export function isPersistableRemotePreviewUrl(url?: string): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

/**
 * Converts a persisted/ready `ChatMessageAttachment` into an Interactions API `AgentMediaAttachment`
 * (`origin: 'message'`), returning `null` if stripped/omitted or past its Files API 48h expiration.
 */
export function toAgentMediaAttachmentFromChat(
  item: ChatMessageAttachment,
  nowMs: number = Date.now()
): AgentMediaAttachment | null {
  const att = item.attachment;
  if (!att || item.omitted) return null;
  if (isReferenceAttachmentExpired(att, nowMs)) return null;

  return {
    origin: 'message',
    handle: '',
    label: item.label.trim() || item.fileName?.trim() || '',
    kind: item.kind,
    source: att.source,
    mimeType: att.mimeType,
    ...(att.fileName || item.fileName ? {fileName: att.fileName || item.fileName} : {}),
    ...(att.inlineBase64 ? {inlineBase64: att.inlineBase64} : {}),
    ...(typeof att.inlineText === 'string' ? {inlineText: att.inlineText} : {}),
    ...(att.uri ? {uri: att.uri} : {}),
    ...(att.processingMode ? {processingMode: att.processingMode} : {}),
    fingerprint: att.fingerprint,
  };
}

/**
 * Collects all `ready` staged composer attachments into both message-level history descriptors
 * and wire-level `AgentMediaAttachment` payloads for the upcoming user turn.
 */
export function collectReadyComposerAttachments(
  items: readonly StagedComposerAttachment[],
  nowMs: number = Date.now()
): {
  messageAttachments: ChatMessageAttachment[];
  agentAttachments: AgentMediaAttachment[];
} {
  const messageAttachments: ChatMessageAttachment[] = [];
  const agentAttachments: AgentMediaAttachment[] = [];

  for (const staged of items) {
    if (staged.status !== 'ready' || !staged.attachment) continue;
    const msgAtt: ChatMessageAttachment = {
      id: staged.id,
      kind: staged.kind,
      label: staged.label,
      ...(staged.fileName ? {fileName: staged.fileName} : {}),
      mimeType: staged.mimeType,
      ...(staged.sizeBytes !== undefined ? {sizeBytes: staged.sizeBytes} : {}),
      source: staged.source,
      attachment: staged.attachment,
    };
    const wireAtt = toAgentMediaAttachmentFromChat(msgAtt, nowMs);
    if (!wireAtt) continue;
    messageAttachments.push(msgAtt);
    agentAttachments.push(wireAtt);
  }

  return {messageAttachments, agentAttachments};
}

/**
 * Restores a ready `ChatMessageAttachment` back into a `StagedComposerAttachment`
 * (e.g., when a turn fails or is stopped before completion).
 */
export function chatAttachmentToStaged(
  item: ChatMessageAttachment
): StagedComposerAttachment | null {
  if (!item.attachment || item.omitted) return null;
  return {
    id: item.id,
    kind: item.kind,
    label: item.label,
    ...(item.fileName ? {fileName: item.fileName} : {}),
    mimeType: item.mimeType,
    ...(item.sizeBytes !== undefined ? {sizeBytes: item.sizeBytes} : {}),
    source: item.source,
    status: 'ready',
    attachment: item.attachment,
  };
}

/**
 * Projects a `ChatMessageAttachment` into a `ReferenceEntry` shape so `BriefMediaLightbox`
 * can inspect/play composer attachments without duplicating modal code.
 */
export function chatAttachmentToPreviewEntry(
  item: Pick<ChatMessageAttachment, 'id' | 'kind' | 'label' | 'fileName' | 'attachment'>
): ReferenceEntry | null {
  if (!item.attachment) return null;
  return {
    id: item.id,
    handle: '',
    kind: item.kind,
    label: item.fileName?.trim() || item.label.trim() || item.kind,
    attachment: item.attachment,
  };
}

/**
 * Formats a concise human-readable summary for Markdown exports and `<prior_session_recap>`.
 */
export function formatChatAttachmentSummary(item: ChatMessageAttachment): string {
  const name = item.fileName?.trim() || item.label.trim() || item.mimeType || item.kind;
  const sourceLabel =
    item.source === 'youtube' ? 'YouTube' : item.source === 'files_api' ? 'Files API' : '';
  const modeLabel =
    item.kind === 'video' && item.attachment?.processingMode
      ? item.attachment.processingMode
      : '';
  const details = [item.kind, sourceLabel, modeLabel].filter((p) => p.length > 0).join(' · ');
  return details ? `${name} (${details})` : name;
}

/**
 * Strips heavy binary/inline payloads from a `ChatMessageAttachment` for IndexedDB storage & exports
 * while preserving lightweight `youtube` URLs (`https://` thumbnails) and `files_api` URIs.
 */
export function sanitizeChatAttachmentForStorage(
  item: ChatMessageAttachment,
  nowMs: number = Date.now()
): {
  item: ChatMessageAttachment;
  hadOmittedMedia: boolean;
} {
  const att = item.attachment;
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
      ...(isPersistableRemotePreviewUrl(att.previewUrl)
        ? {previewUrl: att.previewUrl!.trim()}
        : {}),
      ...(att.filesApiName ? {filesApiName: att.filesApiName} : {}),
      ...(att.expirationTime ? {expirationTime: att.expirationTime} : {}),
      ...(att.processingMode ? {processingMode: att.processingMode} : {}),
    };

    return {
      hadOmittedMedia: isReferenceAttachmentExpired(persistedAttachment, nowMs),
      item: {
        id: item.id,
        kind: item.kind,
        label: item.label,
        ...(item.fileName ? {fileName: item.fileName} : {}),
        mimeType: item.mimeType,
        ...(item.sizeBytes !== undefined ? {sizeBytes: item.sizeBytes} : {}),
        source: item.source,
        attachment: persistedAttachment,
      },
    };
  }

  return {
    hadOmittedMedia: true,
    item: {
      id: item.id,
      kind: item.kind,
      label: item.label,
      ...(item.fileName ? {fileName: item.fileName} : {}),
      mimeType: item.mimeType,
      ...(item.sizeBytes !== undefined ? {sizeBytes: item.sizeBytes} : {}),
      source: item.source,
      omitted: true,
    },
  };
}

/**
 * Returns true if any message in the thread carries omitted inline media or an expired Files API asset.
 */
export function hasAnyOmittedOrExpiredMessageAttachments(
  messages: readonly AiChatMessage[],
  nowMs: number = Date.now()
): boolean {
  for (const msg of messages) {
    if (!msg.attachments || msg.attachments.length === 0) continue;
    for (const item of msg.attachments) {
      if (item.omitted || !item.attachment) return true;
      if (isReferenceAttachmentExpired(item.attachment, nowMs)) return true;
    }
  }
  return false;
}
