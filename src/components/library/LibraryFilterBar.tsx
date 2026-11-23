import {useEffect, useMemo, useRef, useState, type RefObject} from 'react';
import {
  ArrowUpDown,
  Check,
  CheckSquare,
  ChevronDown,
  Download,
  Folder,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {UI_LABELS} from '../../ui/labels.ts';
import type {ScriptRecord} from '../../ui/scriptLibraryDb.ts';
import {
  filterAndSortLibraryFacets,
  type LibraryFacets,
  type LibraryFilterTab,
  type LibrarySortBy,
} from '../../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../../ui/tokens/ui.ts';

const FILTER_TABS: readonly LibraryFilterTab[] = ['all', 'custom', 'examples'];
const SORT_OPTIONS: readonly LibrarySortBy[] = ['recent', 'title', 'beats'];
const FACET_SEARCH_THRESHOLD = 6;

export interface LibraryFilterBarProps {
  query: string;
  onQueryChange: (next: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  filterTab: LibraryFilterTab;
  onFilterTabChange: (tab: LibraryFilterTab) => void;
  tabCounts: Record<LibraryFilterTab, number>;
  sortBy: LibrarySortBy;
  onSortByChange: (sort: LibrarySortBy) => void;
  isSortMenuOpen: boolean;
  onToggleSortMenu: () => void;
  onCloseSortMenu: () => void;
  sortMenuRef: RefObject<HTMLDivElement | null>;
  isFilterMenuOpen: boolean;
  onToggleFilterMenu: () => void;
  onCloseFilterMenu: () => void;
  filterTriggerRef: RefObject<HTMLButtonElement | null>;
  filterPopoverRef: RefObject<HTMLDivElement | null>;
  customScriptsCount: number;
  readOnly?: boolean;
  isBulkMode: boolean;
  onToggleBulkMode: () => void;
  facets: LibraryFacets;
  hasFacets: boolean;
  hasFacetFilters: boolean;
  activeFolder: string | null;
  onSelectFolder: (folder: string | null) => void;
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onClearFacetFilters: () => void;
}

/**
 * Left-pane filter header for ScriptLibraryModal:
 * full-text search input, segmented filter tabs, custom sort & folder/tag filter popovers,
 * bulk selection mode toggle, and active-only filter chips.
 */
export function LibraryFilterBar({
  query,
  onQueryChange,
  searchInputRef,
  filterTab,
  onFilterTabChange,
  tabCounts,
  sortBy,
  onSortByChange,
  isSortMenuOpen,
  onToggleSortMenu,
  onCloseSortMenu,
  sortMenuRef,
  isFilterMenuOpen,
  onToggleFilterMenu,
  onCloseFilterMenu,
  filterTriggerRef,
  filterPopoverRef,
  customScriptsCount,
  readOnly = false,
  isBulkMode,
  onToggleBulkMode,
  facets,
  hasFacets,
  hasFacetFilters,
  activeFolder,
  onSelectFolder,
  activeTag,
  onSelectTag,
  onClearFacetFilters,
}: LibraryFilterBarProps) {
  const [facetQuery, setFacetQuery] = useState<string>('');
  const facetSearchInputRef = useRef<HTMLInputElement | null>(null);

  const totalFacetCount = facets.folders.length + facets.tags.length;
  const showFacetSearch = totalFacetCount > FACET_SEARCH_THRESHOLD;
  const activeFacetCount = (activeFolder !== null ? 1 : 0) + (activeTag !== null ? 1 : 0);

  useEffect(() => {
    if (!isFilterMenuOpen) {
      setFacetQuery('');
      return;
    }
    if (showFacetSearch) {
      const id = requestAnimationFrame(() => {
        facetSearchInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isFilterMenuOpen, showFacetSearch]);

  const filteredFacets = useMemo(
    () => filterAndSortLibraryFacets(facets, facetQuery),
    [facets, facetQuery]
  );

  return (
    <div className="px-3.5 py-3 border-b border-border-subtle space-y-2.5 shrink-0">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-faint"
        />
        <input
          ref={searchInputRef}
          type="text"
          data-native-undo="true"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={UI_LABELS.library.searchPlaceholder}
          aria-label={UI_LABELS.library.searchAria}
          className={UI_TOKENS.input.search}
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onQueryChange('');
              searchInputRef.current?.focus();
            }}
            aria-label={UI_LABELS.library.clearSearchAria}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-faint hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Row 1: Full-width Segmented Filter Tabs */}
      <div
        role="tablist"
        aria-label={UI_LABELS.library.tabsAria}
        className="grid grid-cols-3 bg-surface-muted p-0.5 rounded-xl border border-border-main"
      >
        {FILTER_TABS.map((tab) => {
          const isSelectedTab = filterTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isSelectedTab}
              onClick={() => onFilterTabChange(tab)}
              className={
                isSelectedTab
                  ? 'flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold bg-surface text-text-main shadow-xs transition-colors cursor-pointer whitespace-nowrap'
                  : 'flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium text-text-muted hover:text-text-main hover:bg-surface/60 transition-colors cursor-pointer whitespace-nowrap'
              }
            >
              <span>{UI_LABELS.library.tabs[tab]}</span>
              <span className="font-mono text-[10px] text-text-faint tabular-nums">
                {tabCounts[tab]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Row 2: Sort Menu + Folder/Tag Filter Popover (left) + Bulk Select Toggle (right) */}
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div ref={sortMenuRef} className="relative">
            <button
              type="button"
              aria-label={UI_LABELS.library.sortAria}
              aria-haspopup="menu"
              aria-expanded={isSortMenuOpen}
              onClick={() => {
                onCloseFilterMenu();
                onToggleSortMenu();
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                isSortMenuOpen
                  ? 'border-border-main bg-surface-muted text-text-main'
                  : 'border-border-main bg-surface text-text-body hover:bg-surface-subtle hover:text-text-main'
              }`}
            >
              <ArrowUpDown className="h-3 w-3 text-text-faint shrink-0" />
              <span>{UI_LABELS.library.sortOptions[sortBy]}</span>
              <ChevronDown
                className={`h-3 w-3 text-text-faint shrink-0 transition-transform duration-150 ${
                  isSortMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isSortMenuOpen && (
              <div
                role="menu"
                aria-label={UI_LABELS.library.sortAria}
                className="absolute top-full left-0 mt-1.5 w-40 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main py-1"
              >
                {SORT_OPTIONS.map((opt) => {
                  const isActiveSort = sortBy === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActiveSort}
                      onClick={() => {
                        onSortByChange(opt);
                        onCloseSortMenu();
                      }}
                      className={`w-full text-left px-3 py-1.5 text-[11.5px] flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isActiveSort
                          ? 'bg-surface-muted font-semibold text-text-main'
                          : 'font-medium text-text-body hover:bg-surface-subtle hover:text-text-main'
                      }`}
                    >
                      <span>{UI_LABELS.library.sortOptions[opt]}</span>
                      {isActiveSort && <Check className="h-3 w-3 text-text-main shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {hasFacets && (
            <button
              ref={filterTriggerRef}
              type="button"
              aria-label={UI_LABELS.library.filterAria}
              aria-haspopup="dialog"
              aria-expanded={isFilterMenuOpen}
              onClick={() => {
                onCloseSortMenu();
                onToggleFilterMenu();
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                isFilterMenuOpen || hasFacetFilters
                  ? 'border-border-main bg-surface-muted text-text-main'
                  : 'border-border-main bg-surface text-text-body hover:bg-surface-subtle hover:text-text-main'
              }`}
            >
              <SlidersHorizontal
                className={`h-3 w-3 shrink-0 ${
                  isFilterMenuOpen || hasFacetFilters ? 'text-text-main' : 'text-text-faint'
                }`}
              />
              <span>{UI_LABELS.library.filterButton}</span>
              {activeFacetCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 rounded-full bg-text-main text-surface font-mono text-[9.5px] font-semibold tabular-nums leading-none">
                  {activeFacetCount}
                </span>
              )}
              <ChevronDown
                className={`h-3 w-3 text-text-faint shrink-0 transition-transform duration-150 ${
                  isFilterMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}
        </div>

        {!readOnly && customScriptsCount > 0 && (
          <button
            type="button"
            onClick={onToggleBulkMode}
            aria-label={UI_LABELS.library.selectModeAria}
            aria-pressed={isBulkMode}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
              isBulkMode
                ? 'border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text'
                : 'border-border-main bg-surface text-text-muted hover:bg-surface-subtle hover:text-text-main'
            }`}
          >
            <CheckSquare className="h-3 w-3" />
            <span>
              {isBulkMode
                ? UI_LABELS.library.selectModeDone
                : UI_LABELS.library.selectModeButton}
            </span>
          </button>
        )}

        {/* Folder & Tag Filter Popover */}
        {hasFacets && isFilterMenuOpen && (
          <div
            ref={filterPopoverRef}
            role="dialog"
            aria-label={UI_LABELS.library.filterMenuAria}
            className="absolute top-full left-0 right-0 mt-1.5 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main"
          >
            {showFacetSearch && (
              <div className="px-2.5 py-2 border-b border-border-subtle bg-surface-subtle">
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-faint"
                  />
                  <input
                    ref={facetSearchInputRef}
                    type="text"
                    data-native-undo="true"
                    value={facetQuery}
                    onChange={(e) => setFacetQuery(e.target.value)}
                    placeholder={UI_LABELS.library.filterSearchPlaceholder}
                    aria-label={UI_LABELS.library.filterSearchAria}
                    className="w-full rounded-lg border border-border-main bg-surface pl-7 pr-6 py-1 text-[11px] text-text-body placeholder:text-text-faint focus:border-text-muted focus:outline-none"
                  />
                  {facetQuery.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFacetQuery('');
                        facetSearchInputRef.current?.focus();
                      }}
                      aria-label={UI_LABELS.library.filterClearSearchAria}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="max-h-[264px] overflow-y-auto auteur-pane-scroll p-2.5 space-y-2.5">
              {filteredFacets.folders.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                    {UI_LABELS.library.filterFoldersHeading}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredFacets.folders.map((folder) => {
                      const isOn = activeFolder?.toLowerCase() === folder.toLowerCase();
                      const count = facets.folderCounts[folder] ?? 0;
                      return (
                        <button
                          key={`folder:${folder}`}
                          type="button"
                          aria-label={UI_LABELS.library.folderFilterAria(folder)}
                          aria-pressed={isOn}
                          onClick={() => {
                            onSelectFolder(isOn ? null : folder);
                            onCloseFilterMenu();
                          }}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-medium transition-colors cursor-pointer ${
                            isOn
                              ? 'border-text-main bg-text-main text-surface'
                              : 'border-border-main bg-surface-subtle text-text-body hover:border-text-muted/60 hover:text-text-main'
                          }`}
                        >
                          <Folder className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate max-w-[160px]">{folder}</span>
                          {count > 0 && (
                            <span className="font-mono text-[9.5px] opacity-65 tabular-nums">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredFacets.tags.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                    {UI_LABELS.library.filterTagsHeading}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredFacets.tags.map((tag) => {
                      const isOn = activeTag === tag;
                      const count = facets.tagCounts[tag] ?? 0;
                      return (
                        <button
                          key={`tag:${tag}`}
                          type="button"
                          aria-label={UI_LABELS.library.tagFilterAria(tag)}
                          aria-pressed={isOn}
                          onClick={() => {
                            onSelectTag(isOn ? null : tag);
                            onCloseFilterMenu();
                          }}
                          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition-colors cursor-pointer ${
                            isOn
                              ? 'border-text-main bg-text-main text-surface'
                              : 'border-border-subtle bg-surface-subtle text-text-muted hover:border-border-main hover:text-text-main'
                          }`}
                        >
                          <span>#{tag}</span>
                          {count > 0 && (
                            <span className="text-[9.5px] opacity-65 tabular-nums">{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredFacets.folders.length === 0 && filteredFacets.tags.length === 0 && (
                <p className="py-3 text-center text-[11px] text-text-faint">
                  {UI_LABELS.library.filterEmptyMatch}
                </p>
              )}
            </div>

            {hasFacetFilters && (
              <div className="flex items-center justify-end px-2.5 py-1.5 border-t border-border-subtle bg-surface-subtle">
                <button
                  type="button"
                  onClick={() => {
                    onClearFacetFilters();
                    onCloseFilterMenu();
                  }}
                  className="text-[10.5px] font-medium text-text-muted hover:text-text-main underline underline-offset-2 cursor-pointer"
                >
                  {UI_LABELS.library.facetsClearFilters}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active-Only Filter Chips Strip */}
      {hasFacetFilters && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {activeFolder && (
            <button
              type="button"
              aria-label={UI_LABELS.library.clearFolderFilterAria(activeFolder)}
              onClick={() => onSelectFolder(null)}
              className="inline-flex items-center gap-1 rounded-md border border-text-main bg-text-main text-surface px-1.5 py-0.5 text-[10.5px] font-medium transition-opacity hover:opacity-90 cursor-pointer"
            >
              <Folder className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate max-w-[140px]">{activeFolder}</span>
              <X className="h-2.5 w-2.5 shrink-0 opacity-75" />
            </button>
          )}

          {activeTag && (
            <button
              type="button"
              aria-label={UI_LABELS.library.clearTagFilterAria(activeTag)}
              onClick={() => onSelectTag(null)}
              className="inline-flex items-center gap-1 rounded-md border border-text-main bg-text-main text-surface px-1.5 py-0.5 font-mono text-[10px] font-medium transition-opacity hover:opacity-90 cursor-pointer"
            >
              <span>#{activeTag}</span>
              <X className="h-2.5 w-2.5 shrink-0 opacity-75" />
            </button>
          )}

          {activeFacetCount > 1 && (
            <button
              type="button"
              onClick={onClearFacetFilters}
              className="text-[10.5px] text-text-faint hover:text-text-main underline underline-offset-2 cursor-pointer ml-0.5"
            >
              {UI_LABELS.library.facetsClearFilters}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface LibraryBulkToolbarProps {
  isBulkMode: boolean;
  selectedBulkRecords: readonly ScriptRecord[];
  visibleCustomCount: number;
  visibleCount: number;
  totalFilteredCount: number;
  onToggleSelectAllVisible: () => void;
  onBulkExportScripts: (records: readonly ScriptRecord[]) => void;
  onRequestBulkDelete: () => void;
}

/**
 * Left-pane footer for ScriptLibraryModal:
 * renders bulk selection actions in bulk mode, or quiet results count + keyboard hint otherwise.
 */
export function LibraryBulkToolbar({
  isBulkMode,
  selectedBulkRecords,
  visibleCustomCount,
  visibleCount,
  totalFilteredCount,
  onToggleSelectAllVisible,
  onBulkExportScripts,
  onRequestBulkDelete,
}: LibraryBulkToolbarProps) {
  if (isBulkMode) {
    return (
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-t border-border-subtle bg-surface-subtle text-[11px] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-semibold text-text-main tabular-nums">
            {UI_LABELS.library.selectedCount(selectedBulkRecords.length)}
          </span>
          {visibleCustomCount > 0 && (
            <button
              type="button"
              onClick={onToggleSelectAllVisible}
              className="text-text-muted hover:text-text-main underline underline-offset-2 cursor-pointer"
            >
              {selectedBulkRecords.length === visibleCustomCount
                ? UI_LABELS.library.clearSelection
                : UI_LABELS.library.selectAllVisible}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={selectedBulkRecords.length === 0}
            onClick={() => onBulkExportScripts(selectedBulkRecords)}
            className="inline-flex items-center gap-1 rounded-lg border border-border-main bg-surface px-2 py-1 text-[11px] font-medium text-text-body hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Download className="h-3 w-3" />
            <span>{UI_LABELS.library.bulkExportButton}</span>
          </button>
          <button
            type="button"
            disabled={selectedBulkRecords.length === 0}
            onClick={onRequestBulkDelete}
            className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Trash2 className="h-3 w-3" />
            <span>{UI_LABELS.library.bulkDeleteButton}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-t border-border-subtle bg-surface-subtle text-[10.5px] font-mono text-text-faint shrink-0">
      <span className="tabular-nums">
        {UI_LABELS.library.resultsCount(visibleCount, totalFilteredCount)}
      </span>
      <span className="hidden sm:inline">{UI_LABELS.library.keyboardHint}</span>
    </div>
  );
}
