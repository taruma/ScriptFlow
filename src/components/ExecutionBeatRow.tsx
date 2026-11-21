import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {ChevronDown, ChevronRight, GripVertical, Plus, Trash2, X} from 'lucide-react';
import type {HistoryCommitMode} from '../core/history.ts';
import type {
  AestheticToken,
  BeatCameraLink,
  ExecutionBeat,
  LintDiagnostic,
} from '../core/types.ts';
import {
  computeSubStateMoveTarget,
  matchSubStateMoveShortcut,
  reconcileStepFocusOnDelete,
} from '../ui/beatFocus.ts';
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

const LIVE_ARROW_SPLIT_REGEX = /^(.*?)\s*(?:->|→)\s+(.*)$/;

interface PendingFocusTarget {
  type: 'step' | 'pending';
  index: number;
  caret: number;
  selectionEnd?: number;
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
  const [focusedStepIndex, setFocusedStepIndex] = useState<number | null>(null);
  const [activeDraft, setActiveDraft] = useState<string>('');
  const [pendingAfterIndex, setPendingAfterIndex] = useState<number | null>(null);
  const [pendingDraft, setPendingDraft] = useState<string>('');

  const stepRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const stepRefCallbacks = useRef<Map<number, (el: HTMLTextAreaElement | null) => void>>(new Map());
  const pendingRef = useRef<HTMLTextAreaElement | null>(null);
  const nextFocusRef = useRef<PendingFocusTarget | null>(null);
  const lastHistoryRevisionRef = useRef<number>(historyRevision);

  const registerStepRef = useCallback((index: number) => {
    let callback = stepRefCallbacks.current.get(index);
    if (!callback) {
      callback = (el: HTMLTextAreaElement | null) => {
        if (el) {
          stepRefs.current.set(index, el);
        } else {
          stepRefs.current.delete(index);
        }
      };
      stepRefCallbacks.current.set(index, callback);
    }
    return callback;
  }, []);

  // Apply queued focus + exact caret position right after React commits DOM updates
  useLayoutEffect(() => {
    const target = nextFocusRef.current;
    if (!target) return;

    if (target.type === 'pending') {
      const el = pendingRef.current;
      if (el) {
        nextFocusRef.current = null;
        el.focus();
        const pos = Math.min(target.caret, el.value.length);
        el.setSelectionRange(pos, pos);
      }
      return;
    }

    const el = stepRefs.current.get(target.index);
    if (el) {
      nextFocusRef.current = null;
      el.focus();
      const start = Math.min(target.caret, el.value.length);
      const end =
        target.selectionEnd !== undefined ? Math.min(target.selectionEnd, el.value.length) : start;
      el.setSelectionRange(start, end);
    }
  });

  // Focus newly inserted beat immediately on the last step (e.g. "[ACT] ")
  useEffect(() => {
    if (!autoFocusEdit || collapsed) return;
    const lastIdx = Math.max(0, beat.subStates.length - 1);
    const initialText = beat.subStates[lastIdx]?.raw ?? '';
    setFocusedStepIndex(lastIdx);
    setActiveDraft(initialText);
    nextFocusRef.current = {type: 'step', index: lastIdx, caret: initialText.length};
    onClearAutoFocus?.();
  }, [autoFocusEdit, collapsed, beat.subStates, onClearAutoFocus]);

  // Clear local step focus when collapsed
  useEffect(() => {
    if (!collapsed) return;
    setFocusedStepIndex(null);
    setPendingAfterIndex(null);
    setPendingDraft('');
    nextFocusRef.current = null;
  }, [collapsed]);

  const handleToggleCollapse = useCallback(() => {
    onToggleCollapse(beat.index);
  }, [onToggleCollapse, beat.index]);

  // Reconcile focus & active drafts on external sub-state shrink or Undo/Redo history jumps
  useEffect(() => {
    const isHistoryJump = lastHistoryRevisionRef.current !== historyRevision;
    lastHistoryRevisionRef.current = historyRevision;

    if (isHistoryJump && pendingAfterIndex !== null) {
      const targetIdx =
        beat.subStates.length > 0 ? Math.min(pendingAfterIndex, beat.subStates.length - 1) : null;
      setPendingAfterIndex(null);
      setPendingDraft('');
      if (targetIdx !== null) {
        const syncedRaw = beat.subStates[targetIdx]?.raw ?? '';
        setFocusedStepIndex(targetIdx);
        setActiveDraft(syncedRaw);
        nextFocusRef.current = {type: 'step', index: targetIdx, caret: syncedRaw.length};
      }
      return;
    }

    if (pendingAfterIndex !== null && pendingAfterIndex >= beat.subStates.length) {
      setPendingAfterIndex(null);
      setPendingDraft('');
    }

    if (focusedStepIndex !== null) {
      if (beat.subStates.length === 0) {
        setFocusedStepIndex(null);
        setActiveDraft('');
        return;
      }
      if (focusedStepIndex >= beat.subStates.length) {
        const clamped = beat.subStates.length - 1;
        const syncedRaw = beat.subStates[clamped]?.raw ?? '';
        setFocusedStepIndex(clamped);
        setActiveDraft(syncedRaw);
        if (isHistoryJump) {
          nextFocusRef.current = {type: 'step', index: clamped, caret: syncedRaw.length};
        }
        return;
      }
      if (isHistoryJump) {
        const syncedRaw = beat.subStates[focusedStepIndex]?.raw ?? '';
        setActiveDraft(syncedRaw);
      }
    }
  }, [historyRevision, beat.subStates, focusedStepIndex, pendingAfterIndex]);

  const isBeatFocused = focusedStepIndex !== null || pendingAfterIndex !== null;

  const openPendingStepAfter = (afterIndex: number) => {
    if (readOnly) return;
    setFocusedStepIndex(null);
    setPendingAfterIndex(afterIndex);
    setPendingDraft('');
    nextFocusRef.current = {type: 'pending', index: afterIndex, caret: 0};
  };

  const handleStepFocus = (index: number, raw: string) => {
    if (readOnly) return;
    setPendingAfterIndex(null);
    setPendingDraft('');
    if (focusedStepIndex !== index) {
      setFocusedStepIndex(index);
      setActiveDraft(raw);
    }
  };

  const handleDeleteStep = (stepIdx: number) => {
    if (readOnly) return;
    const subStateRaws = beat.subStates.map((s) => s.raw);
    const activeEl =
      focusedStepIndex !== null
        ? stepRefs.current.get(focusedStepIndex)
        : pendingAfterIndex !== null
          ? pendingRef.current
          : null;
    const currentCaret = activeEl?.selectionStart ?? undefined;

    const reconciled = reconcileStepFocusOnDelete(
      {
        focusedStepIndex,
        activeDraft,
        pendingAfterIndex,
        pendingDraft,
      },
      subStateRaws,
      stepIdx,
      currentCaret
    );

    setFocusedStepIndex(reconciled.focusedStepIndex);
    setActiveDraft(reconciled.activeDraft);
    setPendingAfterIndex(reconciled.pendingAfterIndex);
    if (reconciled.pendingAfterIndex === null && pendingAfterIndex !== null) {
      setPendingDraft('');
    }
    nextFocusRef.current = reconciled.nextFocusTarget;
    onDeleteSubState(beat.index, stepIdx);
  };

  const handleStepChange = (index: number, nextValue: string) => {
    if (readOnly) return;
    // Strip accidental raw newlines inside a single Sub-State step
    const singleLine = nextValue.replace(/\r?\n/g, ' ');

    // Live "-> " / "→ " split trigger: instantly forks into the next ↳ waterfall row
    const splitMatch = LIVE_ARROW_SPLIT_REGEX.exec(singleLine);
    if (splitMatch) {
      const left = splitMatch[1].trim();
      const right = splitMatch[2];

      if (left.length > 0 && right.trim().length > 0) {
        const rightTrimmed = right.trim();
        onUpdateSubState(beat.index, index, `${left} -> ${rightTrimmed}`, 'checkpoint');
        setFocusedStepIndex(index + 1);
        setActiveDraft(rightTrimmed);
        nextFocusRef.current = {type: 'step', index: index + 1, caret: rightTrimmed.length};
        return;
      }

      if (left.length > 0 && right.trim().length === 0) {
        onUpdateSubState(beat.index, index, left, 'checkpoint');
        openPendingStepAfter(index);
        return;
      }
    }

    setActiveDraft(singleLine);
    if (singleLine.trim().length > 0) {
      onUpdateSubState(beat.index, index, singleLine, 'coalesce');
    }
  };

  const handleStepBlur = (index: number) => {
    if (readOnly) return;
    const trimmed = activeDraft.trim();
    if (focusedStepIndex === index) {
      setFocusedStepIndex(null);
      if (trimmed.length === 0) {
        onDeleteSubState(beat.index, index);
      } else if (trimmed !== (beat.subStates[index]?.raw ?? '')) {
        onUpdateSubState(beat.index, index, trimmed, 'coalesce');
      }
    }
  };

  const handleStepKeyDown = (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.currentTarget.blur();
      }
      return;
    }
    const el = event.currentTarget;
    const caretStart = el.selectionStart ?? 0;
    const caretEnd = el.selectionEnd ?? 0;
    const hasSelection = caretStart !== caretEnd;
    const currentText = focusedStepIndex === index ? activeDraft : (beat.subStates[index]?.raw ?? '');

    if (event.key === 'Escape') {
      event.preventDefault();
      el.blur();
      return;
    }

    // Alt+ArrowUp / Alt+ArrowDown reorders this Sub-State within the current Macro-State
    const moveDelta = matchSubStateMoveShortcut(event);
    if (moveDelta !== null) {
      event.preventDefault();
      const trimmed = currentText.trim();
      if (trimmed.length === 0) return;

      const targetIndex = computeSubStateMoveTarget(index, beat.subStates.length, moveDelta);
      if (targetIndex === null) return;

      setFocusedStepIndex(targetIndex);
      setActiveDraft(trimmed);
      nextFocusRef.current = {
        type: 'step',
        index: targetIndex,
        caret: Math.min(caretStart, trimmed.length),
        selectionEnd: Math.min(caretEnd, trimmed.length),
      };
      onReorderSubState(beat.index, index, targetIndex);
      return;
    }

    // Enter splits/adds a new ↳ waterfall step below (like Notion / Obsidian)
    if (event.key === 'Enter') {
      event.preventDefault();

      if (currentText.trim().length === 0) {
        el.blur();
        return;
      }

      const before = currentText.slice(0, caretStart).trim();
      const after = currentText.slice(caretEnd).trim();

      if (before.length > 0 && after.length > 0) {
        onUpdateSubState(beat.index, index, `${before} -> ${after}`, 'checkpoint');
        setFocusedStepIndex(index + 1);
        setActiveDraft(after);
        nextFocusRef.current = {type: 'step', index: index + 1, caret: 0};
      } else if (before.length > 0) {
        onUpdateSubState(beat.index, index, before, 'checkpoint');
        openPendingStepAfter(index);
      } else {
        openPendingStepAfter(index);
      }
      return;
    }

    // Backspace at column 0 of an indented ↳ step merges it cleanly into the previous step
    if (event.key === 'Backspace' && !hasSelection && caretStart === 0 && index > 0) {
      event.preventDefault();
      const prevRaw = beat.subStates[index - 1]?.raw ?? '';
      const currTrimmed = currentText.trim();

      if (currTrimmed.length === 0) {
        onDeleteSubState(beat.index, index);
        setFocusedStepIndex(index - 1);
        setActiveDraft(prevRaw);
        nextFocusRef.current = {type: 'step', index: index - 1, caret: prevRaw.length};
      } else {
        onMergeSubState(beat.index, index);
        const merged = `${prevRaw} ${currTrimmed}`;
        setFocusedStepIndex(index - 1);
        setActiveDraft(merged);
        nextFocusRef.current = {type: 'step', index: index - 1, caret: prevRaw.length + 1};
      }
      return;
    }

    // ArrowUp at very start navigates to previous waterfall step
    if (event.key === 'ArrowUp' && !hasSelection && caretStart === 0 && index > 0) {
      event.preventDefault();
      const prevRaw = beat.subStates[index - 1]?.raw ?? '';
      setFocusedStepIndex(index - 1);
      setActiveDraft(prevRaw);
      nextFocusRef.current = {type: 'step', index: index - 1, caret: prevRaw.length};
      return;
    }

    // ArrowDown at very end navigates to next waterfall step
    if (
      event.key === 'ArrowDown' &&
      !hasSelection &&
      caretStart === currentText.length &&
      index < beat.subStates.length - 1
    ) {
      event.preventDefault();
      const nextRaw = beat.subStates[index + 1]?.raw ?? '';
      setFocusedStepIndex(index + 1);
      setActiveDraft(nextRaw);
      nextFocusRef.current = {type: 'step', index: index + 1, caret: 0};
    }
  };

  const handlePendingChange = (nextValue: string) => {
    const singleLine = nextValue.replace(/\r?\n/g, ' ');
    setPendingDraft(singleLine);

    if (singleLine.trim().length > 0 && pendingAfterIndex !== null) {
      const insertAfter = pendingAfterIndex;
      const newStepIdx = insertAfter + 1;
      const commitMode: HistoryCommitMode = singleLine.trim().length <= 2 ? 'coalesce' : 'checkpoint';
      onInsertSubState(beat.index, insertAfter, singleLine, commitMode);
      setPendingAfterIndex(null);
      setPendingDraft('');
      setFocusedStepIndex(newStepIdx);
      setActiveDraft(singleLine);
      nextFocusRef.current = {type: 'step', index: newStepIdx, caret: singleLine.length};
    }
  };

  const handlePendingKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault();
      setPendingAfterIndex(null);
      setPendingDraft('');
      return;
    }
    if (event.key === 'Backspace' && pendingDraft.length === 0 && pendingAfterIndex !== null) {
      event.preventDefault();
      const targetIdx = pendingAfterIndex;
      const prevRaw = beat.subStates[targetIdx]?.raw ?? '';
      setPendingAfterIndex(null);
      setPendingDraft('');
      setFocusedStepIndex(targetIdx);
      setActiveDraft(prevRaw);
      nextFocusRef.current = {type: 'step', index: targetIdx, caret: prevRaw.length};
    }
  };

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

  const renderPendingRow = () => (
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
          value={pendingDraft}
          onChange={handlePendingChange}
          mode="substate"
          aestheticTokens={aestheticTokens}
          ariaLabel={UI_LABELS.execution.newStepAria(beat.index)}
          placeholder={UI_LABELS.execution.stepPlaceholder}
          onBlur={() => {
            if (pendingDraft.trim().length === 0) {
              setPendingAfterIndex(null);
              setPendingDraft('');
            }
          }}
          onKeyDown={handlePendingKeyDown}
        />
      </div>
    </div>
  );

  return (
    <div
      id={`execution-beat-${beat.index}`}
      className={`group/beat relative grid grid-cols-[46px_minmax(0,1fr)_24px] items-stretch gap-1.5 transition-opacity ${
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
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleToggleCollapse();
            }
          }}
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
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCollapse();
              }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBeat(beat.index);
                  }}
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
                onMouseDown={(e) => {
                  e.preventDefault();
                  openPendingStepAfter(Math.max(0, subStates.length - 1));
                }}
                title={UI_LABELS.execution.addStep}
                aria-label={UI_LABELS.execution.addStep}
                className="rounded-md p-1 text-text-faint hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteBeat(beat.index)}
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
            <div className={`relative flex items-start gap-1.5 ${readOnly ? '' : 'pr-12'}`}>
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

              <div className="min-w-0 flex-1 flex items-baseline gap-2">
                <div className="min-w-0 flex-1">
                  <LiveHighlightedEditor
                    ref={registerStepRef(0)}
                    value={focusedStepIndex === 0 ? activeDraft : leadNode.raw}
                    readOnly={readOnly}
                    onChange={(val) => handleStepChange(0, val)}
                    mode="substate"
                    aestheticTokens={aestheticTokens}
                    isLead
                    ariaLabel={UI_LABELS.execution.leadStepAria(beat.index)}
                    placeholder={UI_LABELS.execution.leadPlaceholder}
                    onFocus={() => handleStepFocus(0, leadNode.raw)}
                    onBlur={() => handleStepBlur(0)}
                    onKeyDown={(e) => handleStepKeyDown(0, e)}
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
              {pendingAfterIndex === 0 && renderPendingRow()}

              {tailNodes.map((sub, offset) => {
                const stepIdx = offset + 1;
                return (
                  <div key={`step-${stepIdx}`} className="space-y-0.5">
                    <div className={`group/step relative flex items-start gap-1.5 ${readOnly ? '' : 'pr-5'}`}>
                      <span
                        aria-hidden="true"
                        className="auteur-tok-arrow mt-[1px] select-none text-[11px] font-bold opacity-85 shrink-0"
                      >
                        ↳
                      </span>
                      <div className="min-w-0 flex-1">
                        <LiveHighlightedEditor
                          ref={registerStepRef(stepIdx)}
                          value={focusedStepIndex === stepIdx ? activeDraft : sub.raw}
                          readOnly={readOnly}
                          onChange={(val) => handleStepChange(stepIdx, val)}
                          mode="substate"
                          aestheticTokens={aestheticTokens}
                          ariaLabel={UI_LABELS.execution.stepAria(beat.index, stepIdx + 1)}
                          placeholder={UI_LABELS.execution.stepPlaceholder}
                          onFocus={() => handleStepFocus(stepIdx, sub.raw)}
                          onBlur={() => handleStepBlur(stepIdx)}
                          onKeyDown={(e) => handleStepKeyDown(stepIdx, e)}
                        />
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleDeleteStep(stepIdx)}
                          title={UI_LABELS.execution.removeStepTitle}
                          aria-label={UI_LABELS.execution.removeStepAria(stepIdx + 1, beat.index)}
                          className="absolute right-0 top-0.5 rounded p-0.5 text-text-faint opacity-0 group-hover/step:opacity-100 focus-visible:opacity-100 hover:bg-surface-muted hover:text-text-main transition-opacity cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {pendingAfterIndex === stepIdx && !readOnly && renderPendingRow()}
                  </div>
                );
              })}
            </div>
          )}

          {/* Focused-only step append + chaining hint (zero layout height when resting) */}
          {isBeatFocused && !readOnly && (
            <div className="mt-1.5 ml-5 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border-subtle/80">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  openPendingStepAfter(Math.max(0, subStates.length - 1));
                }}
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

      {/* Right Margin Diagnostics, Quick Scan Indicator & Quiet AI Patch Indicator (zero layout shift) */}
      <div className="flex w-6 flex-col items-center gap-1 pt-1.5">
        <AiPatchIndicator phase="execution" indicators={patchIndicators} />
        {patchIndicators.length === 0 && (
          <AiQuickScanIndicator beatIndex={beat.index} indicators={quickScanIndicators} />
        )}
        <DiagnosticDot diagnostics={diagnostics} />
      </div>
    </div>
  );
});
