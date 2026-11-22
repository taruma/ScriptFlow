import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {computeSnapshotHash} from '../core/index.ts';
import type {HistoryCommitMode} from '../core/history.ts';
import type {
  AuteurDocument,
  ExtractedMetadata,
  LintDiagnostic,
} from '../core/types.ts';
import type {QuickScanResult} from '../services/geminiDecisions.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {
  buildLivePatchIndicators,
  type ActiveAiPatchItem,
} from '../ui/patchIndicators.ts';
import {buildLiveQuickScanIndicators} from '../ui/quickScanIndicators.ts';
import {
  applyLiveSplit,
  clampLiveSplitPercent,
  computeLiveSplitFromPointer,
  DEFAULT_LIVE_SPLIT_PERCENT,
  isQuickDoubleTap,
  LIVE_SPLIT_KEYBOARD_LARGE_STEP,
  LIVE_SPLIT_KEYBOARD_STEP,
  MAX_LIVE_SPLIT_PERCENT,
  MIN_LIVE_SPLIT_PERCENT,
  TOUCH_SPLIT_DRAG_THRESHOLD_PX,
} from '../ui/workspaceSplit.ts';
import {
  EMPTY_BEATS,
  stabilizeAestheticTokens,
  stabilizeBeatLinks,
  stabilizeBeatPatchMap,
  stabilizeBeatQuickScanMap,
  stabilizeBlockPatchMap,
  stabilizeCharacters,
  stabilizeDiagnosticsMap,
  stabilizeExecutionBeats,
  stabilizeInsertionPatchMap,
  stabilizeStagingBlocks,
} from '../ui/referenceStability.ts';
import {useStableValue} from '../ui/useStableValue.ts';
import {LivePatchActionContext} from './AiPatchIndicator.tsx';
import {LiveQuickScanActionContext} from './AiQuickScanIndicator.tsx';
import {ExecutionPane} from './ExecutionPane.tsx';
import {StagingPane} from './StagingPane.tsx';
import type {StagingBlockCommitOptions} from './stagingBlockRegistry.ts';

const EMPTY_ACTIVE_PATCHES: readonly ActiveAiPatchItem[] = [];

interface LiveDocumentProps {
  rawText: string;
  doc: AuteurDocument;
  metadata: ExtractedMetadata;
  diagnostics: LintDiagnostic[];
  activeAiPatches?: readonly ActiveAiPatchItem[];
  onApplyAiPatch?: (patchId: string) => void;
  onDismissAiPatch?: (patchId: string) => void;
  activeQuickScan?: QuickScanResult | null;
  onAuditQuickScanBeat?: (beatIndex: number) => void;
  historyRevision: number;
  readOnly?: boolean;
  narrowReadOnly?: boolean;
  liveSplitPercent?: number;
  onChangeLiveSplit?: (nextPercent: number) => void;
  onUpdateStaging: (
    blockIndex: number,
    nextBody: string,
    options?: StagingBlockCommitOptions
  ) => void;
  onInsertStaging: (headerName: string, afterBlockIndex?: number) => void;
  onDeleteStaging: (blockIndex: number) => void;
  onReorderStaging: (fromBlockIndex: number, toBlockIndex: number) => void;
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
  onInsertBeat: (afterBeatIndex: number, starterLine: string) => void;
  onDeleteBeat: (beatIndex: number) => void;
  onReorderBeats: (fromBeatIndex: number, toBeatIndex: number) => void;
}

/**
 * Thin asymmetric 40/60 Live Mode workspace shell coordinating
 * Phase 1 (StagingPane) and Phase 2 (ExecutionPane).
 * Reconciles freshly derived AST/metadata/diagnostic references against the last
 * committed snapshot so editing one block or beat never forces unrelated cards to re-render.
 */
export const LiveDocument = memo(function LiveDocument({
  rawText,
  doc,
  metadata,
  diagnostics,
  activeAiPatches = EMPTY_ACTIVE_PATCHES,
  onApplyAiPatch,
  onDismissAiPatch,
  activeQuickScan = null,
  onAuditQuickScanBeat,
  historyRevision,
  readOnly = false,
  narrowReadOnly = false,
  liveSplitPercent = DEFAULT_LIVE_SPLIT_PERCENT,
  onChangeLiveSplit,
  onUpdateStaging,
  onInsertStaging,
  onDeleteStaging,
  onReorderStaging,
  onUpdateSubState,
  onInsertSubState,
  onDeleteSubState,
  onMergeSubState,
  onReorderSubState,
  onInsertBeat,
  onDeleteBeat,
  onReorderBeats,
}: LiveDocumentProps) {
  const stagingBlocks = useStableValue(doc.stagingBlocks, stabilizeStagingBlocks);
  const characters = useStableValue(metadata.characters, stabilizeCharacters);
  const aestheticTokens = useStableValue(metadata.aestheticTokens, stabilizeAestheticTokens);
  const beats = useStableValue(doc.execution?.beats ?? EMPTY_BEATS, stabilizeExecutionBeats);
  const beatLinks = useStableValue(metadata.beatLinks, stabilizeBeatLinks);

  const rawStagingDiagnosticsByIndex = useMemo(() => {
    const map = new Map<number, LintDiagnostic[]>();
    for (const diag of diagnostics) {
      if (diag.target.phase === 'staging') {
        const list = map.get(diag.target.blockIndex) ?? [];
        list.push(diag);
        map.set(diag.target.blockIndex, list);
      }
    }
    return map;
  }, [diagnostics]);

  const rawBeatDiagnosticsByIndex = useMemo(() => {
    const map = new Map<number, LintDiagnostic[]>();
    for (const diag of diagnostics) {
      if (diag.target.phase === 'execution') {
        const list = map.get(diag.target.beatIndex) ?? [];
        list.push(diag);
        map.set(diag.target.beatIndex, list);
      }
    }
    return map;
  }, [diagnostics]);

  const stagingDiagnosticsByIndex = useStableValue(
    rawStagingDiagnosticsByIndex,
    stabilizeDiagnosticsMap
  );
  const beatDiagnosticsByIndex = useStableValue(
    rawBeatDiagnosticsByIndex,
    stabilizeDiagnosticsMap
  );

  const rawPatchMaps = useMemo(
    () => buildLivePatchIndicators(rawText, activeAiPatches),
    [rawText, activeAiPatches]
  );
  const stagingPatchIndicatorsByIndex = useStableValue(
    rawPatchMaps.stagingByBlockIndex,
    stabilizeBlockPatchMap
  );
  const stagingPatchInsertionsByAfterIndex = useStableValue(
    rawPatchMaps.stagingInsertionsByAfterIndex,
    stabilizeInsertionPatchMap
  );
  const beatPatchIndicatorsByIndex = useStableValue(
    rawPatchMaps.executionByBeatIndex,
    stabilizeBeatPatchMap
  );
  const beatPatchInsertionsByAfterBeatIndex = useStableValue(
    rawPatchMaps.executionInsertionsByAfterBeatIndex,
    stabilizeInsertionPatchMap
  );

  const rawQuickScanByBeatIndex = useMemo(() => {
    if (!activeQuickScan) return new Map();
    return buildLiveQuickScanIndicators(activeQuickScan, computeSnapshotHash(rawText));
  }, [activeQuickScan, rawText]);
  const beatQuickScanIndicatorsByIndex = useStableValue(
    rawQuickScanByBeatIndex,
    stabilizeBeatQuickScanMap
  );

  const livePatchActionValue = useMemo(
    () => ({
      readOnly,
      onApplyPatch: onApplyAiPatch,
      onDismissPatch: onDismissAiPatch,
    }),
    [readOnly, onApplyAiPatch, onDismissAiPatch]
  );

  const liveQuickScanActionValue = useMemo(
    () => ({
      onAuditBeat: onAuditQuickScanBeat,
    }),
    [onAuditQuickScanBeat]
  );

  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const activeSplitCleanupRef = useRef<(() => void) | null>(null);
  const lastTouchTapMsRef = useRef<number>(0);
  const [isResizingSplit, setIsResizingSplit] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      activeSplitCleanupRef.current?.();
      activeSplitCleanupRef.current = null;
    };
  }, []);

  const commitLiveSplit = useCallback(
    (nextPercent: number) => {
      const clamped = clampLiveSplitPercent(nextPercent);
      applyLiveSplit(clamped);
      onChangeLiveSplit?.(clamped);
    },
    [onChangeLiveSplit]
  );

  const handleSplitPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const container = splitContainerRef.current;
      if (!container) return;

      event.preventDefault();
      activeSplitCleanupRef.current?.();

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;

      const handleEl = event.currentTarget;
      const activePointerId = event.pointerId;
      const pointerType = event.pointerType;
      const startX = event.clientX;
      const moveThresholdPx = pointerType === 'mouse' ? 1 : TOUCH_SPLIT_DRAG_THRESHOLD_PX;

      try {
        handleEl.setPointerCapture?.(activePointerId);
      } catch {
        // Ignore capture errors on synthetic or unsupported pointer sources
      }

      let latestPercent = liveSplitPercent;
      let didMove = false;
      document.body.classList.add('auteur-split-dragging');
      setIsResizingSplit(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== activePointerId) return;
        if (!didMove && Math.abs(moveEvent.clientX - startX) < moveThresholdPx) {
          return;
        }
        didMove = true;
        latestPercent = computeLiveSplitFromPointer(moveEvent.clientX, rect.left, rect.width);
        applyLiveSplit(latestPercent);
      };

      const cleanup = (commit: boolean, isNormalRelease: boolean) => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
        handleEl.removeEventListener('lostpointercapture', handleLostPointerCapture);
        try {
          if (handleEl.hasPointerCapture?.(activePointerId)) {
            handleEl.releasePointerCapture(activePointerId);
          }
        } catch {
          // Ignore release errors if pointer capture already ended
        }
        document.body.classList.remove('auteur-split-dragging');
        setIsResizingSplit(false);
        if (activeSplitCleanupRef.current === forceCleanup) {
          activeSplitCleanupRef.current = null;
        }
        if (commit && didMove) {
          lastTouchTapMsRef.current = 0;
          onChangeLiveSplit?.(latestPercent);
        } else if (commit && !didMove && isNormalRelease && pointerType !== 'mouse') {
          const now = Date.now();
          if (isQuickDoubleTap(lastTouchTapMsRef.current, now)) {
            lastTouchTapMsRef.current = 0;
            commitLiveSplit(DEFAULT_LIVE_SPLIT_PERCENT);
          } else {
            lastTouchTapMsRef.current = now;
          }
        }
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== activePointerId) return;
        cleanup(true, true);
      };
      const handlePointerCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== activePointerId) return;
        cleanup(true, false);
      };
      const handleLostPointerCapture = (lostEvent: PointerEvent) => {
        if (lostEvent.pointerId !== activePointerId) return;
        cleanup(true, false);
      };
      const forceCleanup = () => cleanup(false, false);

      activeSplitCleanupRef.current = forceCleanup;
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
      handleEl.addEventListener('lostpointercapture', handleLostPointerCapture);
    },
    [liveSplitPercent, onChangeLiveSplit, commitLiveSplit]
  );

  const handleSplitDoubleClick = useCallback(() => {
    commitLiveSplit(DEFAULT_LIVE_SPLIT_PERCENT);
  }, [commitLiveSplit]);

  const handleSplitKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? LIVE_SPLIT_KEYBOARD_LARGE_STEP : LIVE_SPLIT_KEYBOARD_STEP;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          commitLiveSplit(liveSplitPercent - step);
          break;
        case 'ArrowRight':
          event.preventDefault();
          commitLiveSplit(liveSplitPercent + step);
          break;
        case 'Home':
          event.preventDefault();
          commitLiveSplit(MIN_LIVE_SPLIT_PERCENT);
          break;
        case 'End':
          event.preventDefault();
          commitLiveSplit(MAX_LIVE_SPLIT_PERCENT);
          break;
        case 'Enter':
        case '0':
          event.preventDefault();
          commitLiveSplit(DEFAULT_LIVE_SPLIT_PERCENT);
          break;
      }
    },
    [liveSplitPercent, commitLiveSplit]
  );

  return (
    <LivePatchActionContext.Provider value={livePatchActionValue}>
      <LiveQuickScanActionContext.Provider value={liveQuickScanActionValue}>
        <main className="w-full lg:h-full lg:overflow-hidden">
          <div
            ref={splitContainerRef}
            className="relative grid h-full w-full grid-cols-1 auteur-live-split-grid"
          >
            <StagingPane
              stagingBlocks={stagingBlocks}
              characters={characters}
              aestheticTokens={aestheticTokens}
              diagnosticsByBlockIndex={stagingDiagnosticsByIndex}
              patchIndicatorsByBlockIndex={stagingPatchIndicatorsByIndex}
              patchInsertionsByAfterIndex={stagingPatchInsertionsByAfterIndex}
              historyRevision={historyRevision}
              readOnly={readOnly}
              onUpdateStaging={onUpdateStaging}
              onInsertStaging={onInsertStaging}
              onDeleteStaging={onDeleteStaging}
              onReorderStaging={onReorderStaging}
            />

            <ExecutionPane
              executionLabel={doc.execution?.headerName ?? 'EXECUTION'}
              beats={beats}
              beatLinks={beatLinks}
              aestheticTokens={aestheticTokens}
              diagnosticsByBeatIndex={beatDiagnosticsByIndex}
              patchIndicatorsByBeatIndex={beatPatchIndicatorsByIndex}
              patchInsertionsByAfterBeatIndex={beatPatchInsertionsByAfterBeatIndex}
              quickScanIndicatorsByBeatIndex={beatQuickScanIndicatorsByIndex}
              historyRevision={historyRevision}
              readOnly={readOnly}
              narrowReadOnly={narrowReadOnly}
              onUpdateSubState={onUpdateSubState}
              onInsertSubState={onInsertSubState}
              onDeleteSubState={onDeleteSubState}
              onMergeSubState={onMergeSubState}
              onReorderSubState={onReorderSubState}
              onInsertBeat={onInsertBeat}
              onDeleteBeat={onDeleteBeat}
              onReorderBeats={onReorderBeats}
            />

            {/* Quiet desktop-only draggable column divider aligned over StagingPane's hairline */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={UI_LABELS.document.resizeColumnsAria}
              aria-valuemin={MIN_LIVE_SPLIT_PERCENT}
              aria-valuemax={MAX_LIVE_SPLIT_PERCENT}
              aria-valuenow={Math.round(liveSplitPercent)}
              title={UI_LABELS.document.resizeColumnsTitle}
              data-resizing={isResizingSplit ? 'true' : undefined}
              tabIndex={0}
              onPointerDown={handleSplitPointerDown}
              onDoubleClick={handleSplitDoubleClick}
              onKeyDown={handleSplitKeyDown}
              className="auteur-live-split-handle group/splitter hidden lg:flex absolute inset-y-0 z-30 w-2.5 -translate-x-1/2 items-center justify-center cursor-col-resize select-none touch-none focus:outline-none"
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none h-full w-[2px] transition-colors ${
                  isResizingSplit
                    ? 'bg-text-muted/60'
                    : 'bg-transparent group-hover/splitter:bg-text-faint/40 group-focus-visible/splitter:bg-text-muted/60'
                }`}
              />
              <span
                aria-hidden="true"
                className={`auteur-live-split-grip pointer-events-none absolute h-8 w-1 rounded-full transition-opacity ${
                  isResizingSplit
                    ? 'opacity-100 bg-text-muted/80'
                    : 'opacity-0 group-hover/splitter:opacity-100 group-focus-visible/splitter:opacity-100 bg-text-faint/80'
                }`}
              />
            </div>
          </div>
        </main>
      </LiveQuickScanActionContext.Provider>
    </LivePatchActionContext.Provider>
  );
});
