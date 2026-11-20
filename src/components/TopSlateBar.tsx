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
  GitFork,
  Redo2,
  Undo2,
} from 'lucide-react';
import type {LintDiagnostic} from '../core/types.ts';
import type {EditorSettings} from '../ui/editorSettings.ts';
import {APP_META, UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {FileMenuDropdown} from './FileMenuDropdown.tsx';
import {SettingsPopover} from './SettingsPopover.tsx';

export type ViewMode = 'live' | 'source';

interface TopSlateBarProps {
  title: string;
  onTitleChange: (nextTitle: string) => void;
  readOnly?: boolean;
  onForkExample?: () => void;
  beatCount: number;
  diagnostics: LintDiagnostic[];
  onJumpToFirstDiagnostic: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNewBlank: () => void;
  onImportFile: () => void;
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
  copiedKind: 'plain' | 'tagless' | null;
  onOpenDebug?: () => void;
  isDebugOpen?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

type OpenMenu = 'file' | 'settings' | 'copy' | null;

export function TopSlateBar({
  title,
  onTitleChange,
  readOnly = false,
  onForkExample,
  beatCount,
  diagnostics,
  onJumpToFirstDiagnostic,
  viewMode,
  onViewModeChange,
  onNewBlank,
  onImportFile,
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
  copiedKind,
  onOpenDebug,
  isDebugOpen = false,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: TopSlateBarProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <header ref={barRef} className={`${UI_TOKENS.layout.appHeader} sticky top-0`}>
      {/* Left Zone: Calm File Menu + Scene Title + Live Beat Count + Quiet Diagnostic Jump */}
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
        <FileMenuDropdown
          isOpen={openMenu === 'file'}
          onToggle={() => setOpenMenu((prev) => (prev === 'file' ? null : 'file'))}
          onClose={() => setOpenMenu(null)}
          onNewBlank={onNewBlank}
          onImportFile={onImportFile}
          onDownloadCanonical={onDownloadCanonical}
          onDownloadTagless={onDownloadTagless}
          onDownloadJsonEnvelope={onDownloadJsonEnvelope}
          onBackupAll={onBackupAll}
          onRestoreBackup={onRestoreBackup}
          onBrowseLibrary={onOpenLibrary}
        />

        <span aria-hidden="true" className="h-3.5 w-px bg-border-main shrink-0" />

        {readOnly ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 max-w-[240px] truncate px-1 py-1 font-serif text-sm font-bold tracking-tight text-text-main">
              {title || APP_META.untitledScene}
            </span>
            <span
              title={UI_LABELS.topBar.exampleBadgeTitle}
              className="auteur-phase-logic inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide"
            >
              {UI_LABELS.topBar.exampleBadge}
            </span>
          </div>
        ) : (
          <div className="inline-grid min-w-0 max-w-[240px] items-center">
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 whitespace-pre truncate px-1.5 py-1 font-serif text-sm font-bold tracking-tight"
            >
              {title || APP_META.untitledScene}
            </span>
            <input
              type="text"
              data-native-undo="true"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              aria-label={UI_LABELS.topBar.sceneTitleAria}
              placeholder={APP_META.untitledScene}
              className="col-start-1 row-start-1 min-w-[4ch] w-full truncate rounded-md bg-transparent px-1.5 py-1 font-serif text-sm font-bold tracking-tight text-text-main hover:bg-surface-subtle focus:bg-surface-subtle focus:outline-none focus:ring-1 focus:ring-border-main"
            />
          </div>
        )}

        <div className="hidden sm:flex items-center gap-2 text-xs text-text-faint whitespace-nowrap shrink-0">
          <span aria-hidden="true">·</span>
          <span className="font-mono text-[11px] tabular-nums">
            {beatCount} {UI_LABELS.topBar.beatUnit(beatCount)}
          </span>
        </div>

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
      </div>

      {/* Center Zone: [ Live | Source ] Segmented Toggle */}
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
            <Eye className="h-3.5 w-3.5" />
            <span>{UI_LABELS.topBar.liveMode}</span>
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
            <Code2 className="h-3.5 w-3.5" />
            <span>{UI_LABELS.topBar.sourceMode}</span>
          </button>
        </div>
      </div>

      {/* Right Zone: Quiet Undo/Redo, Optional Debug Inspector, Library, Settings, Copy */}
      <div className="flex flex-1 items-center justify-end gap-1.5 pl-2">
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
            <GitFork className="h-3.5 w-3.5 text-[var(--phase-logic-text)]" />
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

        {onOpenDebug && (
          <button
            type="button"
            onClick={() => {
              setOpenMenu(null);
              onOpenDebug();
            }}
            aria-label={UI_LABELS.topBar.debugAria}
            aria-expanded={isDebugOpen}
            className={isDebugOpen ? UI_TOKENS.button.filePillActive : UI_TOKENS.button.filePill}
          >
            <Braces className="h-3.5 w-3.5 text-text-muted" />
            <span className="hidden lg:inline">{UI_LABELS.topBar.debugButton}</span>
          </button>
        )}

        {/* Quiet Library Button */}
        <button
          type="button"
          onClick={() => {
            setOpenMenu(null);
            onOpenLibrary();
          }}
          aria-label={UI_LABELS.topBar.libraryAria}
          aria-expanded={isLibraryOpen}
          className={isLibraryOpen ? UI_TOKENS.button.filePillActive : UI_TOKENS.button.filePill}
        >
          <BookOpen className="h-3.5 w-3.5 text-text-muted" />
          <span className="hidden sm:inline">{UI_LABELS.topBar.libraryButton}</span>
        </button>

        {/* Settings Popover (Text Size, Clause Underlines, Theme, Supervisor Rules) */}
        <SettingsPopover
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          isOpen={openMenu === 'settings'}
          onToggle={() => setOpenMenu((prev) => (prev === 'settings' ? null : 'settings'))}
        />

        {/* Copy Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu((prev) => (prev === 'copy' ? null : 'copy'))}
            aria-expanded={openMenu === 'copy'}
            className={
              copiedKind ? UI_TOKENS.button.actionPillActive : UI_TOKENS.button.filePill
            }
          >
            {copiedKind ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-text-muted" />
            )}
            <span>
              {copiedKind === 'plain'
                ? UI_LABELS.topBar.copiedPlain
                : copiedKind === 'tagless'
                  ? UI_LABELS.topBar.copiedTagless
                  : UI_LABELS.topBar.copyButton}
            </span>
            {!copiedKind && <ChevronDown className="h-3 w-3 text-text-faint" />}
          </button>

          {openMenu === 'copy' && (
            <div className={UI_TOKENS.dropdown.menuRight}>
              <div className={UI_TOKENS.dropdown.header}>
                <span className={UI_TOKENS.dropdown.headerText}>
                  {UI_LABELS.topBar.copyHeader}
                </span>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    onCopyPlainText();
                    setOpenMenu(null);
                  }}
                  className={`${UI_TOKENS.dropdown.item} flex-col items-start gap-0.5 py-2`}
                >
                  <span>{UI_LABELS.topBar.copyPlainTitle}</span>
                  <span className="text-[10px] font-normal text-text-faint">
                    {UI_LABELS.topBar.copyPlainDesc}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCopyTagless();
                    setOpenMenu(null);
                  }}
                  className={`${UI_TOKENS.dropdown.item} flex-col items-start gap-0.5 py-2`}
                >
                  <span>{UI_LABELS.topBar.copyTaglessTitle}</span>
                  <span className="text-[10px] font-normal text-text-faint">
                    {UI_LABELS.topBar.copyTaglessDesc}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
