import {describe, expect, it} from 'vitest';
import {
  deleteGeminiFile,
  formatGeminiFilesError,
  listGeminiFiles,
  normalizeGeminiFileName,
  uploadFileToGeminiFilesApi,
  type GeminiFilesClientLike,
} from '../../src/services/geminiFiles.ts';
import {
  buildInitialInteractionInput,
  sanitizeTraceInput,
  type AgentMediaAttachment,
} from '../../src/services/geminiInteractions.ts';
import {
  collectPendingBriefAttachments,
  formatReferenceEntriesForPrompt,
  getNextReferenceHandle,
  isReferenceAttachmentExpired,
  type DraftBriefState,
  type ReferenceEntry,
} from '../../src/ui/aiAssistant.ts';
import {
  buildAttachmentFingerprint,
  buildTextExcerpt,
  CARD_DEFAULT_WIDTH,
  CARD_MAX_WIDTH,
  CARD_MIN_WIDTH,
  CARD_VIDEO_DEFAULT_WIDTH,
  classifyLocalDropFile,
  CLOUD_FILE_EXPIRING_SOON_MS,
  computeDownscaledDimensions,
  computeReferenceCardWidth,
  extractYouTubeVideoId,
  filenameToDefaultLabel,
  formatByteSize,
  formatCloudFileTimeRemaining,
  formatCloudFileTimestampTooltip,
  getYouTubeThumbnailUrl,
  IMAGE_COMPRESSION_QUALITY,
  IMAGE_MAX_LONGEST_EDGE,
  inferMimeTypeFromFile,
  inferReferenceKindFromMime,
  isYouTubeUrl,
  MAX_INLINE_TEXT_BYTES,
  normalizeYouTubeUrl,
} from '../../src/ui/briefMedia.ts';

describe('briefMedia pure helpers', () => {
  it('downscales oversized images proportionally to 1600px longest edge and never upscales smaller ones', () => {
    expect(IMAGE_MAX_LONGEST_EDGE).toBe(1600);
    expect(IMAGE_COMPRESSION_QUALITY).toBe(0.85);

    expect(computeDownscaledDimensions(3200, 1800)).toEqual({width: 1600, height: 900});
    expect(computeDownscaledDimensions(1800, 3600)).toEqual({width: 800, height: 1600});
    expect(computeDownscaledDimensions(1200, 800)).toEqual({width: 1200, height: 800});
    expect(computeDownscaledDimensions(1600, 1600)).toEqual({width: 1600, height: 1600});
  });

  it('computes fixed-height proportional reference card widths clamped safely between min and max', () => {
    // Portrait 960x1280 clamps cleanly at CARD_MIN_WIDTH
    expect(
      computeReferenceCardWidth({kind: 'image', mediaWidth: 960, mediaHeight: 1280})
    ).toBe(CARD_MIN_WIDTH);

    // Square 1000x1000 fits 136px inner + 16px padding = 152px
    expect(
      computeReferenceCardWidth({kind: 'image', mediaWidth: 1000, mediaHeight: 1000})
    ).toBe(152);

    // 4:3 landscape fits naturally between min and max
    const w43 = computeReferenceCardWidth({kind: 'image', mediaWidth: 1600, mediaHeight: 1200});
    expect(w43).toBeGreaterThan(CARD_MIN_WIDTH);
    expect(w43).toBeLessThan(CARD_MAX_WIDTH);

    // Ultra-wide 21:9 clamps cleanly at CARD_MAX_WIDTH
    expect(
      computeReferenceCardWidth({kind: 'image', mediaWidth: 2100, mediaHeight: 900})
    ).toBe(CARD_MAX_WIDTH);

    // Fallbacks when dimensions are unknown
    expect(computeReferenceCardWidth({kind: 'video'})).toBe(CARD_VIDEO_DEFAULT_WIDTH);
    expect(computeReferenceCardWidth({kind: 'document'})).toBe(CARD_DEFAULT_WIDTH);
  });

  it('produces clean bounded text excerpts for document hover previews', () => {
    const short = buildTextExcerpt('Line 1\nLine 2');
    expect(short).toEqual({excerpt: 'Line 1\nLine 2', truncated: false});

    const manyLines = Array.from({length: 20}, (_, i) => `Line ${i + 1}`).join('\n');
    const clipped = buildTextExcerpt(manyLines, 5, 500);
    expect(clipped.truncated).toBe(true);
    expect(clipped.excerpt.endsWith('…')).toBe(true);
    expect(clipped.excerpt).toContain('Line 5');
    expect(clipped.excerpt).not.toContain('Line 6');
  });

  it('routes local drops strictly to inline image, inline small text, or Files API', () => {
    expect(classifyLocalDropFile({name: 'mark.png', type: 'image/png', size: 4_000_000})).toBe(
      'inline_image'
    );
    expect(classifyLocalDropFile({name: 'notes.md', type: '', size: 4_000})).toBe('inline_text');
    expect(
      classifyLocalDropFile({name: 'dialogue.json', type: 'application/json', size: 12_000})
    ).toBe('inline_text');

    // Oversized text, PDFs, videos, and audio all route to Gemini Files API
    expect(
      classifyLocalDropFile({name: 'novel.txt', type: 'text/plain', size: MAX_INLINE_TEXT_BYTES + 1})
    ).toBe('files_api_required');
    expect(classifyLocalDropFile({name: 'script.pdf', type: 'application/pdf', size: 50_000})).toBe(
      'files_api_required'
    );
    expect(classifyLocalDropFile({name: 'clip1.mp4', type: 'video/mp4', size: 5_000_000})).toBe(
      'files_api_required'
    );
    expect(classifyLocalDropFile({name: 'voice.mp3', type: 'audio/mp3', size: 2_000_000})).toBe(
      'files_api_required'
    );
  });

  it('infers reference kinds, MIME types, sizes, and clean labels accurately', () => {
    expect(inferReferenceKindFromMime('image/jpeg', 'shot.jpg')).toBe('image');
    expect(inferReferenceKindFromMime('video/mp4', 'clip.mp4')).toBe('video');
    expect(inferReferenceKindFromMime('audio/wav', 'voice.wav')).toBe('audio');
    expect(inferReferenceKindFromMime('application/pdf', 'bible.pdf')).toBe('document');
    expect(inferReferenceKindFromMime('', 'scene.md')).toBe('document');

    expect(inferMimeTypeFromFile({name: 'notes.md', type: ''})).toBe('text/markdown');
    expect(inferMimeTypeFromFile({name: 'clip.mp4', type: ''})).toBe('video/mp4');
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(215 * 1024)).toBe('215 KB');
    expect(formatByteSize(12.4 * 1024 * 1024)).toBe('12.4 MB');
    expect(filenameToDefaultLabel('mark_cafe_ref.webp')).toBe('mark_cafe_ref');
  });

  it('parses, normalizes, and builds thumbnails for all common YouTube URL formats', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=9hE5-98ZeCg')).toBe(true);
    expect(isYouTubeUrl('https://youtu.be/9hE5-98ZeCg?t=12')).toBe(true);
    expect(isYouTubeUrl('https://youtube.com/shorts/9hE5-98ZeCg')).toBe(true);
    expect(isYouTubeUrl('https://www.youtube.com/embed/9hE5-98ZeCg')).toBe(true);
    expect(isYouTubeUrl('https://vimeo.com/123456')).toBe(false);
    expect(isYouTubeUrl('not a url')).toBe(false);

    expect(extractYouTubeVideoId('https://youtu.be/9hE5-98ZeCg?si=abc')).toBe('9hE5-98ZeCg');
    expect(normalizeYouTubeUrl('youtu.be/9hE5-98ZeCg')).toBe(
      'https://www.youtube.com/watch?v=9hE5-98ZeCg'
    );
    expect(getYouTubeThumbnailUrl('https://youtu.be/9hE5-98ZeCg')).toBe(
      'https://img.youtube.com/vi/9hE5-98ZeCg/hqdefault.jpg'
    );
  });
});

describe('multimodal ReferenceEntry handle numbering, manifest & send-once tracking', () => {
  it('assigns sequential handles per kind (@imageN, @videoN, @audioN, @docN) and formats source tags', () => {
    const refs: ReferenceEntry[] = [
      {
        id: 'r1',
        handle: '@image1',
        kind: 'image',
        label: 'Mark',
        attachment: {
          source: 'inline',
          mimeType: 'image/jpeg',
          fileName: 'mark.jpg',
          inlineBase64: 'AAAA',
          fingerprint: buildAttachmentFingerprint(['inline', 'mark.jpg']),
        },
      },
      {
        id: 'r2',
        handle: '@video1',
        kind: 'video',
        label: 'Rainy alley look',
        attachment: {
          source: 'youtube',
          mimeType: 'video/youtube',
          uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
          processingMode: 'agentic',
          fingerprint: buildAttachmentFingerprint(['youtube', '9hE5-98ZeCg']),
        },
      },
    ];

    expect(getNextReferenceHandle(refs, 'image')).toBe('@image2');
    expect(getNextReferenceHandle(refs, 'video')).toBe('@video2');
    expect(getNextReferenceHandle(refs, 'audio')).toBe('@audio1');
    expect(getNextReferenceHandle(refs, 'document')).toBe('@doc1');

    const manifest = formatReferenceEntriesForPrompt(refs);
    expect(manifest).toContain('@image1 as Mark [attached image: mark.jpg]');
    expect(manifest).toContain('@video1: Rainy alley look [YouTube video]');
  });

  it('delivers attachments once per interaction chain and skips them when Brief is paused', () => {
    const fp1 = buildAttachmentFingerprint(['inline', '1']);
    const fp2 = buildAttachmentFingerprint(['youtube', '2']);
    const brief: DraftBriefState = {
      enabled: true,
      references: [
        {
          id: 'r1',
          handle: '@image1',
          kind: 'image',
          label: 'Mark',
          attachment: {
            source: 'inline',
            mimeType: 'image/jpeg',
            inlineBase64: 'AAAA',
            fingerprint: fp1,
          },
        },
        {
          id: 'r2',
          handle: '@video1',
          kind: 'video',
          label: 'Clip 1',
          attachment: {
            source: 'youtube',
            mimeType: 'video/youtube',
            uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
            fingerprint: fp2,
          },
        },
      ],
      specs: '',
      subtext: '',
    };

    const sent = new Set<string>([fp1]);

    // Fresh chain (no previous_interaction_id): sends ALL active attachments even if seen previously
    const freshTurn = collectPendingBriefAttachments(brief, sent, false);
    expect(freshTurn.map((a) => a.fingerprint)).toEqual([fp1, fp2]);

    // Chained turn: skips fp1 and sends only newly added fp2
    const chainedTurn = collectPendingBriefAttachments(brief, sent, true);
    expect(chainedTurn.map((a) => a.fingerprint)).toEqual([fp2]);

    // Paused brief: sends nothing
    expect(collectPendingBriefAttachments({...brief, enabled: false}, new Set(), false)).toEqual([]);
  });

  it('detects expired Gemini Files API attachments and skips them in collectPendingBriefAttachments', () => {
    const nowMs = Date.parse('2026-11-27T12:00:00.000Z');
    const pastIso = '2026-11-27T11:59:59.000Z';
    const futureIso = '2026-11-28T12:00:00.000Z';

    expect(isReferenceAttachmentExpired({source: 'files_api', expirationTime: pastIso}, nowMs)).toBe(
      true
    );
    expect(
      isReferenceAttachmentExpired(
        {source: 'files_api', expirationTime: '2026-11-27T12:00:00.000Z'},
        nowMs
      )
    ).toBe(true);
    expect(
      isReferenceAttachmentExpired({source: 'files_api', expirationTime: futureIso}, nowMs)
    ).toBe(false);
    expect(isReferenceAttachmentExpired({source: 'files_api'}, nowMs)).toBe(false);
    expect(
      isReferenceAttachmentExpired({source: 'files_api', expirationTime: 'not-a-date'}, nowMs)
    ).toBe(false);
    expect(
      isReferenceAttachmentExpired({source: 'inline', expirationTime: pastIso}, nowMs)
    ).toBe(false);
    expect(
      isReferenceAttachmentExpired({source: 'youtube', expirationTime: pastIso}, nowMs)
    ).toBe(false);

    const brief: DraftBriefState = {
      enabled: true,
      references: [
        {
          id: 'r-expired',
          handle: '@video1',
          kind: 'video',
          label: 'Expired Clip',
          attachment: {
            source: 'files_api',
            mimeType: 'video/mp4',
            uri: 'https://generativelanguage.googleapis.com/v1beta/files/expired1',
            expirationTime: pastIso,
            fingerprint: 'fp_expired',
          },
        },
        {
          id: 'r-active-file',
          handle: '@video2',
          kind: 'video',
          label: 'Active Clip',
          attachment: {
            source: 'files_api',
            mimeType: 'video/mp4',
            uri: 'https://generativelanguage.googleapis.com/v1beta/files/active2',
            expirationTime: futureIso,
            fingerprint: 'fp_active_file',
          },
        },
        {
          id: 'r-inline',
          handle: '@image1',
          kind: 'image',
          label: 'Mark',
          attachment: {
            source: 'inline',
            mimeType: 'image/jpeg',
            inlineBase64: 'AAAA',
            fingerprint: 'fp_inline',
          },
        },
        {
          id: 'r-youtube',
          handle: '@video3',
          kind: 'video',
          label: 'YT Ref',
          attachment: {
            source: 'youtube',
            mimeType: 'video/youtube',
            uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
            fingerprint: 'fp_yt',
          },
        },
      ],
      specs: '',
      subtext: '',
    };

    const freshPending = collectPendingBriefAttachments(brief, new Set(), false, nowMs);
    expect(freshPending.map((a) => a.fingerprint)).toEqual([
      'fp_active_file',
      'fp_inline',
      'fp_yt',
    ]);

    const chainedPending = collectPendingBriefAttachments(
      brief,
      new Set(['fp_inline']),
      true,
      nowMs
    );
    expect(chainedPending.map((a) => a.fingerprint)).toEqual(['fp_active_file', 'fp_yt']);
  });
});

describe('Interactions API multimodal input builder & trace sanitization', () => {
  it('returns verbatim prompt string when no attachments exist and builds typed content blocks otherwise', () => {
    expect(buildInitialInteractionInput('Tighten S2 framing.')).toBe('Tighten S2 framing.');
    expect(buildInitialInteractionInput('Tighten S2 framing.', [])).toBe('Tighten S2 framing.');

    const largeBase64 = 'A'.repeat(2048);
    const attachments: AgentMediaAttachment[] = [
      {
        handle: '@image1',
        label: 'Mark',
        kind: 'image',
        source: 'inline',
        mimeType: 'image/jpeg',
        inlineBase64: largeBase64,
        fingerprint: 'att_1',
      },
      {
        handle: '@doc1',
        label: 'Backstory',
        kind: 'document',
        source: 'inline',
        mimeType: 'text/markdown',
        fileName: 'notes.md',
        inlineText: 'Mark lost the key yesterday.',
        fingerprint: 'att_2',
      },
      {
        handle: '@video1',
        label: 'Ref clip',
        kind: 'video',
        source: 'youtube',
        mimeType: 'video/youtube',
        uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
        processingMode: 'agentic',
        fingerprint: 'att_3',
      },
      {
        handle: '@audio1',
        label: 'Voice sample',
        kind: 'audio',
        source: 'files_api',
        mimeType: 'audio/mp3',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
        fingerprint: 'att_4',
      },
    ];

    const payload = buildInitialInteractionInput('Draft opening scene.', attachments);
    expect(Array.isArray(payload)).toBe(true);
    const steps = payload as Array<{type: string; content: Array<Record<string, unknown>>}>;
    expect(steps).toHaveLength(1);
    expect(steps[0]?.type).toBe('user_input');

    const blocks = steps[0]!.content;
    expect(blocks).toContainEqual({
      type: 'image',
      data: largeBase64,
      mime_type: 'image/jpeg',
    });
    expect(blocks).toContainEqual({
      type: 'video',
      uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
      processing: 'agentic',
    });
    expect(blocks).toContainEqual({
      type: 'audio',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
      mime_type: 'audio/mp3',
    });
    expect(blocks[blocks.length - 1]).toEqual({type: 'text', text: 'Draft opening scene.'});

    // Static video mode omits `processing` (uses server default cleanly)
    const staticVideoPayload = buildInitialInteractionInput('Check clip.', [
      {
        handle: '@video1',
        label: 'Ref',
        kind: 'video',
        source: 'youtube',
        mimeType: 'video/youtube',
        uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
        processingMode: 'static',
        fingerprint: 'att_static',
      },
    ]) as Array<{type: string; content: Array<Record<string, unknown>>}>;
    expect(staticVideoPayload[0]?.content).toContainEqual({
      type: 'video',
      uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
    });

    // Trace sanitization strips bulky base64 inside nested user_input.content
    const sanitized = sanitizeTraceInput(payload) as Array<{
      type: string;
      content: Array<Record<string, unknown>>;
    }>;
    const imageBlock = sanitized[0]?.content.find((b) => b.type === 'image');
    expect(String(imageBlock?.data)).toContain('base64');
    expect(String(imageBlock?.data)).toContain('omitted');

    // Per-turn composer attachments (origin: 'message') use clean [Attached ...] framing without @handles
    const messagePayload = buildInitialInteractionInput('Compare this clip.', [
      {
        origin: 'message',
        handle: '',
        label: 'Render 01',
        kind: 'video',
        source: 'files_api',
        mimeType: 'video/mp4',
        fileName: 'render_01.mp4',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/r01',
        processingMode: 'agentic',
        fingerprint: 'msg_fp_1',
      },
      {
        origin: 'message',
        handle: '',
        label: 'Beat notes',
        kind: 'document',
        source: 'inline',
        mimeType: 'text/markdown',
        fileName: 'beat_notes.md',
        inlineText: 'Keep the pause before the door opens.',
        fingerprint: 'msg_fp_2',
      },
    ]) as Array<{type: string; content: Array<Record<string, unknown>>}>;
    const msgBlocks = messagePayload[0]!.content;
    expect(msgBlocks).toContainEqual({
      type: 'text',
      text: '[Attached video: render_01.mp4]',
    });
    expect(msgBlocks).toContainEqual({
      type: 'text',
      text: '[Attached document: beat_notes.md]\nKeep the pause before the door opens.',
    });
  });
});

describe('geminiFiles browser-direct Files API service', () => {
  it('uploads via SDK, polls PROCESSING -> ACTIVE, and handles progressive list fallback & delete', async () => {
    let getCalls = 0;
    const deletedNames: string[] = [];

    const fakeClient: GeminiFilesClientLike = {
      files: {
        upload: async () => ({
          name: 'files/vid001',
          displayName: 'alley.mp4',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/vid001',
          mimeType: 'video/mp4',
          sizeBytes: 4_500_000,
          state: 'PROCESSING',
        }),
        get: async () => {
          getCalls += 1;
          return {
            name: 'files/vid001',
            displayName: 'alley.mp4',
            uri: 'https://generativelanguage.googleapis.com/v1beta/files/vid001',
            mimeType: 'video/mp4',
            sizeBytes: 4_500_000,
            state: getCalls >= 2 ? 'ACTIVE' : 'PROCESSING',
          };
        },
        list: async (params) => {
          if (params?.config?.pageSize === 100) {
            throw new Error('Failed to convert server response to JSON');
          }
          // Progressive pageSize=1 fallback yields one valid item before throwing on corrupt entry
          return {
            async *[Symbol.asyncIterator]() {
              yield {
                name: 'files/vid001',
                displayName: 'alley.mp4',
                uri: 'https://generativelanguage.googleapis.com/v1beta/files/vid001',
                mimeType: 'video/mp4',
                sizeBytes: 4_500_000,
                state: 'ACTIVE',
                createTime: '2026-11-21T03:00:00Z',
              };
              throw new Error('Corrupt entry');
            },
          };
        },
        delete: async ({name}) => {
          deletedNames.push(name);
          return {};
        },
      },
    };

    const statuses: string[] = [];
    const mockFile = new File(['dummy-video-bytes'], 'alley.mp4', {type: 'video/mp4'});
    const uploaded = await uploadFileToGeminiFilesApi({
      apiKey: 'AIza-test',
      file: mockFile,
      pollIntervalMs: 1,
      maxPollAttempts: 5,
      onStatus: (s) => statuses.push(s),
      createClient: () => fakeClient,
    });

    expect(uploaded.state).toBe('ACTIVE');
    expect(uploaded.uri).toContain('files/vid001');
    expect(statuses).toEqual(['uploading', 'processing', 'active']);
    expect(getCalls).toBe(2);

    const listed = await listGeminiFiles({
      apiKey: 'AIza-test',
      createClient: () => fakeClient,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.displayName).toBe('alley.mp4');

    await deleteGeminiFile({
      apiKey: 'AIza-test',
      name: 'https://generativelanguage.googleapis.com/v1beta/files/vid001',
      createClient: () => fakeClient,
    });
    expect(deletedNames).toEqual(['files/vid001']);
    expect(normalizeGeminiFileName('https://generativelanguage.googleapis.com/v1beta/files/xyz')).toBe(
      'files/xyz'
    );
    expect(formatGeminiFilesError('403 PERMISSION_DENIED: You do not have permission to access the File x')).toContain(
      '48 hours'
    );
  });

  it('formats cloud file remaining time, expiration urgency, upload-age fallback, and tooltips', () => {
    const now = Date.parse('2026-11-27T12:00:00Z');
    const hourMs = 3_600_000;
    const minMs = 60_000;

    // Active file > 6h left
    expect(
      formatCloudFileTimeRemaining(
        new Date(now + 47 * hourMs + 30 * minMs).toISOString(),
        undefined,
        now
      )
    ).toEqual({
      label: '47h 30m left',
      isExpiringSoon: false,
      isExpired: false,
    });

    expect(
      formatCloudFileTimeRemaining(new Date(now + 24 * hourMs).toISOString(), undefined, now)
    ).toEqual({
      label: '24h left',
      isExpiringSoon: false,
      isExpired: false,
    });

    // Expiring soon (< 6h left)
    expect(CLOUD_FILE_EXPIRING_SOON_MS).toBe(6 * hourMs);
    expect(
      formatCloudFileTimeRemaining(
        new Date(now + 5 * hourMs + 45 * minMs).toISOString(),
        undefined,
        now
      )
    ).toEqual({
      label: '5h 45m left',
      isExpiringSoon: true,
      isExpired: false,
    });

    expect(
      formatCloudFileTimeRemaining(new Date(now + 42 * minMs).toISOString(), undefined, now)
    ).toEqual({
      label: '42m left',
      isExpiringSoon: true,
      isExpired: false,
    });

    expect(
      formatCloudFileTimeRemaining(new Date(now + 20_000).toISOString(), undefined, now)
    ).toEqual({
      label: '<1m left',
      isExpiringSoon: true,
      isExpired: false,
    });

    // Expired (<= 0ms)
    expect(
      formatCloudFileTimeRemaining(new Date(now).toISOString(), undefined, now)
    ).toEqual({
      label: 'Expired',
      isExpiringSoon: false,
      isExpired: true,
    });
    expect(
      formatCloudFileTimeRemaining(new Date(now - 5 * minMs).toISOString(), undefined, now)
    ).toEqual({
      label: 'Expired',
      isExpiringSoon: false,
      isExpired: true,
    });

    // Fallback to createTime when expirationTime is absent
    expect(
      formatCloudFileTimeRemaining(undefined, new Date(now - 10_000).toISOString(), now)
    ).toEqual({
      label: 'Uploaded just now',
      isExpiringSoon: false,
      isExpired: false,
    });
    expect(
      formatCloudFileTimeRemaining(undefined, new Date(now - 25 * minMs).toISOString(), now)
    ).toEqual({
      label: 'Uploaded 25m ago',
      isExpiringSoon: false,
      isExpired: false,
    });
    expect(
      formatCloudFileTimeRemaining(
        undefined,
        new Date(now - (3 * hourMs + 15 * minMs)).toISOString(),
        now
      )
    ).toEqual({
      label: 'Uploaded 3h 15m ago',
      isExpiringSoon: false,
      isExpired: false,
    });
    expect(
      formatCloudFileTimeRemaining(undefined, new Date(now - 50 * hourMs).toISOString(), now)
    ).toEqual({
      label: 'Uploaded 2d ago',
      isExpiringSoon: false,
      isExpired: false,
    });

    // Missing or invalid timestamps
    expect(formatCloudFileTimeRemaining(undefined, undefined, now)).toBeNull();
    expect(formatCloudFileTimeRemaining('not-a-date', 'also-invalid', now)).toBeNull();

    // Tooltips
    const bothTooltip = formatCloudFileTimestampTooltip(
      '2026-11-26T10:00:00Z',
      '2026-11-28T10:00:00Z'
    );
    expect(bothTooltip).toContain('Uploaded: ');
    expect(bothTooltip).toContain(' · Expires: ');

    const uploadOnlyTooltip = formatCloudFileTimestampTooltip('2026-11-26T10:00:00Z', undefined);
    expect(uploadOnlyTooltip).toContain('Uploaded: ');
    expect(uploadOnlyTooltip).not.toContain('Expires: ');

    const expiresOnlyTooltip = formatCloudFileTimestampTooltip(undefined, '2026-11-28T10:00:00Z');
    expect(expiresOnlyTooltip).toContain('Expires: ');
    expect(expiresOnlyTooltip).not.toContain('Uploaded: ');

    expect(formatCloudFileTimestampTooltip(undefined, undefined)).toBeUndefined();
    expect(formatCloudFileTimestampTooltip('invalid', 'invalid')).toBeUndefined();
  });
});
