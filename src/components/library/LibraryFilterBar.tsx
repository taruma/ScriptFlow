import type {RefObject} from 'react';
import {
  ArrowUpDown,
  Check,
  CheckSquare,
  ChevronDown,
  Download,
  Folder,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {UI_LABELS} from '../../ui/labels.ts';
import type {ScriptRecord} from '../../ui/scriptLibraryDb.ts';
import type {
  LibraryFacets,
  LibraryFilterTab,
  LibrarySortBy,
} from '../../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../../ui/tokens/ui.ts';

const FILTER_TABS: readonly LibraryFilterTab[] = ['all', 'custom', 'examples'];
const SORT_OPTIONS: readonly LibrarySortBy[] = ['recent', 'title', 'beats'];

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
 * full-text search input, segmented filter tabs, custom sort popover,
 * bulk selection mode toggle, and quiet folder/tag facet chips.
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

      {/* Row 2: Custom Sort Menu (left) + Bulk Select Toggle (right) */}
      <div className="flex items-center justify-between gap-2">
        <div ref={sortMenuRef} className="relative">
          <button
            type="button"
            aria-label={UI_LABELS.library.sortAria}
            aria-haspopup="menu"
            aria-expanded={isSortMenuOpen}
            onClick={onToggleSortMenu}
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
      </div>

      {/* Quiet Folder & Tag Filter Strip (only shown when folders/tags exist) */}
      {hasFacets && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {facets.folders.map((folder) => {
            const isOn = activeFolder?.toLowerCase() === folder.toLowerCase();
            return (
              <button
                key={`folder:${folder}`}
                type="button"
                aria-label={UI_LABELS.library.folderFilterAria(folder)}
                aria-pressed={isOn}
                onClick={() => onSelectFolder(isOn ? null : folder)}
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium transition-colors cursor-pointer ${
                  isOn
                    ? 'border-text-main bg-text-main text-surface'
                    : 'border-border-main bg-surface-subtle text-text-muted hover:text-text-main'
                }`}
              >
                <Folder className="h-2.5 w-2.5" />
                <span className="truncate max-w-[110px]">{folder}</span>
              </button>
            );
          })}

          {facets.tags.map((tag) => {
            const isOn = activeTag === tag;
            return (
              <button
                key={`tag:${tag}`}
                type="button"
                aria-label={UI_LABELS.library.tagFilterAria(tag)}
                aria-pressed={isOn}
                onClick={() => onSelectTag(isOn ? null : tag)}
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition-colors cursor-pointer ${
                  isOn
                    ? 'border-text-main bg-text-main text-surface'
                    : 'border-border-subtle bg-surface-subtle text-text-faint hover:border-border-main hover:text-text-main'
                }`}
              >
                #{tag}
              </button>
            );
          })}

          {hasFacetFilters && (
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
