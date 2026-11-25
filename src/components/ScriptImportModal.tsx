import {type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState} from 'react';
import {AlertTriangle, FileUp, Loader2, Upload, X} from 'lucide-react';
import type {LintRuleOverrides} from '../core/index.ts';
import type {BundledExample} from '../data/examples/index.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {
  inspectImportedFile,
  type AnalyzedBackupScriptItem,
  type ImportPreflightResult,
} from '../ui/scriptFileIO.ts';
import type {ScriptRecord} from '../ui/scriptLibraryDb.ts';
import type {ActiveScriptRef} from '../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {
  LibraryBackupImportView,
  SingleScriptImportView,
} from './library/ImportPreflightViews.tsx';

export interface ScriptImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeScript: ActiveScriptRef;
  activeSceneTitle: string;
  customScripts: readonly ScriptRecord[];
  examples: readonly BundledExample[];
  ruleOverrides?: LintRuleOverrides;
  initialReport?: ImportPreflightResult | null;
  remoteLoadingUrl?: string | null;
  onOpenExistingCustomScript: (record: ScriptRecord) => Promise<void> | void;
  onForkExample: (example: BundledExample) => Promise<void> | void;
  onCommitSingleScript: (options: {
    title: string;
    rawText: string;
    mode: 'new' | 'replace';
    updateTitleOnReplace?: boolean;
  }) => Promise<void>;
  onCommitLibraryBackup: (
    items: readonly AnalyzedBackupScriptItem[],
    selectedIds: ReadonlySet<string>
  ) => Promise<void>;
}

export function ScriptImportModal(props: ScriptImportModalProps) {
  if (!props.isOpen) return null;
  return <ScriptImportModalContent {...props} />;
}

function ScriptImportModalContent({
  onClose,
  activeScript,
  activeSceneTitle,
  customScripts,
  examples,
  ruleOverrides,
  initialReport = null,
  remoteLoadingUrl = null,
  onOpenExistingCustomScript,
  onForkExample,
  onCommitSingleScript,
  onCommitLibraryBackup,
}: Omit<ScriptImportModalProps, 'isOpen'>) {
  const labels = UI_LABELS.importModal;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [report, setReport] = useState<ImportPreflightResult | null>(initialReport);
  const [draftTitle, setDraftTitle] = useState(() =>
    initialReport?.kind === 'single-script' ? initialReport.suggestedTitle : ''
  );
  const [importMode, setImportMode] = useState<'new' | 'replace'>('new');
  const [updateTitleOnReplace, setUpdateTitleOnReplace] = useState(false);
  const [selectedBackupIds, setSelectedBackupIds] = useState<Set<string>>(() =>
    initialReport?.kind === 'library-backup'
      ? new Set(
          initialReport.items.filter((item) => item.defaultSelected).map((item) => item.record.id)
        )
      : new Set()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyPreflightReport = useCallback((result: ImportPreflightResult) => {
    setReport(result);
    if (result.kind === 'single-script') {
      setDraftTitle(result.suggestedTitle);
      setImportMode('new');
      setUpdateTitleOnReplace(false);
    } else if (result.kind === 'library-backup') {
      setSelectedBackupIds(
        new Set(
          result.items.filter((item) => item.defaultSelected).map((item) => item.record.id)
        )
      );
    }
  }, []);

  useEffect(() => {
    if (initialReport) {
      applyPreflightReport(initialReport);
    }
  }, [initialReport, applyPreflightReport]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const inspectFile = async (file: File) => {
    try {
      const content = await file.text();
      const result = inspectImportedFile(file.name, content, {
        customScripts,
        examples,
        activeScript,
        ruleOverrides,
      });
      applyPreflightReport(result);
    } catch {
      setReport({
        kind: 'error',
        filename: file.name,
        error: UI_LABELS.toasts.fileReadError,
      });
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void inspectFile(file);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingOver(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void inspectFile(file);
  };

  const handleConfirm = async () => {
    if (!report || report.kind === 'error' || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (report.kind === 'single-script') {
        const finalTitle = draftTitle.trim() || report.suggestedTitle;
        await onCommitSingleScript({
          title: finalTitle,
          rawText: report.validation.canonicalText,
          mode: importMode,
          updateTitleOnReplace,
        });
        onClose();
        return;
      }

      if (selectedBackupIds.size === 0) return;
      await onCommitLibraryBackup(report.items, selectedBackupIds);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleBackupId = (id: string) => {
    setSelectedBackupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const hasCustomDuplicate =
    report?.kind === 'single-script' &&
    report.contentDuplicates.some((dup) => dup.kind === 'custom');

  const canSubmit =
    !isSubmitting &&
    ((report?.kind === 'single-script' &&
      (importMode === 'replace' || draftTitle.trim().length > 0)) ||
      (report?.kind === 'library-backup' && selectedBackupIds.size > 0));

  const submitLabel =
    report?.kind === 'single-script'
      ? importMode === 'replace'
        ? labels.confirmReplaceButton
        : hasCustomDuplicate
          ? labels.confirmNewDuplicateButton
          : labels.confirmNewButton
      : report?.kind === 'library-backup'
        ? labels.confirmBackupButton(selectedBackupIds.size)
        : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      className={UI_TOKENS.modal.overlayHeavy}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative bg-surface w-full max-w-2xl max-h-[86vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown,.json,text/plain,text/markdown,application/json"
          onChange={handleFileInputChange}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
        />

        {/* Whole-Modal Drag-and-Drop Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-surface/95 backdrop-blur-xs border-2 border-dashed border-sky-500 rounded-2xl p-6 text-center pointer-events-none">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-500">
              <Upload className="h-6 w-6" />
            </div>
            <div className="font-serif text-base font-bold text-text-main">
              {labels.dropOverlayTitle}
            </div>
            <p className="text-xs text-text-muted">{labels.dropOverlayDesc}</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-subtle bg-surface-subtle shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <FileUp className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main truncate">
                {labels.title}
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">{labels.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={labels.closeAria}
            className={UI_TOKENS.button.iconClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll p-5 space-y-4">
          {!report && remoteLoadingUrl && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-main bg-surface-subtle/60 px-6 py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <div className="space-y-1 max-w-md">
                <div className="text-sm font-semibold text-text-main">
                  {labels.loadingRemoteHeading}
                </div>
                <p className="text-xs text-text-muted break-all">
                  {labels.loadingRemoteDesc(remoteLoadingUrl)}
                </p>
              </div>
            </div>
          )}

          {!report && !remoteLoadingUrl && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border-main bg-surface-subtle/60 hover:bg-surface-subtle hover:border-indigo-500/50 transition-colors px-6 py-10 text-center cursor-pointer"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-main bg-surface text-indigo-500 shadow-2xs">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-text-main">
                    {labels.dropzoneTitle}
                  </div>
                  <p className="text-xs text-text-muted max-w-md">{labels.dropzoneNote}</p>
                </div>
                <span className={UI_TOKENS.button.primary}>{labels.chooseFileButton}</span>
              </div>

              <div className="space-y-2">
                <div className={UI_TOKENS.input.labelMini}>{labels.supportedFormatsHeading}</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {labels.supportedFormats.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-xl border border-border-subtle bg-surface-subtle/50 p-3"
                    >
                      <div className="text-xs font-semibold text-text-main">{item.title}</div>
                      <p className="mt-0.5 text-[11px] text-text-muted leading-snug">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {report?.kind === 'error' && (
            <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-text-main">
                    {labels.errorHeading} · <span className="font-mono">{report.filename}</span>
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-300">{report.error}</p>
                  {report.issues && report.issues.length > 0 && (
                    <ul className="mt-1.5 list-disc pl-4 space-y-0.5 font-mono text-[10.5px] text-text-body">
                      {report.issues.slice(0, 6).map((issue, idx) => (
                        <li key={`${issue.path}-${idx}`}>
                          {issue.path ? `${issue.path}: ${issue.message}` : issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="pt-1 text-[11px] text-text-muted">{labels.errorHint}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={UI_TOKENS.button.actionPill}
                >
                  {labels.chooseAnotherFileButton}
                </button>
              </div>
            </div>
          )}

          {report?.kind === 'single-script' && (
            <SingleScriptImportView
              report={report}
              activeScript={activeScript}
              activeSceneTitle={activeSceneTitle}
              customScripts={customScripts}
              examples={examples}
              draftTitle={draftTitle}
              onDraftTitleChange={setDraftTitle}
              importMode={importMode}
              onImportModeChange={setImportMode}
              updateTitleOnReplace={updateTitleOnReplace}
              onUpdateTitleOnReplaceChange={setUpdateTitleOnReplace}
              onChooseAnotherFile={() => fileInputRef.current?.click()}
              onOpenExistingCustomScript={(record) => {
                void Promise.resolve(onOpenExistingCustomScript(record)).then(() => onClose());
              }}
              onForkExample={(example) => {
                void Promise.resolve(onForkExample(example)).then(() => onClose());
              }}
            />
          )}

          {report?.kind === 'library-backup' && (
            <LibraryBackupImportView
              report={report}
              selectedIds={selectedBackupIds}
              onToggleId={toggleBackupId}
              onSelectDefaults={() =>
                setSelectedBackupIds(
                  new Set(
                    report.items
                      .filter((item) => item.defaultSelected)
                      .map((item) => item.record.id)
                  )
                )
              }
              onSelectAll={() =>
                setSelectedBackupIds(new Set(report.items.map((item) => item.record.id)))
              }
              onClearSelection={() => setSelectedBackupIds(new Set())}
              onChooseAnotherFile={() => fileInputRef.current?.click()}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border-subtle bg-surface-subtle shrink-0">
          <span className="hidden sm:inline text-[11px] text-text-faint">
            {labels.footerDropHint}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className={UI_TOKENS.button.secondary}
            >
              {labels.cancelButton}
            </button>
            {report && report.kind !== 'error' && (
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void handleConfirm()}
                className={`${UI_TOKENS.button.primary} disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                {submitLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
