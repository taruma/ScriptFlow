import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from 'react';
import {
  AlertCircle,
  CloudUpload,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  deleteGeminiFile,
  listGeminiFiles,
  uploadFileToGeminiFilesApi,
  type GeminiUploadedFile,
} from '../../../services/geminiFiles.ts';
import {
  buildAttachmentFingerprint,
  filenameToDefaultLabel,
  formatByteSize,
  inferReferenceKindFromMime,
} from '../../../ui/briefMedia.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import {
  formatExpirationLabel,
  readImageNaturalDimensions,
  type NewReferenceEntryDraft,
} from './briefHelpers.ts';

export {formatExpirationLabel};

export interface GeminiFilesPanelHandle {
  uploadFiles: (fileInput: File | FileList | readonly File[]) => Promise<void>;
}

export interface GeminiFilesPanelProps {
  isOpen: boolean;
  apiKey: string;
  hasApiKey: boolean;
  attachedUris: ReadonlySet<string>;
  panelRef?: RefObject<GeminiFilesPanelHandle | null>;
  onClosePanel: () => void;
  onRequestOpenPanel: () => void;
  onUploadStarted: () => void;
  onUploadBusyChange: (isBusy: boolean) => void;
  onCloseModalAndOpenSettings: () => void;
  onAddReferenceEntry: (draft: NewReferenceEntryDraft) => void;
}

export function GeminiFilesPanel({
  isOpen,
  apiKey,
  hasApiKey,
  attachedUris,
  panelRef,
  onClosePanel,
  onRequestOpenPanel,
  onUploadStarted,
  onUploadBusyChange,
  onCloseModalAndOpenSettings,
  onAddReferenceEntry,
}: GeminiFilesPanelProps) {
  const labels = UI_LABELS.ai.briefTray;

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

  const filesApiInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    onUploadBusyChange(uploadStatus !== 'idle');
  }, [uploadStatus, onUploadBusyChange]);

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
    if (isOpen && hasApiKey) {
      void refreshCloudFiles();
    }
  }, [isOpen, hasApiKey, refreshCloudFiles]);

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
      const files = fileInput instanceof File ? [fileInput] : Array.from(fileInput);
      if (files.length === 0) return;

      if (!hasApiKey) {
        setFilesApiError(labels.filesApiMissingKey);
        onRequestOpenPanel();
        return;
      }

      uploadAbortRef.current?.abort();
      const controller = new AbortController();
      uploadAbortRef.current = controller;

      setFilesApiError(null);
      onUploadStarted();
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
        if (uploadAbortRef.current === controller) {
          setUploadStatus('idle');
          setUploadBatchProgress(null);
        }
      }
    },
    [apiKey, hasApiKey, attachCloudFile, labels.filesApiMissingKey, onRequestOpenPanel, onUploadStarted]
  );

  useImperativeHandle(
    panelRef,
    () => ({
      uploadFiles: handleFilesApiUploadFiles,
    }),
    [handleFilesApiUploadFiles]
  );

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

  if (!isOpen) return null;

  return (
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
          onClick={onClosePanel}
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
            onClick={onCloseModalAndOpenSettings}
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
              if (uploadStatus === 'idle' && (event.key === 'Enter' || event.key === ' ')) {
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
                <RefreshCw className={`h-3 w-3 ${isLoadingCloudFiles ? 'animate-spin' : ''}`} />
                <span>{labels.filesApiRefreshButton}</span>
              </button>
            </div>

            {isLoadingCloudFiles ? (
              <p className="text-[11px] italic text-text-faint py-1">
                {labels.filesApiLoadingList}
              </p>
            ) : cloudFiles.length === 0 ? (
              <p className="text-[11px] italic text-text-faint py-1">{labels.filesApiEmptyList}</p>
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
  );
}
