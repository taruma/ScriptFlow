import {memo, useCallback, type KeyboardEvent, type MouseEvent} from 'react';
import {ChevronDown, ChevronRight, GripVertical, Plus, Trash2} from 'lucide-react';
import type {HistoryCommitMode} from '../core/history.ts';
import type {
  AestheticToken,
  BeatCameraLink,
  ExecutionBeat,
  LintDiagnostic,
} from '../core/types.ts';
import {UI_LABELS} from '../ui/labels.ts';
import type {LiveBeatPatchIndicator} from '../ui/patchIndicators.ts';
import type {LiveBeatQuickScanIndicator} from '../ui/quickScanIndicators.ts';
import {
  EMPTY_BEAT_PATCH_INDICATORS,
  EMPTY_BEAT_QUICK_SCAN_INDICATORS,
} from '../ui/referenceStability.ts';
import {AiPatchIndicator} from './AiPatchIndicator.tsx';
import {AiQuickScanIndicator} from './AiQuickScanIndicator.tsx';
import {DiagnosticDot} from './DiagnosticDot.tsx';
import {LiveHighlightedEditor} from './LiveHighlightedEditor.tsx';
import type {SortableItemBinding} from './SortableList.tsx';
import {PendingSubStateRow, SubStateWaterfallItem} from './execution/SubStateWaterfallItem.tsx';
import {useSubStateDrafts} from './execution/useSubStateDrafts.ts';

interface ExecutionBeatRowProps {
  beat: ExecutionBeat;
  cameraLink?: BeatCameraLink;
  connectsToNext: boolean;
  aestheticTokens: AestheticToken[];
  diagnostics: LintDiagnostic[];
  patchIndicators?: readonly LiveBeatPatchIndicator[];
  quickScanIndicators?: readonly LiveBeatQuickScanIndicator[];
  historyRevision: number;
  readOnly?: boolean;
  collapsed: boolean;
  onToggleCollapse: (beatIndex: number) => void;
  autoFocusEdit?: boolean;
  onClearAutoFocus?: () => void;
  onUpdateSubState: (
    beatIndex: number,
    subStateIndex: number,
    nextSubStateRaw: string,
    mode?: HistoryCommitMode
  ) => void;
  onInsertSubState: (
    beatIndex: number,
    afterSubStateIndex: number,
    starterText: string,
    mode?: HistoryCommitMode
  ) => void;
  onDeleteSubState: (beatIndex: number, subStateIndex: number) => void;
  onMergeSubState: (beatIndex: number, subStateIndex: number) => void;
  onReorderSubState: (
    beatIndex: number,
    fromSubStateIndex: number,
    toSubStateIndex: number
  ) => void;
  onDeleteBeat: (beatIndex: number) => void;
  drag?: SortableItemBinding;
}

export const ExecutionBeatRow = memo(function ExecutionBeatRow({
  beat,
  cameraLink,
  connectsToNext,
  aestheticTokens,
  diagnostics,
  patchIndicators = EMPTY_BEAT_PATCH_INDICATORS,
  quickScanIndicators = EMPTY_BEAT_QUICK_SCAN_INDICATORS,
  historyRevision,
  readOnly = false,
  collapsed,
  onToggleCollapse,
  autoFocusEdit = false,
  onClearAutoFocus,
  onUpdateSubState,
  onInsertSubState,
  onDeleteSubState,
  onMergeSubState,
  onReorderSubState,
  onDeleteBeat,
  drag,
}: ExecutionBeatRowProps) {
  const {
    focusedStepIndex,
    activeDraft,
    pendingAfterIndex,
    pendingDraft,
    isBeatFocused,
    pendingRef,
    registerStepRef,
    openPendingStepAtEnd,
    handleStepFocus,
    handleStepChange,
    handleStepBlur,
    handleStepKeyDown,
    handleDeleteStep,
    handlePendingChange,
    handlePendingBlur,
    handlePendingKeyDown,
  } = useSubStateDrafts({
    beat,
    historyRevision,
    readOnly,
    collapsed,
    autoFocusEdit,
    onClearAutoFocus,
    onUpdateSubState,
    onInsertSubState,
    onDeleteSubState,
    onMergeSubState,
    onReorderSubState,
  });

  const handleToggleCollapse = useCallback(() => {
    onToggleCollapse(beat.index);
  }, [onToggleCollapse, beat.index]);

  const handleCollapsedToggleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      handleToggleCollapse();
    },
    [handleToggleCollapse]
  );

  const handleCollapsedKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggleCollapse();
      }
    },
    [handleToggleCollapse]
  );

  const handleDeleteBeatClick = useCallback(() => {
    onDeleteBeat(beat.index);
  }, [onDeleteBeat, beat.index]);

  const handleCollapsedDeleteClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onDeleteBeat(beat.index);
    },
    [onDeleteBeat, beat.index]
  );

  const handleAddStepMouseDown = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      openPendingStepAtEnd();
    },
    [openPendingStepAtEnd]
  );

  const handleLeadChange = useCallback(
    (val: string) => {
      handleStepChange(0, val);
    },
    [handleStepChange]
  );

  const handleLeadFocus = useCallback(() => {
    handleStepFocus(0);
  }, [handleStepFocus]);

  const handleLeadBlur = useCallback(() => {
    handleStepBlur(0);
  }, [handleStepBlur]);

  const handleLeadKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      handleStepKeyDown(0, e);
    },
    [handleStepKeyDown]
  );

  const isDragging = Boolean(drag?.isDragging);
  const isAnyDragging = Boolean(drag?.isAnyDragging);
  const handleProps = !readOnly && drag ? drag.getHandleProps(isBeatFocused && !collapsed) : null;

  const connectsFromPrevious = Boolean(cameraLink?.connectsFromPrevious) && !isAnyDragging;
  const showConnectsToNext = connectsToNext && !isAnyDragging;
  const subStates = beat.subStates;
  const leadNode = subStates[0];
  const tailNodes = subStates.slice(1);
  const showWaterfallRail = tailNodes.length > 0 || pendingAfterIndex !== null;
  const collapsedPreviewText = collapsed ? beat.raw.trim() : '';

  return (
    <div
      id={`execution-beat-${beat.index}`}
      className={`group/beat relative grid grid-cols-[28px_minmax(0,1fr)] sm:grid-cols-[46px_minmax(0,1fr)_24px] items-stretch gap-1.5 transition-opacity ${
        isDragging ? 'opacity-30' : 'opacity-100'
      }`}
    >
      {/* Left Margin: Camera Continuity Rail + Beat Index + Drag Handle */}
      <div
        className={`relative flex items-start justify-end gap-0.5 pr-0.5 select-none ${
          collapsed ? 'pt-1.5' : 'pt-2'
        }`}
      >
        {connectsFromPrevious && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute right-[12px] top-0 w-[2px] opacity-45 ${
              collapsed ? 'h-[8px]' : 'h-[10px]'
            }`}
            style={{backgroundColor: 'var(--tok-continuity)'}}
          />
        )}
        {showConnectsToNext && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute right-[12px] bottom-0 w-[2px] opacity-45 ${
              collapsed ? 'top-[23px]' : 'top-[25px]'
            }`}
            style={{backgroundColor: 'var(--tok-continuity)'}}
          />
        )}

        {handleProps && (
          <div
            {...handleProps}
            title={UI_LABELS.execution.dragReorderTitle}
            aria-label={UI_LABELS.execution.dragReorderTitle}
            className="mt-0.5 flex h-4 w-3.5 items-center justify-center rounded text-text-faint opacity-0 group-hover/beat:opacity-100 focus-visible:opacity-100 hover:bg-surface-muted hover:text-text-main cursor-grab active:cursor-grabbing transition-opacity"
          >
            <GripVertical className="h-3 w-3" />
          </div>
        )}

        <span className="relative z-10 inline-flex min-w-[22px] justify-center rounded bg-app px-1 py-0.5 font-mono text-[10.5px] font-medium tabular-nums text-text-faint group-hover/beat:text-text-muted">
          S{beat.index}
        </span>
      </div>

      {/* Main Beat Card — Collapsed 2-Line Chained Preview vs. Always-Formatted Option A Waterfall Stack */}
      {collapsed ? (
        <div
          role="button"
          tabIndex={0}
          aria-expanded={false}
          title={UI_LABELS.execution.expandBeatTitle(beat.index)}
          onClick={handleToggleCollapse}
          onKeyDown={handleCollapsedKeyDown}
          className={`relative min-w-0 rounded-lg border px-3 py-1.5 transition-colors cursor-pointer select-none ${
            isDragging
              ? 'border-dashed border-text-muted/60 bg-surface-subtle/60'
              : patchIndicators.length > 0
                ? `bg-surface hover:bg-surface-subtle/50 ${
                    patchIndicators.some((item) => item.kind === 'delete')
                      ? 'auteur-ai-patch-card-delete'
                      : 'auteur-ai-patch-card-modify'
                  }`
                : 'border-border-main bg-surface hover:border-text-faint/50 hover:bg-surface-subtle/50'
          }`}
        >
          <div className="flex items-start gap-1.5">
            <button
              type="button"
              onClick={handleCollapsedToggleClick}
              title={UI_LABELS.execution.expandBeatTitle(beat.index)}
              aria-label={UI_LABELS.execution.expandBeatTitle(beat.index)}
              aria-expanded={false}
              className="-ml-1 mt-[2px] flex shrink-0 items-center justify-center rounded p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            <div className="min-w-0 flex-1">
              {collapsedPreviewText ? (
                <p className="font-script auteur-script-size leading-[1.44] text-text-muted break-words line-clamp-2">
                  {collapsedPreviewText}
                </p>
              ) : (
                <p className="font-script auteur-script-size leading-[1.44] text-text-faint italic">
                  {UI_LABELS.execution.emptySummary}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5 pt-[1px]">
              {subStates.length > 0 && (
                <span className="font-mono text-[10.5px] text-text-faint tabular-nums whitespace-nowrap">
                  {UI_LABELS.execution.stepsCount(subStates.length)}
                </span>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={handleCollapsedDeleteClick}
                  title={UI_LABELS.execution.deleteBeatTitle(beat.index)}
                  aria-label={UI_LABELS.execution.deleteBeatTitle(beat.index)}
                  className="rounded-md p-1 text-text-faint opacity-0 group-hover/beat:opacity-100 focus-visible:opacity-100 hover:bg-surface-muted hover:text-red-500 transition-opacity cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`relative min-w-0 rounded-lg border px-3 py-2 transition-colors ${
            isDragging
              ? 'border-dashed border-text-muted/60 bg-surface-subtle/60'
              : isBeatFocused
                ? 'border-text-muted/60 bg-surface shadow-xs'
                : patchIndicators.length > 0
                  ? `bg-surface ${
                      patchIndicators.some((item) => item.kind === 'delete')
                        ? 'auteur-ai-patch-card-delete'
                        : 'auteur-ai-patch-card-modify'
                    }`
                  : 'border-border-main bg-surface hover:border-text-faint/50'
          }`}
        >
          {/* Compact Hover Actions (Add Step + Delete Beat — zero idle vertical footprint) */}
          {!readOnly && (
            <div className="absolute right-2 top-1.5 z-10 flex items-center gap-0.5 opacity-0 group-hover/beat:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onMouseDown={handleAddStepMouseDown}
                title={UI_LABELS.execution.addStep}
                aria-label={UI_LABELS.execution.addStep}
                className="rounded-md p-1 text-text-faint hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDeleteBeatClick}
                title={UI_LABELS.execution.deleteBeatTitle(beat.index)}
                aria-label={UI_LABELS.execution.deleteBeatTitle(beat.index)}
                className="rounded-md p-1 text-text-faint hover:bg-surface-muted hover:text-red-500 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Step 1 — Lead Sub-State (always formatted, directly editable) + Per-Macro-State Collapse Trigger */}
          {leadNode && (
            <div
              id={`execution-beat-${beat.index}-substate-0`}
              className={`group/step relative flex items-start gap-1.5 ${readOnly ? '' : 'pr-12'}`}
            >
              <button
                type="button"
                onClick={handleToggleCollapse}
                title={UI_LABELS.execution.collapseBeatTitle(beat.index)}
                aria-label={UI_LABELS.execution.collapseBeatTitle(beat.index)}
                aria-expanded={true}
                className="-ml-1 mt-[2px] flex shrink-0 items-center justify-center rounded p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              <span
                aria-hidden="true"
                className="auteur-substate-id mt-[3px] shrink-0 select-none font-mono text-[10px] font-medium tabular-nums leading-[1.35] text-text-faint/75 group-hover/step:text-text-muted group-focus-within/step:text-text-muted transition-colors"
              >
                S{beat.index}.1
              </span>

              <div className="min-w-0 flex-1 flex items-baseline gap-2">
                <div className="min-w-0 flex-1">
                  <LiveHighlightedEditor
                    ref={registerStepRef(0)}
                    value={focusedStepIndex === 0 ? activeDraft : leadNode.raw}
                    readOnly={readOnly}
                    onChange={handleLeadChange}
                    mode="substate"
                    aestheticTokens={aestheticTokens}
                    isLead
                    ariaLabel={UI_LABELS.execution.leadStepAria(beat.index)}
                    placeholder={UI_LABELS.execution.leadPlaceholder}
                    onFocus={handleLeadFocus}
                    onBlur={handleLeadBlur}
                    onKeyDown={handleLeadKeyDown}
                  />
                </div>

                {leadNode.kind === 'camera' &&
                  leadNode.body.length === 0 &&
                  focusedStepIndex !== 0 && (
                    <span className="pointer-events-none select-none font-mono text-[10.5px] italic text-text-faint shrink-0">
                      {UI_LABELS.execution.holdFraming}
                    </span>
                  )}
              </div>
            </div>
          )}

          {/* Steps 2..k — Waterfall Indented Rail (always formatted, each step directly editable) */}
          {showWaterfallRail && (
            <div className="auteur-waterfall-rail mt-1.5 ml-5 pl-2.5 space-y-0.5">
              {pendingAfterIndex === 0 && !readOnly && (
                <PendingSubStateRow
                  beatIndex={beat.index}
                  pendingRef={pendingRef}
                  value={pendingDraft}
                  aestheticTokens={aestheticTokens}
                  onChange={handlePendingChange}
                  onBlur={handlePendingBlur}
                  onKeyDown={handlePendingKeyDown}
                />
              )}

              {tailNodes.map((sub, offset) => {
                const stepIdx = offset + 1;
                const showPendingAfter = pendingAfterIndex === stepIdx;
                return (
                  <SubStateWaterfallItem
                    key={`step-${stepIdx}`}
                    beatIndex={beat.index}
                    stepIndex={stepIdx}
                    value={focusedStepIndex === stepIdx ? activeDraft : sub.raw}
                    readOnly={readOnly}
                    aestheticTokens={aestheticTokens}
                    inputRef={registerStepRef(stepIdx)}
                    onStepChange={handleStepChange}
                    onStepFocus={handleStepFocus}
                    onStepBlur={handleStepBlur}
                    onStepKeyDown={handleStepKeyDown}
                    onDeleteStep={handleDeleteStep}
                    showPendingAfter={showPendingAfter}
                    pendingRef={pendingRef}
                    pendingDraft={showPendingAfter ? pendingDraft : ''}
                    onPendingChange={handlePendingChange}
                    onPendingBlur={handlePendingBlur}
                    onPendingKeyDown={handlePendingKeyDown}
                  />
                );
              })}
            </div>
          )}

          {/* Focused-only step append + chaining hint (zero layout height when resting) */}
          {isBeatFocused && !readOnly && (
            <div className="mt-1.5 ml-5 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border-subtle/80">
              <button
                type="button"
                onMouseDown={handleAddStepMouseDown}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] text-text-faint hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                <span>{UI_LABELS.execution.addStep}</span>
              </button>

              <span className="font-sans text-[10px] text-text-faint select-none">
                {UI_LABELS.execution.chainHintLead}{' '}
                <code className="font-mono">{UI_LABELS.execution.chainHintArrow}</code>{' '}
                {UI_LABELS.execution.chainHintTail}
                {subStates.length > 1 && (
                  <>
                    {' '}
                    · <code className="font-mono">{UI_LABELS.execution.moveHintShortcut}</code>{' '}
                    {UI_LABELS.execution.moveHintTail}
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Right Margin Diagnostics, Quick Scan Indicator & Quiet AI Patch Indicator (zero layout shift; hidden on narrow < 640px) */}
      <div className="hidden sm:flex w-6 flex-col items-center gap-1 pt-1.5">
        <AiPatchIndicator phase="execution" indicators={patchIndicators} />
        {patchIndicators.length === 0 && (
          <AiQuickScanIndicator beatIndex={beat.index} indicators={quickScanIndicators} />
        )}
        <DiagnosticDot diagnostics={diagnostics} />
      </div>
    </div>
  );
});
