import {useEffect, useRef, useState, type ReactNode} from 'react';
import {
  AlignLeft,
  BookOpen,
  Braces,
  ChevronDown,
  ChevronRight,
  CopyPlus,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FolderArchive,
  History,
  Settings,
  Upload,
} from 'lucide-react';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

export interface FileMenuDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  readOnly?: boolean;
  onNewBlank: () => void;
  onDuplicateScript: () => void;
  onImportFile: () => void;
  onFormatScript: () => void;
  onVersionHistory: () => void;
  onAiChatHistory?: () => void;
  onDownloadCanonical: () => void;
  onDownloadTagless: () => void;
  onDownloadJsonEnvelope: () => void;
  onBackupAll: () => void;
  onRestoreBackup?: () => void;
  onBrowseLibrary: () => void;
  onOpenDebug?: () => void;
  onOpenSettings: () => void;
}

function SectionHeading({title}: {title: string}) {
  return (
    <div className="px-2.5 pt-1 pb-0.5 text-[9.5px] font-black uppercase tracking-widest text-text-faint select-none">
      {title}
    </div>
  );
}

interface MenuRowProps {
  icon: ReactNode;
  label: string;
  tag?: string;
  trailing?: ReactNode;
  title?: string;
  disabled?: boolean;
  isActive?: boolean;
  ariaHasPopup?: 'menu';
  ariaExpanded?: boolean;
  onClick: () => void;
}

function MenuRow({
  icon,
  label,
  tag,
  trailing,
  title,
  disabled = false,
  isActive = false,
  ariaHasPopup,
  ariaExpanded,
  onClick,
}: MenuRowProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left ${
        disabled
          ? 'text-text-muted opacity-45 cursor-not-allowed'
          : isActive
            ? 'bg-surface-muted text-text-main cursor-pointer'
            : 'text-text-body hover:text-text-main hover:bg-surface-subtle cursor-pointer'
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="whitespace-nowrap truncate">{label}</span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {tag && (
          <span className="text-[9px] font-mono uppercase tracking-wider text-text-faint">
            {tag}
          </span>
        )}
        {trailing}
      </span>
    </button>
  );
}

/**
 * Tiered left-wing File menu dropdown styled after StageFlow parity:
 * slim inline micro-headers, rounded hover rows with colorful semantic icons,
 * right-aligned format badges, and a Download flyout submenu.
 */
export function FileMenuDropdown({
  isOpen,
  onToggle,
  onClose,
  readOnly = false,
  onNewBlank,
  onDuplicateScript,
  onImportFile,
  onFormatScript,
  onVersionHistory,
  onAiChatHistory,
  onDownloadCanonical,
  onDownloadTagless,
  onDownloadJsonEnvelope,
  onBackupAll,
  onBrowseLibrary,
  onOpenDebug,
  onOpenSettings,
}: FileMenuDropdownProps) {
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const hoverCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsDownloadOpen(false);
    }
    return () => {
      if (hoverCloseTimerRef.current !== null) {
        window.clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = null;
      }
    };
  }, [isOpen]);

  const openDownloadSubmenu = () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    setIsDownloadOpen(true);
  };

  const scheduleCloseDownloadSubmenu = () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
    }
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setIsDownloadOpen(false);
      hoverCloseTimerRef.current = null;
    }, 110);
  };

  const runAndClose = (action: () => void) => () => {
    setIsDownloadOpen(false);
    onClose();
    action();
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={UI_LABELS.topBar.fileMenuAria}
        className={isOpen ? UI_TOKENS.button.filePillActive : UI_TOKENS.button.filePill}
      >
        <FileText className="h-3.5 w-3.5 text-sky-500 shrink-0" />
        <span className="hidden sm:inline">{UI_LABELS.topBar.fileButton}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-text-main' : 'text-text-faint'
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={UI_LABELS.topBar.fileMenuAria}
          className="absolute top-full left-0 mt-2 w-[264px] bg-surface rounded-xl shadow-xl border border-border-main z-50 text-text-main divide-y divide-border-subtle"
        >
          {/* Section 1: Script & History */}
          <div className="p-1.5 space-y-0.5">
            <SectionHeading title={UI_LABELS.topBar.fileMenuScriptHeader} />
            <MenuRow
              icon={<FilePlus2 className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
              label={UI_LABELS.topBar.fileMenuNewBlank}
              onClick={runAndClose(onNewBlank)}
            />
            <MenuRow
              icon={<CopyPlus className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
              label={UI_LABELS.topBar.fileMenuDuplicateScript}
              onClick={runAndClose(onDuplicateScript)}
            />
            <MenuRow
              icon={<Upload className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
              label={UI_LABELS.topBar.fileMenuImportFile}
              tag={UI_LABELS.topBar.fileMenuTagTxtJson}
              onClick={runAndClose(onImportFile)}
            />
            <MenuRow
              icon={<AlignLeft className="h-3.5 w-3.5 text-violet-500 shrink-0" />}
              label={UI_LABELS.topBar.fileMenuFormatScript}
              disabled={readOnly}
              title={
                readOnly
                  ? UI_LABELS.topBar.fileMenuFormatReadOnlyTitle
                  : UI_LABELS.source.formatTitle
              }
              onClick={runAndClose(onFormatScript)}
            />
            <MenuRow
              icon={<History className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
              label={UI_LABELS.topBar.fileMenuVersionHistory}
              onClick={runAndClose(onVersionHistory)}
            />
            {onAiChatHistory && (
              <MenuRow
                icon={<History className="h-3.5 w-3.5 text-violet-500 shrink-0" />}
                label={UI_LABELS.topBar.fileMenuAiChatHistory}
                onClick={runAndClose(onAiChatHistory)}
              />
            )}
          </div>

          {/* Section 2: Export & Library */}
          <div className="p-1.5 space-y-0.5">
            <SectionHeading title={UI_LABELS.topBar.fileMenuExportHeader} />

            {/* Download ▸ Flyout Submenu */}
            <div
              className="relative"
              onMouseEnter={openDownloadSubmenu}
              onMouseLeave={scheduleCloseDownloadSubmenu}
            >
              <MenuRow
                icon={<Download className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                label={UI_LABELS.topBar.fileMenuDownloadSubmenu}
                isActive={isDownloadOpen}
                ariaHasPopup="menu"
                ariaExpanded={isDownloadOpen}
                trailing={
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform duration-150 ${
                      isDownloadOpen ? 'text-text-main translate-x-0.5' : 'text-text-faint'
                    }`}
                  />
                }
                onClick={() => setIsDownloadOpen((prev) => !prev)}
              />

              {isDownloadOpen && (
                <div className="sm:absolute sm:left-full sm:top-0 sm:pl-1.5 pt-1 sm:pt-0 z-50">
                  <div
                    role="menu"
                    aria-label={UI_LABELS.topBar.fileMenuDownloadSubmenu}
                    className="w-full sm:w-56 bg-surface rounded-xl shadow-xl border border-border-main p-1.5 space-y-0.5 text-text-main"
                  >
                    <MenuRow
                      icon={<Download className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                      label={UI_LABELS.topBar.fileMenuDownloadCanonical}
                      tag={UI_LABELS.topBar.fileMenuTagTxt}
                      onClick={runAndClose(onDownloadCanonical)}
                    />
                    <MenuRow
                      icon={<FileCode2 className="h-3.5 w-3.5 text-teal-500 shrink-0" />}
                      label={UI_LABELS.topBar.fileMenuDownloadTagless}
                      tag={UI_LABELS.topBar.fileMenuTagPlain}
                      onClick={runAndClose(onDownloadTagless)}
                    />
                    <MenuRow
                      icon={<Braces className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      label={UI_LABELS.topBar.fileMenuDownloadJsonEnvelope}
                      tag={UI_LABELS.topBar.fileMenuTagJson}
                      onClick={runAndClose(onDownloadJsonEnvelope)}
                    />
                  </div>
                </div>
              )}
            </div>

            <MenuRow
              icon={<FolderArchive className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
              label={UI_LABELS.topBar.fileMenuBackupAll}
              tag={UI_LABELS.topBar.fileMenuTagJson}
              onClick={runAndClose(onBackupAll)}
            />
            <MenuRow
              icon={<BookOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
              label={UI_LABELS.topBar.fileMenuBrowseLibrary}
              onClick={runAndClose(onBrowseLibrary)}
            />
          </div>

          {/* Section 3: Tools & Settings */}
          <div className="p-1.5 space-y-0.5">
            <SectionHeading title={UI_LABELS.topBar.fileMenuToolsHeader} />
            {onOpenDebug && (
              <MenuRow
                icon={<Braces className="h-3.5 w-3.5 text-purple-500 shrink-0" />}
                label={UI_LABELS.topBar.fileMenuJsonIrInspector}
                tag={UI_LABELS.topBar.fileMenuTagIr}
                onClick={runAndClose(onOpenDebug)}
              />
            )}
            <MenuRow
              icon={<Settings className="h-3.5 w-3.5 text-text-muted shrink-0" />}
              label={UI_LABELS.topBar.fileMenuSettings}
              onClick={() => {
                setIsDownloadOpen(false);
                onOpenSettings();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
