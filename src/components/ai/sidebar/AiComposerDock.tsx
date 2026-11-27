import {
  memo,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  AlertCircle,
  ArrowUp,
  CloudUpload,
  FileText,
  Film,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Music,
  PlayCircle,
  Plus,
  ScanSearch,
  Settings2,
  ShieldAlert,
  Square,
  Upload,
  X,
} from 'lucide-react';
import type {AssistantFocus} from '../../../services/auteurKnowledge.ts';
import {
  AUDIT_QUICK_CHECKS,
  type AiTargetScope,
  type AuditQuickCheckId,
  type StagedComposerAttachment,
} from '../../../ui/aiAssistant.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {isOutsideDismissTarget} from '../../../ui/outsideDismiss.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import type {NewReferenceEntryDraft} from '../brief/briefHelpers.ts';
import {YouTubeAttachmentBar} from '../brief/YouTubeAttachmentBar.tsx';

const ASSISTANT_FOCUSES: readonly AssistantFocus[] = ['auto', 'draft', 'refine', 'audit'];

export interface AiComposerDockProps {
  composerRef: RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  placeholder: string;
  isStreaming: boolean;
  isEmpty: boolean;
  focus: AssistantFocus;
  targetOptions: readonly AiTargetScope[];
  activeTargetKey: string;
  isBriefOpen: boolean;
  briefHasContent: boolean;
  briefIsActive: boolean;
  briefSummaryLabel: string | undefined;
  askFirstEnabled: boolean;
  askFirstDisabled?: boolean;
  showEstimatedCost: boolean;
  sessionCostTurnCount: number;
  formattedSessionCost: string;
  hasApiKey: boolean;
  modelShortLabel: string;
  reasoningLabel: string;
  stagedAttachments: readonly StagedComposerAttachment[];
  composerAttachError: string | null;
  isYoutubeBarOpen: boolean;
  hasPendingUploads: boolean;
  hasErroredAttachments: boolean;
  onAddLocalFiles: (files: FileList | File[]) => void | Promise<void>;
  onOpenCloudFilesModal: () => void;
  onToggleYoutubeBar: (open: boolean) => void;
  onAddYoutubeDraft: (draft: NewReferenceEntryDraft) => void;
  onRemoveStagedAttachment: (id: string) => void;
  onToggleStagedVideoMode: (id: string) => void;
  onInspectStagedAttachment: (item: StagedComposerAttachment) => void;
  onDismissAttachError: () => void;
  onInputChange: (value: string) => void;
  onComposerKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onComposerSend: () => void;
  onStopRun: () => void;
  onComposerResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onComposerResizeReset: () => void;
  onFocusChange: (focus: AssistantFocus) => void;
  onTargetKeyChange: (key: string) => void;
  onQuickScan: () => void | Promise<void>;
  onQuickAudit: (checkId: AuditQuickCheckId) => void;
  onOpenBrief: () => void;
  onToggleAskFirst: () => void;
  onSessionCostMouseEnter: (event: ReactMouseEvent<HTMLElement>) => void;
  onSessionCostMouseLeave: () => void;
  onOpenSettings: () => void;
}

export const AiComposerDock = memo(function AiComposerDock({
  composerRef,
  inputValue,
  placeholder,
  isStreaming,
  isEmpty,
  focus,
  targetOptions,
  activeTargetKey,
  isBriefOpen,
  briefHasContent,
  briefIsActive,
  briefSummaryLabel,
  askFirstEnabled,
  askFirstDisabled = false,
  showEstimatedCost,
  sessionCostTurnCount,
  formattedSessionCost,
  hasApiKey,
  modelShortLabel,
  reasoningLabel,
  stagedAttachments,
  composerAttachError,
  isYoutubeBarOpen,
  hasPendingUploads,
  hasErroredAttachments,
  onAddLocalFiles,
  onOpenCloudFilesModal,
  onToggleYoutubeBar,
  onAddYoutubeDraft,
  onRemoveStagedAttachment,
  onToggleStagedVideoMode,
  onInspectStagedAttachment,
  onDismissAttachError,
  onInputChange,
  onComposerKeyDown,
  onComposerSend,
  onStopRun,
  onComposerResizePointerDown,
  onComposerResizeReset,
  onFocusChange,
  onTargetKeyChange,
  onQuickScan,
  onQuickAudit,
  onOpenBrief,
  onToggleAskFirst,
  onSessionCostMouseEnter,
  onSessionCostMouseLeave,
  onOpenSettings,
}: AiComposerDockProps) {
  const attachLabels = UI_LABELS.ai.composerAttach;
  const briefLabels = UI_LABELS.ai.briefTray;

  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const attachMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const localFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isAttachMenuOpen) return;
    const handlePointer = (event: Event) => {
      if (isOutsideDismissTarget(attachMenuContainerRef.current, event.target)) {
        setIsAttachMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsAttachMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointer, {capture: true});
    document.addEventListener('mousedown', handlePointer, {capture: true});
    document.addEventListener('keydown', handleKeyDown, {capture: true});
    return () => {
      document.removeEventListener('pointerdown', handlePointer, {capture: true});
      document.removeEventListener('mousedown', handlePointer, {capture: true});
      document.removeEventListener('keydown', handleKeyDown, {capture: true});
    };
  }, [isAttachMenuOpen]);

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      void onAddLocalFiles(files);
    }
    event.target.value = '';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    if (!dragActive) setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    void onAddLocalFiles(event.dataTransfer.files);
  };

  const handleTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = event.clipboardData?.files;
    if (files && files.length > 0) {
      event.preventDefault();
      void onAddLocalFiles(files);
    }
  };

  const sendDisabled =
    inputValue.trim().length === 0 || hasPendingUploads || hasErroredAttachments;
  const sendTitle = hasPendingUploads
    ? attachLabels.sendBlockedUploadingTitle
    : hasErroredAttachments
      ? attachLabels.sendBlockedErrorTitle
      : `${UI_LABELS.ai.sendButton} (${UI_LABELS.ai.composerHint})`;

  return (
    <div className="relative border-t border-border-main bg-surface px-3 pb-2.5 pt-2 shrink-0 space-y-2">
      {/* Drag-to-resize top handle for the prompt box */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={UI_LABELS.ai.composerResizeAria}
        title={UI_LABELS.ai.composerResizeTitle}
        onPointerDown={onComposerResizePointerDown}
        onDoubleClick={onComposerResizeReset}
        className="group absolute -top-1.5 inset-x-0 h-3 flex items-center justify-center cursor-row-resize z-10 select-none"
      >
        <span
          aria-hidden="true"
          className="h-1 w-9 rounded-full bg-border-main/90 group-hover:bg-text-faint/70 transition-colors"
        />
      </div>

      {/* Inline YouTube URL Bar (triggered from + menu) */}
      <YouTubeAttachmentBar
        isOpen={isYoutubeBarOpen}
        onClose={() => onToggleYoutubeBar(false)}
        onAddReferenceEntry={onAddYoutubeDraft}
      />

      {/* Resizable Prompt Box (with dropzone, staged chips & + menu) */}
      <div
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-xl border transition-colors ${
          dragActive
            ? 'border-[var(--phase-aesthetic-text)] bg-surface ring-1 ring-[var(--phase-aesthetic-text)]'
            : 'border-border-main bg-surface-subtle focus-within:bg-surface focus-within:ring-1 focus-within:ring-border-main'
        }`}
      >
        <input
          ref={localFileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,application/pdf,text/*,.md,.markdown,.json,.csv,.srt,.vtt"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {dragActive && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-surface/90 text-xs font-medium text-text-main">
            {attachLabels.dropOverlayLabel}
          </div>
        )}

        {composerAttachError && (
          <div
            role="alert"
            className="mx-2.5 mt-2 flex items-start justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-700 dark:text-red-300"
          >
            <div className="flex items-start gap-1.5 min-w-0">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{composerAttachError}</span>
            </div>
            <button
              type="button"
              onClick={onDismissAttachError}
              aria-label={briefLabels.dismissNoticeAria}
              className="p-0.5 opacity-80 hover:opacity-100 cursor-pointer shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {stagedAttachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2">
            {stagedAttachments.map((item) => {
              const isUploading = item.status === 'uploading' || item.status === 'processing';
              const isError = item.status === 'error';
              const isReady = item.status === 'ready';
              const att = item.attachment;
              const displayName = item.fileName?.trim() || item.label.trim() || item.kind;
              const isVideoReady = isReady && item.kind === 'video' && Boolean(att);
              const sourceBadge =
                item.source === 'youtube'
                  ? briefLabels.cardYoutubeBadge
                  : item.source === 'files_api'
                    ? briefLabels.cardFilesApiBadge
                    : item.kind === 'document'
                      ? briefLabels.cardInlineTextBadge
                      : null;

              const renderThumbOrIcon = () => {
                if (isUploading) {
                  return (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--phase-aesthetic-text)]" />
                  );
                }
                if (isError) {
                  return (
                    <AlertCircle className="h-3 w-3 shrink-0 text-red-600 dark:text-red-400" />
                  );
                }
                if (att?.previewUrl) {
                  return (
                    <img
                      src={att.previewUrl}
                      alt={displayName}
                      className="h-5 w-5 rounded object-cover shrink-0 border border-border-subtle bg-surface-muted"
                    />
                  );
                }
                switch (item.kind) {
                  case 'video':
                    return (
                      <Film className="h-3 w-3 shrink-0 text-[var(--phase-continuity-text)]" />
                    );
                  case 'audio':
                    return <Music className="h-3 w-3 shrink-0 text-[var(--phase-logic-text)]" />;
                  case 'image':
                    return <ImageIcon className="h-3 w-3 shrink-0 text-text-muted" />;
                  case 'document':
                  default:
                    return (
                      <FileText className="h-3 w-3 shrink-0 text-[var(--phase-aesthetic-text)]" />
                    );
                }
              };

              return (
                <div
                  key={item.id}
                  title={isError ? item.error : undefined}
                  className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] max-w-full ${
                    isError
                      ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                      : 'border-border-main bg-surface text-text-main'
                  }`}
                >
                  {isReady && att ? (
                    <button
                      type="button"
                      onClick={() => onInspectStagedAttachment(item)}
                      title={attachLabels.inspectChipTitle}
                      className="inline-flex items-center gap-1.5 min-w-0 cursor-pointer hover:opacity-85"
                    >
                      {renderThumbOrIcon()}
                      <span className="max-w-[120px] truncate font-medium">{displayName}</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      {renderThumbOrIcon()}
                      <span className="max-w-[120px] truncate font-medium">{displayName}</span>
                    </span>
                  )}

                  {isUploading && (
                    <span className="font-mono text-[9px] text-text-muted shrink-0">
                      {item.status === 'processing'
                        ? attachLabels.processingStatus
                        : attachLabels.uploadingStatus}
                    </span>
                  )}

                  {!isUploading && !isError && sourceBadge && (
                    <span
                      className={`rounded border px-1 py-0 font-mono text-[8.5px] font-semibold uppercase shrink-0 ${
                        item.source === 'youtube'
                          ? 'auteur-phase-intent'
                          : item.source === 'files_api'
                            ? 'auteur-phase-aesthetic'
                            : 'border-border-subtle bg-surface-subtle text-text-muted'
                      }`}
                    >
                      {sourceBadge}
                    </span>
                  )}

                  {isVideoReady && (
                    <button
                      type="button"
                      onClick={() => onToggleStagedVideoMode(item.id)}
                      title={briefLabels.cardVideoModeTitle}
                      className="rounded border border-border-main bg-surface-subtle px-1 py-0 font-mono text-[8.5px] font-semibold uppercase text-text-main hover:bg-surface-hover cursor-pointer shrink-0"
                    >
                      {att?.processingMode === 'agentic'
                        ? briefLabels.cardVideoModeAgentic
                        : briefLabels.cardVideoModeStatic}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onRemoveStagedAttachment(item.id)}
                    aria-label={attachLabels.removeChipAria(displayName)}
                    className="rounded p-0.5 text-text-faint hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-end gap-1.5 px-2 py-2">
          <div ref={attachMenuContainerRef} className="relative shrink-0">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isAttachMenuOpen}
              aria-label={attachLabels.buttonAria}
              title={attachLabels.buttonTitle}
              disabled={isStreaming}
              onClick={() => setIsAttachMenuOpen((prev) => !prev)}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isAttachMenuOpen
                  ? 'border-text-main bg-surface text-text-main'
                  : 'border-border-main bg-surface text-text-muted hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            {isAttachMenuOpen && (
              <div
                role="menu"
                aria-label={attachLabels.menuAria}
                className="absolute bottom-full left-0 mb-1.5 w-64 rounded-xl border border-border-main bg-surface shadow-xl p-1 z-30 space-y-0.5"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsAttachMenuOpen(false);
                    localFileInputRef.current?.click();
                  }}
                  className="w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5 mt-0.5 text-text-muted shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-text-main">
                      {attachLabels.menuUploadFiles}
                    </div>
                    <div className="text-[10.5px] text-text-faint">
                      {attachLabels.menuUploadFilesHint}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsAttachMenuOpen(false);
                    onOpenCloudFilesModal();
                  }}
                  className="w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  <CloudUpload className="h-3.5 w-3.5 mt-0.5 text-[var(--phase-aesthetic-text)] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-text-main">
                      {attachLabels.menuCloudFiles}
                    </div>
                    <div className="text-[10.5px] text-text-faint">
                      {attachLabels.menuCloudFilesHint}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsAttachMenuOpen(false);
                    onToggleYoutubeBar(true);
                  }}
                  className="w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  <PlayCircle className="h-3.5 w-3.5 mt-0.5 text-[var(--phase-intent-text)] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-text-main">
                      {attachLabels.menuYoutubeUrl}
                    </div>
                    <div className="text-[10.5px] text-text-faint">
                      {attachLabels.menuYoutubeUrlHint}
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <textarea
            ref={composerRef}
            rows={2}
            data-native-undo="true"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onComposerKeyDown}
            onPaste={handleTextareaPaste}
            placeholder={placeholder}
            aria-label={UI_LABELS.ai.composerAria}
            className="min-h-[56px] flex-1 resize-none overflow-y-auto bg-transparent text-xs leading-relaxed text-text-main placeholder-text-placeholder outline-none auteur-pane-scroll"
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={onStopRun}
              aria-label={UI_LABELS.ai.stopAria}
              title={UI_LABELS.ai.stopButton}
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-red-500 px-2.5 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors cursor-pointer shrink-0"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              <span>{UI_LABELS.ai.stopButton}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={sendDisabled}
              onClick={onComposerSend}
              aria-label={UI_LABELS.ai.sendAria}
              title={sendTitle}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-btn-primary-bg text-btn-primary-text hover:bg-btn-primary-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4-Tab Focus Bar (Auto | Draft | Refine | Audit) */}
      <div
        role="group"
        aria-label={UI_LABELS.ai.focusAria}
        className={`${UI_TOKENS.button.segmentedGroup} grid grid-cols-4 w-full`}
      >
        {ASSISTANT_FOCUSES.map((item) => {
          const active = focus === item;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={active}
              onClick={() => onFocusChange(item)}
              className={`${
                active ? UI_TOKENS.button.segmentedItemActive : UI_TOKENS.button.segmentedItem
              } justify-center`}
            >
              <span>{UI_LABELS.ai.focusLabels[item]}</span>
            </button>
          );
        })}
      </div>

      {/* Contextual Scope / Quick Audit Controls */}
      {!isEmpty && (focus === 'auto' || focus === 'refine') && (
        <div className="flex items-center gap-2">
          <label
            htmlFor="auteur-ai-target-scope"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0"
          >
            {UI_LABELS.ai.refineTargetLabel}
          </label>
          <select
            id="auteur-ai-target-scope"
            aria-label={UI_LABELS.ai.refineTargetAria}
            value={activeTargetKey}
            onChange={(e) => onTargetKeyChange(e.target.value)}
            className="min-w-0 flex-1 truncate rounded-lg border border-border-main bg-surface-subtle px-2 py-1 font-mono text-[11px] text-text-body focus:outline-none focus:ring-1 focus:ring-border-main cursor-pointer"
          >
            {targetOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          {focus === 'auto' && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={isStreaming}
                onClick={onQuickScan}
                title={UI_LABELS.ai.quickScanTitle}
                className={`${UI_TOKENS.ai.pillButton} text-[10px] py-1 px-2`}
              >
                <ScanSearch className="h-3 w-3 text-text-faint" />
                <span>{UI_LABELS.ai.quickScanButton}</span>
              </button>
              <button
                type="button"
                disabled={isStreaming}
                onClick={() => onQuickAudit('all')}
                title={UI_LABELS.ai.quickAuditAllTitle}
                className={`${UI_TOKENS.ai.pillButton} text-[10px] py-1 px-2`}
              >
                <ShieldAlert className="h-3 w-3 text-text-faint" />
                <span>{UI_LABELS.ai.quickAuditAllButton}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {focus === 'audit' && (
        <div
          role="group"
          aria-label={UI_LABELS.ai.auditQuickGroupAria}
          className="flex flex-wrap gap-1"
        >
          {!isEmpty && (
            <button
              type="button"
              disabled={isStreaming}
              onClick={onQuickScan}
              title={UI_LABELS.ai.quickScanTitle}
              className={`${UI_TOKENS.ai.pillButton} text-[10px] py-0.5 px-2 font-semibold`}
            >
              <ScanSearch className="h-3 w-3 text-text-faint" />
              <span>{UI_LABELS.ai.quickScanButton}</span>
            </button>
          )}
          {AUDIT_QUICK_CHECKS.map((check) => {
            const label =
              check.id === 'all'
                ? UI_LABELS.ai.auditQuickAll
                : UI_LABELS.ai.auditQuickLensShort[check.id];
            return (
              <button
                key={check.id}
                type="button"
                disabled={isStreaming}
                onClick={() => onQuickAudit(check.id)}
                className={`${UI_TOKENS.ai.pillButton} text-[10px] py-0.5 px-2`}
              >
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom Utility Row: Brief + Ask First Toggle | Session Cost + Model Settings Chip */}
      <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-border-subtle">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isBriefOpen}
            aria-label={UI_LABELS.ai.briefToggleAria(
              isBriefOpen,
              briefHasContent,
              briefIsActive
            )}
            title={UI_LABELS.ai.briefToggleTitle}
            onClick={onOpenBrief}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-medium text-[11px] transition-colors cursor-pointer shrink-0 ${
              isBriefOpen || briefIsActive
                ? 'auteur-phase-aesthetic'
                : 'border-border-main bg-surface text-text-body hover:bg-surface-hover hover:text-text-main'
            }`}
          >
            <FileText className="h-3 w-3" />
            <span>
              {briefSummaryLabel ??
                (briefHasContent ? UI_LABELS.ai.briefPausedLabel : UI_LABELS.ai.briefToggle)}
            </span>
          </button>

          {focus !== 'audit' && (
            <button
              type="button"
              disabled={askFirstDisabled}
              aria-pressed={!askFirstDisabled && askFirstEnabled}
              aria-label={UI_LABELS.ai.askFirstAria(
                !askFirstDisabled && askFirstEnabled,
                askFirstDisabled
              )}
              title={
                askFirstDisabled ? UI_LABELS.ai.askFirstDisabledTitle : UI_LABELS.ai.askFirstTitle
              }
              onClick={onToggleAskFirst}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-medium text-[11px] transition-colors shrink-0 ${
                askFirstDisabled
                  ? 'border-border-subtle bg-surface-subtle text-text-faint opacity-50 cursor-not-allowed'
                  : askFirstEnabled
                    ? 'auteur-phase-logic cursor-pointer'
                    : 'border-border-main bg-surface text-text-muted hover:bg-surface-hover hover:text-text-main cursor-pointer'
              }`}
            >
              <HelpCircle className="h-3 w-3" />
              <span>{UI_LABELS.ai.askFirstToggle}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          {showEstimatedCost && sessionCostTurnCount > 0 && (
            <span
              aria-label={UI_LABELS.ai.cost.sessionBadgeAria(
                formattedSessionCost,
                sessionCostTurnCount
              )}
              onMouseEnter={onSessionCostMouseEnter}
              onMouseLeave={onSessionCostMouseLeave}
              className="inline-flex items-center rounded-lg border border-border-subtle bg-surface-subtle px-2 py-1 font-mono text-[10px] font-medium text-text-muted tabular-nums hover:border-border-main hover:text-text-main transition-colors cursor-default select-none shrink-0"
            >
              {formattedSessionCost}
            </span>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            title={UI_LABELS.ai.settingsChipTitle}
            aria-label={UI_LABELS.ai.settingsChipAria(modelShortLabel, reasoningLabel)}
            className={`${UI_TOKENS.ai.statusChip} min-w-0`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                hasApiKey ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="truncate">
              {modelShortLabel} · {reasoningLabel}
            </span>
            <Settings2 className="h-3 w-3 shrink-0 text-text-faint" />
          </button>
        </div>
      </div>
    </div>
  );
});
