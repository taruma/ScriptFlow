import {
  AlignLeft,
  ArchiveRestore,
  Braces,
  ChevronDown,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FolderArchive,
  FolderOpen,
  History,
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
  onImportFile: () => void;
  onFormatScript: () => void;
  onVersionHistory: () => void;
  onDownloadCanonical: () => void;
  onDownloadTagless: () => void;
  onDownloadJsonEnvelope: () => void;
  onBackupAll: () => void;
  onRestoreBackup: () => void;
  onBrowseLibrary: () => void;
}

/**
 * Quiet left-wing File menu dropdown housing creation, single-file import/export,
 * non-destructive formatting, version history, full-library backup/restore, and
 * library browser navigation.
 */
export function FileMenuDropdown({
  isOpen,
  onToggle,
  onClose,
  readOnly = false,
  onNewBlank,
  onImportFile,
  onFormatScript,
  onVersionHistory,
  onDownloadCanonical,
  onDownloadTagless,
  onDownloadJsonEnvelope,
  onBackupAll,
  onRestoreBackup,
  onBrowseLibrary,
}: FileMenuDropdownProps) {
  const runAndClose = (action: () => void) => () => {
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
        <FileText className="h-3.5 w-3.5 text-text-muted" />
        <span className="hidden sm:inline">{UI_LABELS.topBar.fileButton}</span>
        <ChevronDown className="h-3 w-3 text-text-faint" />
      </button>

      {isOpen && (
        <div role="menu" aria-label={UI_LABELS.topBar.fileMenuAria} className={UI_TOKENS.dropdown.menuLeftWide}>
          {/* Create & Import */}
          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={runAndClose(onNewBlank)}
              className={UI_TOKENS.dropdown.item}
            >
              <span className="inline-flex items-center gap-2">
                <FilePlus2 className="h-3.5 w-3.5 text-text-muted" />
                <span>{UI_LABELS.topBar.fileMenuNewBlank}</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={runAndClose(onImportFile)}
              className={UI_TOKENS.dropdown.item}
            >
              <span className="inline-flex items-center gap-2">
                <Upload className="h-3.5 w-3.5 text-text-muted" />
                <span>{UI_LABELS.topBar.fileMenuImportFile}</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={readOnly}
              title={UI_LABELS.source.formatTitle}
              onClick={runAndClose(onFormatScript)}
              className={`${UI_TOKENS.dropdown.item} disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-text-body disabled:cursor-not-allowed`}
            >
              <span className="inline-flex items-center gap-2">
                <AlignLeft className="h-3.5 w-3.5 text-text-muted" />
                <span>{UI_LABELS.topBar.fileMenuFormatScript}</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={runAndClose(onVersionHistory)}
              className={UI_TOKENS.dropdown.item}
            >
              <span className="inline-flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-text-muted" />
                <span>{UI_LABELS.topBar.fileMenuVersionHistory}</span>
              </span>
            </button>
          </div>

          {/* Download Current */}
          <div>
            <div className={UI_TOKENS.dropdown.header}>
              <span className={UI_TOKENS.dropdown.headerText}>
                {UI_LABELS.topBar.fileMenuExportHeader}
              </span>
            </div>
            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                onClick={runAndClose(onDownloadCanonical)}
                className={UI_TOKENS.dropdown.item}
              >
                <span className="inline-flex items-center gap-2">
                  <Download className="h-3.5 w-3.5 text-text-muted" />
                  <span>{UI_LABELS.topBar.fileMenuDownloadCanonical}</span>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={runAndClose(onDownloadTagless)}
                className={UI_TOKENS.dropdown.item}
              >
                <span className="inline-flex items-center gap-2">
                  <FileCode2 className="h-3.5 w-3.5 text-text-muted" />
                  <span>{UI_LABELS.topBar.fileMenuDownloadTagless}</span>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={runAndClose(onDownloadJsonEnvelope)}
                className={UI_TOKENS.dropdown.item}
              >
                <span className="inline-flex items-center gap-2">
                  <Braces className="h-3.5 w-3.5 text-text-muted" />
                  <span>{UI_LABELS.topBar.fileMenuDownloadJsonEnvelope}</span>
                </span>
              </button>
            </div>
          </div>

          {/* Library & Backup */}
          <div>
            <div className={UI_TOKENS.dropdown.header}>
              <span className={UI_TOKENS.dropdown.headerText}>
                {UI_LABELS.topBar.fileMenuLibraryHeader}
              </span>
            </div>
            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                onClick={runAndClose(onBackupAll)}
                className={UI_TOKENS.dropdown.item}
              >
                <span className="inline-flex items-center gap-2">
                  <FolderArchive className="h-3.5 w-3.5 text-text-muted" />
                  <span>{UI_LABELS.topBar.fileMenuBackupAll}</span>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={runAndClose(onRestoreBackup)}
                className={UI_TOKENS.dropdown.item}
              >
                <span className="inline-flex items-center gap-2">
                  <ArchiveRestore className="h-3.5 w-3.5 text-text-muted" />
                  <span>{UI_LABELS.topBar.fileMenuRestoreBackup}</span>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={runAndClose(onBrowseLibrary)}
                className={UI_TOKENS.dropdown.item}
              >
                <span className="inline-flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5 text-text-muted" />
                  <span>{UI_LABELS.topBar.fileMenuBrowseLibrary}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
