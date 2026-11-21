import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {createPortal} from 'react-dom';
import {
  AlertCircle,
  CloudUpload,
  ExternalLink,
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Music,
  Play,
  PlayCircle,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  deleteGeminiFile,
  listGeminiFiles,
  uploadFileToGeminiFilesApi,
  type GeminiUploadedFile,
} from '../services/geminiFiles.ts';
import type {
  DraftBriefState,
  ReferenceAttachment,
  ReferenceEntry,
  ReferenceKind,
  VideoProcessingMode,
} from '../ui/aiAssistant.ts';
import {
  buildAttachmentFingerprint,
  buildTextExcerpt,
  CARD_PREVIEW_HEIGHT,
  classifyLocalDropFile,
  compressImageFile,
  computeReferenceCardWidth,
  extractYouTubeVideoId,
  filenameToDefaultLabel,
  formatByteSize,
  getYouTubeThumbnailUrl,
  inferReferenceKindFromMime,
  normalizeYouTubeUrl,
  readLocalTextFile,
} from '../ui/briefMedia.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

export interface NewReferenceEntryDraft {
  kind: ReferenceKind;
  label: string;
  note?: string;
  attachment?: ReferenceAttachment;
}

export interface AiBriefModalProps {
  isOpen: boolean;
  apiKey: string;
  hasApiKey: boolean;
  brief: DraftBriefState;
  briefHasContent: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onAddReference: () => void;
  onAddReferenceEntry: (draft: NewReferenceEntryDraft) => void;
  onUpdateReference: (
    refId: string,
    patch: Partial<Pick<ReferenceEntry, 'handle' | 'label' | 'note' | 'attachment'>>
  ) => void;
  onRemoveReference: (refId: string) => void;
  onUpdateSpecs: (specs: string) => void;
  onUpdateSubtext: (subtext: string) => void;
  onClearBrief: () => void;
}

interface HoverPreviewState {
  entry: ReferenceEntry;
  top: number;
  left: number;
}

async function readImageNaturalDimensions(
  objectUrl: string
): Promise<{width: number; height: number} | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({width: img.naturalWidth, height: img.naturalHeight});
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = objectUrl;
  });
}

function formatExpirationLabel(iso?: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function AiBriefModal(props: AiBriefModalProps) {
  if (!props.isOpen) return null;
  return <AiBriefModalContent {...props} />;
}

function AiBriefModalContent({
  apiKey,
  hasApiKey,
  brief,
  briefHasContent,
  onClose,
  onOpenSettings,
  onSetEnabled,
  onAddReference,
  onAddReferenceEntry,
  onUpdateReference,
  onRemoveReference,
  onUpdateSpecs,
  onUpdateSubtext,
  onClearBrief,
}: Omit<AiBriefModalProps, 'isOpen'>) {
  const labels = UI_LABELS.ai.briefTray;

  const [dragActive, setDragActive] = useState(false);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [redirectFile, setRedirectFile] = useState<File | null>(null);

  // Hover floating preview & click-to-inspect lightbox
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const [inspectedEntryId, setInspectedEntryId] = useState<string | null>(null);

  // Inline YouTube URL attachment bar
  const [isYoutubeOpen, setIsYoutubeOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeLabel, setYoutubeLabel] = useState('');
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  // Inline Gemini Files API upload & cloud picker panel
  const [isFilesApiOpen, setIsFilesApiOpen] = useState(false);
  const [filesApiDragActive, setFilesApiDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const [uploadBatchProgress, setUploadBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [filesApiError, setFilesApiError] = useState<string | null>(null);
  const [cloudFiles, setCloudFiles] = useState<GeminiUploadedFile[]>([]);
  const [isLoadingCloudFiles, setIsLoadingCloudFiles] = useState(false);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);

  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const filesApiInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const inspectedEntry = inspectedEntryId
    ? (brief.references.find((ref) => ref.id === inspectedEntryId) ?? null)
    : null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (inspectedEntryId) {
          setInspectedEntryId(null);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, inspectedEntryId]);

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
    };
  }, []);

  const refreshCloudFiles = useCallback(async () => {
    if (!hasApiKey) return;
    setIsLoadingCloudFiles(true);
    setFilesApiError(null);
    try {
      const files = await listGeminiFiles({apiKey});
      setCloudFiles(files);
    } catch (err) {
      setFilesApiError(err instanceof Error ? err.message : 'Failed to list Gemini Files.');
    } finally {
      setIsLoadingCloudFiles(false);
    }
  }, [apiKey, hasApiKey]);

  useEffect(() => {
    if (isFilesApiOpen && hasApiKey) {
      void refreshCloudFiles();
    }
  }, [isFilesApiOpen, hasApiKey, refreshCloudFiles]);

  const attachCloudFile = useCallback(
    (
      file: GeminiUploadedFile,
      options?: {
        customLabel?: string;
        localMediaUrl?: string;
        previewUrl?: string;
        width?: number;
        height?: number;
      }
    ) => {
      const kind = inferReferenceKindFromMime(file.mimeType, file.displayName);
      onAddReferenceEntry({
        kind,
        label: options?.customLabel?.trim() || filenameToDefaultLabel(file.displayName),
        attachment: {
          source: 'files_api',
          mimeType: file.mimeType,
          fileName: file.displayName,
          sizeBytes: file.sizeBytes,
          ...(options?.width ? {width: options.width} : {}),
          ...(options?.height ? {height: options.height} : {}),
          ...(options?.previewUrl ? {previewUrl: options.previewUrl} : {}),
          ...(options?.localMediaUrl ? {localMediaUrl: options.localMediaUrl} : {}),
          uri: file.uri,
          filesApiName: file.name,
          ...(file.expirationTime ? {expirationTime: file.expirationTime} : {}),
          ...(kind === 'video' ? {processingMode: 'static'} : {}),
          fingerprint: buildAttachmentFingerprint(['files_api', file.uri, file.mimeType]),
        },
      });
    },
    [onAddReferenceEntry]
  );

  const handleFilesApiUploadFiles = useCallback(
    async (fileInput: File | FileList | readonly File[]) => {
      const files =
        fileInput instanceof File ? [fileInput] : Array.from(fileInput);
      if (files.length === 0) return;

      if (!hasApiKey) {
        setFilesApiError(labels.filesApiMissingKey);
        setIsFilesApiOpen(true);
        return;
      }

      uploadAbortRef.current?.abort();
      const controller = new AbortController();
      uploadAbortRef.current = controller;

      setFilesApiError(null);
      setDropError(null);
      setRedirectFile(null);
      setIsFilesApiOpen(true);
      setUploadStatus('uploading');
      setUploadBatchProgress(files.length > 1 ? {current: 1, total: files.length} : null);

      try {
        for (let idx = 0; idx < files.length; idx++) {
          const file = files[idx];
          if (controller.signal.aborted) break;
          if (files.length > 1) {
            setUploadBatchProgress({current: idx + 1, total: files.length});
          }
          setUploadStatus('uploading');

          const uploaded = await uploadFileToGeminiFilesApi({
            apiKey,
            file,
            displayName: file.name,
            signal: controller.signal,
            onStatus: (status) => {
              if (status === 'uploading') setUploadStatus('uploading');
              else if (status === 'processing') setUploadStatus('processing');
            },
          });

          const kind = inferReferenceKindFromMime(uploaded.mimeType, uploaded.displayName);
          let localMediaUrl: string | undefined;
          let previewUrl: string | undefined;
          let dims: {width: number; height: number} | null = null;

          if (kind === 'image' || kind === 'video' || kind === 'audio') {
            localMediaUrl = URL.createObjectURL(file);
            if (kind === 'image') {
              previewUrl = localMediaUrl;
              dims = await readImageNaturalDimensions(localMediaUrl);
            }
          }

          attachCloudFile(uploaded, {
            customLabel: filenameToDefaultLabel(file.name),
            localMediaUrl,
            previewUrl,
            width: dims?.width,
            height: dims?.height,
          });
          setCloudFiles((prev) => [uploaded, ...prev.filter((item) => item.uri !== uploaded.uri)]);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFilesApiError(err instanceof Error ? err.message : 'Failed to upload file.');
      } finally {
        setUploadStatus('idle');
        setUploadBatchProgress(null);
      }
    },
    [apiKey, hasApiKey, attachCloudFile, labels.filesApiMissingKey]
  );

  const handleFilesApiUpload = useCallback(
    async (file: File) => handleFilesApiUploadFiles(file),
    [handleFilesApiUploadFiles]
  );

  const processLocalFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setDropError(null);
      setRedirectFile(null);
      setIsProcessingLocal(true);

      try {
        for (const file of files) {
          const route = classifyLocalDropFile(file);

          if (route === 'inline_image') {
            const compressed = await compressImageFile(file);
            onAddReferenceEntry({
              kind: 'image',
              label: filenameToDefaultLabel(file.name),
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
            });
          } else if (route === 'inline_text') {
            const textResult = await readLocalTextFile(file);
            onAddReferenceEntry({
              kind: 'document',
              label: filenameToDefaultLabel(file.name),
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
            });
          } else {
            setRedirectFile(file);
          }
        }
      } catch (err) {
        setDropError(err instanceof Error ? err.message : 'Could not process dropped file.');
      } finally {
        setIsProcessingLocal(false);
      }
    },
    [onAddReferenceEntry]
  );

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragActive) setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer?.files?.length) {
      void processLocalFiles(event.dataTransfer.files);
    }
  };

  const handleLocalFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      void processLocalFiles(files);
    }
    event.target.value = '';
  };

  const handleFilesApiInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      void handleFilesApiUploadFiles(files);
    }
    event.target.value = '';
  };

  const handleFilesApiDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!filesApiDragActive && uploadStatus === 'idle') {
      setFilesApiDragActive(true);
    }
  };

  const handleFilesApiDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFilesApiDragActive(false);
    }
  };

  const handleFilesApiDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setFilesApiDragActive(false);
    if (uploadStatus !== 'idle') return;
    if (event.dataTransfer?.files?.length) {
      void handleFilesApiUploadFiles(event.dataTransfer.files);
    }
  };

  const handleAttachYoutube = () => {
    const normalized = normalizeYouTubeUrl(youtubeUrl);
    if (!normalized) {
      setYoutubeError(labels.youtubeInvalidError);
      return;
    }
    const videoId = extractYouTubeVideoId(normalized);
    const thumb = getYouTubeThumbnailUrl(normalized) ?? undefined;

    onAddReferenceEntry({
      kind: 'video',
      label: youtubeLabel.trim() || (videoId ? `YouTube ${videoId}` : 'YouTube reference'),
      attachment: {
        source: 'youtube',
        mimeType: 'video/youtube',
        uri: normalized,
        previewUrl: thumb,
        processingMode: 'static',
        fingerprint: buildAttachmentFingerprint(['youtube', normalized]),
      },
    });

    setYoutubeUrl('');
    setYoutubeLabel('');
    setYoutubeError(null);
    setIsYoutubeOpen(false);
  };

  const handleDeleteCloudFile = async (fileName: string) => {
    if (!hasApiKey) return;
    setDeletingFileName(fileName);
    setFilesApiError(null);
    try {
      await deleteGeminiFile({apiKey, name: fileName});
      setCloudFiles((prev) => prev.filter((item) => item.name !== fileName));
    } catch (err) {
      setFilesApiError(err instanceof Error ? err.message : 'Failed to delete Gemini file.');
    } finally {
      setDeletingFileName(null);
    }
  };

  const handleToggleVideoProcessingMode = (entry: ReferenceEntry) => {
    if (!entry.attachment || entry.kind !== 'video') return;
    const nextMode: VideoProcessingMode =
      entry.attachment.processingMode === 'agentic' ? 'static' : 'agentic';
    onUpdateReference(entry.id, {
      attachment: {
        ...entry.attachment,
        processingMode: nextMode,
        fingerprint: buildAttachmentFingerprint([
          entry.attachment.source,
          entry.attachment.uri ?? entry.attachment.fileName ?? entry.id,
          nextMode,
        ]),
      },
    });
  };

  const handlePreviewMouseEnter = (
    entry: ReferenceEntry,
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    if (!entry.attachment) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const previewWidth = 340;
    const estimatedHeight = 320;
    const pad = 16;

    let left = rect.right + 12;
    if (left + previewWidth > window.innerWidth - pad) {
      left = rect.left - previewWidth - 12;
    }
    if (left < pad) {
      left = Math.max(pad, Math.min(rect.left, window.innerWidth - previewWidth - pad));
    }

    let top = rect.top;
    if (top + estimatedHeight > window.innerHeight - pad) {
      top = window.innerHeight - estimatedHeight - pad;
    }
    if (top < pad) top = pad;

    setHoverPreview({entry, top, left});
  };

  const handlePreviewMouseLeave = () => {
    setHoverPreview(null);
  };

  const attachedUris = new Set(
    brief.references
      .map((entry) => entry.attachment?.uri)
      .filter((uri): uri is string => Boolean(uri))
  );

  const youtubePreviewThumb = youtubeUrl.trim() ? getYouTubeThumbnailUrl(youtubeUrl) : null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.dialogAria}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !inspectedEntry) {
            onClose();
          }
        }}
        className={UI_TOKENS.modal.overlay}
      >
        <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col max-h-[90dvh]">
          {/* Header */}
          <div className={UI_TOKENS.modal.header}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-text-main"
              >
                <FileText className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main">
                  {labels.title}
                </h2>
                <p className="text-[11px] text-text-muted truncate">{labels.subtitle}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={labels.closeAria}
              className={UI_TOKENS.button.iconClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div
            aria-label={labels.regionAria}
            onScroll={() => {
              if (hoverPreview) setHoverPreview(null);
            }}
            className="overflow-y-auto auteur-pane-scroll px-5 py-4 space-y-5"
          >
            {/* Include in AI Context Toggle */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-subtle/60 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-text-main">{labels.enableLabel}</div>
                  <div className="text-[11px] text-text-muted">{labels.enableDesc}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={brief.enabled}
                  aria-label={labels.enableAria}
                  onClick={() => onSetEnabled(!brief.enabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                    brief.enabled
                      ? 'border-btn-primary-bg bg-btn-primary-bg'
                      : 'border-border-main bg-surface-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                      brief.enabled
                        ? 'translate-x-4 bg-btn-primary-text'
                        : 'translate-x-0.5 bg-text-muted'
                    }`}
                  />
                </button>
              </div>
              {!brief.enabled && briefHasContent && (
                <p className="text-[11px] text-text-muted px-1">{labels.pausedHint}</p>
              )}
            </div>

            {/* Cast & References (Compact Drop Strip + Proportional Visual Card Strip) */}
            <section className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {labels.refsHeading}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFilesApiOpen((prev) => !prev);
                      setIsYoutubeOpen(false);
                    }}
                    aria-expanded={isFilesApiOpen}
                    aria-label={labels.filesApiAria}
                    className={`${UI_TOKENS.ai.pillButton} text-[11px] py-1 px-2.5 ${
                      isFilesApiOpen ? 'auteur-phase-aesthetic' : ''
                    }`}
                  >
                    <CloudUpload className="h-3 w-3" />
                    <span>{labels.filesApiButton}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsYoutubeOpen((prev) => !prev);
                      setIsFilesApiOpen(false);
                      setYoutubeError(null);
                    }}
                    aria-expanded={isYoutubeOpen}
                    aria-label={labels.youtubeAria}
                    className={`${UI_TOKENS.ai.pillButton} text-[11px] py-1 px-2.5 ${
                      isYoutubeOpen ? 'auteur-phase-intent' : ''
                    }`}
                  >
                    <PlayCircle className="h-3 w-3" />
                    <span>{labels.youtubeButton}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onAddReference}
                    aria-label={labels.addRefAria}
                    className={`${UI_TOKENS.ai.pillButton} text-[11px] py-1 px-2.5`}
                  >
                    <Plus className="h-3 w-3" />
                    <span>{labels.addRefButton}</span>
                  </button>
                </div>
              </div>

              {/* Compact Horizontal Drag-and-Drop Bar (Images + Text only) */}
              <div
                role="button"
                tabIndex={0}
                aria-label={labels.dropzoneAria}
                onDragEnter={handleDragOver}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => localFileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    localFileInputRef.current?.click();
                  }
                }}
                className={`rounded-xl border border-dashed px-3 py-2 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                  dragActive
                    ? 'border-text-main bg-surface-muted'
                    : 'border-border-main bg-surface-subtle/50 hover:border-text-muted hover:bg-surface-subtle'
                }`}
              >
                <input
                  ref={localFileInputRef}
                  type="file"
                  multiple
                  accept="image/*,text/*,.md,.markdown,.json,.csv,.srt,.vtt"
                  onChange={handleLocalFileInputChange}
                  className="hidden"
                />
                <div className="flex items-center gap-2.5 min-w-0">
                  {isProcessingLocal ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-muted" />
                  ) : (
                    <Upload className="h-4 w-4 shrink-0 text-text-faint" />
                  )}
                  <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs font-medium text-text-main">
                      {labels.dropzoneTitle}
                    </span>
                    <span className="text-[11px] text-text-faint truncate">
                      {labels.dropzoneSubtitle}
                    </span>
                  </div>
                </div>
                <span className="rounded-md border border-border-main bg-surface px-2 py-0.5 text-[11px] font-medium text-text-body shrink-0">
                  {labels.dropzoneBrowseButton}
                </span>
              </div>

              {/* Non-image/non-text drop redirect notice */}
              {redirectFile && (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-main bg-surface-subtle px-3 py-2 text-xs text-text-body"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CloudUpload className="h-3.5 w-3.5 shrink-0 text-[var(--phase-aesthetic-text)]" />
                    <span className="truncate">
                      {labels.filesApiRedirectNotice(redirectFile.name)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={uploadStatus !== 'idle'}
                      onClick={() => void handleFilesApiUpload(redirectFile)}
                      className={`${UI_TOKENS.button.primary} !px-2.5 !py-1 !text-[11px]`}
                    >
                      {labels.filesApiRedirectAction}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRedirectFile(null)}
                      aria-label={labels.dismissNoticeAria}
                      className={UI_TOKENS.button.iconGhost}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Local drop error */}
              {dropError && (
                <div
                  role="alert"
                  className="flex items-start justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{dropError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDropError(null)}
                    aria-label={labels.dismissNoticeAria}
                    className="p-0.5 opacity-80 hover:opacity-100 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Inline YouTube URL Bar */}
              {isYoutubeOpen && (
                <div className="rounded-xl border border-border-main bg-surface-subtle/70 p-3 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    {youtubePreviewThumb && (
                      <img
                        src={youtubePreviewThumb}
                        alt=""
                        className="h-14 w-24 rounded-lg border border-border-main object-cover shrink-0 bg-surface-muted"
                      />
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        type="url"
                        data-native-undo="true"
                        value={youtubeUrl}
                        onChange={(event) => {
                          setYoutubeUrl(event.target.value);
                          if (youtubeError) setYoutubeError(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAttachYoutube();
                          }
                        }}
                        placeholder={labels.youtubeUrlPlaceholder}
                        aria-label={labels.youtubeUrlAria}
                        className={UI_TOKENS.input.field}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          data-native-undo="true"
                          value={youtubeLabel}
                          onChange={(event) => setYoutubeLabel(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleAttachYoutube();
                            }
                          }}
                          placeholder={labels.youtubeLabelPlaceholder}
                          aria-label={labels.youtubeLabelAria}
                          className={`${UI_TOKENS.input.field} flex-1`}
                        />
                        <button
                          type="button"
                          onClick={handleAttachYoutube}
                          disabled={youtubeUrl.trim().length === 0}
                          className={`${UI_TOKENS.button.primary} !px-3 !py-1.5 !text-xs disabled:opacity-40`}
                        >
                          {labels.youtubeAddButton}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsYoutubeOpen(false);
                            setYoutubeError(null);
                          }}
                          className={`${UI_TOKENS.button.secondary} !px-2.5 !py-1.5 !text-xs`}
                        >
                          {labels.youtubeCancelButton}
                        </button>
                      </div>
                    </div>
                  </div>
                  {youtubeError && (
                    <p className="text-[11px] text-red-600 dark:text-red-400">{youtubeError}</p>
                  )}
                </div>
              )}

              {/* Inline Gemini Files API Panel */}
              {isFilesApiOpen && (
                <div className="rounded-xl border border-border-main bg-surface-subtle/70 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CloudUpload className="h-3.5 w-3.5 shrink-0 text-[var(--phase-aesthetic-text)]" />
                      <span className="text-xs font-semibold text-text-main truncate">
                        {labels.filesApiPanelTitle}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFilesApiOpen(false)}
                      className="text-[11px] text-text-muted hover:text-text-main cursor-pointer"
                    >
                      {labels.filesApiCloseButton}
                    </button>
                  </div>

                  {!hasApiKey ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-xs text-text-muted">
                      <span>{labels.filesApiMissingKey}</span>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenSettings();
                        }}
                        className={`${UI_TOKENS.button.primary} !px-2.5 !py-1 !text-[11px]`}
                      >
                        {labels.filesApiOpenSettings}
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        ref={filesApiInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*,audio/*,application/pdf,text/*,.md,.json,.csv,.srt,.vtt"
                        onChange={handleFilesApiInputChange}
                        className="hidden"
                      />
                      <div
                        role="button"
                        tabIndex={uploadStatus === 'idle' ? 0 : -1}
                        aria-disabled={uploadStatus !== 'idle'}
                        aria-label={labels.filesApiDropAria}
                        onClick={() => {
                          if (uploadStatus === 'idle') {
                            filesApiInputRef.current?.click();
                          }
                        }}
                        onKeyDown={(event) => {
                          if (
                            uploadStatus === 'idle' &&
                            (event.key === 'Enter' || event.key === ' ')
                          ) {
                            event.preventDefault();
                            filesApiInputRef.current?.click();
                          }
                        }}
                        onDragOver={handleFilesApiDragOver}
                        onDragLeave={handleFilesApiDragLeave}
                        onDrop={handleFilesApiDrop}
                        className={`flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-dashed px-3 py-2.5 transition-colors ${
                          uploadStatus !== 'idle'
                            ? 'border-border-main bg-surface/70 opacity-75 cursor-wait'
                            : filesApiDragActive
                              ? 'border-[var(--phase-aesthetic-text)] bg-surface shadow-inner cursor-copy'
                              : 'border-border-main bg-surface/80 hover:bg-surface hover:border-text-muted/60 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface-subtle text-text-muted"
                          >
                            {uploadStatus !== 'idle' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--phase-aesthetic-text)]" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-text-main truncate">
                              {uploadStatus === 'uploading'
                                ? uploadBatchProgress
                                  ? labels.filesApiUploadingBatch(
                                      uploadBatchProgress.current,
                                      uploadBatchProgress.total
                                    )
                                  : labels.filesApiUploading
                                : uploadStatus === 'processing'
                                  ? uploadBatchProgress
                                    ? labels.filesApiProcessingBatch(
                                        uploadBatchProgress.current,
                                        uploadBatchProgress.total
                                      )
                                    : labels.filesApiProcessing
                                  : labels.filesApiDropTitle}
                            </div>
                            <div className="text-[10.5px] text-text-faint truncate">
                              {labels.filesApiUploadHint}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 !px-2.5 !py-1 !text-[11px] shrink-0 ${
                            uploadStatus !== 'idle' ? 'opacity-60' : ''
                          }`}
                        >
                          {labels.filesApiUploadButton}
                        </span>
                      </div>

                      {filesApiError && (
                        <div
                          role="alert"
                          className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-700 dark:text-red-300"
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{filesApiError}</span>
                        </div>
                      )}

                      {/* Existing 48h Cloud Files */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                            {labels.filesApiCloudHeading}
                          </span>
                          <button
                            type="button"
                            disabled={isLoadingCloudFiles}
                            onClick={() => void refreshCloudFiles()}
                            aria-label={labels.filesApiRefreshAria}
                            className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-main disabled:opacity-40 cursor-pointer"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${isLoadingCloudFiles ? 'animate-spin' : ''}`}
                            />
                            <span>{labels.filesApiRefreshButton}</span>
                          </button>
                        </div>

                        {isLoadingCloudFiles ? (
                          <p className="text-[11px] italic text-text-faint py-1">
                            {labels.filesApiLoadingList}
                          </p>
                        ) : cloudFiles.length === 0 ? (
                          <p className="text-[11px] italic text-text-faint py-1">
                            {labels.filesApiEmptyList}
                          </p>
                        ) : (
                          <div className="max-h-36 overflow-y-auto auteur-pane-scroll space-y-1 pr-0.5">
                            {cloudFiles.map((file) => {
                              const isAttached = attachedUris.has(file.uri);
                              const isActive = file.state === 'ACTIVE' || !file.state;
                              return (
                                <div
                                  key={file.name || file.uri}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-[11px]"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-text-main truncate">
                                      {file.displayName}
                                    </div>
                                    <div className="font-mono text-[10px] text-text-faint truncate">
                                      {file.mimeType}
                                      {file.sizeBytes > 0
                                        ? ` · ${formatByteSize(file.sizeBytes)}`
                                        : ''}
                                      {file.state && file.state !== 'ACTIVE'
                                        ? ` · ${file.state}`
                                        : ''}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isAttached ? (
                                      <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-aesthetic">
                                        {labels.filesApiAttachedBadge}
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={!isActive}
                                        onClick={() => attachCloudFile(file)}
                                        className={`${UI_TOKENS.ai.pillButton} text-[10px] py-0.5 px-2 disabled:opacity-40`}
                                      >
                                        {labels.filesApiAttachButton}
                                      </button>
                                    )}
                                    {file.name && (
                                      <button
                                        type="button"
                                        disabled={deletingFileName === file.name}
                                        onClick={() => void handleDeleteCloudFile(file.name)}
                                        aria-label={labels.filesApiDeleteAria(file.displayName)}
                                        className="p-1 rounded text-text-faint hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40"
                                      >
                                        {deletingFileName === file.name ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3 w-3" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Uniform-Height, Aspect-Ratio-Aware Reference Card Strip */}
              {brief.references.length > 0 && (
                <div className="flex flex-wrap items-stretch gap-2.5 pt-0.5">
                  {brief.references.map((entry) => {
                    const att = entry.attachment;
                    const isYoutube = att?.source === 'youtube';
                    const isFilesApi = att?.source === 'files_api';
                    const isInlineText =
                      att?.source === 'inline' && typeof att.inlineText === 'string';
                    const previewUrl = att?.previewUrl;
                    const localVideoSrc =
                      entry.kind === 'video' && !isYoutube ? att?.localMediaUrl : undefined;
                    const isInspectable = Boolean(att);

                    const cardWidth = computeReferenceCardWidth({
                      kind: entry.kind,
                      mediaWidth: att?.width,
                      mediaHeight: att?.height,
                    });

                    const metaParts: string[] = [];
                    if (att?.width && att?.height) {
                      metaParts.push(`${att.width}×${att.height}`);
                    }
                    if (att?.sizeBytes) {
                      metaParts.push(formatByteSize(att.sizeBytes));
                    }
                    if (isFilesApi) {
                      metaParts.push('48h');
                    }
                    const metaCaption = metaParts.join(' · ');
                    const textSnippet = isInlineText
                      ? buildTextExcerpt(att.inlineText ?? '', 5, 180).excerpt
                      : '';

                    return (
                      <div
                        key={entry.id}
                        style={{width: `${cardWidth}px`}}
                        className="rounded-xl border border-border-main bg-surface-subtle/40 p-2 flex flex-col gap-1.5 shrink-0 max-w-full"
                      >
                        {/* Fixed-Height Preview Box (aspect ratio preserved via card width + object-contain) */}
                        <div
                          style={{height: `${CARD_PREVIEW_HEIGHT}px`}}
                          onMouseEnter={(e) => handlePreviewMouseEnter(entry, e)}
                          onMouseLeave={handlePreviewMouseLeave}
                          onClick={() => {
                            if (isInspectable) {
                              setHoverPreview(null);
                              setInspectedEntryId(entry.id);
                            }
                          }}
                          title={
                            isInspectable
                              ? entry.kind === 'video' || entry.kind === 'audio'
                                ? labels.previewPlayHint
                                : labels.previewClickHint
                              : undefined
                          }
                          className={`group/preview relative w-full rounded-lg overflow-hidden border border-border-subtle bg-surface-muted flex items-center justify-center ${
                            isInspectable ? 'cursor-pointer' : ''
                          }`}
                        >
                          {previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={entry.label || entry.handle}
                              className={`h-full w-full ${
                                isYoutube ? 'object-cover' : 'object-contain'
                              }`}
                            />
                          ) : localVideoSrc ? (
                            <video
                              src={localVideoSrc}
                              muted
                              playsInline
                              preload="metadata"
                              className="h-full w-full object-contain bg-black/80"
                            />
                          ) : isInlineText ? (
                            <div className="h-full w-full p-2 pt-7 pb-6 overflow-hidden bg-surface text-left">
                              <pre className="whitespace-pre-wrap break-words font-mono text-[9px] leading-snug text-text-muted">
                                {textSnippet}
                              </pre>
                            </div>
                          ) : entry.kind === 'video' ? (
                            <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-muted">
                              <Film className="h-5 w-5 text-[var(--phase-continuity-text)]" />
                              <span className="font-mono text-[9px] truncate max-w-full">
                                {att?.fileName || 'Video'}
                              </span>
                            </div>
                          ) : entry.kind === 'audio' ? (
                            <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-muted">
                              <Music className="h-5 w-5 text-[var(--phase-logic-text)]" />
                              <span className="font-mono text-[9px] truncate max-w-full">
                                {att?.fileName || 'Audio'}
                              </span>
                            </div>
                          ) : entry.kind === 'document' ? (
                            <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-muted">
                              <FileText className="h-5 w-5 text-[var(--phase-aesthetic-text)]" />
                              <span className="font-mono text-[9px] truncate max-w-full px-1">
                                {att?.fileName || 'Document'}
                              </span>
                            </div>
                          ) : entry.kind === 'image' ? (
                            <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-muted">
                              <ImageIcon className="h-5 w-5 text-text-faint" />
                              <span className="font-mono text-[9px] truncate max-w-full px-1">
                                {att?.fileName || 'Image'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-faint">
                              <Tag className="h-4 w-4" />
                              <span className="font-mono text-[9px] uppercase">
                                {labels.cardManualBadge}
                              </span>
                            </div>
                          )}

                          {/* Subtle Center Inspect / Play Affordance on Hover */}
                          {isInspectable && (
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 group-hover/preview:bg-black/20 transition-colors"
                            >
                              <span className="opacity-0 group-hover/preview:opacity-100 transition-opacity flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 border border-border-main text-text-main shadow-sm">
                                {entry.kind === 'video' || entry.kind === 'audio' ? (
                                  <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </span>
                            </div>
                          )}

                          {/* Top-left Handle Badge (Editable) */}
                          <input
                            type="text"
                            data-native-undo="true"
                            value={entry.handle}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              onUpdateReference(entry.id, {handle: event.target.value})
                            }
                            placeholder={labels.handlePlaceholder}
                            aria-label={labels.handleAria}
                            className="absolute top-1 left-1 max-w-[74px] rounded bg-btn-primary-bg/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-btn-primary-text placeholder-btn-primary-text/60 outline-none focus:ring-1 focus:ring-surface z-10"
                          />

                          {/* Top-right Delete Button */}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setHoverPreview(null);
                              if (inspectedEntryId === entry.id) setInspectedEntryId(null);
                              onRemoveReference(entry.id);
                            }}
                            aria-label={labels.removeRefAria}
                            className="absolute top-1 right-1 rounded bg-surface/90 border border-border-main p-1 text-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer z-10"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>

                          {/* Bottom-left Source Badge */}
                          {(isFilesApi || isYoutube || isInlineText) && (
                            <span
                              className={`absolute bottom-1 left-1 rounded border px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wider z-10 ${
                                isYoutube
                                  ? 'auteur-phase-intent'
                                  : isFilesApi
                                    ? 'auteur-phase-aesthetic'
                                    : 'border-border-main bg-surface/90 text-text-body'
                              }`}
                            >
                              {isYoutube
                                ? labels.cardYoutubeBadge
                                : isFilesApi
                                  ? labels.cardFilesApiBadge
                                  : labels.cardInlineTextBadge}
                            </span>
                          )}

                          {/* Bottom-right Video Processing Toggle (Static / Agentic) */}
                          {entry.kind === 'video' && att && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleToggleVideoProcessingMode(entry);
                              }}
                              title={labels.cardVideoModeTitle}
                              className="absolute bottom-1 right-1 rounded border border-border-main bg-surface/90 px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase text-text-main hover:bg-surface cursor-pointer z-10"
                            >
                              {att.processingMode === 'agentic'
                                ? labels.cardVideoModeAgentic
                                : labels.cardVideoModeStatic}
                            </button>
                          )}
                        </div>

                        {/* Below Preview: Assigned Label & Optional Note */}
                        <div className="space-y-1">
                          <input
                            type="text"
                            data-native-undo="true"
                            value={entry.label}
                            onChange={(event) =>
                              onUpdateReference(entry.id, {label: event.target.value})
                            }
                            placeholder={labels.labelPlaceholder}
                            aria-label={labels.labelAria}
                            className="w-full rounded-md border border-border-main bg-surface px-2 py-1 text-xs font-medium text-text-main placeholder-text-placeholder focus:outline-none focus:ring-1 focus:ring-border-main"
                          />
                          <input
                            type="text"
                            data-native-undo="true"
                            value={entry.note ?? ''}
                            onChange={(event) =>
                              onUpdateReference(entry.id, {note: event.target.value})
                            }
                            placeholder={labels.notePlaceholder}
                            aria-label={labels.noteAria}
                            className="w-full rounded-md border border-border-subtle bg-surface px-2 py-1 text-[11px] text-text-body placeholder-text-placeholder focus:border-border-main focus:outline-none focus:ring-1 focus:ring-border-main"
                          />
                          {metaCaption && (
                            <div className="px-0.5 font-mono text-[9px] text-text-faint truncate">
                              {metaCaption}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <hr className="border-border-subtle" />

            {/* Format & Specs */}
            <section className="space-y-1.5">
              <label
                htmlFor="auteur-ai-brief-specs"
                className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted"
              >
                {labels.specsLabel}
              </label>
              <textarea
                id="auteur-ai-brief-specs"
                rows={3}
                data-native-undo="true"
                value={brief.specs}
                onChange={(event) => onUpdateSpecs(event.target.value)}
                placeholder={labels.specsPlaceholder}
                aria-label={labels.specsAria}
                className={`${UI_TOKENS.input.field} min-h-[76px] resize-y leading-relaxed auteur-pane-scroll`}
              />
            </section>

            {/* Subtext & Additional Instructions */}
            <section className="space-y-1.5">
              <label
                htmlFor="auteur-ai-brief-subtext"
                className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted"
              >
                {labels.subtextLabel}
              </label>
              <textarea
                id="auteur-ai-brief-subtext"
                rows={3}
                data-native-undo="true"
                value={brief.subtext}
                onChange={(event) => onUpdateSubtext(event.target.value)}
                placeholder={labels.subtextPlaceholder}
                aria-label={labels.subtextAria}
                className={`${UI_TOKENS.input.field} min-h-[76px] resize-y leading-relaxed auteur-pane-scroll`}
              />
            </section>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border-subtle bg-surface-subtle flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              {briefHasContent && (
                <button
                  type="button"
                  onClick={() => {
                    setHoverPreview(null);
                    setInspectedEntryId(null);
                    onClearBrief();
                  }}
                  aria-label={labels.clearAria}
                  className="text-xs font-medium text-text-faint hover:text-text-main transition-colors cursor-pointer"
                >
                  {labels.clearButton}
                </button>
              )}
            </div>

            <button type="button" onClick={onClose} className={UI_TOKENS.button.primary}>
              {labels.doneButton}
            </button>
          </div>
        </div>
      </div>

      {/* Floating Hover Preview Portal (never clipped by modal overflow) */}
      {hoverPreview &&
        !inspectedEntry &&
        hoverPreview.entry.attachment &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: `${hoverPreview.top}px`,
              left: `${hoverPreview.left}px`,
            }}
            className="pointer-events-none z-[120] w-[320px] max-w-[min(340px,calc(100vw-32px))] rounded-xl border border-border-main bg-surface p-2.5 shadow-2xl space-y-2 text-text-main"
          >
            {hoverPreview.entry.attachment.previewUrl ? (
              <div className="rounded-lg overflow-hidden border border-border-subtle bg-surface-muted flex items-center justify-center max-h-[260px]">
                <img
                  src={hoverPreview.entry.attachment.previewUrl}
                  alt={hoverPreview.entry.label || hoverPreview.entry.handle}
                  className="max-h-[260px] w-auto max-w-full object-contain"
                />
              </div>
            ) : typeof hoverPreview.entry.attachment.inlineText === 'string' ? (
              <div className="rounded-lg border border-border-subtle bg-surface-subtle p-2.5 max-h-[220px] overflow-hidden">
                <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-text-body">
                  {buildTextExcerpt(hoverPreview.entry.attachment.inlineText, 12, 700).excerpt}
                </pre>
              </div>
            ) : (
              <div className="rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2.5 space-y-1 text-[11px]">
                <div className="font-mono text-[10px] text-text-muted truncate">
                  {hoverPreview.entry.attachment.fileName || hoverPreview.entry.attachment.mimeType}
                </div>
                {hoverPreview.entry.attachment.uri && (
                  <div className="font-mono text-[10px] text-text-faint break-all line-clamp-2">
                    {hoverPreview.entry.attachment.uri}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="min-w-0 flex items-center gap-1.5">
                <span className="rounded bg-btn-primary-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold text-btn-primary-text shrink-0">
                  {hoverPreview.entry.handle || `@${hoverPreview.entry.kind}`}
                </span>
                <span className="font-medium text-text-main truncate">
                  {hoverPreview.entry.label || hoverPreview.entry.attachment.fileName || 'Reference'}
                </span>
              </div>
              <span className="font-mono text-[9px] text-text-faint shrink-0">
                {hoverPreview.entry.kind === 'video' || hoverPreview.entry.kind === 'audio'
                  ? labels.previewPlayHint
                  : labels.previewClickHint}
              </span>
            </div>
          </div>,
          document.body
        )}

      {/* Click-to-Inspect Lightbox Overlay */}
      {inspectedEntry &&
        inspectedEntry.attachment &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${inspectedEntry.handle} ${inspectedEntry.label || 'preview'}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setInspectedEntryId(null);
              }
            }}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-4"
          >
            <div className="bg-surface w-full max-w-3xl max-h-[88dvh] rounded-2xl border border-border-main shadow-2xl overflow-hidden flex flex-col text-text-main">
              {/* Lightbox Header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle bg-surface-subtle shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="rounded bg-btn-primary-bg px-1.5 py-0.5 font-mono text-[11px] font-semibold text-btn-primary-text shrink-0">
                    {inspectedEntry.handle || `@${inspectedEntry.kind}`}
                  </span>
                  <span className="text-sm font-semibold text-text-main truncate">
                    {inspectedEntry.label || inspectedEntry.attachment.fileName || 'Reference'}
                  </span>
                  {inspectedEntry.attachment.sizeBytes ? (
                    <span className="font-mono text-[11px] text-text-faint shrink-0">
                      {formatByteSize(inspectedEntry.attachment.sizeBytes)}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {inspectedEntry.attachment.source === 'youtube' &&
                    inspectedEntry.attachment.uri && (
                      <a
                        href={inspectedEntry.attachment.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${UI_TOKENS.ai.pillButton} text-[11px] py-1 px-2.5`}
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>{labels.previewOpenYoutube}</span>
                      </a>
                    )}
                  <button
                    type="button"
                    onClick={() => setInspectedEntryId(null)}
                    aria-label={labels.previewCloseAria}
                    className={UI_TOKENS.button.iconClose}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Lightbox Content */}
              <div className="flex-1 min-h-0 overflow-auto auteur-pane-scroll p-4 flex flex-col items-center justify-center bg-app/50">
                {inspectedEntry.attachment.source === 'youtube' && inspectedEntry.attachment.uri ? (
                  (() => {
                    const videoId = extractYouTubeVideoId(inspectedEntry.attachment.uri);
                    return videoId ? (
                      <div className="w-full aspect-video rounded-xl overflow-hidden border border-border-main bg-black">
                        <iframe
                          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                          title={inspectedEntry.label || 'YouTube preview'}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="h-full w-full border-0"
                        />
                      </div>
                    ) : null;
                  })()
                ) : inspectedEntry.kind === 'image' && inspectedEntry.attachment.previewUrl ? (
                  <img
                    src={inspectedEntry.attachment.previewUrl}
                    alt={inspectedEntry.label || inspectedEntry.handle}
                    className="max-h-[70dvh] max-w-full rounded-xl border border-border-subtle object-contain bg-surface"
                  />
                ) : inspectedEntry.kind === 'video' && inspectedEntry.attachment.localMediaUrl ? (
                  <video
                    src={inspectedEntry.attachment.localMediaUrl}
                    controls
                    autoPlay
                    className="max-h-[70dvh] max-w-full rounded-xl border border-border-main bg-black"
                  />
                ) : inspectedEntry.kind === 'audio' && inspectedEntry.attachment.localMediaUrl ? (
                  <div className="w-full max-w-md rounded-xl border border-border-main bg-surface p-5 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-text-main">
                      <Music className="h-4 w-4 text-[var(--phase-logic-text)]" />
                      <span className="truncate">
                        {inspectedEntry.attachment.fileName || inspectedEntry.label}
                      </span>
                    </div>
                    <audio
                      src={inspectedEntry.attachment.localMediaUrl}
                      controls
                      autoPlay
                      className="w-full"
                    />
                  </div>
                ) : typeof inspectedEntry.attachment.inlineText === 'string' ? (
                  <div className="w-full rounded-xl border border-border-main bg-surface overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-border-subtle bg-surface-subtle text-[11px] text-text-muted">
                      <span className="font-mono truncate">
                        {inspectedEntry.attachment.fileName || inspectedEntry.attachment.mimeType}
                      </span>
                      <span className="font-mono text-[10px] text-text-faint shrink-0">
                        {labels.previewLinesChars(
                          inspectedEntry.attachment.inlineText.split(/\r?\n/).length,
                          inspectedEntry.attachment.inlineText.length
                        )}
                      </span>
                    </div>
                    <pre className="max-h-[64dvh] overflow-auto auteur-pane-scroll p-4 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-body">
                      {inspectedEntry.attachment.inlineText}
                    </pre>
                  </div>
                ) : (
                  <div className="w-full max-w-lg rounded-xl border border-border-main bg-surface p-4 space-y-2.5 text-xs">
                    <p className="text-text-muted leading-relaxed">{labels.previewNoLocalMedia}</p>
                    <div className="space-y-1 font-mono text-[11px] text-text-body">
                      {inspectedEntry.attachment.fileName && (
                        <div>
                          <span className="text-text-faint">File: </span>
                          {inspectedEntry.attachment.fileName}
                        </div>
                      )}
                      <div>
                        <span className="text-text-faint">MIME: </span>
                        {inspectedEntry.attachment.mimeType}
                      </div>
                      {inspectedEntry.attachment.uri && (
                        <div className="break-all">
                          <span className="text-text-faint">{labels.previewFilesApiUriLabel}: </span>
                          {inspectedEntry.attachment.uri}
                        </div>
                      )}
                      {formatExpirationLabel(inspectedEntry.attachment.expirationTime) && (
                        <div>
                          <span className="text-text-faint">{labels.previewExpiresLabel}: </span>
                          {formatExpirationLabel(inspectedEntry.attachment.expirationTime)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
