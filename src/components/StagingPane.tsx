import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ChevronsDownUp, ChevronsUpDown, GripVertical} from 'lucide-react';
import type {
  AestheticToken,
  CharacterBinding,
  LintDiagnostic,
  StagingBlock,
} from '../core/types.ts';
import {getMacroBlockMeta, UI_LABELS} from '../ui/labels.ts';
import type {
  LiveBlockPatchIndicator,
  LiveInsertionPatchIndicator,
} from '../ui/patchIndicators.ts';
import {
  EMPTY_BLOCK_PATCH_INDICATORS,
  EMPTY_DIAGNOSTICS,
  EMPTY_INSERTION_PATCH_INDICATORS,
  stabilizeStringArray,
} from '../ui/referenceStability.ts';
import {
  areAllIndicesCollapsed,
  deleteCollapsedIndex,
  insertCollapsedIndex,
  pruneCollapsedIndices,
  reorderCollapsedIndices,
  toggleAllCollapsedIndices,
  toggleCollapsedIndex,
} from '../ui/stagingCollapse.ts';
import {useStableValue} from '../ui/useStableValue.ts';
import {AddStagingBlockPicker, StagingBlockPickerPanel} from './AddStagingBlockPicker.tsx';
import {AiPatchInsertionSeam} from './AiPatchIndicator.tsx';
import {HoverInsertSeam} from './HoverInsertSeam.tsx';
import {SortableList, type SortableItemBinding} from './SortableList.tsx';
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
  patchIndicatorsByBlockIndex: Map<number, LiveBlockPatchIndicator[]>;
  patchInsertionsByAfterIndex: Map<number, LiveInsertionPatchIndicator[]>;
  historyRevision: number;
  readOnly?: boolean;
  onUpdateStaging: (
    blockIndex: number,
    nextBody: string,
    options?: StagingBlockCommitOptions
  ) => void;
  onInsertStaging: (headerName: string, afterBlockIndex?: number) => void;
  onDeleteStaging: (blockIndex: number) => void;
  onReorderStaging: (fromBlockIndex: number, toBlockIndex: number) => void;
}

const STAGING_GRID = 'grid-cols-1 sm:grid-cols-[minmax(0,1fr)_24px]';

/**
 * Left column of the Live Mode workspace (Phase 1: Staging / S0).
 * Owns its sticky editorial header, collapse state, surgical insertion pickers,
 * and sortable Staging Macro-Block cards.
 */
export const StagingPane = memo(function StagingPane({
  stagingBlocks,
  characters,
  aestheticTokens,
  diagnosticsByBlockIndex,
  patchIndicatorsByBlockIndex,
  patchInsertionsByAfterIndex,
  historyRevision,
  readOnly = false,
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
  const stagingBlocksCountRef = useRef<number>(stagingBlocks.length);

  useEffect(() => {
    stagingBlocksCountRef.current = stagingBlocks.length;
  }, [stagingBlocks.length]);

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

  const allStagingCollapsed = areAllIndicesCollapsed(collapsedIndices, stagingBlocks.length);

  const toggleAllStaging = useCallback(() => {
    setCollapsedIndices((prev) => toggleAllCollapsedIndices(prev, stagingBlocksCountRef.current));
  }, []);

  const toggleSingleBlock = useCallback((blockIndex: number) => {
    setCollapsedIndices((prev) => toggleCollapsedIndex(prev, blockIndex));
  }, []);

  const handleClearAutoFocus = useCallback(() => {
    setAutoFocusBlockIndex(null);
  }, []);

  const handleInsertStagingBlock = useCallback(
    (headerName: string, afterBlockIndex?: number) => {
      pendingDeleteRef.current = null;
      const count = stagingBlocksCountRef.current;
      const insertedIndex =
        afterBlockIndex === undefined
          ? count
          : Math.max(0, Math.min(afterBlockIndex + 1, count));
      setCollapsedIndices((prev) => insertCollapsedIndex(prev, insertedIndex));
      setActiveStagingPicker(null);
      onInsertStaging(headerName, afterBlockIndex);
      setAutoFocusBlockIndex(insertedIndex);
    },
    [onInsertStaging]
  );

  const handleDeleteStaging = useCallback(
    (blockIndex: number) => {
      pendingDeleteRef.current = {index: blockIndex, count: stagingBlocksCountRef.current};
      onDeleteStaging(blockIndex);
    },
    [onDeleteStaging]
  );

  const handleReorderStaging = useCallback(
    (fromIndex: number, toIndex: number) => {
      pendingDeleteRef.current = null;
      setCollapsedIndices((prev) =>
        reorderCollapsedIndices(prev, fromIndex, toIndex, stagingBlocksCountRef.current)
      );
      onReorderStaging(fromIndex, toIndex);
    },
    [onReorderStaging]
  );

  const handleDragStart = useCallback(() => {
    setActiveStagingPicker(null);
    setIsDraggingAny(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDraggingAny(false);
  }, []);

  const rawBlockNames = useMemo(() => stagingBlocks.map((b) => b.name), [stagingBlocks]);
  const existingBlockNames = useStableValue(rawBlockNames, stabilizeStringArray);

  const renderOverlay = useCallback(
    (block: StagingBlock) => {
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
              <span className="text-[11.5px] text-text-muted truncate">{phase.caption}</span>
            </div>
            {meta && (
              <span className="font-mono text-[10.5px] text-text-faint tabular-nums whitespace-nowrap shrink-0">
                {meta}
              </span>
            )}
          </div>
          <div className="hidden sm:block" />
        </div>
      );
    },
    [characters, aestheticTokens]
  );

  const renderItem = useCallback(
    (block: StagingBlock, index: number, binding: SortableItemBinding) => {
      const prevBlockName = index > 0 ? existingBlockNames[index - 1] : null;
      const seamSlot = index - 1;
      return (
        <>
          {index > 0 && prevBlockName && (
            <>
              <AiPatchInsertionSeam
                gridClass={STAGING_GRID}
                insertions={
                  patchInsertionsByAfterIndex.get(seamSlot) ?? EMPTY_INSERTION_PATCH_INDICATORS
                }
              />

              <HoverInsertSeam
                gridClass={STAGING_GRID}
                buttonLabel={UI_LABELS.document.insertMacroBlockBetween(prevBlockName, block.name)}
                isPickerTrigger
                subtleHairline
                quiet={binding.isAnyDragging}
                readOnly={readOnly}
                onClick={() =>
                  setActiveStagingPicker((prev) => (prev === seamSlot ? null : seamSlot))
                }
              />

              {!readOnly && activeStagingPicker === seamSlot && (
                <div className={`grid ${STAGING_GRID} gap-1.5 py-1.5`}>
                  <StagingBlockPickerPanel
                    existingBlockNames={existingBlockNames}
                    onSelectBlock={(name) => handleInsertStagingBlock(name, seamSlot)}
                    onClose={() => setActiveStagingPicker(null)}
                  />
                  <div className="hidden sm:block" />
                </div>
              )}
            </>
          )}

          <StagingBlockCard
            block={block}
            blockIndex={index}
            historyRevision={historyRevision}
            readOnly={readOnly}
            collapsed={collapsedIndices.has(index)}
            onToggleCollapse={toggleSingleBlock}
            onCommit={onUpdateStaging}
            onDelete={handleDeleteStaging}
            autoFocusEdit={autoFocusBlockIndex === index}
            onClearAutoFocus={handleClearAutoFocus}
            diagnostics={diagnosticsByBlockIndex.get(index) ?? EMPTY_DIAGNOSTICS}
            patchIndicators={
              patchIndicatorsByBlockIndex.get(index) ?? EMPTY_BLOCK_PATCH_INDICATORS
            }
            characters={characters}
            aestheticTokens={aestheticTokens}
            drag={readOnly ? undefined : binding}
          />
        </>
      );
    },
    [
      existingBlockNames,
      readOnly,
      activeStagingPicker,
      handleInsertStagingBlock,
      historyRevision,
      collapsedIndices,
      toggleSingleBlock,
      onUpdateStaging,
      handleDeleteStaging,
      autoFocusBlockIndex,
      handleClearAutoFocus,
      diagnosticsByBlockIndex,
      patchIndicatorsByBlockIndex,
      patchInsertionsByAfterIndex,
      characters,
      aestheticTokens,
    ]
  );

  return (
    <section
      aria-label={UI_LABELS.document.stagingPaneAria}
      onScroll={(e) => {
        const next = e.currentTarget.scrollTop > 8;
        if (next !== stagingScrolled) setStagingScrolled(next);
      }}
      className="auteur-pane-scroll flex flex-col border-b border-border-main lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r"
    >
      {/* Sticky Editorial Folio Header — Staging (Compact on < 640px) */}
      <div
        className={`relative pt-1 sm:pt-0 transition-colors duration-200 lg:sticky lg:top-0 lg:z-20 ${
          stagingScrolled
            ? 'bg-app/88 backdrop-blur-md border-b border-border-main'
            : 'bg-app border-b border-transparent'
        }`}
      >
        <div className="mx-auto w-full max-w-[660px] px-3 sm:px-5 lg:ml-auto lg:mr-0 lg:pl-5 lg:pr-3">
          <div className={`grid ${STAGING_GRID} items-center gap-1.5`}>
            <div
              className={`flex h-8 sm:h-10 min-w-0 items-center justify-between gap-2.5 px-0.5 transition-colors duration-200 ${
                stagingScrolled ? 'border-b border-transparent' : 'border-b border-border-main/70'
              }`}
            >
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="hidden sm:inline whitespace-nowrap shrink-0 font-mono text-[10.5px] font-medium tracking-wide text-text-faint">
                  {UI_LABELS.document.phase1Kicker}
                </span>
                <span
                  aria-hidden="true"
                  className="hidden sm:block h-2.5 w-px self-center bg-border-main shrink-0"
                />
                <h2 className="truncate font-serif text-[12.5px] sm:text-[13.5px] font-bold tracking-tight text-text-main">
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
                  className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-md px-1.5 py-0.5 text-[11px] sm:text-[11.5px] font-medium text-text-muted hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
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
            <div className="hidden sm:block" />
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
        className={`mx-auto w-full max-w-[660px] px-3 pb-4 sm:px-5 sm:pb-8 lg:ml-auto lg:mr-0 lg:pl-5 lg:pr-3 lg:pb-24 ${
          stagingBlocks.length > 0 ? 'pt-2 sm:pt-1' : 'pt-2.5'
        }`}
      >
        {stagingBlocks.length > 0 ? (
          <div>
            <AiPatchInsertionSeam
              gridClass={STAGING_GRID}
              insertions={
                patchInsertionsByAfterIndex.get(-1) ?? EMPTY_INSERTION_PATCH_INDICATORS
              }
            />

            {/* Surgical insert seam before the first Staging Macro-Block */}
            {!readOnly && (
              <>
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
                    <div className="hidden sm:block" />
                  </div>
                )}
              </>
            )}

            <SortableList
              items={stagingBlocks}
              scopeId="staging"
              disabled={readOnly}
              onReorder={handleReorderStaging}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              renderOverlay={renderOverlay}
              renderItem={renderItem}
            />

            <AiPatchInsertionSeam
              gridClass={STAGING_GRID}
              insertions={
                patchInsertionsByAfterIndex.get(stagingBlocks.length - 1) ??
                EMPTY_INSERTION_PATCH_INDICATORS
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            <AiPatchInsertionSeam
              gridClass={STAGING_GRID}
              insertions={
                patchInsertionsByAfterIndex.get(-1) ?? EMPTY_INSERTION_PATCH_INDICATORS
              }
            />
            <div className={`grid ${STAGING_GRID} gap-1.5`}>
              <div className="rounded-lg border border-dashed border-border-main bg-surface/50 px-3 py-5 text-center text-xs leading-relaxed text-text-faint">
                {UI_LABELS.document.noStagingBlocks}
              </div>
              <div className="hidden sm:block" />
            </div>
          </div>
        )}

        {/* Quiet bottom Add Macro-Block action */}
        {!readOnly && (
          <AddStagingBlockPicker
            existingBlockNames={existingBlockNames}
            isOpen={activeStagingPicker === 'bottom'}
            onToggle={() =>
              setActiveStagingPicker((prev) => (prev === 'bottom' ? null : 'bottom'))
            }
            onClose={() => setActiveStagingPicker(null)}
            onAddBlock={(name) => handleInsertStagingBlock(name)}
          />
        )}
      </div>
    </section>
  );
});
