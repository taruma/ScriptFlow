import {useMemo} from 'react';
import type {HistoryCommitMode} from '../core/history.ts';
import type {
  AuteurDocument,
  ExtractedMetadata,
  LintDiagnostic,
} from '../core/types.ts';
import {ExecutionPane} from './ExecutionPane.tsx';
import {StagingPane} from './StagingPane.tsx';
import type {StagingBlockCommitOptions} from './stagingBlockRegistry.ts';

interface LiveDocumentProps {
  doc: AuteurDocument;
  metadata: ExtractedMetadata;
  diagnostics: LintDiagnostic[];
  historyRevision: number;
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
  onInsertBeat: (afterBeatIndex: number, starterLine: string) => void;
  onDeleteBeat: (beatIndex: number) => void;
  onReorderBeats: (fromBeatIndex: number, toBeatIndex: number) => void;
}

/**
 * Thin asymmetric 40/60 Live Mode workspace shell coordinating
 * Phase 1 (StagingPane) and Phase 2 (ExecutionPane).
 */
export function LiveDocument({
  doc,
  metadata,
  diagnostics,
  historyRevision,
  onUpdateStaging,
  onInsertStaging,
  onDeleteStaging,
  onReorderStaging,
  onUpdateSubState,
  onInsertSubState,
  onDeleteSubState,
  onMergeSubState,
  onInsertBeat,
  onDeleteBeat,
  onReorderBeats,
}: LiveDocumentProps) {
  const stagingDiagnosticsByIndex = useMemo(() => {
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

  const beatDiagnosticsByIndex = useMemo(() => {
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

  return (
    <main className="w-full lg:h-[calc(100dvh-3rem)] lg:overflow-hidden">
      <div className="grid h-full w-full grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <StagingPane
          stagingBlocks={doc.stagingBlocks}
          characters={metadata.characters}
          aestheticTokens={metadata.aestheticTokens}
          diagnosticsByBlockIndex={stagingDiagnosticsByIndex}
          historyRevision={historyRevision}
          onUpdateStaging={onUpdateStaging}
          onInsertStaging={onInsertStaging}
          onDeleteStaging={onDeleteStaging}
          onReorderStaging={onReorderStaging}
        />

        <ExecutionPane
          executionLabel={doc.execution?.headerName ?? 'EXECUTION'}
          beats={doc.execution?.beats ?? []}
          beatLinks={metadata.beatLinks}
          aestheticTokens={metadata.aestheticTokens}
          diagnosticsByBeatIndex={beatDiagnosticsByIndex}
          historyRevision={historyRevision}
          onUpdateSubState={onUpdateSubState}
          onInsertSubState={onInsertSubState}
          onDeleteSubState={onDeleteSubState}
          onMergeSubState={onMergeSubState}
          onInsertBeat={onInsertBeat}
          onDeleteBeat={onDeleteBeat}
          onReorderBeats={onReorderBeats}
        />
      </div>
    </main>
  );
}
