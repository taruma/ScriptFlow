import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  BookOpen,
  Check,
  CopyPlus,
  Download,
  FilePlus2,
  GitFork,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {BundledExample} from '../data/examples/index.ts';
import {APP_META, UI_LABELS} from '../ui/labels.ts';
import type {ScriptRecord} from '../ui/scriptLibraryDb.ts';
import {
  buildLibraryRows,
  countExecutionBeatsFast,
  formatRelativeUpdatedTime,
  LIBRARY_PAGE_SIZE,
  paginateLibraryRows,
  stepLibrarySelectionIndex,
  type ActiveScriptRef,
  type LibraryFilterTab,
  type LibraryRowItem,
} from '../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

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
  onExportScriptTxt: (record: ScriptRecord) => void;
  onRequestDeleteScript: (record: ScriptRecord) => void;
}

const FILTER_TABS: readonly LibraryFilterTab[] = ['all', 'custom', 'examples'];

/**
 * Single-column searchable Script Library modal.
 * Paginates visible rows and computes lightweight beat counts strictly for visible items
 * so searching and keyboard navigation stay instant at 1,000+ scripts.
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
  onExportScriptTxt,
  onRequestDeleteScript,
}: Omit<ScriptLibraryModalProps, 'isOpen'>) {
  const [filterTab, setFilterTab] = useState<LibraryFilterTab>('all');
  const [query, setQuery] = useState<string>('');
  const [visibleLimit, setVisibleLimit] = useState<number>(LIBRARY_PAGE_SIZE);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [openedAt] = useState<number>(() => Date.now());

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const shouldScrollSelectedIntoViewRef = useRef<boolean>(false);

  const filteredRows = useMemo(
    () => buildLibraryRows(customScripts, examples, filterTab, query),
    [customScripts, examples, filterTab, query]
  );

  const paginated = useMemo(
    () => paginateLibraryRows(filteredRows, visibleLimit),
    [filteredRows, visibleLimit]
  );

  // Compute fast beat counts strictly for the currently visible page slice (never off-screen rows)
  const visibleBeatCounts = useMemo(
    () => paginated.visible.map((row) => countExecutionBeatsFast(row.rawText)),
    [paginated.visible]
  );

  // Focus search input on open
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Focus inline rename input whenever rename begins
  useEffect(() => {
    if (!renamingId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);

  // Reset pagination and clamp selection when filter or search query changes
  useEffect(() => {
    setVisibleLimit(LIBRARY_PAGE_SIZE);
    setSelectedIndex(0);
  }, [filterTab, query]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedIndex(-1);
    } else if (selectedIndex >= filteredRows.length) {
      setSelectedIndex(filteredRows.length - 1);
    } else if (selectedIndex < 0) {
      setSelectedIndex(0);
    }
  }, [filteredRows.length, selectedIndex]);

  // Keep keyboard-selected row visible inside the scroll container (skip forced reflow on mount/hover)
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

  const handleCommitRename = useCallback(
    (record: ScriptRecord) => {
      const cleaned = renameDraft.trim();
      setRenamingId(null);
      if (cleaned.length > 0 && cleaned !== record.title) {
        onRenameScript(record, cleaned);
      }
    },
    [renameDraft, onRenameScript]
  );

  // Keyboard navigation (↑ / ↓ / Enter / Esc) while modal is active and ConfirmDialog is closed
  useEffect(() => {
    if (isConfirmDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (renamingId !== null) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setRenamingId(null);
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        shouldScrollSelectedIntoViewRef.current = true;
        setSelectedIndex((prev) => stepLibrarySelectionIndex(prev, 1, filteredRows.length));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        shouldScrollSelectedIntoViewRef.current = true;
        setSelectedIndex((prev) => stepLibrarySelectionIndex(prev, -1, filteredRows.length));
        return;
      }

      if (event.key === 'Enter') {
        // Let explicit action buttons handle their own Enter press when focused
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'button') return;

        const selectedRow = selectedIndex >= 0 ? filteredRows[selectedIndex] : null;
        if (selectedRow) {
          event.preventDefault();
          handleOpenRow(selectedRow);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isConfirmDialogOpen, renamingId, filteredRows, selectedIndex, handleOpenRow, onClose]);

  const handleRenameInputKeyDown = (
    record: ScriptRecord,
    event: ReactKeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      handleCommitRename(record);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setRenamingId(null);
    }
  };

  const tabCounts: Record<LibraryFilterTab, number> = {
    all: customScripts.length + examples.length,
    custom: customScripts.length,
    examples: examples.length,
  };

  const emptyMessage =
    query.trim().length > 0
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
      <div className="bg-surface w-full max-w-[580px] max-h-[82vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle bg-surface-subtle shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-4 w-4 text-text-muted shrink-0" />
            <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main truncate">
              {UI_LABELS.library.title}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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

        {/* Search & Filter Tabs */}
        <div className="px-4 py-3 border-b border-border-subtle space-y-2.5 shrink-0">
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

          <div
            role="tablist"
            aria-label={UI_LABELS.library.tabsAria}
            className="inline-flex items-center bg-surface-muted p-0.5 rounded-xl border border-border-main"
          >
            {FILTER_TABS.map((tab) => {
              const isSelected = filterTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setFilterTab(tab)}
                  className={
                    isSelected
                      ? UI_TOKENS.button.segmentedItemActive
                      : UI_TOKENS.button.segmentedItem
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
        </div>

        {/* Single-Column Scrollable List */}
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
                const isSelected = index === selectedIndex;
                const isActive = activeScript.kind === row.kind && activeScript.id === row.id;
                const isRenaming = row.kind === 'custom' && renamingId === row.id;
                const beatCount = visibleBeatCounts[index] ?? 0;

                return (
                  <div
                    key={`${row.kind}:${row.id}`}
                    ref={(el) => {
                      if (el) rowRefs.current.set(index, el);
                      else rowRefs.current.delete(index);
                    }}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => {
                      if (!isRenaming) {
                        handleOpenRow(row);
                      }
                    }}
                    className={`group/librow flex items-center justify-between gap-3 px-4 py-2.5 transition-colors cursor-pointer ${
                      isSelected ? 'bg-surface-subtle' : 'bg-surface hover:bg-surface-subtle/60'
                    }`}
                  >
                    {/* Left: Title + Compact Metadata */}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {isRenaming && row.kind === 'custom' ? (
                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            ref={renameInputRef}
                            type="text"
                            data-native-undo="true"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => handleRenameInputKeyDown(row.record, e)}
                            onBlur={() => handleCommitRename(row.record)}
                            aria-label={UI_LABELS.library.renameInputAria}
                            placeholder={APP_META.untitledScene}
                            className="min-w-0 flex-1 rounded-md border border-border-main bg-surface px-2 py-0.5 font-serif text-[13px] font-bold text-text-main focus:outline-none focus:ring-1 focus:ring-text-muted"
                          />
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleCommitRename(row.record);
                            }}
                            aria-label={UI_LABELS.library.saveRenameAria}
                            className="rounded-md p-1 text-text-muted hover:bg-surface-muted hover:text-text-main cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setRenamingId(null);
                            }}
                            aria-label={UI_LABELS.library.cancelRenameAria}
                            className="rounded-md p-1 text-text-faint hover:bg-surface-muted hover:text-text-main cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate font-serif text-[13.5px] font-bold tracking-tight text-text-main">
                            {row.title}
                          </span>
                          {isActive && (
                            <span className="inline-flex shrink-0 items-center rounded border border-border-main bg-surface-muted px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-text-muted">
                              {UI_LABELS.library.activeBadge}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-text-faint tabular-nums">
                        {row.kind === 'example' ? (
                          <>
                            <span className="auteur-phase-logic inline-flex items-center rounded border px-1.5 py-px text-[9.5px] font-semibold">
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
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: Inline Row Actions */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`flex items-center gap-0.5 shrink-0 transition-opacity ${
                        isSelected
                          ? 'opacity-100'
                          : 'opacity-80 sm:opacity-0 sm:group-hover/librow:opacity-100 sm:focus-within:opacity-100'
                      }`}
                    >
                      {row.kind === 'example' ? (
                        <button
                          type="button"
                          onClick={() => {
                            onForkExample(row.example);
                            onClose();
                          }}
                          title={UI_LABELS.library.forkAria(row.title)}
                          aria-label={UI_LABELS.library.forkAria(row.title)}
                          className={UI_TOKENS.button.actionPill}
                        >
                          <GitFork className="h-3 w-3 text-text-muted" />
                          <span>{UI_LABELS.library.forkAction}</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onDuplicateScript(row.record)}
                            title={UI_LABELS.library.duplicateAction}
                            aria-label={UI_LABELS.library.duplicateAria(row.title)}
                            className={UI_TOKENS.button.iconGhost}
                          >
                            <CopyPlus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(row.id);
                              setRenameDraft(row.title);
                            }}
                            title={UI_LABELS.library.renameAction}
                            aria-label={UI_LABELS.library.renameAria(row.title)}
                            className={UI_TOKENS.button.iconGhost}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onExportScriptTxt(row.record)}
                            title={UI_LABELS.library.exportTxtAction}
                            aria-label={UI_LABELS.library.exportTxtAria(row.title)}
                            className={UI_TOKENS.button.iconGhost}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRequestDeleteScript(row.record)}
                            title={UI_LABELS.library.deleteAction}
                            aria-label={UI_LABELS.library.deleteAria(row.title)}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-surface-muted transition-colors active:scale-95 cursor-pointer shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
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

        {/* Quiet Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border-subtle bg-surface-subtle text-[10.5px] font-mono text-text-faint shrink-0">
          <span className="tabular-nums">
            {UI_LABELS.library.resultsCount(paginated.visible.length, filteredRows.length)}
          </span>
          <span className="hidden sm:inline">{UI_LABELS.library.keyboardHint}</span>
        </div>
      </div>
    </div>
  );
}
