import {useEffect, useRef, useState} from 'react';
import {ChevronsDownUp, ChevronsUpDown, GripVertical} from 'lucide-react';
import type {
  AestheticToken,
  CharacterBinding,
  LintDiagnostic,
  StagingBlock,
} from '../core/types.ts';
import {getMacroBlockMeta, UI_LABELS} from '../ui/labels.ts';
import {
  deleteCollapsedIndex,
  insertCollapsedIndex,
  pruneCollapsedIndices,
  reorderCollapsedIndices,
  toggleCollapsedIndex,
} from '../ui/stagingCollapse.ts';
import {AddStagingBlockPicker, StagingBlockPickerPanel} from './AddStagingBlockPicker.tsx';
import {HoverInsertSeam} from './HoverInsertSeam.tsx';
import {SortableList} from './SortableList.tsx';
import {StagingBlockCard} from './StagingBlockCard.tsx';
import {
  formatStagingCollapsedMeta,
  type StagingBlockCommitOptions,
} from './stagingBlockRegistry.ts';

interface StagingPaneProps {
  stagingBlocks: StagingBlock[];
  characters: CharacterBinding[];
  aestheticTokens: AestheticToken[];
  diagnosticsByBlockIndex: Map<number, LintDiagnostic[]>;
  historyRevision: number;
  onUpdateStaging: (
    blockIndex: number,
    nextBody: string,
    options?: StagingBlockCommitOptions
  ) => void;
  onInsertStaging: (headerName: string, afterBlockIndex?: number) => void;
  onDeleteStaging: (blockIndex: number) => void;
  onReorderStaging: (fromBlockIndex: number, toBlockIndex: number) => void;
}

const STAGING_GRID = 'grid-cols-[minmax(0,1fr)_24px]';

/**
 * Left column of the Live Mode workspace (Phase 1: Staging / S0).
 * Owns its sticky editorial header, collapse state, surgical insertion pickers,
 * and sortable Staging Macro-Block cards.
 */
export function StagingPane({
  stagingBlocks,
  characters,
  aestheticTokens,
  diagnosticsByBlockIndex,
  historyRevision,
  onUpdateStaging,
  onInsertStaging,
  onDeleteStaging,
  onReorderStaging,
}: StagingPaneProps) {
  const [collapsedIndices, setCollapsedIndices] = useState<Set<number>>(() => new Set());
  const [activeStagingPicker, setActiveStagingPicker] = useState<number | 'bottom' | null>(null);
  const [autoFocusBlockIndex, setAutoFocusBlockIndex] = useState<number | null>(null);
  const [stagingScrolled, setStagingScrolled] = useState<boolean>(false);
  const [isDraggingAny, setIsDraggingAny] = useState<boolean>(false);
  const pendingDeleteRef = useRef<{index: number; count: number} | null>(null);

  // Reconcile index-based collapse flags after confirmed deletions or external script changes
  useEffect(() => {
    const pending = pendingDeleteRef.current;
    if (pending && stagingBlocks.length === pending.count - 1) {
      pendingDeleteRef.current = null;
      setCollapsedIndices((prev) => deleteCollapsedIndex(prev, pending.index));
      return;
    }
    if (pending && stagingBlocks.length !== pending.count) {
      pendingDeleteRef.current = null;
    }
    setCollapsedIndices((prev) => pruneCollapsedIndices(prev, stagingBlocks.length));
  }, [stagingBlocks.length]);

  const allStagingCollapsed =
    stagingBlocks.length > 0 && stagingBlocks.every((_, idx) => collapsedIndices.has(idx));

  const toggleAllStaging = () => {
    if (allStagingCollapsed) {
      setCollapsedIndices(new Set());
    } else {
      setCollapsedIndices(new Set(stagingBlocks.map((_, idx) => idx)));
    }
  };

  const toggleSingleBlock = (blockIndex: number) => {
    setCollapsedIndices((prev) => toggleCollapsedIndex(prev, blockIndex));
  };

  const handleInsertStagingBlock = (headerName: string, afterBlockIndex?: number) => {
    pendingDeleteRef.current = null;
    const insertedIndex =
      afterBlockIndex === undefined
        ? stagingBlocks.length
        : Math.max(0, Math.min(afterBlockIndex + 1, stagingBlocks.length));
    setCollapsedIndices((prev) => insertCollapsedIndex(prev, insertedIndex));
    setActiveStagingPicker(null);
    onInsertStaging(headerName, afterBlockIndex);
    setAutoFocusBlockIndex(insertedIndex);
  };

  const handleDeleteStaging = (blockIndex: number) => {
    pendingDeleteRef.current = {index: blockIndex, count: stagingBlocks.length};
    onDeleteStaging(blockIndex);
  };

  const handleReorderStaging = (fromIndex: number, toIndex: number) => {
    pendingDeleteRef.current = null;
    setCollapsedIndices((prev) =>
      reorderCollapsedIndices(prev, fromIndex, toIndex, stagingBlocks.length)
    );
    onReorderStaging(fromIndex, toIndex);
  };

  const existingBlockNames = stagingBlocks.map((b) => b.name);

  return (
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
        <div className="mx-auto w-full max-w-[660px] px-3 sm:px-5 lg:ml-auto lg:mr-0 lg:pl-5 lg:pr-3">
          <div className={`grid ${STAGING_GRID} items-center gap-1.5`}>
            <div
              className={`flex h-10 min-w-0 items-center justify-between gap-2.5 px-0.5 transition-colors duration-200 ${
                stagingScrolled ? 'border-b border-transparent' : 'border-b border-border-main/70'
              }`}
            >
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="whitespace-nowrap shrink-0 font-mono text-[10.5px] font-medium tracking-wide text-text-faint">
                  {UI_LABELS.document.phase1Kicker}
                </span>
                <span
                  aria-hidden="true"
                  className="h-2.5 w-px self-center bg-border-main shrink-0"
                />
                <h2 className="truncate font-serif text-[13.5px] font-bold tracking-tight text-text-main">
                  {UI_LABELS.document.phase1Name}
                </h2>
                <span
                  aria-hidden="true"
                  className="hidden sm:inline text-text-placeholder shrink-0"
                >
                  ·
                </span>
                <span className="hidden sm:inline whitespace-nowrap shrink-0 font-mono text-[10.5px] text-text-faint tabular-nums">
                  {UI_LABELS.document.stagingBlockCount(stagingBlocks.length)}
                </span>
              </div>

              {stagingBlocks.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAllStaging}
                  className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-text-muted hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
                >
                  {allStagingCollapsed ? (
                    <ChevronsUpDown className="h-3 w-3 text-text-faint" />
                  ) : (
                    <ChevronsDownUp className="h-3 w-3 text-text-faint" />
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
          className={`pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b from-app/90 via-app/40 to-transparent transition-opacity duration-200 ${
            stagingScrolled ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      <div
        className={`mx-auto w-full max-w-[660px] px-3 pb-8 sm:px-5 lg:ml-auto lg:mr-0 lg:pl-5 lg:pr-3 lg:pb-24 ${
          stagingBlocks.length > 0 ? 'pt-1' : 'pt-2.5'
        }`}
      >
        {stagingBlocks.length > 0 ? (
          <div>
            {/* Surgical insert seam before the first Staging Macro-Block */}
            <HoverInsertSeam
              gridClass={STAGING_GRID}
              buttonLabel={UI_LABELS.document.insertMacroBlockBeforeFirst}
              isPickerTrigger
              quiet={isDraggingAny}
              onClick={() => setActiveStagingPicker((prev) => (prev === -1 ? null : -1))}
            />

            {activeStagingPicker === -1 && (
              <div className={`grid ${STAGING_GRID} gap-1.5 py-1.5`}>
                <StagingBlockPickerPanel
                  existingBlockNames={existingBlockNames}
                  onSelectBlock={(name) => handleInsertStagingBlock(name, -1)}
                  onClose={() => setActiveStagingPicker(null)}
                />
                <div />
              </div>
            )}

            <SortableList
              items={stagingBlocks}
              scopeId="staging"
              onReorder={handleReorderStaging}
              onDragStart={() => {
                setActiveStagingPicker(null);
                setIsDraggingAny(true);
              }}
              onDragEnd={() => setIsDraggingAny(false)}
              renderOverlay={(block) => {
                const phase = getMacroBlockMeta(block.kind);
                const meta = formatStagingCollapsedMeta(block, characters, aestheticTokens);
                return (
                  <div className={`grid ${STAGING_GRID} items-center gap-1.5 cursor-grabbing`}>
                    <div className="flex items-center justify-between gap-2.5 rounded-lg border border-text-muted/50 bg-surface px-2.5 py-2 shadow-lg ring-1 ring-border-main/60 select-none">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <GripVertical className="h-3 w-3 shrink-0 text-text-muted" />
                        <span
                          className={`${phase.badgeClass} inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-tight shrink-0`}
                        >
                          [{block.name}]
                        </span>
                        <span className="text-[11.5px] text-text-muted truncate">
                          {phase.caption}
                        </span>
                      </div>
                      {meta && (
                        <span className="font-mono text-[10.5px] text-text-faint tabular-nums whitespace-nowrap shrink-0">
                          {meta}
                        </span>
                      )}
                    </div>
                    <div />
                  </div>
                );
              }}
              renderItem={(block, index, binding) => {
                const prevBlock = index > 0 ? stagingBlocks[index - 1] : null;
                const seamSlot = index - 1;
                return (
                  <>
                    {index > 0 && prevBlock && (
                      <>
                        <HoverInsertSeam
                          gridClass={STAGING_GRID}
                          buttonLabel={UI_LABELS.document.insertMacroBlockBetween(
                            prevBlock.name,
                            block.name
                          )}
                          isPickerTrigger
                          subtleHairline
                          quiet={binding.isAnyDragging}
                          onClick={() =>
                            setActiveStagingPicker((prev) =>
                              prev === seamSlot ? null : seamSlot
                            )
                          }
                        />

                        {activeStagingPicker === seamSlot && (
                          <div className={`grid ${STAGING_GRID} gap-1.5 py-1.5`}>
                            <StagingBlockPickerPanel
                              existingBlockNames={existingBlockNames}
                              onSelectBlock={(name) => handleInsertStagingBlock(name, seamSlot)}
                              onClose={() => setActiveStagingPicker(null)}
                            />
                            <div />
                          </div>
                        )}
                      </>
                    )}

                    <StagingBlockCard
                      block={block}
                      blockIndex={index}
                      historyRevision={historyRevision}
                      collapsed={collapsedIndices.has(index)}
                      onToggleCollapse={() => toggleSingleBlock(index)}
                      onCommit={onUpdateStaging}
                      onDelete={handleDeleteStaging}
                      autoFocusEdit={autoFocusBlockIndex === index}
                      onClearAutoFocus={() => setAutoFocusBlockIndex(null)}
                      diagnostics={diagnosticsByBlockIndex.get(index) ?? []}
                      characters={characters}
                      aestheticTokens={aestheticTokens}
                      drag={binding}
                    />
                  </>
                );
              }}
            />
          </div>
        ) : (
          <div className={`grid ${STAGING_GRID} gap-1.5`}>
            <div className="rounded-lg border border-dashed border-border-main bg-surface/50 px-3 py-5 text-center text-xs leading-relaxed text-text-faint">
              {UI_LABELS.document.noStagingBlocks}
            </div>
            <div />
          </div>
        )}

        {/* Quiet bottom Add Macro-Block action */}
        <AddStagingBlockPicker
          existingBlockNames={existingBlockNames}
          isOpen={activeStagingPicker === 'bottom'}
          onToggle={() =>
            setActiveStagingPicker((prev) => (prev === 'bottom' ? null : 'bottom'))
          }
          onClose={() => setActiveStagingPicker(null)}
          onAddBlock={(name) => handleInsertStagingBlock(name)}
        />
      </div>
    </section>
  );
}
