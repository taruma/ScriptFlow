import {memo, useCallback, type KeyboardEvent, type MouseEvent, type Ref} from 'react';
import {X} from 'lucide-react';
import type {AestheticToken} from '../../core/types.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {LiveHighlightedEditor} from '../LiveHighlightedEditor.tsx';

function preventMouseDown(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

export interface PendingSubStateRowProps {
  beatIndex: number;
  pendingRef: Ref<HTMLTextAreaElement>;
  value: string;
  aestheticTokens: AestheticToken[];
  onChange: (nextValue: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

/**
 * Memoized pending `↳` Sub-State row rendered when splitting or appending a new Sub-State
 * before the user commits its first non-whitespace character.
 */
export const PendingSubStateRow = memo(function PendingSubStateRow({
  beatIndex,
  pendingRef,
  value,
  aestheticTokens,
  onChange,
  onBlur,
  onKeyDown,
}: PendingSubStateRowProps) {
  return (
    <div className="flex items-start gap-1.5">
      <span
        aria-hidden="true"
        className="auteur-tok-arrow mt-[1px] select-none text-[11px] font-bold opacity-85 shrink-0"
      >
        ↳
      </span>
      <div className="min-w-0 flex-1">
        <LiveHighlightedEditor
          ref={pendingRef}
          value={value}
          onChange={onChange}
          mode="substate"
          aestheticTokens={aestheticTokens}
          ariaLabel={UI_LABELS.execution.newStepAria(beatIndex)}
          placeholder={UI_LABELS.execution.stepPlaceholder}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
});

export interface SubStateWaterfallItemProps {
  beatIndex: number;
  stepIndex: number;
  value: string;
  readOnly: boolean;
  aestheticTokens: AestheticToken[];
  inputRef: (el: HTMLTextAreaElement | null) => void;
  onStepChange: (index: number, nextValue: string) => void;
  onStepFocus: (index: number) => void;
  onStepBlur: (index: number) => void;
  onStepKeyDown: (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onDeleteStep: (index: number) => void;
  showPendingAfter: boolean;
  pendingRef: Ref<HTMLTextAreaElement>;
  pendingDraft: string;
  onPendingChange: (nextValue: string) => void;
  onPendingBlur: () => void;
  onPendingKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

/**
 * Memoized individual `↳` Sub-State waterfall row wrapping `LiveHighlightedEditor`,
 * hover remove button, step-level keyboard bindings, and optional trailing pending row.
 */
export const SubStateWaterfallItem = memo(function SubStateWaterfallItem({
  beatIndex,
  stepIndex,
  value,
  readOnly,
  aestheticTokens,
  inputRef,
  onStepChange,
  onStepFocus,
  onStepBlur,
  onStepKeyDown,
  onDeleteStep,
  showPendingAfter,
  pendingRef,
  pendingDraft,
  onPendingChange,
  onPendingBlur,
  onPendingKeyDown,
}: SubStateWaterfallItemProps) {
  const handleChange = useCallback(
    (nextValue: string) => {
      onStepChange(stepIndex, nextValue);
    },
    [onStepChange, stepIndex]
  );

  const handleFocus = useCallback(() => {
    onStepFocus(stepIndex);
  }, [onStepFocus, stepIndex]);

  const handleBlur = useCallback(() => {
    onStepBlur(stepIndex);
  }, [onStepBlur, stepIndex]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      onStepKeyDown(stepIndex, event);
    },
    [onStepKeyDown, stepIndex]
  );

  const handleDeleteClick = useCallback(() => {
    onDeleteStep(stepIndex);
  }, [onDeleteStep, stepIndex]);

  return (
    <div className="space-y-0.5">
      <div
        id={`execution-beat-${beatIndex}-substate-${stepIndex}`}
        className={`group/step relative flex items-start gap-1.5 ${readOnly ? '' : 'pr-5'}`}
      >
        <span
          aria-hidden="true"
          className="auteur-tok-arrow mt-[1px] select-none text-[11px] font-bold opacity-85 shrink-0"
        >
          ↳
        </span>
        <div className="min-w-0 flex-1">
          <LiveHighlightedEditor
            ref={inputRef}
            value={value}
            readOnly={readOnly}
            onChange={handleChange}
            mode="substate"
            aestheticTokens={aestheticTokens}
            ariaLabel={UI_LABELS.execution.stepAria(beatIndex, stepIndex + 1)}
            placeholder={UI_LABELS.execution.stepPlaceholder}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
        </div>
        {!readOnly && (
          <button
            type="button"
            onMouseDown={preventMouseDown}
            onClick={handleDeleteClick}
            title={UI_LABELS.execution.removeStepTitle}
            aria-label={UI_LABELS.execution.removeStepAria(stepIndex + 1, beatIndex)}
            className="absolute right-0 top-0.5 rounded p-0.5 text-text-faint opacity-0 group-hover/step:opacity-100 focus-visible:opacity-100 hover:bg-surface-muted hover:text-text-main transition-opacity cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {showPendingAfter && !readOnly && (
        <PendingSubStateRow
          beatIndex={beatIndex}
          pendingRef={pendingRef}
          value={pendingDraft}
          aestheticTokens={aestheticTokens}
          onChange={onPendingChange}
          onBlur={onPendingBlur}
          onKeyDown={onPendingKeyDown}
        />
      )}
    </div>
  );
});
