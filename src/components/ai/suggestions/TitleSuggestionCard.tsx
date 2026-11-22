import {memo, useState} from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  GitFork,
  Loader2,
  Type,
  X,
} from 'lucide-react';
import type {TitleSuggestion} from '../../../services/scriptTools.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface TitleSuggestionCardProps {
  suggestion: TitleSuggestion;
  readOnly: boolean;
  isStreaming?: boolean;
  isApplied: boolean;
  isDismissed: boolean;
  onApply: (suggestion: TitleSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}

export const TitleSuggestionCard = memo(function TitleSuggestionCard({
  suggestion,
  readOnly,
  isStreaming = false,
  isApplied,
  isDismissed,
  onApply,
  onDismiss,
}: TitleSuggestionCardProps) {
  const [isReceiptExpanded, setIsReceiptExpanded] = useState(false);
  const labels = UI_LABELS.ai.suggestions;
  const isResolved = isApplied || isDismissed;

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
          <span className="font-serif text-xs font-semibold text-text-body truncate">
            {suggestion.title}
          </span>
        </div>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" />
      </button>
    );
  }

  return (
    <div className={`${UI_TOKENS.ai.suggestionCard} ${isDismissed ? 'opacity-65' : ''}`}>
      <div className={UI_TOKENS.ai.suggestionHeader}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="auteur-phase-intent inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium">
              <Type className="h-2.5 w-2.5" />
              <span>{labels.titleBadge}</span>
            </span>
          </div>
          <p className="font-serif text-xs font-bold leading-snug text-text-main break-words">
            {suggestion.title}
          </p>
        </div>

        {isResolved && (
          <button
            type="button"
            onClick={() => setIsReceiptExpanded(false)}
            aria-label={labels.collapseDetailsAria}
            className="rounded p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main cursor-pointer shrink-0"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {suggestion.previousTitle && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-subtle/60 px-2.5 py-1.5 text-[11px]">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
              {labels.currentTitleLabel}
            </span>
            <span className="text-text-muted line-through decoration-text-faint/60 break-words">
              {suggestion.previousTitle}
            </span>
            <ArrowRight className="h-3 w-3 shrink-0 text-text-faint" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
              {labels.proposedTitleLabel}
            </span>
            <span className="font-medium text-text-main break-words">{suggestion.title}</span>
          </div>
        )}

        {suggestion.rationale && (
          <p className="text-[11px] leading-relaxed text-text-muted">{suggestion.rationale}</p>
        )}

        <div className="flex items-center justify-end gap-1.5">
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
                disabled={isStreaming}
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
                      ? labels.forkAndApplyTitleButton
                      : labels.applyTitleButton}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
