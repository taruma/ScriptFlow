import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  AlertCircle,
  CloudUpload,
  FileText,
  Loader2,
  PlayCircle,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import type {DraftBriefState, ReferenceEntry} from '../ui/aiAssistant.ts';
import {
  buildAttachmentFingerprint,
  classifyLocalDropFile,
  compressImageFile,
  filenameToDefaultLabel,
  readLocalTextFile,
} from '../ui/briefMedia.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {
  type HoverPreviewState,
  type NewReferenceEntryDraft,
} from './ai/brief/briefHelpers.ts';
import {BriefMediaLightbox} from './ai/brief/BriefMediaLightbox.tsx';
import {
  GeminiFilesPanel,
  type GeminiFilesPanelHandle,
} from './ai/brief/GeminiFilesPanel.tsx';
import {ReferenceEntryCard} from './ai/brief/ReferenceEntryCard.tsx';
import {YouTubeAttachmentBar} from './ai/brief/YouTubeAttachmentBar.tsx';

export type {NewReferenceEntryDraft};

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

  // Hover floating preview & click-to-inspect lightbox
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const [inspectedEntryId, setInspectedEntryId] = useState<string | null>(null);

  // Inline attachment panels
  const [isYoutubeOpen, setIsYoutubeOpen] = useState(false);
  const [isFilesApiOpen, setIsFilesApiOpen] = useState(false);
  const [isFilesApiUploading, setIsFilesApiUploading] = useState(false);

  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const geminiFilesPanelRef = useRef<GeminiFilesPanelHandle | null>(null);

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

  const handlePreviewMouseEnter = useCallback(
    (entry: ReferenceEntry, event: ReactMouseEvent<HTMLDivElement>) => {
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
    },
    []
  );

  const handlePreviewMouseLeave = useCallback(() => {
    setHoverPreview(null);
  }, []);

  const handleInspectEntry = useCallback((entryId: string) => {
    setHoverPreview(null);
    setInspectedEntryId(entryId);
  }, []);

  const handleCloseInspect = useCallback(() => {
    setInspectedEntryId(null);
  }, []);

  const handleRemoveReference = useCallback(
    (refId: string) => {
      setHoverPreview(null);
      setInspectedEntryId((prev) => (prev === refId ? null : prev));
      onRemoveReference(refId);
    },
    [onRemoveReference]
  );

  const handleCloseYoutube = useCallback(() => {
    setIsYoutubeOpen(false);
  }, []);

  const handleCloseFilesApi = useCallback(() => {
    setIsFilesApiOpen(false);
  }, []);

  const handleOpenFilesApi = useCallback(() => {
    setIsFilesApiOpen(true);
  }, []);

  const handleFilesApiUploadStarted = useCallback(() => {
    setDropError(null);
    setRedirectFile(null);
    setIsFilesApiOpen(true);
  }, []);

  const handleCloseModalAndOpenSettings = useCallback(() => {
    onClose();
    onOpenSettings();
  }, [onClose, onOpenSettings]);

  const attachedUris = useMemo(
    () =>
      new Set(
        brief.references
          .map((entry) => entry.attachment?.uri)
          .filter((uri): uri is string => Boolean(uri))
      ),
    [brief.references]
  );

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
                      disabled={isFilesApiUploading}
                      onClick={() => {
                        if (redirectFile) {
                          void geminiFilesPanelRef.current?.uploadFiles(redirectFile);
                        }
                      }}
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
              <YouTubeAttachmentBar
                isOpen={isYoutubeOpen}
                onClose={handleCloseYoutube}
                onAddReferenceEntry={onAddReferenceEntry}
              />

              {/* Inline Gemini Files API Panel */}
              <GeminiFilesPanel
                isOpen={isFilesApiOpen}
                apiKey={apiKey}
                hasApiKey={hasApiKey}
                attachedUris={attachedUris}
                panelRef={geminiFilesPanelRef}
                onClosePanel={handleCloseFilesApi}
                onRequestOpenPanel={handleOpenFilesApi}
                onUploadStarted={handleFilesApiUploadStarted}
                onUploadBusyChange={setIsFilesApiUploading}
                onCloseModalAndOpenSettings={handleCloseModalAndOpenSettings}
                onAddReferenceEntry={onAddReferenceEntry}
              />

              {/* Uniform-Height, Aspect-Ratio-Aware Reference Card Strip */}
              {brief.references.length > 0 && (
                <div className="flex flex-wrap items-stretch gap-2.5 pt-0.5">
                  {brief.references.map((entry) => (
                    <ReferenceEntryCard
                      key={entry.id}
                      entry={entry}
                      onUpdateReference={onUpdateReference}
                      onRemoveReference={handleRemoveReference}
                      onPreviewMouseEnter={handlePreviewMouseEnter}
                      onPreviewMouseLeave={handlePreviewMouseLeave}
                      onInspectEntry={handleInspectEntry}
                    />
                  ))}
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

      <BriefMediaLightbox
        hoverPreview={hoverPreview}
        inspectedEntry={inspectedEntry}
        onCloseInspect={handleCloseInspect}
      />
    </>
  );
}
