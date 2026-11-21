import {memo, useMemo, useState} from 'react';
import {Check, ChevronDown, ChevronRight, HelpCircle, Loader2, Send, X} from 'lucide-react';
import type {QuestionSuggestion} from '../../../services/scriptTools.ts';
import {hasAnyQuestionAnswer, type QuestionAnswerDraft} from '../../../ui/aiAssistant.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface QuestionSuggestionCardProps {
  suggestion: QuestionSuggestion;
  isStreaming?: boolean;
  isRunning?: boolean;
  isAnswered: boolean;
  isDismissed: boolean;
  onSubmit: (
    suggestion: QuestionSuggestion,
    answers: Record<string, QuestionAnswerDraft>
  ) => void;
  onDismiss: (suggestionId: string) => void;
}

export const QuestionSuggestionCard = memo(function QuestionSuggestionCard({
  suggestion,
  isStreaming = false,
  isRunning = false,
  isAnswered,
  isDismissed,
  onSubmit,
  onDismiss,
}: QuestionSuggestionCardProps) {
  const [answers, setAnswers] = useState<Record<string, QuestionAnswerDraft>>({});
  const [isReceiptExpanded, setIsReceiptExpanded] = useState(false);
  const labels = UI_LABELS.ai.suggestions;
  const isResolved = isAnswered || isDismissed;
  const canSubmit = !isStreaming && !isRunning && !isResolved && hasAnyQuestionAnswer(answers);

  const answeredCount = useMemo(
    () =>
      suggestion.questions.filter((q) => {
        const entry = answers[q.id];
        return Boolean(
          entry && (entry.selectedOptions.length > 0 || entry.comment.trim().length > 0)
        );
      }).length,
    [suggestion.questions, answers]
  );

  const toggleOption = (questionId: string, option: string) => {
    if (isResolved) return;
    setAnswers((prev) => {
      const current = prev[questionId] ?? {selectedOptions: [], comment: ''};
      const exists = current.selectedOptions.includes(option);
      const nextSelected = exists
        ? current.selectedOptions.filter((item) => item !== option)
        : [...current.selectedOptions, option];
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

  // Compact single-line receipt once answered or dismissed (click to expand & review)
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
        <div className="flex items-center gap-1.5 min-w-0">
          <HelpCircle className="h-3 w-3 shrink-0 text-text-faint" />
          <span className="text-[11px] font-medium text-text-muted truncate">
            {labels.questionLabel}
          </span>
          <span className="font-mono text-[10px] text-text-faint shrink-0 tabular-nums">
            ·{' '}
            {isAnswered && answeredCount > 0
              ? labels.questionAnsweredSummary(answeredCount, suggestion.questions.length)
              : labels.questionCount(suggestion.questions.length)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isAnswered ? (
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
      className={`${UI_TOKENS.ai.suggestionCard} ${isDismissed ? 'opacity-60' : ''}`}
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
              {labels.questionCount(suggestion.questions.length)} · {labels.questionMultiSelectHint}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isAnswered && (
              <span className="auteur-phase-aesthetic inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold">
                <Check className="h-2.5 w-2.5" />
                {labels.questionAnsweredBadge}
              </span>
            )}
            {isDismissed && (
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

      {/* Multi-Select Questions + Inline Comment per Question */}
      <div className="px-3 py-2.5 space-y-3">
        {suggestion.questions.map((item, idx) => {
          const entry = answers[item.id] ?? {selectedOptions: [], comment: ''};
          return (
            <div key={item.id} className="space-y-1.5">
              <p className="text-xs font-medium leading-snug text-text-main">
                <span className="font-mono text-[10.5px] text-text-faint mr-1.5 tabular-nums">
                  {idx + 1}.
                </span>
                {item.question}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {item.options.map((option) => {
                  const isSelected = entry.selectedOptions.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={isResolved}
                      aria-pressed={isSelected}
                      onClick={() => toggleOption(item.id, option)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] leading-tight text-left transition-colors ${
                        isSelected
                          ? 'auteur-phase-logic font-medium'
                          : 'border-border-main bg-surface-subtle text-text-body hover:bg-surface-hover hover:text-text-main'
                      } ${isResolved ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5 shrink-0" />}
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
                ) : entry.selectedOptions.length === 0 && isAnswered ? (
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
