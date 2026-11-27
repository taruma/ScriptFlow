import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  formatGeminiFilesError,
  uploadFileToGeminiFilesApi,
} from '../../../services/geminiFiles.ts';
import {
  collectReadyComposerAttachments,
  getUtf8ByteLength,
  validateSectionTag,
  type ChatMessageAttachment,
  type StagedComposerAttachment,
} from '../../../ui/aiAssistant.ts';
import {
  buildAttachmentFingerprint,
  classifyLocalDropFile,
  compressImageFile,
  filenameToDefaultLabel,
  formatByteSize,
  inferMimeTypeFromFile,
  inferReferenceKindFromMime,
  MAX_INLINE_TEXT_BYTES,
  readLocalTextFile,
} from '../../../ui/briefMedia.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import type {NewReferenceEntryDraft} from '../../AiBriefModal.tsx';

export interface UseComposerAttachmentsOptions {
  apiKey: string;
  hasApiKey: boolean;
  onOpenSettings: () => void;
}

function createAttachmentId(): string {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useComposerAttachments({
  apiKey,
  hasApiKey,
  onOpenSettings,
}: UseComposerAttachmentsOptions) {
  const [stagedAttachments, setStagedAttachments] = useState<StagedComposerAttachment[]>([]);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isYoutubeBarOpen, setIsYoutubeBarOpen] = useState(false);
  const [isTextSectionModalOpen, setIsTextSectionModalOpen] = useState(false);
  const [editingTextSectionId, setEditingTextSectionId] = useState<string | null>(null);
  const [composerAttachError, setComposerAttachError] = useState<string | null>(null);

  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map());
  /** Tracks object URLs created for staged attachments; released on explicit remove, reset, or unmount. */
  const ownedBlobUrlsRef = useRef<Set<string>>(new Set());
  /** Tracks object URLs transferred to sent message bubbles so unmount/reset still frees them cleanly. */
  const sentBlobUrlsRef = useRef<Set<string>>(new Set());

  const revokeBlobUrl = useCallback((url?: string) => {
    if (!url || !url.startsWith('blob:')) return;
    if (ownedBlobUrlsRef.current.has(url)) {
      ownedBlobUrlsRef.current.delete(url);
      URL.revokeObjectURL(url);
    }
  }, []);

  const revokeAllBlobUrls = useCallback(() => {
    for (const url of ownedBlobUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    ownedBlobUrlsRef.current.clear();
    for (const url of sentBlobUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    sentBlobUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      for (const ctrl of uploadControllersRef.current.values()) {
        ctrl.abort();
      }
      uploadControllersRef.current.clear();
      revokeAllBlobUrls();
    };
  }, [revokeAllBlobUrls]);

  const addLocalFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setComposerAttachError(null);

      for (const file of files) {
        const route = classifyLocalDropFile(file);

        if (route === 'inline_image') {
          try {
            const compressed = await compressImageFile(file);
            const id = createAttachmentId();
            setStagedAttachments((prev) => [
              ...prev,
              {
                id,
                kind: 'image',
                label: filenameToDefaultLabel(file.name),
                fileName: file.name,
                mimeType: compressed.mimeType,
                sizeBytes: compressed.sizeBytes,
                source: 'inline',
                status: 'ready',
                attachment: {
                  source: 'inline',
                  mimeType: compressed.mimeType,
                  fileName: file.name,
                  sizeBytes: compressed.sizeBytes,
                  width: compressed.width,
                  height: compressed.height,
                  inlineBase64: compressed.base64,
                  previewUrl: compressed.dataUrl,
                  fingerprint: buildAttachmentFingerprint([
                    'inline_image',
                    compressed.mimeType,
                    String(compressed.sizeBytes),
                    compressed.base64.slice(0, 256),
                    compressed.base64.slice(-128),
                  ]),
                },
              },
            ]);
          } catch (err) {
            setComposerAttachError(
              err instanceof Error ? err.message : `Could not compress "${file.name}".`
            );
          }
          continue;
        }

        if (route === 'inline_text') {
          try {
            const textResult = await readLocalTextFile(file);
            const id = createAttachmentId();
            setStagedAttachments((prev) => [
              ...prev,
              {
                id,
                kind: 'document',
                label: filenameToDefaultLabel(file.name),
                fileName: file.name,
                mimeType: textResult.mimeType,
                sizeBytes: textResult.sizeBytes,
                source: 'inline',
                status: 'ready',
                attachment: {
                  source: 'inline',
                  mimeType: textResult.mimeType,
                  fileName: file.name,
                  sizeBytes: textResult.sizeBytes,
                  inlineText: textResult.text,
                  fingerprint: buildAttachmentFingerprint([
                    'inline_text',
                    file.name,
                    textResult.text,
                  ]),
                },
              },
            ]);
          } catch (err) {
            setComposerAttachError(
              err instanceof Error ? err.message : `Could not read "${file.name}".`
            );
          }
          continue;
        }

        // files_api_required: video, audio, PDF, or > 256 KB text doc → auto-upload via Gemini Files API
        if (!hasApiKey) {
          setComposerAttachError(UI_LABELS.ai.composerAttach.missingKeyForFilesApi);
          onOpenSettings();
          return;
        }

        const mimeType = inferMimeTypeFromFile(file);
        const kind = inferReferenceKindFromMime(mimeType, file.name);
        const id = createAttachmentId();
        const controller = new AbortController();
        uploadControllersRef.current.set(id, controller);

        setStagedAttachments((prev) => [
          ...prev,
          {
            id,
            kind,
            label: filenameToDefaultLabel(file.name),
            fileName: file.name,
            mimeType,
            sizeBytes: file.size,
            source: 'files_api',
            status: 'uploading',
          },
        ]);

        void (async () => {
          try {
            const uploaded = await uploadFileToGeminiFilesApi({
              apiKey,
              file,
              signal: controller.signal,
              onStatus: (nextStatus) => {
                if (controller.signal.aborted) return;
                if (nextStatus === 'processing') {
                  setStagedAttachments((prev) =>
                    prev.map((item) =>
                      item.id === id ? {...item, status: 'processing'} : item
                    )
                  );
                }
              },
            });

            if (controller.signal.aborted) return;

            let localMediaUrl: string | undefined;
            if (kind === 'video' || kind === 'audio') {
              localMediaUrl = URL.createObjectURL(file);
              ownedBlobUrlsRef.current.add(localMediaUrl);
            }

            setStagedAttachments((prev) =>
              prev.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      status: 'ready',
                      mimeType: uploaded.mimeType,
                      sizeBytes: uploaded.sizeBytes || file.size,
                      attachment: {
                        source: 'files_api',
                        mimeType: uploaded.mimeType,
                        fileName: uploaded.displayName || file.name,
                        sizeBytes: uploaded.sizeBytes || file.size,
                        ...(localMediaUrl ? {localMediaUrl} : {}),
                        uri: uploaded.uri,
                        filesApiName: uploaded.name,
                        ...(uploaded.expirationTime
                          ? {expirationTime: uploaded.expirationTime}
                          : {}),
                        ...(kind === 'video' ? {processingMode: 'static'} : {}),
                        fingerprint: buildAttachmentFingerprint([
                          'files_api',
                          uploaded.uri,
                          uploaded.mimeType,
                        ]),
                      },
                    }
                  : item
              )
            );
          } catch (err) {
            if (controller.signal.aborted) return;
            const message = formatGeminiFilesError(err);
            setStagedAttachments((prev) =>
              prev.map((item) =>
                item.id === id ? {...item, status: 'error', error: message} : item
              )
            );
          } finally {
            uploadControllersRef.current.delete(id);
          }
        })();
      }
    },
    [apiKey, hasApiKey, onOpenSettings]
  );

  const addFromEntryDraft = useCallback((draft: NewReferenceEntryDraft) => {
    const att = draft.attachment;
    if (!att) return;
    const kind = draft.kind === 'text' ? 'document' : draft.kind;
    if (att.localMediaUrl && att.localMediaUrl.startsWith('blob:')) {
      ownedBlobUrlsRef.current.add(att.localMediaUrl);
    }

    setComposerAttachError(null);
    setStagedAttachments((prev) => {
      if (att.uri && prev.some((item) => item.attachment?.uri === att.uri)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: createAttachmentId(),
          kind,
          label: draft.label.trim() || att.fileName || kind,
          ...(att.fileName ? {fileName: att.fileName} : {}),
          mimeType: att.mimeType,
          ...(att.sizeBytes !== undefined ? {sizeBytes: att.sizeBytes} : {}),
          source: att.source,
          status: 'ready',
          attachment: att,
        },
      ];
    });
    if (att.source === 'youtube') {
      setIsYoutubeBarOpen(false);
    }
  }, []);

  const openNewTextSectionModal = useCallback(() => {
    setEditingTextSectionId(null);
    setIsTextSectionModalOpen(true);
  }, []);

  const openEditTextSectionModal = useCallback((id: string) => {
    setEditingTextSectionId(id);
    setIsTextSectionModalOpen(true);
  }, []);

  const closeTextSectionModal = useCallback(() => {
    setIsTextSectionModalOpen(false);
    setEditingTextSectionId(null);
  }, []);

  const upsertTextSection = useCallback(
    ({id, tag, content}: {id?: string; tag: string; content: string}) => {
      const validation = validateSectionTag(tag);
      if (!validation.valid) {
        setComposerAttachError(
          validation.error === 'reserved'
            ? UI_LABELS.ai.composerAttach.textSectionTagReservedError(validation.tag)
            : UI_LABELS.ai.composerAttach.textSectionTagEmptyError
        );
        return;
      }
      if (!content.trim()) return;
      const sizeBytes = getUtf8ByteLength(content);
      if (sizeBytes > MAX_INLINE_TEXT_BYTES) {
        setComposerAttachError(
          UI_LABELS.ai.composerAttach.textSectionContentTooLargeError(
            formatByteSize(sizeBytes) || `${sizeBytes} B`
          )
        );
        return;
      }

      const normalizedTag = validation.tag;
      const chipLabel = `<${normalizedTag}>`;
      const fingerprint = buildAttachmentFingerprint(['text_section', normalizedTag, content]);

      setComposerAttachError(null);
      setStagedAttachments((prev) => {
        const nextItem: StagedComposerAttachment = {
          id: id ?? createAttachmentId(),
          kind: 'document',
          label: chipLabel,
          mimeType: 'text/plain',
          sizeBytes,
          source: 'inline',
          sectionTag: normalizedTag,
          status: 'ready',
          attachment: {
            source: 'inline',
            mimeType: 'text/plain',
            sizeBytes,
            inlineText: content,
            sectionTag: normalizedTag,
            fingerprint,
          },
        };
        if (id && prev.some((item) => item.id === id)) {
          return prev.map((item) => (item.id === id ? nextItem : item));
        }
        return [...prev, nextItem];
      });
      setIsTextSectionModalOpen(false);
      setEditingTextSectionId(null);
    },
    []
  );

  const editingTextSection = useMemo(() => {
    if (!editingTextSectionId) return null;
    const match = stagedAttachments.find((item) => item.id === editingTextSectionId);
    const tag = match?.sectionTag || match?.attachment?.sectionTag;
    const content = match?.attachment?.inlineText;
    if (!match || !tag || typeof content !== 'string') return null;
    return {id: match.id, tag, content};
  }, [editingTextSectionId, stagedAttachments]);

  const removeStaged = useCallback(
    (id: string) => {
      const controller = uploadControllersRef.current.get(id);
      if (controller) {
        controller.abort();
        uploadControllersRef.current.delete(id);
      }
      setStagedAttachments((prev) => {
        const target = prev.find((item) => item.id === id);
        if (target?.attachment?.localMediaUrl) {
          revokeBlobUrl(target.attachment.localMediaUrl);
        }
        return prev.filter((item) => item.id !== id);
      });
    },
    [revokeBlobUrl]
  );

  const toggleVideoMode = useCallback((id: string) => {
    setStagedAttachments((prev) =>
      prev.map((item) => {
        if (item.id !== id || item.kind !== 'video' || !item.attachment) return item;
        const nextMode = item.attachment.processingMode === 'agentic' ? 'static' : 'agentic';
        return {
          ...item,
          attachment: {
            ...item.attachment,
            processingMode: nextMode,
            fingerprint: buildAttachmentFingerprint([
              item.attachment.source,
              item.attachment.uri ?? item.attachment.fileName ?? item.id,
              nextMode,
            ]),
          },
        };
      })
    );
  }, []);

  const consumeReadyForSend = useCallback(() => {
    const readySnapshot = stagedAttachments.filter((item) => item.status === 'ready');
    const collected = collectReadyComposerAttachments(readySnapshot);
    for (const item of readySnapshot) {
      const url = item.attachment?.localMediaUrl;
      if (url && ownedBlobUrlsRef.current.has(url)) {
        ownedBlobUrlsRef.current.delete(url);
        sentBlobUrlsRef.current.add(url);
      }
    }
    setStagedAttachments((prev) => prev.filter((item) => item.status !== 'ready'));
    setComposerAttachError(null);
    return {
      messageAttachments: collected.messageAttachments as ChatMessageAttachment[],
      agentAttachments: collected.agentAttachments,
      snapshotStaged: readySnapshot,
    };
  }, [stagedAttachments]);

  const restoreStaged = useCallback((snapshot: readonly StagedComposerAttachment[]) => {
    if (snapshot.length === 0) return;
    for (const item of snapshot) {
      const url = item.attachment?.localMediaUrl;
      if (url && sentBlobUrlsRef.current.has(url)) {
        sentBlobUrlsRef.current.delete(url);
        ownedBlobUrlsRef.current.add(url);
      }
    }
    setStagedAttachments((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const toRestore = snapshot.filter((item) => !existingIds.has(item.id));
      return toRestore.length > 0 ? [...toRestore, ...prev] : prev;
    });
  }, []);

  const clearAllStaged = useCallback(() => {
    for (const ctrl of uploadControllersRef.current.values()) {
      ctrl.abort();
    }
    uploadControllersRef.current.clear();
    revokeAllBlobUrls();
    setStagedAttachments([]);
    setIsCloudModalOpen(false);
    setIsYoutubeBarOpen(false);
    setIsTextSectionModalOpen(false);
    setEditingTextSectionId(null);
    setComposerAttachError(null);
  }, [revokeAllBlobUrls]);

  const hasPendingUploads = useMemo(
    () =>
      stagedAttachments.some(
        (item) => item.status === 'uploading' || item.status === 'processing'
      ),
    [stagedAttachments]
  );

  const hasErroredAttachments = useMemo(
    () => stagedAttachments.some((item) => item.status === 'error'),
    [stagedAttachments]
  );

  const canSendAttachments = !hasPendingUploads && !hasErroredAttachments;

  const stagedUris = useMemo(
    () =>
      new Set(
        stagedAttachments
          .map((item) => item.attachment?.uri)
          .filter((uri): uri is string => Boolean(uri))
      ),
    [stagedAttachments]
  );

  return {
    stagedAttachments,
    isCloudModalOpen,
    setIsCloudModalOpen,
    isYoutubeBarOpen,
    setIsYoutubeBarOpen,
    isTextSectionModalOpen,
    editingTextSection,
    openNewTextSectionModal,
    openEditTextSectionModal,
    closeTextSectionModal,
    upsertTextSection,
    composerAttachError,
    setComposerAttachError,
    hasPendingUploads,
    hasErroredAttachments,
    canSendAttachments,
    stagedUris,
    addLocalFiles,
    addFromEntryDraft,
    removeStaged,
    toggleVideoMode,
    consumeReadyForSend,
    restoreStaged,
    clearAllStaged,
  };
}
