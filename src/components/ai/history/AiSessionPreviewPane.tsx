import {useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  History,
  Pencil,
  Pin,
  PinOff,
  Play,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatSceneBriefContext,
  hasDraftBriefContent,
  type AiChatMessage,
} from '../../../ui/aiAssistant.ts';
import {estimateTraceCost, formatEstimatedUsd} from '../../../ui/aiPricing.ts';
import {getGeminiModelOption} from '../../../ui/aiSettings.ts';
import {
  buildAiSessionJsonExport,
  buildAiSessionMarkdownExport,
  describeStagedSuggestion,
  type AiSessionRecord,
  type ResolvedAiSessionSummary,
} from '../../../ui/aiSessions.ts';
import {copyTextToClipboard} from '../../../ui/clipboard.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {isOutsideDismissTarget} from '../../../ui/outsideDismiss.ts';
import {triggerTextFileDownload} from '../../../ui/scriptFileIO.ts';
import {formatRelativeUpdatedTime} from '../../../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import type {AiInspectableTrace} from '../../AiTraceModal.tsx';
import {MarkdownContent} from '../../MarkdownContent.tsx';
import {ReasoningAccordion} from '../sidebar/ReasoningAccordion.tsx';

export interface AiSessionPreviewPaneProps {
  summary: ResolvedAiSessionSummary | null;
  showThinkingSummary: boolean;
  showEstimatedCost: boolean;
  onLoadInSidebar: (summary: ResolvedAiSessionSummary) => void;
  onSwitchScriptAndLoad: (summary: ResolvedAiSessionSummary) => void;
  onRenameSession: (id: string, nextTitle: string) => Promise<void> | void;
  onTogglePinSession: (id: string, nextPinned: boolean) => Promise<void> | void;
  onRequestDeleteSession: (summary: ResolvedAiSessionSummary) => void;
  onInspectTrace: (trace: AiInspectableTrace) => void;
}

export function AiSessionPreviewPane({
  summary,
  showThinkingSummary,
  showEstimatedCost,
  onLoadInSidebar,
  onSwitchScriptAndLoad,
  onRenameSession,
  onTogglePinSession,
  onRequestDeleteSession,
  onInspectTrace,
}: AiSessionPreviewPaneProps) {
  const labels = UI_LABELS.ai.history;

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [isBriefExpanded, setIsBriefExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);

  const session = summary?.session ?? null;

  useEffect(() => {
    setIsRenaming(false);
    setRenameDraft(session?.title ?? '');
    setIsBriefExpanded(false);
    setCopiedKey(null);
    setIsDownloadOpen(false);
  }, [session?.id]);

  useEffect(() => {
    if (!isDownloadOpen) return;
    const handlePointer = (event: Event) => {
      if (isOutsideDismissTarget(downloadMenuRef.current, event.target)) {
        setIsDownloadOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsDownloadOpen(false);
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
  }, [isDownloadOpen]);

  useEffect(() => {
    if (!copiedKey) return;
    const timer = window.setTimeout(() => setCopiedKey(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  if (!summary || !session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted space-y-2 bg-app/30">
        <History className="h-8 w-8 text-text-faint" />
        <p className="text-xs max-w-xs leading-relaxed">{labels.selectPrompt}</p>
      </div>
    );
  }

  const modelOption = getGeminiModelOption(session.model);
  const focusLabel = UI_LABELS.ai.focusLabels[session.focus] ?? session.focus;
  const timeLabel = formatRelativeUpdatedTime(session.updatedAt);
  const hasBrief = hasDraftBriefContent(session.brief);
  const briefText = hasBrief ? formatSceneBriefContext(session.brief) : '';
  const isDeleted = summary.scriptStatus === 'deleted';
  const isOtherExisting = summary.scriptStatus === 'other_exists';
  const isCurrent = summary.scriptStatus === 'current';

  const scriptStatusText = isCurrent
    ? labels.thisScriptBadge
    : isDeleted
      ? `${summary.resolvedScriptTitle} · ${labels.scriptDeletedBadge}`
      : summary.resolvedScriptTitle;

  const handleCopy = async (key: string, text: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKey(key);
    }
  };

  const handleCommitRename = async () => {
    const clean = renameDraft.trim();
    setIsRenaming(false);
    if (!clean || clean === session.title) return;
    await onRenameSession(session.id, clean);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-app/25">
      {/* Preview Header (Title + Metadata + Collapsible Brief) */}
      <div className="px-4 py-3 border-b border-border-subtle bg-surface space-y-2 shrink-0">
        {isRenaming ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              data-native-undo="true"
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCommitRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsRenaming(false);
                  setRenameDraft(session.title);
                }
              }}
              placeholder={labels.renamePlaceholder}
              aria-label={labels.renameAria}
              className={`${UI_TOKENS.input.field} py-1 text-xs font-semibold`}
            />
            <button
              type="button"
              onClick={() => void handleCommitRename()}
              aria-label={labels.saveRenameAria}
              className={UI_TOKENS.button.iconGhost}
            >
              <Check className="h-3.5 w-3.5 text-[var(--phase-aesthetic-text)]" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRenaming(false);
                setRenameDraft(session.title);
              }}
              aria-label={labels.cancelRenameAria}
              className={UI_TOKENS.button.iconGhost}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="font-serif text-sm font-bold text-text-main truncate">
              {session.title}
            </h3>
            <button
              type="button"
              onClick={() => {
                setRenameDraft(session.title);
                setIsRenaming(true);
              }}
              title={labels.renameButton}
              aria-label={labels.renameButton}
              className={UI_TOKENS.button.iconGhost}
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Single-line Metadata Strip */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
          <span
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium ${
              isCurrent
                ? 'auteur-phase-continuity'
                : isDeleted
                  ? 'border-border-main bg-surface-subtle text-text-faint italic'
                  : 'border-border-main bg-surface-subtle text-text-body'
            }`}
          >
            <BookOpen className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate max-w-[220px]">{scriptStatusText}</span>
          </span>
          <span className="text-text-faint">·</span>
          <span className="font-mono">{modelOption.shortLabel}</span>
          <span className="text-text-faint">·</span>
          <span>{focusLabel}</span>
          <span className="text-text-faint">·</span>
          <span className="tabular-nums">{labels.turnsLabel(session.turnCount)}</span>
          {session.estimatedCostUsd > 0 && (
            <>
              <span className="text-text-faint">·</span>
              <span className="font-mono tabular-nums">
                {formatEstimatedUsd(session.estimatedCostUsd)}
              </span>
            </>
          )}
          <span className="text-text-faint">·</span>
          <span>{timeLabel}</span>
        </div>

        {/* Collapsible Saved Text-Only Brief */}
        {hasBrief && (
          <div className="rounded-xl border border-border-subtle bg-surface-subtle/60 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5">
              <button
                type="button"
                onClick={() => setIsBriefExpanded((prev) => !prev)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-text-body hover:text-text-main cursor-pointer"
              >
                {isBriefExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
                )}
                <FileText className="h-3 w-3 text-text-faint" />
                <span>{labels.savedBriefHeading}</span>
              </button>

              {briefText && (
                <button
                  type="button"
                  onClick={() => void handleCopy('brief', briefText)}
                  className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:text-text-main cursor-pointer"
                >
                  {copiedKey === 'brief' ? (
                    <Check className="h-2.5 w-2.5 text-[var(--phase-aesthetic-text)]" />
                  ) : (
                    <Copy className="h-2.5 w-2.5" />
                  )}
                  <span>
                    {copiedKey === 'brief' ? labels.copiedBriefButton : labels.copyBriefButton}
                  </span>
                </button>
              )}
            </div>

            {isBriefExpanded && (
              <div className="px-3 pb-2.5 pt-1 border-t border-border-subtle space-y-1.5 text-[11px] text-text-body">
                {session.hasOmittedMedia && (
                  <p className="text-[10px] italic text-text-faint">{labels.omittedMediaHint}</p>
                )}
                <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed text-[11px] text-text-body">
                  {briefText}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Read-Only Transcript */}
      <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll px-4 py-3 space-y-3">
        {session.messages.length === 0 ? (
          <p className="text-xs text-text-muted italic">{labels.noTurnsYet}</p>
        ) : (
          session.messages.map((msg) => (
            <HistoryMessageRow
              key={msg.id}
              msg={msg}
              copiedKey={copiedKey}
              showThinkingSummary={showThinkingSummary}
              showEstimatedCost={showEstimatedCost}
              onCopyPrompt={(text) => void handleCopy(`prompt:${msg.id}`, text)}
              onCopyReply={(text) => void handleCopy(`reply:${msg.id}`, text)}
              onInspectTrace={onInspectTrace}
            />
          ))
        )}
      </div>

      {/* Balanced Bottom Action Bar */}
      <div className="px-4 py-2.5 border-t border-border-subtle bg-surface flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void onTogglePinSession(session.id, !session.pinned)}
            title={session.pinned ? labels.unpinButton : labels.pinButton}
            aria-label={session.pinned ? labels.unpinAria : labels.pinAria}
            className={UI_TOKENS.button.actionPill}
          >
            {session.pinned ? (
              <PinOff className="h-3.5 w-3.5 text-[var(--phase-continuity-text)]" />
            ) : (
              <Pin className="h-3.5 w-3.5 text-text-muted" />
            )}
            <span>{session.pinned ? labels.unpinButton : labels.pinButton}</span>
          </button>

          {/* Download | ▾ Split Button (opens upward) */}
          <div ref={downloadMenuRef} className="relative">
            <div className={UI_TOKENS.button.splitGroup}>
              <button
                type="button"
                onClick={() => {
                  setIsDownloadOpen(false);
                  const exp = buildAiSessionMarkdownExport(session, {
                    scriptStatusLabel: isDeleted ? labels.scriptDeletedBadge : undefined,
                  });
                  triggerTextFileDownload(exp.filename, exp.content, exp.mimeType);
                }}
                title={labels.downloadDefaultTitle}
                aria-label={labels.downloadDefaultAria}
                className={UI_TOKENS.button.splitPrimary}
              >
                <Download className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>{labels.downloadButton}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDownloadOpen((prev) => !prev)}
                aria-expanded={isDownloadOpen}
                aria-haspopup="menu"
                aria-label={labels.downloadMenuAria}
                className={
                  isDownloadOpen ? UI_TOKENS.button.splitChevronOpen : UI_TOKENS.button.splitChevron
                }
              >
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-150 ${
                    isDownloadOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {isDownloadOpen && (
              <div
                role="menu"
                aria-label={labels.downloadMenuAria}
                className="absolute bottom-full left-0 mb-2 w-64 bg-surface rounded-xl shadow-xl border border-border-main p-1.5 space-y-0.5 z-50 text-text-main"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsDownloadOpen(false);
                    const exp = buildAiSessionMarkdownExport(session, {
                      scriptStatusLabel: isDeleted ? labels.scriptDeletedBadge : undefined,
                    });
                    triggerTextFileDownload(exp.filename, exp.content, exp.mimeType);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-subtle transition-colors cursor-pointer"
                >
                  <span className="flex items-start gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-text-main">
                        {labels.downloadConversationLabel}
                      </span>
                      <span className="block text-[10px] text-text-muted">
                        {labels.downloadConversationDesc}
                      </span>
                    </span>
                  </span>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-text-faint shrink-0">
                    {labels.downloadTagMd}
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsDownloadOpen(false);
                    const exp = buildAiSessionJsonExport(session, {
                      scriptStatus: summary.scriptStatus,
                      resolvedScriptTitle: summary.resolvedScriptTitle,
                    });
                    triggerTextFileDownload(exp.filename, exp.content, exp.mimeType);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-subtle transition-colors cursor-pointer"
                >
                  <span className="flex items-start gap-2 min-w-0">
                    <Braces className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-text-main">
                        {labels.downloadFullJsonLabel}
                      </span>
                      <span className="block text-[10px] text-text-muted">
                        {labels.downloadFullJsonDesc}
                      </span>
                    </span>
                  </span>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-text-faint shrink-0">
                    {labels.downloadTagJson}
                  </span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onRequestDeleteSession(summary)}
            aria-label={labels.deleteButton}
            title={labels.deleteButton}
            className={`${UI_TOKENS.button.actionPill} hover:text-red-600 dark:hover:text-red-400`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{labels.deleteButton}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isOtherExisting && (
            <button
              type="button"
              onClick={() => onSwitchScriptAndLoad(summary)}
              className={UI_TOKENS.button.secondary}
            >
              <span className="inline-flex items-center gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>{labels.switchScriptAndLoadButton}</span>
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onLoadInSidebar(summary)}
            className={UI_TOKENS.button.primary}
          >
            <span className="inline-flex items-center gap-1.5">
              <Play className="h-3 w-3 fill-current" />
              <span>{labels.loadInSidebarButton}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryMessageRow({
  msg,
  copiedKey,
  showThinkingSummary,
  showEstimatedCost,
  onCopyPrompt,
  onCopyReply,
  onInspectTrace,
}: {
  msg: AiChatMessage;
  copiedKey: string | null;
  showThinkingSummary: boolean;
  showEstimatedCost: boolean;
  onCopyPrompt: (text: string) => void;
  onCopyReply: (text: string) => void;
  onInspectTrace: (trace: AiInspectableTrace) => void;
}) {
  const labels = UI_LABELS.ai.history;

  if (msg.role === 'user') {
    const isCopied = copiedKey === `prompt:${msg.id}`;
    const hasMeta = Boolean(msg.scopeLabel || msg.briefSummary || msg.focus !== 'auto');
    return (
      <div className="flex justify-end items-end gap-1 group/histuser">
        {msg.text.trim().length > 0 && (
          <button
            type="button"
            onClick={() => onCopyPrompt(msg.text)}
            title={labels.copyUserPromptTitle}
            aria-label={isCopied ? labels.copiedUserPromptAria : labels.copyUserPromptAria}
            className={`inline-flex items-center justify-center rounded-md p-1 text-text-faint hover:text-text-main hover:bg-surface-subtle transition-all cursor-pointer shrink-0 ${
              isCopied
                ? 'opacity-100'
                : 'opacity-0 group-hover/histuser:opacity-100 focus-visible:opacity-100'
            }`}
          >
            {isCopied ? (
              <Check className="h-3 w-3 text-[var(--phase-aesthetic-text)]" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        )}
        <div className="max-w-[88%] rounded-2xl rounded-br-sm border border-border-main bg-surface px-3 py-2 text-xs text-text-main shadow-2xs space-y-1">
          {hasMeta && (
            <div className="flex flex-wrap items-center gap-1.5">
              {msg.focus !== 'auto' && (
                <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-text-muted">
                  {UI_LABELS.ai.focusLabels[msg.focus] ?? msg.focus}
                </span>
              )}
              {msg.scopeLabel && (
                <span className="font-mono text-[10px] text-text-faint">{msg.scopeLabel}</span>
              )}
              {msg.briefSummary && (
                <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-aesthetic">
                  {msg.briefSummary}
                </span>
              )}
            </div>
          )}
          <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
        </div>
      </div>
    );
  }

  const applied = new Set(msg.appliedSuggestionIds ?? []);
  const dismissed = new Set(msg.dismissedSuggestionIds ?? []);
  const quickScanCost = msg.quickScanTrace ? estimateTraceCost(msg.quickScanTrace) : null;

  const isReplyCopied = copiedKey === `reply:${msg.id}`;

  return (
    <div className="space-y-2">
      {msg.bridgedFromHistory && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-subtle px-2 py-0.5 text-[10px] text-text-muted">
          <History className="h-2.5 w-2.5 text-text-faint shrink-0" />
          <span>
            {msg.bridgedFromHistory === 'cross_script'
              ? labels.bridgedCrossScriptBadge
              : labels.bridgedExpiredBadge}
          </span>
        </div>
      )}

      {!msg.quickScan && !msg.quickScanTrace && (
        <ReasoningAccordion
          isStreaming={false}
          showThinkingSummary={showThinkingSummary}
          showEstimatedCost={showEstimatedCost}
          showDebugTrace={Boolean(msg.trace)}
          hasError={Boolean(msg.error)}
          thoughtSummary={msg.thoughtSummary ?? ''}
          toolCalls={msg.toolCalls ?? []}
          loadedSkills={msg.loadedSkills ?? []}
          trace={msg.trace}
          onInspectTrace={onInspectTrace}
        />
      )}

      {msg.quickScan && (
        <div className="rounded-xl border border-border-main bg-surface px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-text-main">
              {UI_LABELS.ai.quickScanButton} ·{' '}
              {msg.quickScan.flaggedCount === 0 && msg.quickScan.borderlineCount === 0
                ? UI_LABELS.ai.quickScan.summaryAllClean
                : UI_LABELS.ai.quickScan.summaryCounts(
                    msg.quickScan.flaggedCount,
                    msg.quickScan.borderlineCount
                  )}
            </span>
            <div className="flex items-center gap-1.5">
              {showEstimatedCost && quickScanCost && (
                <span className="font-mono text-[10px] text-text-muted tabular-nums">
                  {formatEstimatedUsd(quickScanCost.totalCostUsd)}
                </span>
              )}
              {msg.quickScanTrace && (
                <button
                  type="button"
                  onClick={() => onInspectTrace(msg.quickScanTrace!)}
                  className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted hover:text-text-main cursor-pointer"
                >
                  <Terminal className="h-2.5 w-2.5" />
                  <span>{labels.inspectTraceButton}</span>
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            {msg.quickScan.totalQuestions} checks · {msg.quickScan.suspectBeats.length} suspect state(s)
          </p>
        </div>
      )}

      {msg.text.trim().length > 0 && (
        <div className="relative group/histreply rounded-xl border border-border-subtle bg-surface px-3 py-2.5 shadow-2xs">
          <button
            type="button"
            onClick={() => onCopyReply(msg.text)}
            title={labels.copyAssistantReplyTitle}
            aria-label={
              isReplyCopied
                ? labels.copiedAssistantReplyAria
                : labels.copyAssistantReplyAria
            }
            className={`absolute top-1.5 right-1.5 inline-flex items-center justify-center rounded-md border border-border-subtle bg-surface/90 backdrop-blur-xs p-1 text-text-faint hover:text-text-main hover:bg-surface-hover shadow-2xs transition-all cursor-pointer ${
              isReplyCopied
                ? 'opacity-100'
                : 'opacity-0 group-hover/histreply:opacity-100 focus-visible:opacity-100'
            }`}
          >
            {isReplyCopied ? (
              <Check className="h-3 w-3 text-[var(--phase-aesthetic-text)]" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
          <MarkdownContent content={msg.text} />
        </div>
      )}

      {msg.suggestions && msg.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {msg.suggestions.map((suggestion) => {
            const isApplied = applied.has(suggestion.id);
            const isDismissed = dismissed.has(suggestion.id);
            const qResp =
              suggestion.kind === 'question' ? msg.questionResponses?.[suggestion.id] : undefined;
            const statusText = qResp
              ? qResp.status
              : isApplied
                ? 'applied'
                : isDismissed
                  ? 'dismissed'
                  : 'staged';

            return (
              <span
                key={suggestion.id}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] ${
                  isApplied || qResp?.status === 'answered'
                    ? 'auteur-phase-aesthetic'
                    : isDismissed || qResp?.status === 'dismissed'
                      ? 'border-border-subtle bg-surface-subtle text-text-faint line-through'
                      : 'border-border-main bg-surface text-text-body'
                }`}
              >
                <span className="font-mono text-[9.5px] uppercase">{suggestion.kind}</span>
                <span className="font-medium truncate max-w-[220px]">
                  {describeStagedSuggestion(suggestion)}
                </span>
                <span className="font-mono text-[9px] opacity-80">({statusText})</span>
              </span>
            );
          })}
        </div>
      )}

      {msg.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{msg.error.message}</span>
          </span>
          {(msg.trace ?? msg.quickScanTrace) && (
            <button
              type="button"
              onClick={() => onInspectTrace((msg.trace ?? msg.quickScanTrace)!)}
              className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-main cursor-pointer shrink-0"
            >
              <Terminal className="h-2.5 w-2.5" />
              <span>{labels.inspectTraceButton}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
