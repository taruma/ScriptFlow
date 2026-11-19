import {useMemo, useState} from 'react';
import {Plus} from 'lucide-react';
import type {
  AuteurDocument,
  ExtractedMetadata,
  LintDiagnostic,
} from '../core/types.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {ExecutionBeatRow} from './ExecutionBeatRow.tsx';
import {StagingBlockCard} from './StagingBlockCard.tsx';

interface LiveDocumentProps {
  doc: AuteurDocument;
  metadata: ExtractedMetadata;
  diagnostics: LintDiagnostic[];
  onUpdateStaging: (blockIndex: number, nextBody: string) => void;
  onUpdateSubState: (beatIndex: number, subStateIndex: number, nextSubStateRaw: string) => void;
  onInsertSubState: (beatIndex: number, afterSubStateIndex: number, starterText: string) => void;
  onDeleteSubState: (beatIndex: number, subStateIndex: number) => void;
  onMergeSubState: (beatIndex: number, subStateIndex: number) => void;
  onInsertBeat: (afterBeatIndex: number, starterLine: string) => void;
  onDeleteBeat: (beatIndex: number) => void;
  onReorderBeats: (fromBeatIndex: number, toBeatIndex: number) => void;
}

function getStarterBeatLine(doc: AuteurDocument): string {
  const beats = doc.execution?.beats ?? [];
  if (beats.length === 0) {
    return '[CAM 01] MS, eye level -> [ACT] ';
  }

  // Match the camera style of the last beat with a camera tag
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

export function LiveDocument({
  doc,
  metadata,
  diagnostics,
  onUpdateStaging,
  onUpdateSubState,
  onInsertSubState,
  onDeleteSubState,
  onMergeSubState,
  onInsertBeat,
  onDeleteBeat,
  onReorderBeats,
}: LiveDocumentProps) {
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});
  const [autoFocusBeatIndex, setAutoFocusBeatIndex] = useState<number | null>(null);
  const [draggedBeatIndex, setDraggedBeatIndex] = useState<number | null>(null);
  const [dragOverBeatIndex, setDragOverBeatIndex] = useState<number | null>(null);

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

  const allStagingCollapsed =
    doc.stagingBlocks.length > 0 &&
    doc.stagingBlocks.every((block) => Boolean(collapsedBlocks[block.name]));

  const toggleAllStaging = () => {
    const nextValue = !allStagingCollapsed;
    const nextState: Record<string, boolean> = {};
    for (const block of doc.stagingBlocks) {
      nextState[block.name] = nextValue;
    }
    setCollapsedBlocks(nextState);
  };

  const toggleSingleBlock = (blockName: string) => {
    setCollapsedBlocks((prev) => ({
      ...prev,
      [blockName]: !prev[blockName],
    }));
  };

  const handleInsertBeatAt = (afterBeatIndex: number) => {
    const starter = getStarterBeatLine(doc);
    onInsertBeat(afterBeatIndex, starter);
    setAutoFocusBeatIndex(afterBeatIndex + 1);
  };

  const handleDropOnBeat = (targetBeatIndex: number) => {
    if (draggedBeatIndex !== null && draggedBeatIndex !== targetBeatIndex) {
      onReorderBeats(draggedBeatIndex, targetBeatIndex);
    }
    setDraggedBeatIndex(null);
    setDragOverBeatIndex(null);
  };

  const beats = doc.execution?.beats ?? [];
  const executionLabel = doc.execution?.headerName ?? 'EXECUTION';

  return (
    <main className="mx-auto w-full max-w-[820px] px-3 sm:px-6 pt-7 pb-28">
      {/* Phase 1 — Staging */}
      {doc.stagingBlocks.length > 0 && (
        <div className="mb-10">
          <div className="mb-3 grid grid-cols-[52px_minmax(0,1fr)_28px] items-center gap-2">
            <div />
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-xs text-text-faint">
                <span className="font-serif text-sm font-normal text-text-muted">
                  {UI_LABELS.document.phase1Title}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px] tabular-nums">
                  {UI_LABELS.document.stagingBlockCount(doc.stagingBlocks.length)}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleAllStaging}
                className="text-xs font-medium text-text-faint hover:text-text-main transition-colors cursor-pointer"
              >
                {allStagingCollapsed
                  ? UI_LABELS.document.expandAll
                  : UI_LABELS.document.collapseAll}
              </button>
            </div>
            <div />
          </div>

          <div className="space-y-2.5">
            {doc.stagingBlocks.map((block, index) => (
              <div key={block.id} className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-2">
                <div aria-hidden="true" />
                <StagingBlockCard
                  block={block}
                  blockIndex={index}
                  collapsed={Boolean(collapsedBlocks[block.name])}
                  onToggleCollapse={() => toggleSingleBlock(block.name)}
                  onCommit={onUpdateStaging}
                  diagnostics={stagingDiagnosticsByIndex.get(index) ?? []}
                  characters={metadata.characters}
                  aestheticTokens={metadata.aestheticTokens}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 2 — Execution Timeline */}
      <div>
        <div className="mb-3 grid grid-cols-[52px_minmax(0,1fr)_28px] items-center gap-2">
          <div />
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5">
              <span className="font-serif text-sm font-normal text-text-muted">
                {UI_LABELS.document.phase2Title}
              </span>
              <span className="auteur-phase-execution inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-tight">
                [{executionLabel}]
              </span>
            </div>

            <span className="font-mono text-[11px] text-text-faint tabular-nums">
              {UI_LABELS.document.beatRange(beats.length)}
            </span>
          </div>
          <div />
        </div>

        {/* Surgical insert before Beat 1 */}
        {beats.length > 0 && (
          <div className="group/seam relative grid grid-cols-[52px_minmax(0,1fr)_28px] items-center gap-2 h-3">
            <div />
            <div className="relative flex items-center justify-center">
              <div className="w-full border-t border-transparent group-hover/seam:border-border-main transition-colors" />
              <button
                type="button"
                onClick={() => handleInsertBeatAt(0)}
                title={UI_LABELS.document.insertBeatBeforeFirst}
                aria-label={UI_LABELS.document.insertBeatBeforeFirst}
                className="absolute flex h-5 w-5 items-center justify-center rounded-full border border-border-main bg-surface text-text-faint opacity-0 group-hover/seam:opacity-100 hover:border-text-muted hover:text-text-main transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <div />
          </div>
        )}

        {/* Waterfall Execution Stack */}
        <div>
          {beats.map((beat, idx) => {
            const link = metadata.beatLinks[idx];
            const nextLink = metadata.beatLinks[idx + 1];
            const connectsToNext = Boolean(nextLink?.connectsFromPrevious);
            const isCutBefore = idx > 0 && Boolean(link?.isCutFromPrevious);

            return (
              <div key={beat.id}>
                {/* Seam between previous beat and current beat */}
                {idx > 0 && (
                  <div className="group/seam relative grid grid-cols-[52px_minmax(0,1fr)_28px] items-stretch gap-2">
                    {/* Left margin keeps continuity rail flush with zero overlap */}
                    <div className="relative">
                      {link?.connectsFromPrevious && (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute right-[15px] inset-y-0 w-[2px] opacity-45"
                          style={{backgroundColor: 'var(--tok-continuity)'}}
                        />
                      )}
                    </div>

                    {/* Center seam: Dotted CUT hairline vs quiet hover insert divider */}
                    <div className="relative flex items-center justify-center h-7">
                      {isCutBefore ? (
                        <>
                          <div className="w-full border-t border-dashed border-border-main" />
                          <span className="absolute bg-app px-2 font-mono text-[10px] font-medium tracking-widest text-text-faint uppercase group-hover/seam:opacity-0 transition-opacity select-none">
                            {link?.transition === 'RECALL'
                              ? UI_LABELS.document.cutRecallMarker
                              : UI_LABELS.document.cutMarker}
                          </span>
                        </>
                      ) : (
                        <div className="w-full border-t border-transparent group-hover/seam:border-border-main/60 transition-colors" />
                      )}

                      <button
                        type="button"
                        onClick={() => handleInsertBeatAt(beat.index - 1)}
                        title={UI_LABELS.document.insertBeatBetween(beat.index - 1, beat.index)}
                        aria-label={UI_LABELS.document.insertBeatBetween(beat.index - 1, beat.index)}
                        className="absolute flex h-5 w-5 items-center justify-center rounded-full border border-border-main bg-surface text-text-faint opacity-0 group-hover/seam:opacity-100 hover:border-text-muted hover:text-text-main transition-all cursor-pointer shadow-2xs"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <div />
                  </div>
                )}

                <ExecutionBeatRow
                  beat={beat}
                  cameraLink={link}
                  connectsToNext={connectsToNext}
                  aestheticTokens={metadata.aestheticTokens}
                  diagnostics={beatDiagnosticsByIndex.get(beat.index) ?? []}
                  autoFocusEdit={autoFocusBeatIndex === beat.index}
                  onClearAutoFocus={() => setAutoFocusBeatIndex(null)}
                  onUpdateSubState={onUpdateSubState}
                  onInsertSubState={onInsertSubState}
                  onDeleteSubState={onDeleteSubState}
                  onMergeSubState={onMergeSubState}
                  onDeleteBeat={onDeleteBeat}
                  onDragStart={(beatIdx) => setDraggedBeatIndex(beatIdx)}
                  onDragOver={(beatIdx) => {
                    if (draggedBeatIndex !== null && draggedBeatIndex !== beatIdx) {
                      setDragOverBeatIndex(beatIdx);
                    }
                  }}
                  onDrop={handleDropOnBeat}
                  onDragEnd={() => {
                    setDraggedBeatIndex(null);
                    setDragOverBeatIndex(null);
                  }}
                  isDragging={draggedBeatIndex === beat.index}
                  isDragOver={dragOverBeatIndex === beat.index}
                />
              </div>
            );
          })}
        </div>

        {/* Quiet bottom Add Beat action */}
        <div className="mt-4 grid grid-cols-[52px_minmax(0,1fr)_28px] items-center gap-2">
          <div />
          <button
            type="button"
            onClick={() => handleInsertBeatAt(beats.length)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-main py-2.5 text-xs font-medium text-text-muted hover:border-text-faint hover:bg-surface hover:text-text-main transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{UI_LABELS.document.addBeat}</span>
          </button>
          <div />
        </div>
      </div>

      {/* Subtle Paste-and-Hydrate hint */}
      <footer className="mt-14 grid grid-cols-[52px_minmax(0,1fr)_28px] items-center gap-2">
        <div />
        <p className="text-center text-xs text-text-faint">
          {UI_LABELS.document.footerHint}
        </p>
        <div />
      </footer>
    </main>
  );
}
