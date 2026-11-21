import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowUpDown,
  BookOpen,
  Check,
  CheckSquare,
  ChevronDown,
  Download,
  FilePlus2,
  Folder,
  Pin,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {BundledExample} from '../data/examples/index.ts';
import {UI_LABELS} from '../ui/labels.ts';
import type {ScriptRecord} from '../ui/scriptLibraryDb.ts';
import {
  buildLibraryRows,
  collectLibraryFacets,
  countExecutionBeatsFast,
  formatRelativeUpdatedTime,
  LIBRARY_PAGE_SIZE,
  paginateLibraryRows,
  stepLibrarySelectionIndex,
  type ActiveScriptRef,
  type LibraryFilterTab,
  type LibraryRowItem,
  type LibrarySortBy,
} from '../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {LibraryPreviewPane} from './LibraryPreviewPane.tsx';

export type {ActiveScriptRef};

export interface ScriptLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  customScripts: readonly ScriptRecord[];
  examples: readonly BundledExample[];
  activeScript: ActiveScriptRef;
  isConfirmDialogOpen: boolean;
  onOpenCustomScript: (record: ScriptRecord) => void;
  onOpenExample: (example: BundledExample) => void;
  onForkExample: (example: BundledExample) => void;
  onNewBlank: () => void;
  onImportFile: () => void;
  onDuplicateScript: (record: ScriptRecord) => void;
  onRenameScript: (record: ScriptRecord, nextTitle: string) => void;
  onTogglePinScript: (record: ScriptRecord) => void;
  onUpdateScriptMetadata: (
    record: ScriptRecord,
    patch: {folder?: string | null; tags?: string[]}
  ) => void;
  onExportScriptTxt: (record: ScriptRecord) => void;
  onBulkExportScripts: (records: readonly ScriptRecord[]) => void;
  onRequestDeleteScript: (record: ScriptRecord) => void;
  onRequestBulkDeleteScripts: (records: readonly ScriptRecord[], onDeleted?: () => void) => void;
  onRequestClearLibrary: (onCleared?: () => void) => void;
}

const FILTER_TABS: readonly LibraryFilterTab[] = ['all', 'custom', 'examples'];
const SORT_OPTIONS: readonly LibrarySortBy[] = ['recent', 'title', 'beats'];

function getRowKey(row: Pick<LibraryRowItem, 'kind' | 'id'>): string {
  return `${row.kind}:${row.id}`;
}

/**
 * Editorial two-pane Script Library modal:
 * - Left pane: full-text search, filter tabs, sort, quiet folder/tag facets, paginated rows, and opt-in bulk selection
 * - Right pane: live read-only structured/source preview, pin toggle, inline rename, and folder/tag organization
 */
export function ScriptLibraryModal(props: ScriptLibraryModalProps) {
  if (!props.isOpen) return null;
  return <ScriptLibraryModalContent {...props} />;
}

function ScriptLibraryModalContent({
  onClose,
  customScripts,
  examples,
  activeScript,
  isConfirmDialogOpen,
  onOpenCustomScript,
  onOpenExample,
  onForkExample,
  onNewBlank,
  onImportFile,
  onDuplicateScript,
  onRenameScript,
  onTogglePinScript,
  onUpdateScriptMetadata,
  onExportScriptTxt,
  onBulkExportScripts,
  onRequestDeleteScript,
  onRequestBulkDeleteScripts,
  onRequestClearLibrary,
}: Omit<ScriptLibraryModalProps, 'isOpen'>) {
  const [filterTab, setFilterTab] = useState<LibraryFilterTab>('all');
  const [sortBy, setSortBy] = useState<LibrarySortBy>('recent');
  const [query, setQuery] = useState<string>('');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState<number>(LIBRARY_PAGE_SIZE);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    () => `${activeScript.kind}:${activeScript.id}`
  );
  const [isBulkMode, setIsBulkMode] = useState<boolean>(false);
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [isSortMenuOpen, setIsSortMenuOpen] = useState<boolean>(false);
  const [openedAt] = useState<number>(() => Date.now());

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const shouldScrollSelectedIntoViewRef = useRef<boolean>(false);

  const facets = useMemo(() => collectLibraryFacets(customScripts), [customScripts]);

  // Clear stale folder/tag filters if the last script with that facet was removed or edited
  useEffect(() => {
    if (
      activeFolder &&
      !facets.folders.some((f) => f.toLowerCase() === activeFolder.toLowerCase())
    ) {
      setActiveFolder(null);
    }
    if (activeTag && !facets.tags.includes(activeTag.toLowerCase())) {
      setActiveTag(null);
    }
  }, [facets, activeFolder, activeTag]);

  const filteredRows = useMemo(
    () =>
      buildLibraryRows(customScripts, examples, filterTab, query, {
        sortBy,
        folder: activeFolder,
        tag: activeTag,
      }),
    [customScripts, examples, filterTab, query, sortBy, activeFolder, activeTag]
  );

  const paginated = useMemo(
    () => paginateLibraryRows(filteredRows, visibleLimit),
    [filteredRows, visibleLimit]
  );

  const visibleBeatCounts = useMemo(
    () => paginated.visible.map((row) => countExecutionBeatsFast(row.rawText)),
    [paginated.visible]
  );

  const selectedIndex = useMemo(() => {
    if (filteredRows.length === 0) return -1;
    if (selectedKey) {
      const idx = filteredRows.findIndex((row) => getRowKey(row) === selectedKey);
      if (idx !== -1) return idx;
    }
    return 0;
  }, [filteredRows, selectedKey]);

  const selectedRow = selectedIndex >= 0 ? (filteredRows[selectedIndex] ?? null) : null;

  // Focus search input on open
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Reset pagination when filters/search/sort change
  useEffect(() => {
    setVisibleLimit(LIBRARY_PAGE_SIZE);
  }, [filterTab, query, sortBy, activeFolder, activeTag]);

  // Keep keyboard-selected row visible inside the scroll container (never on mount or hover)
  useEffect(() => {
    if (selectedIndex < 0) return;
    if (selectedIndex >= visibleLimit) {
      setVisibleLimit(Math.ceil((selectedIndex + 1) / LIBRARY_PAGE_SIZE) * LIBRARY_PAGE_SIZE);
      return;
    }
    if (!shouldScrollSelectedIntoViewRef.current) return;
    shouldScrollSelectedIntoViewRef.current = false;
    const rowEl = rowRefs.current.get(selectedIndex);
    rowEl?.scrollIntoView({block: 'nearest'});
  }, [selectedIndex, visibleLimit]);

  // Prune checked IDs if customScripts change (e.g. after delete)
  useEffect(() => {
    if (checkedIds.size === 0) return;
    const validIds = new Set(customScripts.map((s) => s.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of checkedIds) {
      if (validIds.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setCheckedIds(next);
  }, [customScripts, checkedIds]);

  const handleOpenRow = useCallback(
    (row: LibraryRowItem) => {
      if (row.kind === 'custom') {
        onOpenCustomScript(row.record);
      } else {
        onOpenExample(row.example);
      }
      onClose();
    },
    [onOpenCustomScript, onOpenExample, onClose]
  );

  const handleForkAndClose = useCallback(
    (example: BundledExample) => {
      onForkExample(example);
      onClose();
    },
    [onForkExample, onClose]
  );

  const toggleCheckedId = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visibleCustomRecords = useMemo(
    () =>
      filteredRows
        .filter((r): r is Extract<LibraryRowItem, {kind: 'custom'}> => r.kind === 'custom')
        .map((r) => r.record),
    [filteredRows]
  );

  const selectedBulkRecords = useMemo(
    () => customScripts.filter((record) => checkedIds.has(record.id)),
    [customScripts, checkedIds]
  );

  // Close custom sort popover on outside pointer down
  useEffect(() => {
    if (!isSortMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isSortMenuOpen]);

  // Keyboard navigation (↑ / ↓ / Enter / Esc) while modal is active and ConfirmDialog is closed
  useEffect(() => {
    if (isConfirmDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const activeEl = document.activeElement;
      const isInSearch = activeEl === searchInputRef.current;
      const isInOtherInput =
        !isInSearch &&
        activeEl instanceof HTMLElement &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT');

      if (event.key === 'Escape') {
        if (isSortMenuOpen) {
          event.preventDefault();
          setIsSortMenuOpen(false);
          return;
        }
        if (isInOtherInput) return;
        event.preventDefault();
        if (isBulkMode) {
          setIsBulkMode(false);
          setCheckedIds(new Set());
          return;
        }
        onClose();
        return;
      }

      if (isInOtherInput || isSortMenuOpen) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        shouldScrollSelectedIntoViewRef.current = true;
        const nextIdx = stepLibrarySelectionIndex(selectedIndex, 1, filteredRows.length);
        const nextRow = nextIdx >= 0 ? filteredRows[nextIdx] : null;
        if (nextRow) setSelectedKey(getRowKey(nextRow));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        shouldScrollSelectedIntoViewRef.current = true;
        const nextIdx = stepLibrarySelectionIndex(selectedIndex, -1, filteredRows.length);
        const nextRow = nextIdx >= 0 ? filteredRows[nextIdx] : null;
        if (nextRow) setSelectedKey(getRowKey(nextRow));
        return;
      }

      if (event.key === 'Enter') {
        const activeTag = activeEl?.tagName.toLowerCase();
        if (activeTag === 'button') return;

        if (selectedRow && !isBulkMode) {
          event.preventDefault();
          handleOpenRow(selectedRow);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isConfirmDialogOpen,
    isBulkMode,
    isSortMenuOpen,
    filteredRows,
    selectedIndex,
    selectedRow,
    handleOpenRow,
    onClose,
  ]);

  const tabCounts: Record<LibraryFilterTab, number> = {
    all: customScripts.length + examples.length,
    custom: customScripts.length,
    examples: examples.length,
  };

  const hasFacetFilters = activeFolder !== null || activeTag !== null;
  const hasFacets = facets.folders.length > 0 || facets.tags.length > 0;

  const emptyMessage =
    query.trim().length > 0 || hasFacetFilters
      ? UI_LABELS.library.emptySearch
      : filterTab === 'custom'
        ? UI_LABELS.library.emptyCustom
        : UI_LABELS.library.emptyAll;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={UI_LABELS.library.dialogAria}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isConfirmDialogOpen) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlayHeavy}
    >
      <div className="bg-surface w-full max-w-[980px] h-[82vh] max-h-[760px] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle bg-surface-subtle shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-4 w-4 text-text-muted shrink-0" />
            <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main truncate">
              {UI_LABELS.library.title}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {customScripts.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onRequestClearLibrary(() => {
                      setIsBulkMode(false);
                      setCheckedIds(new Set());
                    })
                  }
                  aria-label={UI_LABELS.library.clearLibraryAria}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-colors active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{UI_LABELS.library.clearLibraryButton}</span>
                </button>
                <span aria-hidden="true" className="h-4 w-px bg-border-main mx-0.5" />
              </>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                onNewBlank();
              }}
              className={UI_TOKENS.button.actionPill}
            >
              <FilePlus2 className="h-3.5 w-3.5 text-text-muted" />
              <span>{UI_LABELS.library.newBlankButton}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onImportFile();
              }}
              className={UI_TOKENS.button.actionPill}
            >
              <Upload className="h-3.5 w-3.5 text-text-muted" />
              <span>{UI_LABELS.library.importButton}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={UI_LABELS.library.closeAria}
              className={UI_TOKENS.button.iconClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Two-Pane Body */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Left Pane: Search, Filters, Facets & Script List */}
          <div className="flex flex-col w-full md:w-[43%] md:min-w-[330px] md:max-w-[420px] min-h-0 flex-1 md:flex-none border-b md:border-b-0 md:border-r border-border-main bg-surface">
            {/* Search & Controls */}
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
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={UI_LABELS.library.searchPlaceholder}
                  aria-label={UI_LABELS.library.searchAria}
                  className={UI_TOKENS.input.search}
                />
                {query.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
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
                      onClick={() => setFilterTab(tab)}
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
                    onClick={() => setIsSortMenuOpen((prev) => !prev)}
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
                              setSortBy(opt);
                              setIsSortMenuOpen(false);
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

                {customScripts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsBulkMode((prev) => {
                        if (prev) setCheckedIds(new Set());
                        return !prev;
                      });
                    }}
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
                        onClick={() => setActiveFolder(isOn ? null : folder)}
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
                        onClick={() => setActiveTag(isOn ? null : tag)}
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
                      onClick={() => {
                        setActiveFolder(null);
                        setActiveTag(null);
                      }}
                      className="text-[10.5px] text-text-faint hover:text-text-main underline underline-offset-2 cursor-pointer ml-0.5"
                    >
                      {UI_LABELS.library.facetsClearFilters}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable Script List */}
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
                    const rowKey = getRowKey(row);
                    const isSelected = index === selectedIndex;
                    const isActive = activeScript.kind === row.kind && activeScript.id === row.id;
                    const beatCount = visibleBeatCounts[index] ?? 0;
                    const isChecked = row.kind === 'custom' && checkedIds.has(row.id);

                    return (
                      <div
                        key={rowKey}
                        ref={(el) => {
                          if (el) rowRefs.current.set(index, el);
                          else rowRefs.current.delete(index);
                        }}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          if (isBulkMode && row.kind === 'custom') {
                            toggleCheckedId(row.id);
                            setSelectedKey(rowKey);
                            return;
                          }
                          setSelectedKey(rowKey);
                          if (
                            typeof window !== 'undefined' &&
                            window.matchMedia('(max-width: 767px)').matches
                          ) {
                            handleOpenRow(row);
                          }
                        }}
                        onDoubleClick={() => {
                          if (!isBulkMode) {
                            handleOpenRow(row);
                          }
                        }}
                        className={`flex items-start gap-2.5 pl-3 pr-3.5 py-2.5 border-l-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-l-text-main bg-surface-muted/75'
                            : 'border-l-transparent bg-surface hover:bg-surface-subtle/70'
                        }`}
                      >
                        {isBulkMode && (
                          <button
                            type="button"
                            disabled={row.kind !== 'custom'}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (row.kind === 'custom') toggleCheckedId(row.id);
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
                          <div className="flex items-center gap-1.5 min-w-0">
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
                        onClick={() => setVisibleLimit((prev) => prev + LIBRARY_PAGE_SIZE)}
                        className={UI_TOKENS.button.secondary}
                      >
                        {UI_LABELS.library.showMore(paginated.remainingCount)}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Left Footer: Bulk Action Bar OR Quiet Count */}
            {isBulkMode ? (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-t border-border-subtle bg-surface-subtle text-[11px] shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-semibold text-text-main tabular-nums">
                    {UI_LABELS.library.selectedCount(selectedBulkRecords.length)}
                  </span>
                  {visibleCustomRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedBulkRecords.length === visibleCustomRecords.length) {
                          setCheckedIds(new Set());
                        } else {
                          setCheckedIds(new Set(visibleCustomRecords.map((r) => r.id)));
                        }
                      }}
                      className="text-text-muted hover:text-text-main underline underline-offset-2 cursor-pointer"
                    >
                      {selectedBulkRecords.length === visibleCustomRecords.length
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
                    onClick={() =>
                      onRequestBulkDeleteScripts(selectedBulkRecords, () => {
                        setCheckedIds(new Set());
                        setIsBulkMode(false);
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>{UI_LABELS.library.bulkDeleteButton}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-t border-border-subtle bg-surface-subtle text-[10.5px] font-mono text-text-faint shrink-0">
                <span className="tabular-nums">
                  {UI_LABELS.library.resultsCount(paginated.visible.length, filteredRows.length)}
                </span>
                <span className="hidden sm:inline">{UI_LABELS.library.keyboardHint}</span>
              </div>
            )}
          </div>

          {/* Right Pane: Editorial Preview & Organization */}
          <div className="hidden md:flex flex-1 min-w-0 min-h-0 flex-col">
            <LibraryPreviewPane
              row={selectedRow}
              isActive={
                selectedRow !== null &&
                activeScript.kind === selectedRow.kind &&
                activeScript.id === selectedRow.id
              }
              openedAt={openedAt}
              existingFolders={facets.folders}
              onOpen={handleOpenRow}
              onForkExample={handleForkAndClose}
              onTogglePin={onTogglePinScript}
              onRename={onRenameScript}
              onUpdateMetadata={onUpdateScriptMetadata}
              onDuplicate={onDuplicateScript}
              onExportTxt={onExportScriptTxt}
              onRequestDelete={onRequestDeleteScript}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
