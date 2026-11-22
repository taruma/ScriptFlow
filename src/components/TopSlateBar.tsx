import {useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Eye,
  FileCode2,
  FileText,
  GitFork,
  Info,
  Redo2,
  Sparkles,
  Undo2,
  Workflow,
} from 'lucide-react';
import type {LintDiagnostic} from '../core/types.ts';
import type {EditorSettings} from '../ui/editorSettings.ts';
import {APP_META, UI_LABELS} from '../ui/labels.ts';
import {attachCaptureOutsideDismiss} from '../ui/outsideDismiss.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {FileMenuDropdown} from './FileMenuDropdown.tsx';
import {SettingsPopover} from './SettingsPopover.tsx';

export type ViewMode = 'live' | 'source' | 'graph';
export type CopyFormatKind = 'plain' | 'tagless' | 'json';

interface TopSlateBarProps {
  title: string;
  readOnly?: boolean;
  isNarrow?: boolean;
  familyBranchCount?: number;
  isVersionHistoryOpen?: boolean;
  onForkExample?: () => void;
  diagnostics: LintDiagnostic[];
  onJumpToFirstDiagnostic: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNewBlank: () => void;
  onDuplicateScript: () => void;
  onImportFile: () => void;
  onFormatScript: () => void;
  onOpenVersionHistory: () => void;
  onDownloadCanonical: () => void;
  onDownloadTagless: () => void;
  onDownloadJsonEnvelope: () => void;
  onBackupAll: () => void;
  onRestoreBackup: () => void;
  onOpenLibrary: () => void;
  isLibraryOpen?: boolean;
  settings: EditorSettings;
  onUpdateSettings: (patch: Partial<EditorSettings>) => void;
  onCopyPlainText: () => void;
  onCopyTagless: () => void;
  onCopyJsonEnvelope: () => void;
  copiedKind: CopyFormatKind | null;
  onOpenDebug?: () => void;
  onToggleAi?: () => void;
  isAiOpen?: boolean;
  onOpenInfo?: () => void;
  isInfoOpen?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

type OpenMenu = 'file' | 'settings' | 'copy' | null;

export function TopSlateBar({
  title,
  readOnly = false,
  isNarrow = false,
  familyBranchCount = 0,
  isVersionHistoryOpen = false,
  onForkExample,
  diagnostics,
  onJumpToFirstDiagnostic,
  viewMode,
  onViewModeChange,
  onNewBlank,
  onDuplicateScript,
  onImportFile,
  onFormatScript,
  onOpenVersionHistory,
  onDownloadCanonical,
  onDownloadTagless,
  onDownloadJsonEnvelope,
  onBackupAll,
  onRestoreBackup,
  onOpenLibrary,
  isLibraryOpen = false,
  settings,
  onUpdateSettings,
  onCopyPlainText,
  onCopyTagless,
  onCopyJsonEnvelope,
  copiedKind,
  onOpenDebug,
  onToggleAi,
  isAiOpen = false,
  onOpenInfo,
  isInfoOpen = false,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: TopSlateBarProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    return attachCaptureOutsideDismiss(document, () => barRef.current, () => setOpenMenu(null));
  }, [openMenu]);

  useEffect(() => {
    if (isNarrow) {
      setOpenMenu((prev) => (prev === 'settings' ? prev : null));
    }
  }, [isNarrow]);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <header ref={barRef} className={`${UI_TOKENS.layout.appHeader} sticky top-0`}>
      {/* Left Zone: App Title + (Wide: File Menu) + Scene Title + (Wide: Quiet Diagnostic Jump) */}
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
        {isNarrow ? (
          <>
            <span
              aria-label={APP_META.name}
              title={APP_META.name}
              className="inline-flex h-7 w-7 items-center justify-center font-sans text-sm font-bold tracking-tight text-text-main shrink-0"
            >
              {APP_META.shortMark}
            </span>

            <span aria-hidden="true" className="h-3.5 w-px bg-border-main shrink-0" />

            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                onOpenVersionHistory();
              }}
              aria-label={UI_LABELS.topBar.sceneTitleButtonAria}
              aria-expanded={isVersionHistoryOpen}
              title={UI_LABELS.topBar.sceneTitleButtonTitle}
              className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors cursor-pointer ${
                isVersionHistoryOpen ? 'bg-surface-muted' : 'hover:bg-surface-subtle'
              }`}
            >
              <span className="min-w-0 truncate font-serif text-sm font-bold tracking-tight text-text-main">
                {title || APP_META.untitledScene}
              </span>
              {familyBranchCount > 1 && (
                <span
                  title={UI_LABELS.topBar.familyBranchBadgeTitle(familyBranchCount)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-text-muted"
                >
                  <GitFork className="h-3 w-3 text-sky-500 shrink-0" />
                  <span>{familyBranchCount}</span>
                </span>
              )}
              {readOnly && (
                <span
                  title={UI_LABELS.topBar.exampleBadgeTitle}
                  className="auteur-phase-logic inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide"
                >
                  {UI_LABELS.topBar.exampleBadge}
                </span>
              )}
            </button>
          </>
        ) : (
          <>
            <span className="font-sans text-sm font-semibold tracking-tight text-text-main whitespace-nowrap shrink-0 pl-0.5 pr-1">
              {APP_META.name}
            </span>

            <FileMenuDropdown
              isOpen={openMenu === 'file'}
              onToggle={() => setOpenMenu((prev) => (prev === 'file' ? null : 'file'))}
              onClose={() => setOpenMenu(null)}
              readOnly={readOnly}
              onNewBlank={onNewBlank}
              onDuplicateScript={onDuplicateScript}
              onImportFile={onImportFile}
              onFormatScript={onFormatScript}
              onVersionHistory={onOpenVersionHistory}
              onDownloadCanonical={onDownloadCanonical}
              onDownloadTagless={onDownloadTagless}
              onDownloadJsonEnvelope={onDownloadJsonEnvelope}
              onBackupAll={onBackupAll}
              onRestoreBackup={onRestoreBackup}
              onBrowseLibrary={onOpenLibrary}
              onOpenDebug={onOpenDebug}
              onOpenSettings={() => setOpenMenu('settings')}
            />

            <span aria-hidden="true" className="h-3.5 w-px bg-border-main shrink-0" />

            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                onOpenVersionHistory();
              }}
              aria-label={UI_LABELS.topBar.sceneTitleButtonAria}
              aria-expanded={isVersionHistoryOpen}
              title={UI_LABELS.topBar.sceneTitleButtonTitle}
              className={`group flex min-w-0 max-w-[300px] items-center gap-1.5 rounded-lg px-2 py-1 text-left transition-colors cursor-pointer ${
                isVersionHistoryOpen ? 'bg-surface-muted' : 'hover:bg-surface-subtle'
              }`}
            >
              <span className="min-w-0 truncate font-serif text-sm font-bold tracking-tight text-text-main">
                {title || APP_META.untitledScene}
              </span>
              {familyBranchCount > 1 && (
                <span
                  title={UI_LABELS.topBar.familyBranchBadgeTitle(familyBranchCount)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-text-muted group-hover:bg-surface"
                >
                  <GitFork className="h-3 w-3 text-sky-500 shrink-0" />
                  <span>{familyBranchCount}</span>
                </span>
              )}
              {readOnly && (
                <span
                  title={UI_LABELS.topBar.exampleBadgeTitle}
                  className="auteur-phase-logic inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide"
                >
                  {UI_LABELS.topBar.exampleBadge}
                </span>
              )}
            </button>

            {diagnostics.length > 0 && (
              <button
                type="button"
                onClick={onJumpToFirstDiagnostic}
                title={UI_LABELS.topBar.jumpToFirstDiagnostic}
                className={`hidden md:inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  errorCount > 0
                    ? 'text-red-500 hover:bg-red-500/10'
                    : 'text-amber-500 hover:bg-amber-500/10'
                }`}
              >
                {errorCount > 0 ? (
                  <AlertCircle className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                <span>
                  {errorCount > 0 && UI_LABELS.topBar.errorShort(errorCount)}
                  {errorCount > 0 && warningCount > 0 && ' · '}
                  {warningCount > 0 && UI_LABELS.topBar.warningShort(warningCount)}
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Center Zone: [ Live | Graph | Source ] Segmented Toggle (Hidden in Narrow Live-Only Mode) */}
      {!isNarrow && (
        <div className="flex items-center justify-center shrink-0">
          <div
            role="tablist"
            aria-label={UI_LABELS.topBar.viewModeAria}
            className={UI_TOKENS.button.segmentedGroup}
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'live'}
              onClick={() => onViewModeChange('live')}
              className={
                viewMode === 'live'
                  ? UI_TOKENS.button.segmentedItemActive
                  : UI_TOKENS.button.segmentedItem
              }
            >
              <Eye className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>{UI_LABELS.topBar.liveMode}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'graph'}
              onClick={() => onViewModeChange('graph')}
              className={
                viewMode === 'graph'
                  ? UI_TOKENS.button.segmentedItemActive
                  : UI_TOKENS.button.segmentedItem
              }
            >
              <Workflow className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              <span>{UI_LABELS.topBar.graphMode}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'source'}
              onClick={() => onViewModeChange('source')}
              className={
                viewMode === 'source'
                  ? UI_TOKENS.button.segmentedItemActive
                  : UI_TOKENS.button.segmentedItem
              }
            >
              <Code2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>{UI_LABELS.topBar.sourceMode}</span>
            </button>
          </div>
        </div>
      )}

      {/* Right Zone: Wide (Undo/Redo, Library, Settings, AI, Split Copy) | Narrow (Library, Settings, 1-Tap Copy Icon) */}
      <div
        className={
          isNarrow
            ? 'flex items-center justify-end gap-1.5 pl-2 shrink-0'
            : 'flex flex-1 items-center justify-end gap-1.5 pl-2'
        }
      >
        {!isNarrow && (
          <>
            {readOnly && onForkExample ? (
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onForkExample();
                }}
                title={UI_LABELS.topBar.forkToEditTitle}
                className={UI_TOKENS.button.forkPill}
              >
                <GitFork className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                <span>{UI_LABELS.topBar.forkToEditButton}</span>
              </button>
            ) : (
              <div
                role="group"
                aria-label={UI_LABELS.topBar.historyGroupAria}
                className="inline-flex items-center gap-0.5 shrink-0"
              >
                <button
                  type="button"
                  disabled={readOnly || !canUndo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onUndo}
                  title={UI_LABELS.topBar.undoTitle}
                  aria-label={UI_LABELS.topBar.undoAria}
                  className={UI_TOKENS.button.iconGhost}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={readOnly || !canRedo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onRedo}
                  title={UI_LABELS.topBar.redoTitle}
                  aria-label={UI_LABELS.topBar.redoAria}
                  className={UI_TOKENS.button.iconGhost}
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-border-main shrink-0" />
          </>
        )}

        {/* Standalone Library Button (StageFlow amber Book icon) */}
        <button
          type="button"
          onClick={() => {
            setOpenMenu(null);
            onOpenLibrary();
          }}
          title={UI_LABELS.topBar.libraryButton}
          aria-label={UI_LABELS.topBar.libraryAria}
          aria-expanded={isLibraryOpen}
          className={isLibraryOpen ? UI_TOKENS.button.iconPillActive : UI_TOKENS.button.iconPill}
        >
          <BookOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        </button>

        {/* Quiet Icon-Only Settings Button + Popover */}
        <SettingsPopover
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          isOpen={openMenu === 'settings'}
          onToggle={() => setOpenMenu((prev) => (prev === 'settings' ? null : 'settings'))}
          onClose={() => setOpenMenu(null)}
          onOpenDebug={isNarrow ? undefined : onOpenDebug}
        />

        {/* Quiet AI Assistant Sidebar Toggle (Hidden in Narrow Mode) */}
        {!isNarrow && onToggleAi && (
          <button
            type="button"
            onClick={() => {
              setOpenMenu(null);
              onToggleAi();
            }}
            title={UI_LABELS.topBar.aiTitle}
            aria-label={UI_LABELS.topBar.aiAria}
            aria-expanded={isAiOpen}
            className={isAiOpen ? UI_TOKENS.button.filePillActive : UI_TOKENS.button.filePill}
          >
            <Sparkles className="h-3.5 w-3.5 text-purple-500 shrink-0" />
            <span>{UI_LABELS.topBar.aiButton}</span>
          </button>
        )}

        {/* Copy Action: 1-Tap Icon-Only in Narrow Mode, Split Format Picker in Wide Mode */}
        {isNarrow ? (
          <button
            type="button"
            onClick={() => {
              setOpenMenu(null);
              onCopyPlainText();
            }}
            title={UI_LABELS.topBar.copyDefaultTitle}
            aria-label={UI_LABELS.topBar.copyDefaultAria}
            className={
              copiedKind
                ? 'inline-flex items-center justify-center h-[30px] w-[30px] bg-btn-primary-bg text-btn-primary-text hover:bg-btn-primary-hover rounded-xl transition-colors active:scale-95 border border-btn-primary-bg shadow-2xs cursor-pointer shrink-0'
                : UI_TOKENS.button.iconPill
            }
          >
            {copiedKind ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-emerald-500" />
            )}
          </button>
        ) : (
          <div className="relative">
            <div
              className={
                copiedKind ? UI_TOKENS.button.splitGroupActive : UI_TOKENS.button.splitGroup
              }
            >
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onCopyPlainText();
                }}
                title={UI_LABELS.topBar.copyDefaultTitle}
                aria-label={UI_LABELS.topBar.copyDefaultAria}
                className={
                  copiedKind ? UI_TOKENS.button.splitPrimaryActive : UI_TOKENS.button.splitPrimary
                }
              >
                {copiedKind ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                )}
                <span>
                  {copiedKind === 'plain'
                    ? UI_LABELS.topBar.copiedPlain
                    : copiedKind === 'tagless'
                      ? UI_LABELS.topBar.copiedTagless
                      : copiedKind === 'json'
                        ? UI_LABELS.topBar.copiedJson
                        : UI_LABELS.topBar.copyButton}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOpenMenu((prev) => (prev === 'copy' ? null : 'copy'))}
                aria-expanded={openMenu === 'copy'}
                aria-haspopup="menu"
                aria-label={UI_LABELS.topBar.copyMenuAria}
                title={UI_LABELS.topBar.copyMenuTitle}
                className={
                  copiedKind
                    ? UI_TOKENS.button.splitChevronActive
                    : openMenu === 'copy'
                      ? UI_TOKENS.button.splitChevronOpen
                      : UI_TOKENS.button.splitChevron
                }
              >
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-150 ${
                    openMenu === 'copy' ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {openMenu === 'copy' && (
              <div
                role="menu"
                aria-label={UI_LABELS.topBar.copyMenuAria}
                className="absolute top-full right-0 mt-2 w-64 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main p-1.5 space-y-0.5"
              >
                <div className="px-2.5 pt-1 pb-0.5 text-[9.5px] font-black uppercase tracking-widest text-text-faint select-none">
                  {UI_LABELS.topBar.copyHeader}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onCopyPlainText();
                    setOpenMenu(null);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-subtle transition-colors group cursor-pointer"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-text-body group-hover:text-text-main">
                        {UI_LABELS.topBar.copyPlainTitle}
                      </span>
                      <span className="text-[10px] font-normal text-text-faint">
                        {UI_LABELS.topBar.copyPlainDesc}
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-text-faint shrink-0">
                    {UI_LABELS.topBar.fileMenuTagTxt}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onCopyTagless();
                    setOpenMenu(null);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-subtle transition-colors group cursor-pointer"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <FileCode2 className="h-3.5 w-3.5 text-teal-500 mt-0.5 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-text-body group-hover:text-text-main">
                        {UI_LABELS.topBar.copyTaglessTitle}
                      </span>
                      <span className="text-[10px] font-normal text-text-faint">
                        {UI_LABELS.topBar.copyTaglessDesc}
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-text-faint shrink-0">
                    {UI_LABELS.topBar.fileMenuTagPlain}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onCopyJsonEnvelope();
                    setOpenMenu(null);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-subtle transition-colors group cursor-pointer"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <Braces className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-text-body group-hover:text-text-main">
                        {UI_LABELS.topBar.copyJsonTitle}
                      </span>
                      <span className="text-[10px] font-normal text-text-faint">
                        {UI_LABELS.topBar.copyJsonDesc}
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-text-faint shrink-0">
                    {UI_LABELS.topBar.fileMenuTagJson}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Standalone About / Info Modal Button (Top Right Corner, StageFlow / SceneFlow parity) */}
        {onOpenInfo && (
          <button
            type="button"
            onClick={() => {
              setOpenMenu(null);
              onOpenInfo();
            }}
            title={UI_LABELS.topBar.infoTitle}
            aria-label={UI_LABELS.topBar.infoAria}
            aria-expanded={isInfoOpen}
            className={isInfoOpen ? UI_TOKENS.button.iconPillActive : UI_TOKENS.button.iconPill}
          >
            <Info className="h-3.5 w-3.5 text-sky-500 shrink-0" />
          </button>
        )}
      </div>
    </header>
  );
}
