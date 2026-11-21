import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type {BundledExample} from '../../data/examples/index.ts';
import type {ScriptRecord} from '../../ui/scriptLibraryDb.ts';
import {
  buildLibraryRows,
  collectLibraryFacets,
  countExecutionBeatsFast,
  LIBRARY_PAGE_SIZE,
  paginateLibraryRows,
  stepLibrarySelectionIndex,
  type ActiveScriptRef,
  type LibraryFacets,
  type LibraryFilterTab,
  type LibraryRowItem,
  type LibrarySortBy,
  type PaginatedLibraryRows,
} from '../../ui/scriptLibraryView.ts';

export function getLibraryRowKey(row: Pick<LibraryRowItem, 'kind' | 'id'>): string {
  return `${row.kind}:${row.id}`;
}

export interface UseLibraryModalNavigationOptions {
  customScripts: readonly ScriptRecord[];
  examples: readonly BundledExample[];
  activeScript: ActiveScriptRef;
  isConfirmDialogOpen: boolean;
  onOpenCustomScript: (record: ScriptRecord) => void;
  onOpenExample: (example: BundledExample) => void;
  onForkExample: (example: BundledExample) => void;
  onClose: () => void;
}

export interface UseLibraryModalNavigationResult {
  filterTab: LibraryFilterTab;
  setFilterTab: (tab: LibraryFilterTab) => void;
  sortBy: LibrarySortBy;
  setSortBy: (sort: LibrarySortBy) => void;
  query: string;
  setQuery: (query: string) => void;
  activeFolder: string | null;
  setActiveFolder: (folder: string | null) => void;
  activeTag: string | null;
  setActiveTag: (tag: string | null) => void;
  clearFacetFilters: () => void;
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  isBulkMode: boolean;
  toggleBulkMode: () => void;
  exitBulkMode: () => void;
  checkedIds: ReadonlySet<string>;
  toggleCheckedId: (id: string) => void;
  toggleSelectAllVisible: () => void;
  isSortMenuOpen: boolean;
  setIsSortMenuOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  openedAt: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
  sortMenuRef: RefObject<HTMLDivElement | null>;
  registerRowRef: (index: number, el: HTMLDivElement | null) => void;
  facets: LibraryFacets;
  filteredRows: LibraryRowItem[];
  paginated: PaginatedLibraryRows;
  visibleBeatCounts: number[];
  selectedIndex: number;
  selectedRow: LibraryRowItem | null;
  visibleCustomRecords: ScriptRecord[];
  selectedBulkRecords: ScriptRecord[];
  tabCounts: Record<LibraryFilterTab, number>;
  hasFacetFilters: boolean;
  hasFacets: boolean;
  handleOpenRow: (row: LibraryRowItem) => void;
  handleForkAndClose: (example: BundledExample) => void;
  handleShowMore: () => void;
}

/**
 * Stateful navigation, filtering, facet pruning, pagination, bulk selection,
 * popover outside-click, scroll-into-view, and keyboard controller for ScriptLibraryModal.
 */
export function useLibraryModalNavigation({
  customScripts,
  examples,
  activeScript,
  isConfirmDialogOpen,
  onOpenCustomScript,
  onOpenExample,
  onForkExample,
  onClose,
}: UseLibraryModalNavigationOptions): UseLibraryModalNavigationResult {
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
      const idx = filteredRows.findIndex((row) => getLibraryRowKey(row) === selectedKey);
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

  const toggleBulkMode = useCallback(() => {
    setIsBulkMode((prev) => {
      if (prev) setCheckedIds(new Set());
      return !prev;
    });
  }, []);

  const exitBulkMode = useCallback(() => {
    setIsBulkMode(false);
    setCheckedIds(new Set());
  }, []);

  const clearFacetFilters = useCallback(() => {
    setActiveFolder(null);
    setActiveTag(null);
  }, []);

  const handleShowMore = useCallback(() => {
    setVisibleLimit((prev) => prev + LIBRARY_PAGE_SIZE);
  }, []);

  const registerRowRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(index, el);
    else rowRefs.current.delete(index);
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

  const toggleSelectAllVisible = useCallback(() => {
    if (selectedBulkRecords.length === visibleCustomRecords.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(visibleCustomRecords.map((r) => r.id)));
    }
  }, [selectedBulkRecords.length, visibleCustomRecords]);

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
        if (nextRow) setSelectedKey(getLibraryRowKey(nextRow));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        shouldScrollSelectedIntoViewRef.current = true;
        const nextIdx = stepLibrarySelectionIndex(selectedIndex, -1, filteredRows.length);
        const nextRow = nextIdx >= 0 ? filteredRows[nextIdx] : null;
        if (nextRow) setSelectedKey(getLibraryRowKey(nextRow));
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

  return {
    filterTab,
    setFilterTab,
    sortBy,
    setSortBy,
    query,
    setQuery,
    activeFolder,
    setActiveFolder,
    activeTag,
    setActiveTag,
    clearFacetFilters,
    selectedKey,
    setSelectedKey,
    isBulkMode,
    toggleBulkMode,
    exitBulkMode,
    checkedIds,
    toggleCheckedId,
    toggleSelectAllVisible,
    isSortMenuOpen,
    setIsSortMenuOpen,
    openedAt,
    searchInputRef,
    sortMenuRef,
    registerRowRef,
    facets,
    filteredRows,
    paginated,
    visibleBeatCounts,
    selectedIndex,
    selectedRow,
    visibleCustomRecords,
    selectedBulkRecords,
    tabCounts,
    hasFacetFilters,
    hasFacets,
    handleOpenRow,
    handleForkAndClose,
    handleShowMore,
  };
}
