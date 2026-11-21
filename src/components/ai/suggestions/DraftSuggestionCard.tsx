import {memo, useState} from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  GitCompare,
  GitFork,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import type {DraftSuggestion} from '../../../services/scriptTools.ts';
import {formatTopologyLabel} from '../../../ui/aiAssistant.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import {ScriptLineDiffView} from './ScriptLineDiffView.tsx';

export interface DraftSuggestionCardProps {
  suggestion: DraftSuggestion;
  readOnly: boolean;
  isStreaming?: boolean;
  isApplied: boolean;
  isDismissed: boolean;
  onApply: (suggestion: DraftSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}

export const DraftSuggestionCard = memo(function DraftSuggestionCard({
  suggestion,
  readOnly,
  isStreaming = false,
  isApplied,
  isDismissed,
  onApply,
  onDismiss,
}: DraftSuggestionCardProps) {
  const [expandedMode, setExpandedMode] = useState<'closed' | 'preview' | 'diff'>('closed');
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
          <span className="text-xs text-text-body truncate">
            {suggestion.title || suggestion.summary}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[10px] text-text-faint tabular-nums">
            {labels.draftStats(suggestion.stagingBlockCount, suggestion.beatCount)}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
        </div>
      </button>
    );
  }

  return (
    <div className={`${UI_TOKENS.ai.suggestionCard} ${isDismissed ? 'opacity-65' : ''}`}>
      <div className={UI_TOKENS.ai.suggestionHeader}>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="auteur-phase-continuity inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium">
                <Sparkles className="h-2.5 w-2.5" />
                <span>{labels.draftLabel}</span>
              </span>

              <span className="rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                {formatTopologyLabel(suggestion.sceneTopology)}
              </span>

              {suggestion.errorCount === 0 && suggestion.warningCount === 0 ? (
                <span className="auteur-phase-aesthetic rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                  {labels.lintClean}
                </span>
              ) : (
                <span className="auteur-phase-intent rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                  {labels.lintWarnings(suggestion.warningCount)}
                </span>
              )}
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

          {suggestion.title && (
            <div className="font-serif text-[13px] font-bold text-text-main leading-snug">
              {suggestion.title}
            </div>
          )}
          <p className="text-xs leading-snug text-text-body">{suggestion.summary}</p>
          <div className="font-mono text-[10px] text-text-faint tabular-nums">
            {labels.draftStats(suggestion.stagingBlockCount, suggestion.beatCount)}
          </div>
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {expandedMode === 'preview' && (
          <pre className={`${UI_TOKENS.ai.diffContainer} p-2.5 whitespace-pre-wrap text-text-body`}>
            {suggestion.candidateRawText}
          </pre>
        )}

        {expandedMode === 'diff' && <ScriptLineDiffView diff={suggestion.diff} />}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setExpandedMode((prev) => (prev === 'preview' ? 'closed' : 'preview'))
              }
              className={UI_TOKENS.ai.pillButton}
            >
              <FileCode2 className="h-3 w-3" />
              <span>
                {expandedMode === 'preview' ? labels.hidePreview : labels.viewModePreview}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setExpandedMode((prev) => (prev === 'diff' ? 'closed' : 'diff'))}
              className={UI_TOKENS.ai.pillButton}
            >
              <GitCompare className="h-3 w-3" />
              <span>{expandedMode === 'diff' ? labels.hideDiff : labels.viewModeDiff}</span>
            </button>
          </div>

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
