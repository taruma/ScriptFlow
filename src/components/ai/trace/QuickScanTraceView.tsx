import {useMemo, useState} from 'react';
import {ChevronDown, ChevronRight} from 'lucide-react';
import type {QuickScanTrace} from '../../../services/geminiDecisions.ts';
import {
  estimateTraceCost,
  formatEstimatedUsd,
  formatUsdBreakdown,
} from '../../../ui/aiPricing.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import {
  formatJsonPretty,
  formatUsageEntries,
  getQuickScanAnswerBadgeClass,
} from './traceFormatters.ts';

export interface QuickScanTraceModalContentProps {
  trace: QuickScanTrace;
  onClose: () => void;
}

export function QuickScanTraceModalContent({
  trace,
  onClose,
}: QuickScanTraceModalContentProps) {
  const [showInput, setShowInput] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const labels = UI_LABELS.ai.traceModal;

  const usageEntries = useMemo(() => formatUsageEntries(trace.usage), [trace.usage]);
  const turnCost = useMemo(() => estimateTraceCost(trace), [trace]);
  const sortedAnswers = useMemo(
    () => Object.entries(trace.answers).sort(([, a], [, b]) => b.noul - a.noul),
    [trace.answers]
  );

  return (
    <>
      {/* Summary Strip */}
      <div className="border-b border-border-subtle bg-surface px-4 py-3 md:px-5 space-y-2 shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
          <div>
            <span className="text-text-faint">{labels.summaryModel}: </span>
            <span className="font-mono font-semibold text-text-main">
              {trace.model} ({trace.apiVersion})
            </span>
          </div>
          <div>
            <span className="text-text-faint">{labels.quickScanSensitivity}: </span>
            <span className="font-mono capitalize text-text-main">{trace.sensitivity}</span>
          </div>
          <div>
            <span className="text-text-faint">{labels.summaryDuration}: </span>
            <span className="font-mono text-text-main">
              {labels.formatDurationMs(trace.durationMs)}
            </span>
          </div>
          <div>
            <span className="text-text-faint">{labels.quickScanQuestions}: </span>
            <span className="font-mono text-text-main">{trace.totalQuestions}</span>
          </div>
          <div>
            <span className="text-text-faint">{labels.quickScanBatches}: </span>
            <span className="font-mono text-text-main">{trace.batchCount}</span>
          </div>
          {turnCost && (
            <div>
              <span className="text-text-faint">{labels.summaryEstimatedCost}: </span>
              <span className="font-mono font-semibold text-text-main">
                {formatEstimatedUsd(turnCost.totalCostUsd)}
              </span>
              <span className="ml-1 font-mono text-[10px] text-text-faint">
                ({formatUsdBreakdown(turnCost.inputCostUsd)} in / $0 out)
              </span>
            </div>
          )}
        </div>

        {usageEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-text-faint">
            <span>{labels.summaryUsage}:</span>
            {usageEntries.map((entry) => (
              <span
                key={entry.key}
                className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 text-text-muted"
              >
                {entry.key}={entry.value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable Details */}
      <div className="flex-1 overflow-y-auto auteur-pane-scroll px-4 py-3 md:px-5 space-y-3">
        {/* Calibrated Answers Table */}
        <section className="rounded-xl border border-border-main bg-surface overflow-hidden">
          <div className="border-b border-border-subtle bg-surface-subtle px-3 py-2 text-[11px] font-semibold text-text-main">
            {labels.quickScanAnswersHeading(sortedAnswers.length)}
          </div>
          <div className="divide-y divide-border-subtle max-h-64 overflow-y-auto auteur-pane-scroll">
            {sortedAnswers.map(([key, ans]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-2 px-3 py-1.5 font-mono text-[10.5px]"
              >
                <span className="text-text-main truncate">{key}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-text-muted tabular-nums">
                    P={(ans.noul * 100).toFixed(1)}%
                  </span>
                  <span className="text-text-faint tabular-nums">
                    conf={(ans.confidence * 100).toFixed(1)}%
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${getQuickScanAnswerBadgeClass(ans.status)}`}
                  >
                    {ans.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Collapsible Input Sent */}
        <section className="rounded-xl border border-border-main bg-surface overflow-hidden">
          <button
            type="button"
            onClick={() => setShowInput((prev) => !prev)}
            aria-expanded={showInput}
            className="w-full flex items-center justify-between gap-2 bg-surface-subtle px-3 py-2 text-left text-[11px] font-semibold text-text-main cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5">
              {showInput ? (
                <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
              )}
              <span>{labels.quickScanInputHeading}</span>
            </span>
          </button>
          {showInput && (
            <pre className="p-3 font-mono text-[10px] leading-relaxed text-text-body whitespace-pre-wrap break-words max-h-64 overflow-y-auto auteur-pane-scroll bg-app">
              {typeof trace.input === 'string' ? trace.input : formatJsonPretty(trace.input)}
            </pre>
          )}
        </section>

        {/* Collapsible Questions Sent */}
        <section className="rounded-xl border border-border-main bg-surface overflow-hidden">
          <button
            type="button"
            onClick={() => setShowQuestions((prev) => !prev)}
            aria-expanded={showQuestions}
            className="w-full flex items-center justify-between gap-2 bg-surface-subtle px-3 py-2 text-left text-[11px] font-semibold text-text-main cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5">
              {showQuestions ? (
                <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
              )}
              <span>{labels.quickScanQuestionsHeading(trace.totalQuestions)}</span>
            </span>
          </button>
          {showQuestions && (
            <pre className="p-3 font-mono text-[10px] leading-relaxed text-text-body whitespace-pre-wrap break-words max-h-72 overflow-y-auto auteur-pane-scroll bg-app">
              {formatJsonPretty(trace.questions)}
            </pre>
          )}
        </section>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end border-t border-border-subtle bg-surface-subtle px-4 py-2.5 md:px-5 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className={`${UI_TOKENS.button.primary} px-3.5 py-1.5 text-xs`}
        >
          {labels.doneButton}
        </button>
      </div>
    </>
  );
}
