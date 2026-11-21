import {useEffect, useMemo, useState} from 'react';
import {AlertCircle, Check, Copy, Terminal, X} from 'lucide-react';
import type {AgentTurnTrace} from '../services/geminiInteractions.ts';
import {
  estimateTraceCost,
  formatEstimatedUsd,
  formatUsdBreakdown,
} from '../ui/aiPricing.ts';
import {getGeminiModelOption, REASONING_LEVEL_OPTIONS} from '../ui/aiSettings.ts';
import {copyTextToClipboard} from '../ui/clipboard.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {QuickScanTraceModalContent} from './ai/trace/QuickScanTraceView.tsx';
import {RoundTraceCard} from './ai/trace/RoundTraceCard.tsx';
import {
  buildInteractionChain,
  formatJsonPretty,
  formatUsageEntries,
  isQuickScanTrace,
  type AiInspectableTrace,
} from './ai/trace/traceFormatters.ts';

export type {AiInspectableTrace};

export interface AiTraceModalProps {
  isOpen: boolean;
  trace: AiInspectableTrace | null;
  onClose: () => void;
}

export function AiTraceModal({isOpen, trace, onClose}: AiTraceModalProps) {
  if (!isOpen || !trace) return null;
  return <AiTraceModalShell trace={trace} onClose={onClose} />;
}

function AiTraceModalShell({
  trace,
  onClose,
}: {
  trace: AiInspectableTrace;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const labels = UI_LABELS.ai.traceModal;
  const serializedTraceJson = useMemo(() => formatJsonPretty(trace), [trace]);

  useEffect(() => {
    setCopied(false);
  }, [trace]);

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
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopyJson = async () => {
    const ok = await copyTextToClipboard(serializedTraceJson);
    if (ok) {
      setCopied(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlay}
    >
      <div className="bg-surface w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col max-h-[88dvh]">
        {/* Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-text-main"
            >
              <Terminal className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main">
                {labels.title}
              </h2>
              <p className="text-[11px] text-text-muted truncate">
                {isQuickScanTrace(trace) ? labels.quickScanSubtitle : labels.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyJson()}
              aria-label={labels.copyJsonAria}
              className={UI_TOKENS.button.actionPill}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[var(--phase-aesthetic-text)]" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-text-muted" />
              )}
              <span>{copied ? labels.copiedJsonButton : labels.copyJsonButton}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={labels.closeAria}
              className={UI_TOKENS.button.iconClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isQuickScanTrace(trace) ? (
          <QuickScanTraceModalContent trace={trace} onClose={onClose} />
        ) : (
          <AgentTurnTraceBody trace={trace} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function AgentTurnTraceBody({
  trace,
  onClose,
}: {
  trace: AgentTurnTrace;
  onClose: () => void;
}) {
  const labels = UI_LABELS.ai.traceModal;

  const modelOption = getGeminiModelOption(trace.model);
  const reasoningOption =
    REASONING_LEVEL_OPTIONS.find((r) => r.id === trace.reasoningLevel) ??
    REASONING_LEVEL_OPTIONS[1];
  const focusLabel = UI_LABELS.ai.focusLabels[trace.focus] ?? trace.focus;
  const modeLabel = UI_LABELS.ai.modes[trace.mode]?.label ?? trace.mode;

  const interactionChain = useMemo(() => buildInteractionChain(trace), [trace]);
  const usageEntries = useMemo(() => formatUsageEntries(trace.usage), [trace.usage]);
  const turnCost = useMemo(() => estimateTraceCost(trace), [trace]);

  const statusBadge = trace.error
    ? trace.error.code === 'aborted'
      ? {label: labels.statusStopped, className: 'auteur-phase-slate'}
      : {
          label:
            trace.error.status !== undefined
              ? `${labels.statusError} · ${trace.error.status}`
              : `${labels.statusError} · ${trace.error.code}`,
          className: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
        }
    : trace.hitToolRoundLimit
      ? {label: labels.statusRoundLimit, className: 'auteur-phase-intent'}
      : {label: labels.statusCompleted, className: 'auteur-phase-aesthetic'};

  return (
    <>
      {/* Compact Summary Bar */}
      <div className="border-b border-border-subtle bg-surface px-4 py-3 md:px-5 space-y-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.summaryStatus}
            </span>
            <span
              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.summaryModel}
            </span>
            <span className="font-medium text-text-main">{modelOption.shortLabel}</span>
            <span className="font-mono text-[10px] text-text-faint">{trace.model}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.summaryReasoning}
            </span>
            <span className="font-mono text-[11px] text-text-body">{reasoningOption.label}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.summaryFocus}
            </span>
            <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-continuity">
              {focusLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.summaryMode}
            </span>
            <span className="font-mono text-[11px] text-text-body">{modeLabel}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.summaryDuration}
            </span>
            <span className="font-mono text-[11px] text-text-body tabular-nums">
              {labels.formatDurationMs(trace.durationMs)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.summaryRounds}
            </span>
            <span className="font-mono text-[11px] text-text-body tabular-nums">
              {trace.toolRounds}
            </span>
            {trace.hitToolRoundLimit && (
              <span className="rounded border px-1 py-0.5 font-mono text-[10px] auteur-phase-intent">
                {labels.roundLimitBadge}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0">
              {labels.summaryInteractionChain}
            </span>
            {interactionChain.length === 0 ? (
              <span className="font-mono text-[10px] text-text-faint">
                {labels.noInteractionId}
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] text-text-body">
                {interactionChain.map((id, index) => (
                  <span key={`${id}-${index}`} className="inline-flex items-center gap-1">
                    {index > 0 && <span className="text-text-faint">→</span>}
                    <span
                      title={id}
                      className="max-w-[180px] truncate rounded border border-border-main bg-surface-subtle px-1.5 py-0.5"
                    >
                      {id}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {usageEntries.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0">
                {labels.summaryUsage}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {usageEntries.map((entry) => (
                  <span
                    key={entry.key}
                    className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted tabular-nums"
                  >
                    {entry.key}: <span className="text-text-main">{entry.value}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {turnCost && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0">
                {labels.summaryEstimatedCost}
              </span>
              <span className="rounded border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-main tabular-nums">
                {formatEstimatedUsd(turnCost.totalCostUsd)}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted tabular-nums">
                  {UI_LABELS.ai.cost.rowInput}:{' '}
                  <span className="text-text-main">
                    {formatUsdBreakdown(turnCost.inputCostUsd)}
                  </span>
                </span>
                {turnCost.usage.cachedTokens > 0 && (
                  <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted tabular-nums">
                    {UI_LABELS.ai.cost.rowCached}:{' '}
                    <span className="text-text-main">
                      {formatUsdBreakdown(turnCost.cachedCostUsd)}
                    </span>
                  </span>
                )}
                <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted tabular-nums">
                  {UI_LABELS.ai.cost.rowOutput}:{' '}
                  <span className="text-text-main">
                    {formatUsdBreakdown(turnCost.outputCostUsd)}
                  </span>
                </span>
                {turnCost.usage.thoughtTokens > 0 && (
                  <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted tabular-nums">
                    {UI_LABELS.ai.cost.rowThinking}:{' '}
                    <span className="text-text-main">
                      {formatUsdBreakdown(turnCost.thoughtCostUsd)}
                    </span>
                  </span>
                )}
                <span className="font-mono text-[10px] text-text-faint">
                  ({labels.costRateSummary(turnCost.rates.inputPer1M, turnCost.rates.outputPer1M)}
                  {turnCost.rates.isPromoRate ? ` · ${labels.costPromoBadge}` : ''})
                </span>
              </div>
            </div>
          )}

          {(trace.activeSkillIds.length > 0 || trace.loadedSkillIds.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0">
                {labels.summarySkills}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {trace.activeSkillIds.map((skillId) => (
                  <span
                    key={`active-${skillId}`}
                    className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-aesthetic"
                  >
                    {labels.skillActivePrefix}: {skillId}
                  </span>
                ))}
                {trace.loadedSkillIds.map((skillId) => (
                  <span
                    key={`loaded-${skillId}`}
                    className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-logic"
                  >
                    {labels.skillLoadedPrefix}: {skillId}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll px-4 py-4 md:px-5 space-y-4 bg-app/40">
        {/* Error Details Card */}
        {trace.error && (
          <section className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-xs text-red-700 dark:text-red-300 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{labels.errorDetailsHeading}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                {trace.error.status !== undefined && (
                  <span className="rounded border border-red-500/30 bg-surface px-1.5 py-0.5 text-text-main">
                    {labels.errorStatusLabel} {trace.error.status}
                  </span>
                )}
                <span className="rounded border border-red-500/30 bg-surface px-1.5 py-0.5 text-text-main">
                  {labels.errorCodeLabel}: {trace.error.code}
                </span>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed whitespace-pre-wrap break-words">
              {trace.error.message}
            </p>
          </section>
        )}

        {/* Round-by-Round Timeline */}
        <section className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            {labels.roundsHeading(trace.rounds.length)}
          </div>

          {trace.rounds.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-main bg-surface/60 px-4 py-4 text-xs text-text-muted">
              {labels.noRoundsNote}
            </div>
          ) : (
            <div className="space-y-3">
              {trace.rounds.map((round) => (
                <RoundTraceCard key={round.roundIndex} round={round} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 md:px-5 border-t border-border-subtle bg-surface-subtle flex items-center justify-between gap-3 shrink-0">
        <span className="font-mono text-[10px] text-text-faint truncate">
          {labels.summaryStartedAt}: {trace.startedAt}
        </span>
        <button type="button" onClick={onClose} className={UI_TOKENS.button.primary}>
          {labels.doneButton}
        </button>
      </div>
    </>
  );
}
