import {memo, useState} from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  GitCompare,
  GitFork,
  Loader2,
  Wrench,
  X,
} from 'lucide-react';
import type {PatchSuggestion} from '../../../services/scriptTools.ts';
import {isSuggestionStale} from '../../../ui/aiAssistant.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import {ScriptLineDiffView} from './ScriptLineDiffView.tsx';

export interface PatchSuggestionCardProps {
  suggestion: PatchSuggestion;
  currentSnapshotHash: string;
  readOnly: boolean;
  isStreaming?: boolean;
  isApplied: boolean;
  isDismissed: boolean;
  onApply: (suggestion: PatchSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}

export const PatchSuggestionCard = memo(function PatchSuggestionCard({
  suggestion,
  currentSnapshotHash,
  readOnly,
  isStreaming = false,
  isApplied,
  isDismissed,
  onApply,
  onDismiss,
}: PatchSuggestionCardProps) {
  const [showDiff, setShowDiff] = useState(false);
  const [isReceiptExpanded, setIsReceiptExpanded] = useState(false);
  const labels = UI_LABELS.ai.suggestions;
  const isResolved = isApplied || isDismissed;
  const stale = !isResolved && isSuggestionStale(suggestion.baseSnapshotHash, currentSnapshotHash);

  const {lintDelta} = suggestion;
  const resolvedCount = lintDelta.resolvedDiagnostics.length;

  // Compact single-line receipt once applied or dismissed (click to expand details/diff)
  if (isResolved && !isReceiptExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsReceiptExpanded(true)}
        aria-expanded={false}
        aria-label={labels.expandDetailsAria}
        className={`w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-surface-subtle transition-colors cursor-pointer ${
          isDismissed ? 'opacity-65' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isApplied ? (
            <span className="auteur-phase-aesthetic inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold shrink-0">
              <Check className="h-2.5 w-2.5" />
              <span>{labels.appliedBadge}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-faint shrink-0">
              <span>{labels.dismissedBadge}</span>
            </span>
          )}
          <span className="text-xs text-text-body truncate">{suggestion.summary}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[10px] text-text-faint tabular-nums">
            +{suggestion.diff.addedCount} / −{suggestion.diff.removedCount}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
        </div>
      </button>
    );
  }

  return (
    <div className={`${UI_TOKENS.ai.suggestionCard} ${isDismissed ? 'opacity-65' : ''}`}>
      <div className={UI_TOKENS.ai.suggestionHeader}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="auteur-phase-logic inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium">
              <Wrench className="h-2.5 w-2.5" />
              <span>{labels.patchLabel}</span>
            </span>

            {suggestion.affectedIds.slice(0, 4).map((id) => (
              <span
                key={id}
                className="rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
              >
                {id}
              </span>
            ))}

            {resolvedCount > 0 ? (
              <span className="auteur-phase-aesthetic rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                {labels.lintDeltaResolved(resolvedCount)}
              </span>
            ) : lintDelta.afterErrors === 0 && lintDelta.afterWarnings === 0 ? (
              <span className="auteur-phase-aesthetic rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                {labels.lintClean}
              </span>
            ) : (
              <span className="auteur-phase-intent rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                {labels.lintWarnings(lintDelta.afterWarnings)}
              </span>
            )}
          </div>

          <p className="text-xs font-medium leading-snug text-text-main">{suggestion.summary}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[10px] text-text-faint tabular-nums">
            +{suggestion.diff.addedCount} / −{suggestion.diff.removedCount}
          </span>
          {isResolved && (
            <button
              type="button"
              onClick={() => setIsReceiptExpanded(false)}
              aria-label={labels.collapseDetailsAria}
              className="rounded p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main cursor-pointer"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {stale && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{labels.staleWarning}</span>
          </div>
        )}

        {showDiff && <ScriptLineDiffView diff={suggestion.diff} />}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowDiff((prev) => !prev)}
            className={UI_TOKENS.ai.pillButton}
          >
            <GitCompare className="h-3 w-3" />
            <span>{showDiff ? labels.hideDiff : labels.showDiff}</span>
            {showDiff ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>

          <div className="flex items-center gap-1.5">
            {isApplied ? (
              <span className="auteur-phase-aesthetic inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold">
                <Check className="h-3 w-3" />
                <span>{labels.appliedBadge}</span>
              </span>
            ) : isDismissed ? (
              <span className="inline-flex items-center gap-1 rounded-lg border border-border-main bg-surface px-2 py-1 text-[11px] text-text-faint">
                {labels.dismissedBadge}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onDismiss(suggestion.id)}
                  className={UI_TOKENS.ai.pillButton}
                >
                  <X className="h-3 w-3" />
                  <span>{labels.dismissButton}</span>
                </button>
                <button
                  type="button"
                  disabled={stale || isStreaming}
                  title={isStreaming ? labels.waitUntilFinishedTitle : undefined}
                  onClick={() => onApply(suggestion)}
                  className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] disabled:opacity-45 disabled:cursor-not-allowed`}
                >
                  {isStreaming ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : readOnly ? (
                    <GitFork className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  <span>
                    {isStreaming
                      ? labels.finishingLabel
                      : readOnly
                        ? labels.forkAndApplyButton
                        : labels.applyButton}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
