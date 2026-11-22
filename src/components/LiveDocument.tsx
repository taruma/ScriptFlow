import {memo, useMemo} from 'react';
import {computeSnapshotHash} from '../core/index.ts';
import type {HistoryCommitMode} from '../core/history.ts';
import type {
  AuteurDocument,
  ExtractedMetadata,
  LintDiagnostic,
} from '../core/types.ts';
import type {QuickScanResult} from '../services/geminiDecisions.ts';
import {
  buildLivePatchIndicators,
  type ActiveAiPatchItem,
} from '../ui/patchIndicators.ts';
import {buildLiveQuickScanIndicators} from '../ui/quickScanIndicators.ts';
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

  return (
    <LivePatchActionContext.Provider value={livePatchActionValue}>
      <LiveQuickScanActionContext.Provider value={liveQuickScanActionValue}>
        <main className="w-full lg:h-full lg:overflow-hidden">
          <div className="grid h-full w-full grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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
          </div>
        </main>
      </LiveQuickScanActionContext.Provider>
    </LivePatchActionContext.Provider>
  );
});
