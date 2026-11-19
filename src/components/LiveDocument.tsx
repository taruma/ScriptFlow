import {useMemo, useState} from 'react';
import {ChevronsDownUp, ChevronsUpDown, Plus} from 'lucide-react';
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
  const [stagingScrolled, setStagingScrolled] = useState<boolean>(false);
  const [executionScrolled, setExecutionScrolled] = useState<boolean>(false);

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
    <main className="w-full lg:h-[calc(100dvh-3rem)] lg:overflow-hidden">
      <div className="grid h-full w-full grid-cols-1 lg:grid-cols-2">
        {/* Left Column — Phase 1: Staging */}
        <section
          aria-label={UI_LABELS.document.stagingPaneAria}
          onScroll={(e) => {
            const next = e.currentTarget.scrollTop > 8;
            if (next !== stagingScrolled) setStagingScrolled(next);
          }}
          className="auteur-pane-scroll flex flex-col border-b border-border-main lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r"
        >
          {/* Sticky Editorial Folio Header — Staging */}
          <div
            className={`relative transition-colors duration-200 lg:sticky lg:top-0 lg:z-20 ${
              stagingScrolled
                ? 'bg-app/88 backdrop-blur-md border-b border-border-main'
                : 'bg-app border-b border-transparent'
            }`}
          >
            <div className="mx-auto w-full max-w-[740px] px-4 sm:px-6 lg:ml-auto lg:mr-0 lg:pl-7 lg:pr-5">
              <div className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-2">
                <div
                  className={`flex h-14 min-w-0 items-center justify-between gap-3 px-0.5 transition-colors duration-200 ${
                    stagingScrolled ? 'border-b border-transparent' : 'border-b border-border-main/70'
                  }`}
                >
                  <div className="flex min-w-0 items-baseline gap-2.5">
                    <span className="whitespace-nowrap shrink-0 font-mono text-[11px] font-medium tracking-wide text-text-faint">
                      {UI_LABELS.document.phase1Kicker}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-3 w-px self-center bg-border-main shrink-0"
                    />
                    <h2 className="truncate font-serif text-[15px] font-bold tracking-tight text-text-main">
                      {UI_LABELS.document.phase1Name}
                    </h2>
                    <span
                      aria-hidden="true"
                      className="hidden sm:inline text-text-placeholder shrink-0"
                    >
                      ·
                    </span>
                    <span className="hidden sm:inline whitespace-nowrap shrink-0 font-mono text-[11px] text-text-faint tabular-nums">
                      {UI_LABELS.document.stagingBlockCount(doc.stagingBlocks.length)}
                    </span>
                  </div>

                  {doc.stagingBlocks.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllStaging}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
                    >
                      {allStagingCollapsed ? (
                        <ChevronsUpDown className="h-3.5 w-3.5 text-text-faint" />
                      ) : (
                        <ChevronsDownUp className="h-3.5 w-3.5 text-text-faint" />
                      )}
                      <span>
                        {allStagingCollapsed
                          ? UI_LABELS.document.expandAll
                          : UI_LABELS.document.collapseAll}
                      </span>
                    </button>
                  )}
                </div>
                <div />
              </div>
            </div>

            {/* Soft scroll veil so cards melt smoothly beneath the sticky header */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b from-app/90 via-app/40 to-transparent transition-opacity duration-200 ${
                stagingScrolled ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>

          <div className="mx-auto w-full max-w-[740px] px-4 pt-4 pb-10 sm:px-6 lg:ml-auto lg:mr-0 lg:pl-7 lg:pr-5 lg:pb-28">
            {doc.stagingBlocks.length > 0 ? (
              <div className="space-y-3">
                {doc.stagingBlocks.map((block, index) => (
                  <StagingBlockCard
                    key={block.id}
                    block={block}
                    blockIndex={index}
                    collapsed={Boolean(collapsedBlocks[block.name])}
                    onToggleCollapse={() => toggleSingleBlock(block.name)}
                    onCommit={onUpdateStaging}
                    diagnostics={stagingDiagnosticsByIndex.get(index) ?? []}
                    characters={metadata.characters}
                    aestheticTokens={metadata.aestheticTokens}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)_28px] gap-2">
                <div className="rounded-xl border border-dashed border-border-main bg-surface/50 px-4 py-6 text-center text-xs leading-relaxed text-text-faint">
                  {UI_LABELS.document.noStagingBlocks}
                </div>
                <div />
              </div>
            )}
          </div>
        </section>

        {/* Right Column — Phase 2: Execution Timeline */}
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
            <div className="mx-auto w-full max-w-[740px] px-3 sm:px-6 lg:ml-0 lg:mr-auto lg:pl-4 lg:pr-7">
              <div className="grid grid-cols-[52px_minmax(0,1fr)_28px] items-center gap-2">
                <div />
                <div
                  className={`flex h-14 min-w-0 items-center justify-between gap-3 px-0.5 transition-colors duration-200 ${
                    executionScrolled
                      ? 'border-b border-transparent'
                      : 'border-b border-border-main/70'
                  }`}
                >
                  <div className="flex min-w-0 items-baseline gap-2.5">
                    <span className="whitespace-nowrap shrink-0 font-mono text-[11px] font-medium tracking-wide text-text-faint">
                      {UI_LABELS.document.phase2Kicker}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-3 w-px self-center bg-border-main shrink-0"
                    />
                    <h2 className="truncate font-serif text-[15px] font-bold tracking-tight text-text-main">
                      {UI_LABELS.document.phase2Name}
                    </h2>
                    <span className="auteur-phase-execution inline-flex shrink-0 self-center items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-tight whitespace-nowrap">
                      [{executionLabel}]
                    </span>
                  </div>

                  <span className="whitespace-nowrap shrink-0 font-mono text-[11px] font-medium text-text-muted tabular-nums">
                    {UI_LABELS.document.beatRange(beats.length)}
                  </span>
                </div>
                <div />
              </div>
            </div>

            {/* Soft scroll veil so beats melt smoothly beneath the sticky header */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b from-app/90 via-app/40 to-transparent transition-opacity duration-200 ${
                executionScrolled ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>

          <div
            className={`mx-auto w-full max-w-[740px] px-3 pb-24 sm:px-6 lg:ml-0 lg:mr-auto lg:pl-4 lg:pr-7 lg:pb-28 ${
              beats.length > 0 ? 'pt-1' : 'pt-4'
            }`}
          >
            {/* Surgical insert before Beat 1 */}
            {beats.length > 0 && (
              <div className="group/seam relative grid h-3 grid-cols-[52px_minmax(0,1fr)_28px] items-center gap-2">
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
                        <div className="relative flex h-7 items-center justify-center">
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
                            aria-label={UI_LABELS.document.insertBeatBetween(
                              beat.index - 1,
                              beat.index
                            )}
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

            {/* Subtle Paste-and-Hydrate hint */}
            <footer className="mt-12 grid grid-cols-[52px_minmax(0,1fr)_28px] items-center gap-2">
              <div />
              <p className="text-center text-xs text-text-faint">
                {UI_LABELS.document.footerHint}
              </p>
              <div />
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
