import {createContext, memo, useContext, useEffect, useRef, useState} from 'react';
import {
  ArrowUpDown,
  Check,
  GitFork,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import {formatLensShort} from '../ui/aiAssistant.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import type {
  LiveBeatPatchIndicator,
  LiveBlockPatchIndicator,
  LiveInsertionPatchIndicator,
  WordDiffLine,
  WordDiffToken,
} from '../ui/patchIndicators.ts';

export interface LivePatchActionContextValue {
  readOnly: boolean;
  onApplyPatch?: (patchId: string) => void;
  onDismissPatch?: (patchId: string) => void;
}

export const LivePatchActionContext = createContext<LivePatchActionContextValue>({
  readOnly: false,
});

function LivePatchActionBar({
  patchId,
  sourceKind,
  isStreaming,
  onAfterAction,
}: {
  patchId: string;
  sourceKind: 'patch' | 'audit_fix';
  isStreaming?: boolean;
  onAfterAction: () => void;
}) {
  const {readOnly, onApplyPatch, onDismissPatch} = useContext(LivePatchActionContext);
  if (!onApplyPatch && !onDismissPatch) return null;

  const aiLabels = UI_LABELS.ai.suggestions;
  const applyLabel = isStreaming
    ? aiLabels.finishingLabel
    : readOnly
      ? aiLabels.forkAndApplyButton
      : sourceKind === 'audit_fix'
        ? aiLabels.applyFixButton
        : aiLabels.applyButton;

  return (
    <div className="flex items-center justify-end gap-1.5 pt-1">
      {sourceKind === 'patch' && onDismissPatch && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismissPatch(patchId);
            onAfterAction();
          }}
          className={UI_TOKENS.ai.pillButton}
        >
          <X className="h-3 w-3" />
          <span>{aiLabels.dismissButton}</span>
        </button>
      )}
      {onApplyPatch && (
        <button
          type="button"
          disabled={Boolean(isStreaming)}
          title={isStreaming ? aiLabels.waitUntilFinishedTitle : undefined}
          onClick={(e) => {
            e.stopPropagation();
            onApplyPatch(patchId);
            onAfterAction();
          }}
          className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1 px-2.5 py-1 text-[11px] disabled:opacity-45 disabled:cursor-not-allowed`}
        >
          {isStreaming ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : readOnly ? (
            <GitFork className="h-3 w-3" />
          ) : sourceKind === 'audit_fix' ? (
            <Wrench className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          <span>{applyLabel}</span>
        </button>
      )}
    </div>
  );
}

function useHoverPinPopover() {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pinned) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setPinned(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pinned]);

  return {
    containerRef,
    pinned,
    setPinned,
    setHovered,
    isOpen: pinned || hovered,
  };
}

const WordDiffTokensView = memo(function WordDiffTokensView({
  tokens,
}: {
  tokens: readonly WordDiffToken[];
}) {
  return (
    <>
      {tokens.map((token, idx) => {
        if (token.type === 'added') {
          return (
            <span key={idx} className="auteur-word-diff-added">
              {token.text}
            </span>
          );
        }
        if (token.type === 'removed') {
          return (
            <span key={idx} className="auteur-word-diff-removed">
              {token.text}
            </span>
          );
        }
        return <span key={idx}>{token.text}</span>;
      })}
    </>
  );
});

const MultiLineWordDiffView = memo(function MultiLineWordDiffView({
  lines,
}: {
  lines: readonly WordDiffLine[];
}) {
  const labels = UI_LABELS.patchIndicators;

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-app px-2.5 py-2 font-mono text-[11px] italic text-text-faint">
        {labels.emptyBodyPlaceholder}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-app px-2.5 py-2 font-script text-[12px] leading-relaxed text-text-body space-y-0.5 max-h-56 overflow-y-auto auteur-pane-scroll">
      {lines.map((line, idx) => {
        if (line.kind === 'omitted') {
          return (
            <div
              key={idx}
              className="py-0.5 text-center font-mono text-[10px] text-text-faint select-none"
            >
              {labels.omittedLines(line.omittedCount ?? 0)}
            </div>
          );
        }

        const isEmpty = line.tokens.length === 0;
        return (
          <div
            key={idx}
            className={`whitespace-pre-wrap break-words ${
              line.kind === 'context' ? 'text-text-muted' : ''
            }`}
          >
            {isEmpty ? '\u00A0' : <WordDiffTokensView tokens={line.tokens} />}
          </div>
        );
      })}
    </div>
  );
});

function getKindBadgeClass(kind: 'modify' | 'delete' | 'reorder' | 'insert'): string {
  switch (kind) {
    case 'delete':
      return 'border-red-500/35 bg-red-500/12 text-red-600 dark:text-red-400';
    case 'insert':
      return 'auteur-phase-aesthetic';
    case 'reorder':
      return 'auteur-phase-continuity';
    case 'modify':
      return 'auteur-phase-logic';
  }
}

export type AiPatchIndicatorProps =
  | {
      phase: 'staging';
      indicators: readonly LiveBlockPatchIndicator[];
      align?: 'top' | 'center';
    }
  | {
      phase: 'execution';
      indicators: readonly LiveBeatPatchIndicator[];
      align?: 'top' | 'center';
    };

/**
 * Quiet right-margin AI Patch indicator mirroring DiagnosticDot.
 * Hover to peek a preview-only word-level diff popover; click to pin open.
 */
export const AiPatchIndicator = memo(function AiPatchIndicator(props: AiPatchIndicatorProps) {
  const {containerRef, pinned, setPinned, setHovered, isOpen} = useHoverPinPopover();
  const labels = UI_LABELS.patchIndicators;
  const count = props.indicators.length;

  if (count === 0) {
    return null;
  }

  const hasDelete = props.indicators.some((item) => item.kind === 'delete');
  const allReorder =
    props.phase === 'execution' && props.indicators.every((item) => item.kind === 'reorder');

  const triggerToneClass = hasDelete
    ? 'border-red-500/40 bg-red-500/12 text-red-500 hover:bg-red-500/20 focus-visible:ring-red-500/40'
    : 'auteur-phase-logic hover:brightness-95 dark:hover:brightness-110 focus-visible:ring-[var(--tok-continuity)]/40';

  const popoverWidthClass =
    props.phase === 'staging'
      ? 'w-80 max-w-[calc(100vw-2.5rem)]'
      : 'w-96 max-w-[calc(100vw-2.5rem)]';

  return (
    <div
      ref={containerRef}
      className={`relative flex items-start justify-center ${
        props.align === 'center' ? 'self-center' : ''
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPinned((prev) => !prev);
        }}
        aria-label={labels.triggerAria(count, hasDelete)}
        aria-expanded={isOpen}
        className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${triggerToneClass}`}
      >
        {hasDelete ? (
          <Trash2 className="h-3 w-3" />
        ) : allReorder ? (
          <ArrowUpDown className="h-3 w-3" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={labels.dialogAria}
          onClick={(e) => e.stopPropagation()}
          className={`absolute right-0 top-6 z-50 pt-1.5 ${popoverWidthClass}`}
        >
          <div className="rounded-xl border border-border-main bg-surface shadow-2xl text-text-main overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle bg-surface-subtle px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-text-muted">
                <Sparkles className="h-3 w-3 text-[var(--tok-continuity)]" />
                <span>{labels.headerTitle(count)}</span>
              </span>
              {pinned && (
                <button
                  type="button"
                  onClick={() => setPinned(false)}
                  className="rounded-md p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main cursor-pointer"
                  aria-label={labels.closeAria}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="divide-y divide-border-subtle max-h-80 overflow-y-auto auteur-pane-scroll">
              {props.phase === 'staging'
                ? props.indicators.map((item) => (
                    <div key={`${item.patchId}-mb-${item.blockIndex}`} className="px-3 py-2.5 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${getKindBadgeClass(
                            item.kind
                          )}`}
                        >
                          {labels.kindBadges[item.kind]}
                        </span>
                        {item.lens && (
                          <span className="rounded border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                            {formatLensShort(item.lens)}
                          </span>
                        )}
                        {item.afterHeader && item.afterHeader !== item.header && (
                          <span className="font-mono text-[10px] font-medium text-text-muted">
                            {labels.headerRename(item.header, item.afterHeader)}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-medium text-text-main leading-snug">
                        {item.issueMessage || item.summary}
                      </p>

                      <MultiLineWordDiffView lines={item.lines} />

                      <LivePatchActionBar
                        patchId={item.patchId}
                        sourceKind={item.sourceKind}
                        isStreaming={item.isStreaming}
                        onAfterAction={() => {
                          setPinned(false);
                          setHovered(false);
                        }}
                      />
                    </div>
                  ))
                : props.indicators.map((item) => (
                    <div key={`${item.patchId}-s-${item.beatIndex}`} className="px-3 py-2.5 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${getKindBadgeClass(
                            item.kind
                          )}`}
                        >
                          {labels.kindBadges[item.kind]}
                        </span>
                        {item.lens && (
                          <span className="rounded border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                            {formatLensShort(item.lens)}
                          </span>
                        )}
                        {item.movedToBeatIndex !== undefined && (
                          <span className="auteur-phase-continuity rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium">
                            {labels.movedToBeat(item.movedToBeatIndex)}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-medium text-text-main leading-snug">
                        {item.issueMessage || item.summary}
                      </p>

                      <div className="rounded-lg border border-border-subtle bg-app px-2.5 py-2 font-script text-[12px] leading-relaxed text-text-body whitespace-pre-wrap break-words max-h-56 overflow-y-auto auteur-pane-scroll">
                        <WordDiffTokensView tokens={item.tokens} />
                      </div>

                      <LivePatchActionBar
                        patchId={item.patchId}
                        sourceKind={item.sourceKind}
                        isStreaming={item.isStreaming}
                        onAfterAction={() => {
                          setPinned(false);
                          setHovered(false);
                        }}
                      />
                    </div>
                  ))}
            </div>

            <div className="border-t border-border-subtle bg-surface-subtle px-3 py-1.5 text-[10.5px] text-text-faint">
              {labels.footerHint}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export interface AiPatchInsertionSeamProps {
  gridClass: string;
  hasLeftGutter?: boolean;
  insertions: readonly LiveInsertionPatchIndicator[];
}

/**
 * Quiet dashed seam pill rendered between Staging Macro-Blocks or Execution Macro-States
 * whenever an active AI patch proposes inserting a new block or Macro-State at that slot.
 * Hover to peek the proposed content; click to pin open.
 */
export const AiPatchInsertionSeam = memo(function AiPatchInsertionSeam({
  gridClass,
  hasLeftGutter = false,
  insertions,
}: AiPatchInsertionSeamProps) {
  const {containerRef, pinned, setPinned, setHovered, isOpen} = useHoverPinPopover();
  const labels = UI_LABELS.patchIndicators;

  if (insertions.length === 0) {
    return null;
  }

  const first = insertions[0];
  const pillLabel =
    first.phase === 'staging' && first.header
      ? labels.insertBlockSeamLabel(first.header, insertions.length - 1)
      : labels.insertBeatSeamLabel(insertions.length);

  return (
    <div className={`grid ${gridClass} items-center gap-1.5 py-1`}>
      {hasLeftGutter && <div />}

      <div className="relative flex items-center justify-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-[var(--phase-aesthetic-border)]"
        />

        <div
          ref={containerRef}
          className="relative z-10 flex justify-center"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPinned((prev) => !prev);
            }}
            aria-label={labels.insertSeamAria(pillLabel)}
            aria-expanded={isOpen}
            className="auteur-phase-aesthetic inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold shadow-xs transition-colors hover:brightness-95 dark:hover:brightness-110 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--phase-aesthetic-text)]/40"
          >
            <Plus className="h-2.5 w-2.5" />
            <span>{pillLabel}</span>
          </button>

          {isOpen && (
            <div
              role="dialog"
              aria-label={labels.dialogAria}
              onClick={(e) => e.stopPropagation()}
              className="absolute left-1/2 -translate-x-1/2 top-5 z-50 pt-1.5 w-80 sm:w-96 max-w-[calc(100vw-2.5rem)]"
            >
              <div className="rounded-xl border border-border-main bg-surface shadow-2xl text-text-main overflow-hidden">
                <div className="flex items-center justify-between border-b border-border-subtle bg-surface-subtle px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-text-muted">
                    <Sparkles className="h-3 w-3 text-[var(--phase-aesthetic-text)]" />
                    <span>{labels.insertionHeaderTitle(insertions.length)}</span>
                  </span>
                  {pinned && (
                    <button
                      type="button"
                      onClick={() => setPinned(false)}
                      className="rounded-md p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main cursor-pointer"
                      aria-label={labels.closeAria}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="divide-y divide-border-subtle max-h-80 overflow-y-auto auteur-pane-scroll">
                  {insertions.map((item, idx) => (
                    <div key={`${item.patchId}-ins-${idx}`} className="px-3 py-2.5 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${getKindBadgeClass(
                            'insert'
                          )}`}
                        >
                          {labels.kindBadges.insert}
                        </span>
                        {item.phase === 'staging' && item.header && (
                          <span className="rounded border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-main">
                            [{item.header}]
                          </span>
                        )}
                        {item.phase === 'execution' && item.insertedBeatIndex !== undefined && (
                          <span className="rounded border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-main">
                            {labels.insertedBeatBadge(item.insertedBeatIndex)}
                          </span>
                        )}
                        {item.lens && (
                          <span className="rounded border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                            {formatLensShort(item.lens)}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-medium text-text-main leading-snug">
                        {item.issueMessage || item.summary}
                      </p>

                      <div className="rounded-lg border border-border-subtle bg-app px-2.5 py-2 font-script text-[12px] leading-relaxed whitespace-pre-wrap break-words max-h-56 overflow-y-auto auteur-pane-scroll">
                        {item.content.length > 0 ? (
                          <span className="auteur-word-diff-added">{item.content}</span>
                        ) : (
                          <span className="font-mono text-[11px] italic text-text-faint">
                            {labels.emptyBodyPlaceholder}
                          </span>
                        )}
                      </div>

                      <LivePatchActionBar
                        patchId={item.patchId}
                        sourceKind={item.sourceKind}
                        isStreaming={item.isStreaming}
                        onAfterAction={() => {
                          setPinned(false);
                          setHovered(false);
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="border-t border-border-subtle bg-surface-subtle px-3 py-1.5 text-[10.5px] text-text-faint">
                  {labels.footerHint}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hidden sm:block" />
    </div>
  );
});
