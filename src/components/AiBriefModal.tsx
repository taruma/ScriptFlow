import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  AlertCircle,
  CloudUpload,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Music,
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
  classifyLocalDropFile,
  compressImageFile,
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

  // Inline YouTube URL attachment bar
  const [isYoutubeOpen, setIsYoutubeOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeLabel, setYoutubeLabel] = useState('');
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  // Inline Gemini Files API upload & cloud picker panel
  const [isFilesApiOpen, setIsFilesApiOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const [filesApiError, setFilesApiError] = useState<string | null>(null);
  const [cloudFiles, setCloudFiles] = useState<GeminiUploadedFile[]>([]);
  const [isLoadingCloudFiles, setIsLoadingCloudFiles] = useState(false);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);

  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const filesApiInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
    (file: GeminiUploadedFile, customLabel?: string) => {
      const kind = inferReferenceKindFromMime(file.mimeType, file.displayName);
      onAddReferenceEntry({
        kind,
        label: customLabel?.trim() || filenameToDefaultLabel(file.displayName),
        attachment: {
          source: 'files_api',
          mimeType: file.mimeType,
          fileName: file.displayName,
          sizeBytes: file.sizeBytes,
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

  const handleFilesApiUpload = useCallback(
    async (file: File) => {
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

      try {
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
        attachCloudFile(uploaded, filenameToDefaultLabel(file.name));
        setCloudFiles((prev) => [uploaded, ...prev.filter((item) => item.uri !== uploaded.uri)]);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFilesApiError(err instanceof Error ? err.message : 'Failed to upload file.');
      } finally {
        setUploadStatus('idle');
      }
    },
    [apiKey, hasApiKey, attachCloudFile, labels.filesApiMissingKey]
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
    const file = event.target.files?.[0];
    if (file) {
      void handleFilesApiUpload(file);
    }
    event.target.value = '';
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

  const attachedUris = new Set(
    brief.references
      .map((entry) => entry.attachment?.uri)
      .filter((uri): uri is string => Boolean(uri))
  );

  const youtubePreviewThumb = youtubeUrl.trim() ? getYouTubeThumbnailUrl(youtubeUrl) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
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

          {/* Cast & References (Visual Grid + Files API + YouTube) */}
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

            <p className="text-[11px] text-text-muted leading-relaxed">{labels.dropzoneHint}</p>

            {/* Non-image/non-text drop redirect notice */}
            {redirectFile && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-main bg-surface-subtle px-3 py-2 text-xs text-text-body"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CloudUpload className="h-3.5 w-3.5 shrink-0 text-[var(--phase-aesthetic-text)]" />
                  <span className="truncate">{labels.filesApiRedirectNotice(redirectFile.name)}</span>
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
                      className="h-14 w-20 rounded-lg border border-border-main object-cover shrink-0 bg-surface-muted"
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <input
                          ref={filesApiInputRef}
                          type="file"
                          accept="image/*,video/*,audio/*,application/pdf,text/*,.md,.json,.csv,.srt,.vtt"
                          onChange={handleFilesApiInputChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={uploadStatus !== 'idle'}
                          onClick={() => filesApiInputRef.current?.click()}
                          className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 !px-3 !py-1.5 !text-xs disabled:opacity-60`}
                        >
                          {uploadStatus !== 'idle' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {uploadStatus === 'uploading'
                              ? labels.filesApiUploading
                              : uploadStatus === 'processing'
                                ? labels.filesApiProcessing
                                : labels.filesApiUploadButton}
                          </span>
                        </button>
                      </div>
                      <span className="text-[11px] text-text-faint">{labels.filesApiUploadHint}</span>
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
                                    {file.sizeBytes > 0 ? ` · ${formatByteSize(file.sizeBytes)}` : ''}
                                    {file.state && file.state !== 'ACTIVE' ? ` · ${file.state}` : ''}
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

            {/* PromptLab-style Reference Card Grid (Dropzone + Attached Cards) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {/* Drag-and-Drop Tile (Images + Text only) */}
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
                className={`min-h-[168px] rounded-xl border-2 border-dashed p-3 flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer transition-colors ${
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
                {isProcessingLocal ? (
                  <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                ) : (
                  <Upload className="h-5 w-5 text-text-faint" />
                )}
                <span className="text-[11px] font-semibold text-text-main">
                  {labels.dropzoneTitle}
                </span>
                <span className="text-[10px] text-text-faint leading-snug">
                  {labels.dropzoneSubtitle}
                </span>
              </div>

              {/* Reference Cards */}
              {brief.references.map((entry) => {
                const att = entry.attachment;
                const isYoutube = att?.source === 'youtube';
                const isFilesApi = att?.source === 'files_api';
                const isInlineText = att?.source === 'inline' && typeof att.inlineText === 'string';
                const previewUrl = att?.previewUrl;

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

                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-border-main bg-surface-subtle/40 p-2 flex flex-col gap-1.5"
                  >
                    {/* Preview Box */}
                    <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden border border-border-subtle bg-surface-muted flex items-center justify-center">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={entry.label || entry.handle}
                          className="h-full w-full object-cover"
                        />
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

                      {/* Top-left Handle Badge (Editable) */}
                      <input
                        type="text"
                        data-native-undo="true"
                        value={entry.handle}
                        onChange={(event) =>
                          onUpdateReference(entry.id, {handle: event.target.value})
                        }
                        placeholder={labels.handlePlaceholder}
                        aria-label={labels.handleAria}
                        className="absolute top-1 left-1 max-w-[78px] rounded bg-btn-primary-bg/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-btn-primary-text placeholder-btn-primary-text/60 outline-none focus:ring-1 focus:ring-surface"
                      />

                      {/* Top-right Delete Button */}
                      <button
                        type="button"
                        onClick={() => onRemoveReference(entry.id)}
                        aria-label={labels.removeRefAria}
                        className="absolute top-1 right-1 rounded bg-surface/90 border border-border-main p-1 text-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>

                      {/* Bottom-left Source Badge */}
                      {(isFilesApi || isYoutube || isInlineText) && (
                        <span
                          className={`absolute bottom-1 left-1 rounded border px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wider ${
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
                          onClick={() => handleToggleVideoProcessingMode(entry)}
                          title={labels.cardVideoModeTitle}
                          className="absolute bottom-1 right-1 rounded border border-border-main bg-surface/90 px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase text-text-main hover:bg-surface cursor-pointer"
                        >
                          {att.processingMode === 'agentic'
                            ? labels.cardVideoModeAgentic
                            : labels.cardVideoModeStatic}
                        </button>
                      )}
                    </div>

                    {/* Below Preview: Assigned Label Input (PromptLab style) */}
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
                onClick={onClearBrief}
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
  );
}
