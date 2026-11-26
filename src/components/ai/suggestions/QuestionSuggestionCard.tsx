import {memo, useMemo, useState} from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FastForward,
  HelpCircle,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import type {QuestionSuggestion} from '../../../services/scriptTools.ts';
import {
  hasAnyQuestionAnswer,
  type QuestionAnswerDraft,
  type QuestionResponseRecord,
} from '../../../ui/aiAssistant.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface QuestionSuggestionCardProps {
  suggestion: QuestionSuggestion;
  submittedResponse?: QuestionResponseRecord;
  isStreaming?: boolean;
  isRunning?: boolean;
  isAnswered: boolean;
  isDismissed: boolean;
  onSubmit: (
    suggestion: QuestionSuggestion,
    answers: Record<string, QuestionAnswerDraft>
  ) => void;
  onSkip?: (suggestion: QuestionSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}

export const QuestionSuggestionCard = memo(function QuestionSuggestionCard({
  suggestion,
  submittedResponse,
  isStreaming = false,
  isRunning = false,
  isAnswered,
  isDismissed,
  onSubmit,
  onSkip,
  onDismiss,
}: QuestionSuggestionCardProps) {
  const [answers, setAnswers] = useState<Record<string, QuestionAnswerDraft>>({});
  const [isReceiptExpanded, setIsReceiptExpanded] = useState(false);
  const labels = UI_LABELS.ai.suggestions;
  const isSkipped = submittedResponse?.status === 'skipped';
  const isDismissedStatus = isDismissed || submittedResponse?.status === 'dismissed';
  const isResolved = isAnswered || isDismissedStatus || isSkipped;
  const canSubmit = !isStreaming && !isRunning && !isResolved && hasAnyQuestionAnswer(answers);
  const canSkip = !isStreaming && !isRunning && !isResolved && Boolean(onSkip);
  const effectiveAnswers = submittedResponse ? submittedResponse.answers : answers;

  const selectionSummaryHint = useMemo(() => {
    const hasMulti = suggestion.questions.some((q) => q.multiSelect === true);
    const hasSingle = suggestion.questions.some((q) => q.multiSelect !== true);
    if (hasMulti && hasSingle) return labels.questionMixedSelectHint;
    return hasMulti ? labels.questionMultiSelectHint : labels.questionSingleSelectHint;
  }, [
    suggestion.questions,
    labels.questionMixedSelectHint,
    labels.questionMultiSelectHint,
    labels.questionSingleSelectHint,
  ]);

  const answeredCount = useMemo(
    () =>
      suggestion.questions.filter((q) => {
        const entry = effectiveAnswers[q.id];
        return Boolean(
          entry && (entry.selectedOptions.length > 0 || entry.comment.trim().length > 0)
        );
      }).length,
    [suggestion.questions, effectiveAnswers]
  );

  const toggleOption = (questionId: string, option: string, multiSelect: boolean) => {
    if (isResolved) return;
    setAnswers((prev) => {
      const current = prev[questionId] ?? {selectedOptions: [], comment: ''};
      const exists = current.selectedOptions.includes(option);
      const nextSelected = multiSelect
        ? exists
          ? current.selectedOptions.filter((item) => item !== option)
          : [...current.selectedOptions, option]
        : exists
          ? []
          : [option];
      return {
        ...prev,
        [questionId]: {
          ...current,
          selectedOptions: nextSelected,
        },
      };
    });
  };

  const updateComment = (questionId: string, comment: string) => {
    if (isResolved) return;
    setAnswers((prev) => {
      const current = prev[questionId] ?? {selectedOptions: [], comment: ''};
      return {
        ...prev,
        [questionId]: {
          ...current,
          comment,
        },
      };
    });
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(suggestion, answers);
  };

  // Compact single-line receipt once answered, skipped, or dismissed (click to expand & review)
  if (isResolved && !isReceiptExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsReceiptExpanded(true)}
        aria-expanded={false}
        aria-label={labels.expandDetailsAria}
        className={`w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-surface-subtle transition-colors cursor-pointer ${
          isDismissedStatus ? 'opacity-65' : ''
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <HelpCircle className="h-3 w-3 shrink-0 text-text-faint" />
          <span className="text-[11px] font-medium text-text-muted truncate">
            {labels.questionLabel}
          </span>
          <span className="font-mono text-[10px] text-text-faint shrink-0 tabular-nums">
            ·{' '}
            {isSkipped
              ? labels.questionSkippedSummary
              : isAnswered && answeredCount > 0
                ? labels.questionAnsweredSummary(answeredCount, suggestion.questions.length)
                : labels.questionCount(suggestion.questions.length)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isSkipped ? (
            <span className="rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
              {labels.questionSkippedBadge}
            </span>
          ) : isAnswered ? (
            <span className="auteur-phase-aesthetic inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold">
              <Check className="h-2.5 w-2.5" />
              {labels.questionAnsweredBadge}
            </span>
          ) : (
            <span className="rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-faint">
              {labels.dismissedBadge}
            </span>
          )}
          <ChevronRight className="h-3 w-3 text-text-faint" />
        </div>
      </button>
    );
  }

  return (
    <div
      className={`${UI_TOKENS.ai.suggestionCard} ${isDismissedStatus ? 'opacity-60' : ''}`}
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border-subtle bg-surface-subtle/60 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="auteur-phase-logic inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide shrink-0">
              <HelpCircle className="h-2.5 w-2.5" />
              {labels.questionLabel}
            </span>
            <span className="font-mono text-[10px] text-text-faint tabular-nums truncate">
              {labels.questionCount(suggestion.questions.length)} · {selectionSummaryHint}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isSkipped && (
              <span className="rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                {labels.questionSkippedBadge}
              </span>
            )}
            {isAnswered && !isSkipped && (
              <span className="auteur-phase-aesthetic inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold">
                <Check className="h-2.5 w-2.5" />
                {labels.questionAnsweredBadge}
              </span>
            )}
            {isDismissedStatus && !isSkipped && (
              <span className="rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-faint">
                {labels.dismissedBadge}
              </span>
            )}
            {isResolved && (
              <button
                type="button"
                onClick={() => setIsReceiptExpanded(false)}
                aria-expanded={true}
                aria-label={labels.collapseDetailsAria}
                className="rounded-md p-0.5 text-text-faint hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {suggestion.intro && (
          <p className="text-[11.5px] leading-snug text-text-muted">{suggestion.intro}</p>
        )}
      </div>

      {/* Questions (Single or Multi-Select) + Independent Additive Note per Question */}
      <div className="px-3 py-2.5 space-y-3">
        {suggestion.questions.map((item, idx) => {
          const entry = effectiveAnswers[item.id] ?? {selectedOptions: [], comment: ''};
          const isMulti = item.multiSelect === true;
          return (
            <div key={item.id} className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium leading-snug text-text-main">
                  <span className="font-mono text-[10.5px] text-text-faint mr-1.5 tabular-nums">
                    {idx + 1}.
                  </span>
                  {item.question}
                </p>
                <span className="font-mono text-[9.5px] text-text-faint shrink-0 pt-0.5">
                  {isMulti ? labels.questionPerQuestionMultiTag : labels.questionPerQuestionSingleTag}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {item.options.map((option) => {
                  const isSelected = entry.selectedOptions.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={isResolved}
                      aria-pressed={isSelected}
                      onClick={() => toggleOption(item.id, option, isMulti)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] leading-tight text-left transition-colors ${
                        isSelected
                          ? 'auteur-phase-logic font-medium'
                          : 'border-border-main bg-surface-subtle text-text-body hover:bg-surface-hover hover:text-text-main'
                      } ${isResolved ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      {isMulti ? (
                        <span
                          aria-hidden="true"
                          className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border ${
                            isSelected
                              ? 'border-current bg-current/15'
                              : 'border-text-faint/50'
                          }`}
                        >
                          {isSelected && <Check className="h-2 w-2" />}
                        </span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full border ${
                            isSelected ? 'border-current' : 'border-text-faint/50'
                          }`}
                        >
                          {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                        </span>
                      )}
                      <span>{option}</span>
                    </button>
                  );
                })}
              </div>

              {isResolved ? (
                entry.comment.trim().length > 0 ? (
                  <p className="rounded-lg border border-border-subtle bg-surface-subtle px-2.5 py-1.5 text-[11px] text-text-body">
                    {entry.comment.trim()}
                  </p>
                ) : entry.selectedOptions.length === 0 && (isAnswered || isSkipped) ? (
                  <p className="text-[10.5px] italic text-text-faint">
                    {labels.questionSkippedNote}
                  </p>
                ) : null
              ) : (
                <input
                  type="text"
                  data-native-undo="true"
                  value={entry.comment}
                  onChange={(e) => updateComment(item.id, e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder={labels.questionCommentPlaceholder}
                  aria-label={labels.questionCommentAria(idx)}
                  className="w-full rounded-lg border border-border-subtle bg-surface-subtle/60 px-2.5 py-1.5 text-[11px] text-text-main placeholder:text-text-placeholder focus:border-border-main focus:bg-surface focus:outline-none transition-colors"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      {!isResolved && (
        <div className="px-3 py-2 border-t border-border-subtle bg-surface-subtle/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!canSubmit}
              title={!hasAnyQuestionAnswer(answers) ? labels.questionSubmitDisabledTitle : undefined}
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-text-main px-2.5 py-1 text-[11px] font-semibold text-surface hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
            >
              {isStreaming ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>{labels.finishingLabel}</span>
                </>
              ) : (
                <>
                  <Send className="h-3 w-3" />
                  <span>{labels.questionSubmitButton}</span>
                </>
              )}
            </button>

            {onSkip && (
              <button
                type="button"
                disabled={!canSkip}
                title={labels.questionSkipTitle}
                onClick={() => onSkip(suggestion)}
                className="inline-flex items-center gap-1 rounded-lg border border-border-main bg-surface px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <FastForward className="h-2.5 w-2.5" />
                <span>{labels.questionSkipButton}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onDismiss(suggestion.id)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
          >
            <X className="h-3 w-3" />
            <span>{labels.dismissButton}</span>
          </button>
        </div>
      )}
    </div>
  );
});
