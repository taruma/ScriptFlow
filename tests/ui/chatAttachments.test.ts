import {describe, expect, it} from 'vitest';
import {
  chatAttachmentToPreviewEntry,
  chatAttachmentToStaged,
  collectReadyComposerAttachments,
  formatChatAttachmentSummary,
  hasAnyOmittedOrExpiredMessageAttachments,
  isPersistableRemotePreviewUrl,
  sanitizeChatAttachmentForStorage,
  toAgentMediaAttachmentFromChat,
  type AiChatMessage,
  type ChatMessageAttachment,
  type StagedComposerAttachment,
} from '../../src/ui/aiAssistant.ts';

describe('chatAttachments pure helpers', () => {
  const nowMs = Date.parse('2026-11-27T12:00:00.000Z');
  const futureIso = '2026-11-28T12:00:00.000Z';
  const pastIso = '2026-11-27T11:00:00.000Z';

  it('collects only ready, non-expired staged attachments into message & wire formats with origin: message', () => {
    const staged: StagedComposerAttachment[] = [
      {
        id: 'c1',
        kind: 'image',
        label: 'frame_ref',
        fileName: 'frame_ref.png',
        mimeType: 'image/jpeg',
        sizeBytes: 12000,
        source: 'inline',
        status: 'ready',
        attachment: {
          source: 'inline',
          mimeType: 'image/jpeg',
          fileName: 'frame_ref.png',
          inlineBase64: 'BASE64_IMG',
          previewUrl: 'data:image/jpeg;base64,BASE64_IMG',
          fingerprint: 'fp_img',
        },
      },
      {
        id: 'c2',
        kind: 'video',
        label: 'clip_v1',
        fileName: 'clip_v1.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 950000,
        source: 'files_api',
        status: 'ready',
        attachment: {
          source: 'files_api',
          mimeType: 'video/mp4',
          fileName: 'clip_v1.mp4',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/vid1',
          expirationTime: futureIso,
          processingMode: 'agentic',
          fingerprint: 'fp_vid1',
        },
      },
      {
        id: 'c3',
        kind: 'document',
        label: 'expired',
        fileName: 'expired.pdf',
        mimeType: 'application/pdf',
        source: 'files_api',
        status: 'ready',
        attachment: {
          source: 'files_api',
          mimeType: 'application/pdf',
          fileName: 'expired.pdf',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/exp1',
          expirationTime: pastIso,
          fingerprint: 'fp_exp1',
        },
      },
      {
        id: 'c4',
        kind: 'audio',
        label: 'uploading_audio',
        fileName: 'voice.wav',
        mimeType: 'audio/wav',
        source: 'files_api',
        status: 'uploading',
      },
    ];

    const {messageAttachments, agentAttachments} = collectReadyComposerAttachments(staged, nowMs);

    expect(messageAttachments.map((m) => m.id)).toEqual(['c1', 'c2']);
    expect(agentAttachments).toHaveLength(2);
    expect(agentAttachments[0]).toMatchObject({
      origin: 'message',
      handle: '',
      kind: 'image',
      source: 'inline',
      fileName: 'frame_ref.png',
      inlineBase64: 'BASE64_IMG',
    });
    expect(agentAttachments[1]).toMatchObject({
      origin: 'message',
      handle: '',
      kind: 'video',
      source: 'files_api',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/vid1',
      processingMode: 'agentic',
    });

    // Omitted or expired ChatMessageAttachment returns null for wire conversion
    expect(
      toAgentMediaAttachmentFromChat(
        {
          id: 'o1',
          kind: 'document',
          label: 'notes',
          mimeType: 'text/plain',
          source: 'inline',
          omitted: true,
        },
        nowMs
      )
    ).toBeNull();
  });

  it('sanitizes inline vs remote message attachments for storage and detects omitted/expired thread media', () => {
    expect(isPersistableRemotePreviewUrl('https://img.youtube.com/vi/abc/hqdefault.jpg')).toBe(
      true
    );
    expect(isPersistableRemotePreviewUrl('blob:http://localhost/123')).toBe(false);
    expect(isPersistableRemotePreviewUrl('data:image/jpeg;base64,AAA')).toBe(false);

    const inlineDoc: ChatMessageAttachment = {
      id: 'm1',
      kind: 'document',
      label: 'notes',
      fileName: 'notes.md',
      mimeType: 'text/markdown',
      sizeBytes: 340,
      source: 'inline',
      attachment: {
        source: 'inline',
        mimeType: 'text/markdown',
        fileName: 'notes.md',
        inlineText: '# Scene notes',
        fingerprint: 'fp_doc',
      },
    };
    const sanitizedInline = sanitizeChatAttachmentForStorage(inlineDoc, nowMs);
    expect(sanitizedInline.hadOmittedMedia).toBe(true);
    expect(sanitizedInline.item.omitted).toBe(true);
    expect(sanitizedInline.item.attachment).toBeUndefined();

    const activeCloudVideo: ChatMessageAttachment = {
      id: 'm2',
      kind: 'video',
      label: 'result',
      fileName: 'result.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 500000,
      source: 'files_api',
      attachment: {
        source: 'files_api',
        mimeType: 'video/mp4',
        fileName: 'result.mp4',
        sizeBytes: 500000,
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/v99',
        filesApiName: 'files/v99',
        expirationTime: futureIso,
        processingMode: 'agentic',
        localMediaUrl: 'blob:http://localhost/local-vid',
        previewUrl: 'blob:http://localhost/local-thumb',
        fingerprint: 'fp_v99',
      },
    };
    const sanitizedCloud = sanitizeChatAttachmentForStorage(activeCloudVideo, nowMs);
    expect(sanitizedCloud.hadOmittedMedia).toBe(false);
    expect(sanitizedCloud.item.omitted).toBeUndefined();
    expect(sanitizedCloud.item.attachment).toEqual({
      source: 'files_api',
      mimeType: 'video/mp4',
      fileName: 'result.mp4',
      sizeBytes: 500000,
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/v99',
      filesApiName: 'files/v99',
      expirationTime: futureIso,
      processingMode: 'agentic',
      fingerprint: 'fp_v99',
    });

    const ytAttachment: ChatMessageAttachment = {
      id: 'm3',
      kind: 'video',
      label: 'YT Ref',
      mimeType: 'video/youtube',
      source: 'youtube',
      attachment: {
        source: 'youtube',
        mimeType: 'video/youtube',
        uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
        previewUrl: 'https://img.youtube.com/vi/9hE5-98ZeCg/hqdefault.jpg',
        processingMode: 'static',
        fingerprint: 'fp_yt',
      },
    };
    const sanitizedYt = sanitizeChatAttachmentForStorage(ytAttachment, nowMs);
    expect(sanitizedYt.hadOmittedMedia).toBe(false);
    expect(sanitizedYt.item.attachment?.previewUrl).toBe(
      'https://img.youtube.com/vi/9hE5-98ZeCg/hqdefault.jpg'
    );

    const activeMessages: AiChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        mode: 'refine',
        focus: 'auto',
        text: 'Compare output',
        attachments: [sanitizedCloud.item, sanitizedYt.item],
      },
    ];
    expect(hasAnyOmittedOrExpiredMessageAttachments(activeMessages, nowMs)).toBe(false);

    const expiredMessages: AiChatMessage[] = [
      {
        id: 'u2',
        role: 'user',
        mode: 'refine',
        focus: 'auto',
        text: 'Compare old output',
        attachments: [sanitizedInline.item],
      },
    ];
    expect(hasAnyOmittedOrExpiredMessageAttachments(expiredMessages, nowMs)).toBe(true);
  });

  it('projects preview entries, restores staged chips, and formats attachment summaries cleanly', () => {
    const cloudAtt: ChatMessageAttachment = {
      id: 'm-vid',
      kind: 'video',
      label: 'Render 1',
      fileName: 'render_01.mp4',
      mimeType: 'video/mp4',
      source: 'files_api',
      attachment: {
        source: 'files_api',
        mimeType: 'video/mp4',
        fileName: 'render_01.mp4',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/r1',
        processingMode: 'agentic',
        fingerprint: 'fp_r1',
      },
    };

    expect(formatChatAttachmentSummary(cloudAtt)).toBe(
      'render_01.mp4 (video · Files API · agentic)'
    );
    expect(chatAttachmentToPreviewEntry(cloudAtt)).toEqual({
      id: 'm-vid',
      handle: '',
      kind: 'video',
      label: 'render_01.mp4',
      attachment: cloudAtt.attachment,
    });
    expect(chatAttachmentToStaged(cloudAtt)).toMatchObject({
      id: 'm-vid',
      status: 'ready',
      kind: 'video',
      fileName: 'render_01.mp4',
    });
    expect(
      chatAttachmentToStaged({...cloudAtt, attachment: undefined, omitted: true})
    ).toBeNull();
  });
});
