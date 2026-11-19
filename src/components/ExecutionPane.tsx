import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {GripVertical, Plus} from 'lucide-react';
import type {HistoryCommitMode} from '../core/history.ts';
import type {
  AestheticToken,
  BeatCameraLink,
  ExecutionBeat,
  LintDiagnostic,
} from '../core/types.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {EMPTY_DIAGNOSTICS} from '../ui/referenceStability.ts';
import {ExecutionBeatRow} from './ExecutionBeatRow.tsx';
import {HoverInsertSeam} from './HoverInsertSeam.tsx';
import {SortableList, type SortableItemBinding} from './SortableList.tsx';

interface ExecutionPaneProps {
  executionLabel: string;
  beats: ExecutionBeat[];
  beatLinks: BeatCameraLink[];
  aestheticTokens: AestheticToken[];
  diagnosticsByBeatIndex: Map<number, LintDiagnostic[]>;
  historyRevision: number;
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
  onInsertBeat: (afterBeatIndex: number, starterLine: string) => void;
  onDeleteBeat: (beatIndex: number) => void;
  onReorderBeats: (fromBeatIndex: number, toBeatIndex: number) => void;
}

const EXECUTION_GRID = 'grid-cols-[46px_minmax(0,1fr)_24px]';

function getStarterBeatLine(beats: ExecutionBeat[]): string {
  if (beats.length === 0) {
    return '[CAM 01] MS, eye level -> [ACT] ';
  }

  for (let i = beats.length - 1; i >= 0; i--) {
    const cam = beats[i].subStates.find((s) => s.kind === 'camera')?.camera;
    if (cam) {
      if (cam.isNumbered && cam.slot) {
        return `[${cam.slot}] -> [ACT] `;
      }
      return '[CAM] -> [ACT] ';
    }
  }

  return '[CAM 01] -> [ACT] ';
}

/**
 * Right column of the Live Mode workspace (Phase 2: Execution / S1..SN).
 * Owns its sticky editorial header, camera continuity HOLD/CUT seams,
 * surgical beat insertion, and sortable Execution waterfall cards.
 */
export const ExecutionPane = memo(function ExecutionPane({
  executionLabel,
  beats,
  beatLinks,
  aestheticTokens,
  diagnosticsByBeatIndex,
  historyRevision,
  onUpdateSubState,
  onInsertSubState,
  onDeleteSubState,
  onMergeSubState,
  onInsertBeat,
  onDeleteBeat,
  onReorderBeats,
}: ExecutionPaneProps) {
  const [autoFocusBeatIndex, setAutoFocusBeatIndex] = useState<number | null>(null);
  const [executionScrolled, setExecutionScrolled] = useState<boolean>(false);
  const [isDraggingAny, setIsDraggingAny] = useState<boolean>(false);
  const beatsRef = useRef<ExecutionBeat[]>(beats);

  useEffect(() => {
    beatsRef.current = beats;
  }, [beats]);

  const handleClearAutoFocus = useCallback(() => {
    setAutoFocusBeatIndex(null);
  }, []);

  const handleInsertBeatAt = useCallback(
    (afterBeatIndex: number) => {
      const starter = getStarterBeatLine(beatsRef.current);
      onInsertBeat(afterBeatIndex, starter);
      setAutoFocusBeatIndex(afterBeatIndex + 1);
    },
    [onInsertBeat]
  );

  const handleReorder = useCallback(
    (fromIdx: number, toIdx: number) => {
      onReorderBeats(fromIdx + 1, toIdx + 1);
    },
    [onReorderBeats]
  );

  const handleDragStart = useCallback(() => {
    setIsDraggingAny(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDraggingAny(false);
  }, []);

  const renderOverlay = useCallback((beat: ExecutionBeat) => {
    const leadSummary = beat.subStates[0]?.raw || beat.raw;
    const stepCount = beat.subStates.length;
    return (
      <div className={`grid ${EXECUTION_GRID} items-center gap-1.5 cursor-grabbing select-none`}>
        <div className="flex items-center justify-end gap-0.5 pr-0.5">
          <GripVertical className="h-3 w-3 text-text-muted" />
          <span className="inline-flex min-w-[22px] justify-center rounded bg-surface px-1 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums text-text-main shadow-xs border border-border-main">
            S{beat.index}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2.5 rounded-lg border border-text-muted/50 bg-surface px-3 py-2 shadow-lg ring-1 ring-border-main/60">
          <span className="truncate font-script auteur-script-size leading-[1.35] text-text-main">
            {leadSummary}
          </span>
          {stepCount > 1 && (
            <span className="font-mono text-[10.5px] text-text-faint tabular-nums whitespace-nowrap shrink-0">
              {UI_LABELS.execution.stepsCount(stepCount)}
            </span>
          )}
        </div>
        <div />
      </div>
    );
  }, []);

  const renderItem = useCallback(
    (beat: ExecutionBeat, idx: number, binding: SortableItemBinding) => {
      const link = beatLinks[idx];
      const nextLink = beatLinks[idx + 1];
      const connectsToNext = Boolean(nextLink?.connectsFromPrevious);
      const isCutBefore = idx > 0 && Boolean(link?.isCutFromPrevious);

      return (
        <>
          {idx > 0 && (
            <HoverInsertSeam
              gridClass={EXECUTION_GRID}
              heightClass={isCutBefore ? 'h-5' : 'h-2'}
              subtleHairline
              quiet={binding.isAnyDragging}
              cutLabel={
                isCutBefore
                  ? link?.transition === 'RECALL'
                    ? UI_LABELS.document.cutRecallMarker
                    : UI_LABELS.document.cutMarker
                  : undefined
              }
              leftGutter={
                link?.connectsFromPrevious && !binding.isAnyDragging ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute right-[12px] inset-y-0 w-[2px] opacity-45"
                    style={{backgroundColor: 'var(--tok-continuity)'}}
                  />
                ) : null
              }
              buttonLabel={UI_LABELS.document.insertBeatBetween(beat.index - 1, beat.index)}
              onClick={() => handleInsertBeatAt(beat.index - 1)}
            />
          )}

          <ExecutionBeatRow
            beat={beat}
            cameraLink={link}
            connectsToNext={connectsToNext}
            aestheticTokens={aestheticTokens}
            diagnostics={diagnosticsByBeatIndex.get(beat.index) ?? EMPTY_DIAGNOSTICS}
            historyRevision={historyRevision}
            autoFocusEdit={autoFocusBeatIndex === beat.index}
            onClearAutoFocus={handleClearAutoFocus}
            onUpdateSubState={onUpdateSubState}
            onInsertSubState={onInsertSubState}
            onDeleteSubState={onDeleteSubState}
            onMergeSubState={onMergeSubState}
            onDeleteBeat={onDeleteBeat}
            drag={binding}
          />
        </>
      );
    },
    [
      beatLinks,
      aestheticTokens,
      diagnosticsByBeatIndex,
      historyRevision,
      autoFocusBeatIndex,
      handleClearAutoFocus,
      handleInsertBeatAt,
      onUpdateSubState,
      onInsertSubState,
      onDeleteSubState,
      onMergeSubState,
      onDeleteBeat,
    ]
  );

  return (
    <section
      aria-label={UI_LABELS.document.executionPaneAria}
      onScroll={(e) => {
        const next = e.currentTarget.scrollTop > 8;
        if (next !== executionScrolled) setExecutionScrolled(next);
      }}
      className="auteur-pane-scroll flex flex-col lg:h-full lg:overflow-y-auto"
    >
      {/* Sticky Editorial Folio Header — Execution */}
      <div
        className={`relative transition-colors duration-200 lg:sticky lg:top-0 lg:z-20 ${
          executionScrolled
            ? 'bg-app/88 backdrop-blur-md border-b border-border-main'
            : 'bg-app border-b border-transparent'
        }`}
      >
        <div className="mx-auto w-full max-w-[920px] px-2.5 sm:px-5 lg:ml-0 lg:mr-auto lg:pl-3 lg:pr-5">
          <div className={`grid ${EXECUTION_GRID} items-center gap-1.5`}>
            <div />
            <div
              className={`flex h-10 min-w-0 items-center justify-between gap-2.5 px-0.5 transition-colors duration-200 ${
                executionScrolled
                  ? 'border-b border-transparent'
                  : 'border-b border-border-main/70'
              }`}
            >
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="whitespace-nowrap shrink-0 font-mono text-[10.5px] font-medium tracking-wide text-text-faint">
                  {UI_LABELS.document.phase2Kicker}
                </span>
                <span
                  aria-hidden="true"
                  className="h-2.5 w-px self-center bg-border-main shrink-0"
                />
                <h2 className="truncate font-serif text-[13.5px] font-bold tracking-tight text-text-main">
                  {UI_LABELS.document.phase2Name}
                </h2>
                <span className="auteur-phase-execution inline-flex shrink-0 self-center items-center rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-tight whitespace-nowrap">
                  [{executionLabel}]
                </span>
              </div>

              <span className="whitespace-nowrap shrink-0 font-mono text-[10.5px] font-medium text-text-muted tabular-nums">
                {UI_LABELS.document.beatRange(beats.length)}
              </span>
            </div>
            <div />
          </div>
        </div>

        {/* Soft scroll veil so beats melt smoothly beneath the sticky header */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b from-app/90 via-app/40 to-transparent transition-opacity duration-200 ${
            executionScrolled ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      <div
        className={`mx-auto w-full max-w-[920px] px-2.5 pb-20 sm:px-5 lg:ml-0 lg:mr-auto lg:pl-3 lg:pr-5 lg:pb-24 ${
          beats.length > 0 ? 'pt-1' : 'pt-2.5'
        }`}
      >
        {/* Surgical insert before Beat 1 */}
        {beats.length > 0 && (
          <HoverInsertSeam
            gridClass={EXECUTION_GRID}
            leftGutter={null}
            buttonLabel={UI_LABELS.document.insertBeatBeforeFirst}
            quiet={isDraggingAny}
            onClick={() => handleInsertBeatAt(0)}
          />
        )}

        {/* Waterfall Execution Stack */}
        <SortableList
          items={beats}
          scopeId="execution"
          onReorder={handleReorder}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          renderOverlay={renderOverlay}
          renderItem={renderItem}
        />

        {/* Quiet bottom Add Beat action */}
        <div className={`mt-2.5 grid ${EXECUTION_GRID} items-center gap-1.5`}>
          <div />
          <button
            type="button"
            onClick={() => handleInsertBeatAt(beats.length)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-main py-2 text-xs font-medium text-text-muted hover:border-text-faint hover:bg-surface hover:text-text-main transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{UI_LABELS.document.addBeat}</span>
          </button>
          <div />
        </div>

        {/* Subtle Paste-and-Hydrate hint */}
        <footer className={`mt-8 grid ${EXECUTION_GRID} items-center gap-1.5`}>
          <div />
          <p className="text-center text-[11px] text-text-faint">
            {UI_LABELS.document.footerHint}
          </p>
          <div />
        </footer>
      </div>
    </section>
  );
});
