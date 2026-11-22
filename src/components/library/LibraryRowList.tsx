import {Check, ChevronDown, ChevronRight, Folder, GitFork, Pin, Square} from 'lucide-react';
import {UI_LABELS} from '../../ui/labels.ts';
import {
  formatRelativeUpdatedTime,
  type ActiveScriptRef,
  type LibraryFilterTab,
  type LibraryRowItem,
  type PaginatedLibraryRows,
} from '../../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../../ui/tokens/ui.ts';
import {getLibraryRowKey} from './useLibraryModalNavigation.ts';

export interface LibraryRowListProps {
  paginated: PaginatedLibraryRows;
  visibleBeatCounts: readonly number[];
  selectedIndex: number;
  activeScript: ActiveScriptRef;
  openedAt: number;
  isBulkMode: boolean;
  checkedIds: ReadonlySet<string>;
  query: string;
  hasFacetFilters: boolean;
  filterTab: LibraryFilterTab;
  registerRowRef: (index: number, el: HTMLDivElement | null) => void;
  onSelectKey: (rowKey: string) => void;
  onToggleExpandFamily: (rootId: string) => void;
  onToggleCheckedId: (id: string) => void;
  onOpenRow: (row: LibraryRowItem) => void;
  onShowMore: () => void;
}

function getBranchIndentClass(depth: number): string {
  if (depth <= 0) return 'pl-3';
  if (depth === 1) return 'pl-6';
  if (depth === 2) return 'pl-9';
  return 'pl-11';
}

/**
 * Scrollable paginated listbox for ScriptLibraryModal:
 * collapsible root families with `[▾ N branches]` toggles, indented child branch rows,
 * bulk checkboxes, active/pinned/example badges, folder/tag chips,
 * full-text match snippet, empty states, and "Show more" pagination button.
 */
export function LibraryRowList({
  paginated,
  visibleBeatCounts,
  selectedIndex,
  activeScript,
  openedAt,
  isBulkMode,
  checkedIds,
  query,
  hasFacetFilters,
  filterTab,
  registerRowRef,
  onSelectKey,
  onToggleExpandFamily,
  onToggleCheckedId,
  onOpenRow,
  onShowMore,
}: LibraryRowListProps) {
  const emptyMessage =
    query.trim().length > 0 || hasFacetFilters
      ? UI_LABELS.library.emptySearch
      : filterTab === 'custom'
        ? UI_LABELS.library.emptyCustom
        : UI_LABELS.library.emptyAll;

  return (
    <div
      role="listbox"
      aria-label={UI_LABELS.library.title}
      className="auteur-pane-scroll flex-1 min-h-0 overflow-y-auto divide-y divide-border-subtle/70"
    >
      {paginated.visible.length === 0 ? (
        <div className="px-6 py-12 text-center text-xs leading-relaxed text-text-faint">
          {emptyMessage}
        </div>
      ) : (
        <>
          {paginated.visible.map((row, index) => {
            const rowKey = getLibraryRowKey(row);
            const isSelected = index === selectedIndex;
            const isActive = activeScript.kind === row.kind && activeScript.id === row.id;
            const beatCount = visibleBeatCounts[index] ?? 0;
            const isChecked = row.kind === 'custom' && checkedIds.has(row.id);
            const depth = row.kind === 'custom' ? (row.depth ?? 0) : 0;
            const isChildBranch = row.kind === 'custom' && depth >= 1;
            const hasCollapsibleBranches =
              row.kind === 'custom' &&
              row.depth === 0 &&
              row.rootId !== undefined &&
              (row.branchCount ?? 0) > 0;

            return (
              <div
                key={rowKey}
                ref={(el) => registerRowRef(index, el)}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  if (isBulkMode && row.kind === 'custom') {
                    onToggleCheckedId(row.id);
                    onSelectKey(rowKey);
                    return;
                  }
                  onSelectKey(rowKey);
                  if (
                    typeof window !== 'undefined' &&
                    window.matchMedia('(max-width: 767px)').matches
                  ) {
                    onOpenRow(row);
                  }
                }}
                onDoubleClick={() => {
                  if (!isBulkMode) {
                    onOpenRow(row);
                  }
                }}
                className={`relative flex items-start gap-2.5 ${getBranchIndentClass(depth)} pr-3.5 py-2.5 border-l-2 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-l-text-main bg-surface-muted/75'
                    : isChildBranch
                      ? 'border-l-transparent bg-surface-subtle/30 hover:bg-surface-subtle/80'
                      : 'border-l-transparent bg-surface hover:bg-surface-subtle/70'
                }`}
              >
                {isChildBranch && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-0 bottom-0 w-px bg-border-main/70"
                  />
                )}

                {isBulkMode && (
                  <button
                    type="button"
                    disabled={row.kind !== 'custom'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (row.kind === 'custom') onToggleCheckedId(row.id);
                    }}
                    aria-label={UI_LABELS.library.selectRowAria(row.title)}
                    className={`mt-0.5 shrink-0 ${
                      row.kind !== 'custom'
                        ? 'opacity-25 cursor-not-allowed'
                        : 'text-text-muted hover:text-text-main cursor-pointer'
                    }`}
                  >
                    {isChecked ? (
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                )}

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isChildBranch && (
                        <GitFork className="h-3 w-3 text-sky-500/80 shrink-0" />
                      )}
                      {row.kind === 'custom' && row.pinned && (
                        <Pin
                          aria-label={UI_LABELS.library.pinnedBadge}
                          className="h-3 w-3 text-text-muted shrink-0"
                        />
                      )}
                      <span className="truncate font-serif text-[13px] font-bold tracking-tight text-text-main">
                        {row.title}
                      </span>
                      {isActive && (
                        <span className="inline-flex shrink-0 items-center rounded border border-border-main bg-surface-muted px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-wide text-text-muted">
                          {UI_LABELS.library.activeBadge}
                        </span>
                      )}
                    </div>

                    {hasCollapsibleBranches && row.rootId && row.branchCount && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleExpandFamily(row.rootId!);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        aria-expanded={Boolean(row.isFamilyExpanded)}
                        aria-label={
                          row.isFamilyExpanded
                            ? UI_LABELS.library.collapseBranchesAria(row.title, row.branchCount)
                            : UI_LABELS.library.expandBranchesAria(row.title, row.branchCount)
                        }
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
                      >
                        {row.isFamilyExpanded ? (
                          <ChevronDown className="h-2.5 w-2.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                        )}
                        <span>{UI_LABELS.library.branchCountLabel(row.branchCount)}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-text-faint tabular-nums">
                    {row.kind === 'example' ? (
                      <>
                        <span className="auteur-phase-logic inline-flex items-center rounded border px-1 py-px text-[9px] font-semibold">
                          {UI_LABELS.library.exampleBadge}
                        </span>
                        <span className="truncate">{row.topology}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {beatCount} {UI_LABELS.topBar.beatUnit(beatCount)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>
                          {beatCount} {UI_LABELS.topBar.beatUnit(beatCount)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRelativeUpdatedTime(row.updatedAt, openedAt)}</span>
                        {row.parentTitle && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-0.5 text-text-muted truncate max-w-[140px]">
                              <span aria-hidden="true">↳</span>
                              <span className="truncate">
                                {UI_LABELS.library.fromParentLabel(row.parentTitle)}
                              </span>
                            </span>
                          </>
                        )}
                        {row.folder && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-0.5 text-text-muted truncate max-w-[110px]">
                              <Folder className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{row.folder}</span>
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {row.kind === 'custom' && row.branchNote && (
                    <p className="truncate text-[11px] text-text-muted">{row.branchNote}</p>
                  )}

                  {row.kind === 'custom' && row.tags && row.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {row.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded border border-border-subtle bg-surface-subtle px-1 py-px font-mono text-[9.5px] text-text-faint"
                        >
                          #{tag}
                        </span>
                      ))}
                      {row.tags.length > 3 && (
                        <span className="font-mono text-[9.5px] text-text-faint">
                          +{row.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {row.matchSnippet && (
                    <p className="truncate font-script text-[11px] italic text-text-muted">
                      “{row.matchSnippet}”
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {paginated.hasMore && (
            <div className="px-4 py-2.5 bg-surface text-center">
              <button
                type="button"
                onClick={onShowMore}
                className={UI_TOKENS.button.secondary}
              >
                {UI_LABELS.library.showMore(paginated.remainingCount)}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
