import {useEffect} from 'react';
import {BookOpen, FilePlus2, Trash2, Upload, X} from 'lucide-react';
import type {BundledExample} from '../data/examples/index.ts';
import {UI_LABELS} from '../ui/labels.ts';
import type {ScriptRecord} from '../ui/scriptLibraryDb.ts';
import type {ActiveScriptRef} from '../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {LibraryPreviewPane} from './LibraryPreviewPane.tsx';
import {LibraryBulkToolbar, LibraryFilterBar} from './library/LibraryFilterBar.tsx';
import {LibraryRowList} from './library/LibraryRowList.tsx';
import {useLibraryModalNavigation} from './library/useLibraryModalNavigation.ts';

export type {ActiveScriptRef};

export interface ScriptLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  readOnly?: boolean;
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
    patch: {folder?: string | null; tags?: string[]; branchNote?: string | null}
  ) => void;
  onExportScriptTxt: (record: ScriptRecord) => void;
  onBulkExportScripts: (records: readonly ScriptRecord[]) => void;
  onRequestDeleteScript: (record: ScriptRecord) => void;
  onRequestBulkDeleteScripts: (records: readonly ScriptRecord[], onDeleted?: () => void) => void;
  onRequestClearLibrary: (onCleared?: () => void) => void;
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
  readOnly = false,
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
  const nav = useLibraryModalNavigation({
    customScripts,
    examples,
    activeScript,
    isConfirmDialogOpen,
    onOpenCustomScript,
    onOpenExample,
    onForkExample,
    onClose,
  });

  useEffect(() => {
    if (readOnly && nav.isBulkMode) {
      nav.exitBulkMode();
    }
  }, [readOnly, nav.isBulkMode, nav.exitBulkMode]);

  const effectiveBulkMode = !readOnly && nav.isBulkMode;

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
            {!readOnly && (
              <>
                {customScripts.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => onRequestClearLibrary(nav.exitBulkMode)}
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
              </>
            )}
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
            <LibraryFilterBar
              query={nav.query}
              onQueryChange={nav.setQuery}
              searchInputRef={nav.searchInputRef}
              filterTab={nav.filterTab}
              onFilterTabChange={nav.setFilterTab}
              tabCounts={nav.tabCounts}
              sortBy={nav.sortBy}
              onSortByChange={nav.setSortBy}
              isSortMenuOpen={nav.isSortMenuOpen}
              onToggleSortMenu={() => nav.setIsSortMenuOpen((prev) => !prev)}
              onCloseSortMenu={() => nav.setIsSortMenuOpen(false)}
              sortMenuRef={nav.sortMenuRef}
              isFilterMenuOpen={nav.isFilterMenuOpen}
              onToggleFilterMenu={() => nav.setIsFilterMenuOpen((prev) => !prev)}
              onCloseFilterMenu={() => nav.setIsFilterMenuOpen(false)}
              filterTriggerRef={nav.filterTriggerRef}
              filterPopoverRef={nav.filterPopoverRef}
              customScriptsCount={customScripts.length}
              readOnly={readOnly}
              isBulkMode={effectiveBulkMode}
              onToggleBulkMode={nav.toggleBulkMode}
              facets={nav.facets}
              hasFacets={nav.hasFacets}
              hasFacetFilters={nav.hasFacetFilters}
              activeFolder={nav.activeFolder}
              onSelectFolder={nav.setActiveFolder}
              activeTag={nav.activeTag}
              onSelectTag={nav.setActiveTag}
              onClearFacetFilters={nav.clearFacetFilters}
            />

            <LibraryRowList
              paginated={nav.paginated}
              visibleBeatCounts={nav.visibleBeatCounts}
              selectedIndex={nav.selectedIndex}
              activeScript={activeScript}
              openedAt={nav.openedAt}
              isBulkMode={effectiveBulkMode}
              checkedIds={nav.checkedIds}
              query={nav.query}
              hasFacetFilters={nav.hasFacetFilters}
              filterTab={nav.filterTab}
              registerRowRef={nav.registerRowRef}
              onSelectKey={nav.setSelectedKey}
              onToggleExpandFamily={nav.toggleExpandFamily}
              onToggleCheckedId={nav.toggleCheckedId}
              onOpenRow={nav.handleOpenRow}
              onShowMore={nav.handleShowMore}
            />

            <LibraryBulkToolbar
              isBulkMode={effectiveBulkMode}
              selectedBulkRecords={nav.selectedBulkRecords}
              visibleCustomCount={nav.visibleCustomRecords.length}
              visibleCount={nav.paginated.visible.length}
              totalFilteredCount={nav.filteredRows.length}
              onToggleSelectAllVisible={nav.toggleSelectAllVisible}
              onBulkExportScripts={onBulkExportScripts}
              onRequestBulkDelete={() =>
                onRequestBulkDeleteScripts(nav.selectedBulkRecords, nav.exitBulkMode)
              }
            />
          </div>

          {/* Right Pane: Editorial Preview & Organization */}
          <div className="hidden md:flex flex-1 min-w-0 min-h-0 flex-col">
            <LibraryPreviewPane
              row={nav.selectedRow}
              isActive={
                nav.selectedRow !== null &&
                activeScript.kind === nav.selectedRow.kind &&
                activeScript.id === nav.selectedRow.id
              }
              readOnly={readOnly}
              openedAt={nav.openedAt}
              existingFolders={nav.existingFolders}
              customScripts={customScripts}
              examples={examples}
              activeScript={activeScript}
              activeFolder={nav.activeFolder}
              activeTag={nav.activeTag}
              onToggleFolderFilter={(folder) =>
                nav.setActiveFolder(
                  nav.activeFolder?.toLowerCase() === folder.toLowerCase() ? null : folder
                )
              }
              onToggleTagFilter={(tag) =>
                nav.setActiveTag(nav.activeTag === tag ? null : tag)
              }
              onOpen={nav.handleOpenRow}
              onOpenCustomScript={(record) => {
                onOpenCustomScript(record);
                onClose();
              }}
              onOpenExample={(example) => {
                onOpenExample(example);
                onClose();
              }}
              onSelectRowKey={(rowKey, expandCustomId) => {
                if (expandCustomId) {
                  nav.ensureFamilyExpanded(expandCustomId);
                }
                nav.setSelectedKey(rowKey);
              }}
              onForkExample={nav.handleForkAndClose}
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
