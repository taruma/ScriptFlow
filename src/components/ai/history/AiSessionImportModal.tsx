import {type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  BookOpen,
  FileUp,
  GitFork,
  Info,
  Pin,
  Upload,
  X,
} from 'lucide-react';
import type {BundledExample} from '../../../data/examples/index.ts';
import {formatEstimatedUsd} from '../../../ui/aiPricing.ts';
import {
  analyzeAiSessionsImport,
  parseAiSessionsImport,
  prepareSelectedAiSessionsImport,
  type AiSessionRecord,
  type AiSessionsImportAnalysis,
  type AnalyzedAiSessionImportItem,
} from '../../../ui/aiSessions.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import type {ScriptRecord} from '../../../ui/scriptLibraryDb.ts';
import {formatRelativeUpdatedTime} from '../../../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface AiSessionImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingSessions: readonly AiSessionRecord[];
  currentScriptSessionKey: string;
  customScripts: readonly ScriptRecord[];
  examples: readonly BundledExample[];
  onConfirmImport: (
    recordsToWrite: readonly AiSessionRecord[],
    stats: {addedCount: number; forkedCount: number}
  ) => Promise<void>;
}

export function AiSessionImportModal(props: AiSessionImportModalProps) {
  if (!props.isOpen) return null;
  return <AiSessionImportModalContent {...props} />;
}

function getDefaultSelectedIds(analysis: AiSessionsImportAnalysis): Set<string> {
  return new Set(
    analysis.items.filter((item) => item.defaultSelected).map((item) => item.session.id)
  );
}

function formatExportedIso(iso?: string): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function AiSessionImportModalContent({
  onClose,
  existingSessions,
  currentScriptSessionKey,
  customScripts,
  examples,
  onConfirmImport,
}: Omit<AiSessionImportModalProps, 'isOpen'>) {
  const historyLabels = UI_LABELS.ai.history;
  const labels = historyLabels.import;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{
    message: string;
    issues?: Array<{path: string; message: string}>;
  } | null>(null);
  const [analysis, setAnalysis] = useState<AiSessionsImportAnalysis | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, {capture: true});
    return () => document.removeEventListener('keydown', handleKeyDown, {capture: true});
  }, [onClose, isSubmitting]);

  const inspectFile = async (file: File) => {
    setFilename(file.name);
    setErrorState(null);
    try {
      const content = await file.text();
      const parsed = parseAiSessionsImport(content);
      if (!parsed.ok) {
        setAnalysis(null);
        setSelectedIds(new Set());
        setErrorState({message: parsed.error, issues: parsed.issues});
        return;
      }

      const nextAnalysis = analyzeAiSessionsImport(parsed, existingSessions, {
        currentScriptSessionKey,
        customScripts,
        examples,
      });
      setAnalysis(nextAnalysis);
      setSelectedIds(getDefaultSelectedIds(nextAnalysis));
    } catch (error) {
      setAnalysis(null);
      setSelectedIds(new Set());
      setErrorState({
        message: error instanceof Error ? error.message : 'Failed to read JSON file.',
      });
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      void inspectFile(file);
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void inspectFile(file);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const prepared = useMemo(
    () =>
      analysis
        ? prepareSelectedAiSessionsImport(analysis, selectedIds, existingSessions)
        : null,
    [analysis, selectedIds, existingSessions]
  );

  const selectedCount = prepared?.recordsToWrite.length ?? 0;

  const handleConfirm = async () => {
    if (!prepared || prepared.recordsToWrite.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirmImport(prepared.recordsToWrite, {
        addedCount: prepared.addedCount,
        forkedCount: prepared.forkedCount,
      });
      onClose();
    } catch (error) {
      setErrorState({
        message: error instanceof Error ? error.message : 'Failed to save imported sessions.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportedAtLabel = formatExportedIso(analysis?.exportedAt);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlay}
    >
      <div className="bg-surface w-full max-w-2xl max-h-[86dvh] rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col">
        {/* Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-[var(--phase-continuity-text)]"
            >
              <Upload className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-serif text-[15px] font-bold tracking-tight text-text-main">
                {labels.title}
              </h3>
              <p className="text-[11px] text-text-muted truncate">{labels.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label={labels.closeAria}
            className={UI_TOKENS.button.iconClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          aria-label={labels.chooseFileAria}
          className="hidden"
        />

        {/* Body */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll p-4 space-y-3.5"
        >
          {!analysis ? (
            <div
              className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors space-y-3 ${
                isDraggingOver
                  ? 'border-btn-primary-bg bg-btn-primary-bg/5'
                  : 'border-border-main bg-surface-subtle/40'
              }`}
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-border-main bg-surface text-text-muted">
                <FileUp className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-text-main">{labels.dropTitle}</p>
                <p className="text-[11px] text-text-muted">{labels.dropSubtitle}</p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={UI_TOKENS.button.primary}
                >
                  {labels.chooseFileButton}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* File Metadata Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-main bg-surface-subtle/50 px-3 py-2.5">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-text-main truncate max-w-[260px]">
                      {filename}
                    </span>
                    <span className="rounded border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[9.5px] text-text-muted">
                      {analysis.sourceFormat === 'sessions-backup'
                        ? labels.formatBackupBadge
                        : labels.formatSingleBadge}
                    </span>
                  </div>
                  {exportedAtLabel && (
                    <p className="text-[10.5px] text-text-muted">
                      {labels.exportedAtPrefix}: {exportedAtLabel}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => fileInputRef.current?.click()}
                  className={UI_TOKENS.button.actionPill}
                >
                  <FileUp className="h-3.5 w-3.5 text-text-muted" />
                  <span>{labels.chooseAnotherButton}</span>
                </button>
              </div>

              {/* Condition Summary Strip */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {analysis.newCount > 0 && (
                  <span className="rounded-lg border px-2 py-0.5 font-medium auteur-phase-aesthetic">
                    {labels.summaryNew(analysis.newCount)}
                  </span>
                )}
                {analysis.conflictCount > 0 && (
                  <span className="rounded-lg border px-2 py-0.5 font-medium auteur-phase-continuity">
                    {labels.summaryConflict(analysis.conflictCount)}
                  </span>
                )}
                {analysis.duplicateCount > 0 && (
                  <span className="rounded-lg border border-border-main bg-surface-subtle px-2 py-0.5 text-text-muted">
                    {labels.summaryDuplicate(analysis.duplicateCount)}
                  </span>
                )}
                {analysis.withTracesCount > 0 && (
                  <span className="rounded-lg border border-border-main bg-surface px-2 py-0.5 font-mono text-[10px] text-text-body">
                    {labels.summaryWithTraces(analysis.withTracesCount)}
                  </span>
                )}
                {analysis.withoutTracesCount > 0 && (
                  <span className="rounded-lg border border-border-subtle bg-surface-subtle px-2 py-0.5 font-mono text-[10px] text-text-muted">
                    {labels.summaryWithoutTraces(analysis.withoutTracesCount)}
                  </span>
                )}
              </div>

              {/* Condition Notices */}
              {analysis.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200 space-y-1">
                  {analysis.warnings.map((warning, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}

              {analysis.withoutTracesCount > 0 && (
                <div className="rounded-xl border border-border-main bg-surface-subtle/60 px-3 py-2 text-[11px] text-text-body flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-text-muted shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{labels.noTracesNotice}</span>
                </div>
              )}

              {analysis.orphanedScriptCount > 0 && (
                <div className="rounded-xl border border-border-main bg-surface-subtle/60 px-3 py-2 text-[11px] text-text-body flex items-start gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-text-muted shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    {labels.orphanedScriptsNotice(analysis.orphanedScriptCount)}
                  </span>
                </div>
              )}

              {/* Selection Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(getDefaultSelectedIds(analysis))}
                    className={UI_TOKENS.ai.pillButton}
                  >
                    {labels.selectRecommendedButton}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(new Set(analysis.items.map((item) => item.session.id)))
                    }
                    className={UI_TOKENS.ai.pillButton}
                  >
                    {labels.selectAllButton}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className={UI_TOKENS.ai.pillButton}
                  >
                    {labels.clearButton}
                  </button>
                </div>
              </div>

              {/* Preflight Session Checklist */}
              <div className="space-y-1.5">
                {analysis.items.map((item) => (
                  <PreflightSessionRow
                    key={item.session.id}
                    item={item}
                    checked={selectedIds.has(item.session.id)}
                    onToggle={() => toggleSelected(item.session.id)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Error Box */}
          {errorState && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300 space-y-1.5">
              <div className="flex items-start gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {labels.importErrorTitle}: {errorState.message}
                </span>
              </div>
              {errorState.issues && errorState.issues.length > 0 && (
                <ul className="list-disc pl-6 space-y-0.5 font-mono text-[10.5px]">
                  {errorState.issues.slice(0, 6).map((issue, idx) => (
                    <li key={idx}>
                      {issue.path ? `${issue.path}: ` : ''}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-subtle bg-surface-subtle flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className={UI_TOKENS.button.secondary}
          >
            {labels.cancelButton}
          </button>
          {analysis && (
            <button
              type="button"
              disabled={selectedCount === 0 || isSubmitting}
              onClick={() => void handleConfirm()}
              className={`${UI_TOKENS.button.primary} disabled:opacity-45 disabled:cursor-not-allowed`}
            >
              {isSubmitting ? labels.importingButton : labels.confirmButton(selectedCount)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PreflightSessionRow({
  item,
  checked,
  onToggle,
}: {
  item: AnalyzedAiSessionImportItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const historyLabels = UI_LABELS.ai.history;
  const labels = historyLabels.import;
  const {session, status, hasTraces, resolvedSummary, matchedExisting} = item;

  const isCurrent = resolvedSummary.scriptStatus === 'current';
  const isDeleted = resolvedSummary.scriptStatus === 'deleted';

  return (
    <label
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors cursor-pointer ${
        checked
          ? 'border-border-main bg-surface shadow-2xs'
          : 'border-border-subtle bg-surface-subtle/40 opacity-80 hover:opacity-100'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 h-3.5 w-3.5 rounded border-border-main accent-[var(--btn-primary-bg)] shrink-0 cursor-pointer"
      />

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-main">
            {session.pinned && (
              <Pin className="h-3 w-3 text-[var(--phase-continuity-text)] shrink-0" />
            )}
            <span className="truncate">{session.title}</span>
          </span>

          <div className="flex items-center gap-1 shrink-0">
            <span
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                status === 'new'
                  ? 'auteur-phase-aesthetic'
                  : status === 'conflict'
                    ? 'auteur-phase-continuity'
                    : 'border-border-main bg-surface-subtle text-text-muted'
              }`}
            >
              {status === 'conflict' && <GitFork className="h-2.5 w-2.5" />}
              <span>
                {status === 'new'
                  ? labels.statusNewBadge
                  : status === 'conflict'
                    ? labels.statusConflictBadge
                    : labels.statusDuplicateBadge}
              </span>
            </span>

            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[9.5px] ${
                hasTraces
                  ? 'border-border-main bg-surface-subtle text-text-body'
                  : 'border-border-subtle bg-app text-text-faint'
              }`}
            >
              {hasTraces ? labels.tracesPresentBadge : labels.tracesOmittedBadge}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-text-muted">
          <span
            className={`rounded border px-1.5 py-0.25 truncate max-w-[200px] ${
              isCurrent
                ? 'auteur-phase-continuity'
                : isDeleted
                  ? 'border-border-subtle bg-surface-subtle text-text-faint italic'
                  : 'border-border-subtle bg-surface-subtle text-text-body'
            }`}
          >
            {isCurrent
              ? historyLabels.thisScriptBadge
              : isDeleted
                ? `${resolvedSummary.resolvedScriptTitle} · ${labels.scriptMissingBadge}`
                : resolvedSummary.resolvedScriptTitle}
          </span>
          <span className="font-mono tabular-nums">
            {historyLabels.turnsLabel(session.turnCount)}
          </span>
          {session.estimatedCostUsd > 0 && (
            <span className="font-mono tabular-nums">
              {formatEstimatedUsd(session.estimatedCostUsd)}
            </span>
          )}
          <span className="text-text-faint">·</span>
          <span>{formatRelativeUpdatedTime(session.updatedAt)}</span>
        </div>

        {status === 'conflict' && matchedExisting && (
          <p className="text-[10.5px] text-text-muted leading-snug">
            {labels.conflictDetail(matchedExisting.title)}
          </p>
        )}
        {status === 'duplicate' && (
          <p className="text-[10.5px] text-text-faint leading-snug">{labels.duplicateDetail}</p>
        )}
      </div>
    </label>
  );
}
