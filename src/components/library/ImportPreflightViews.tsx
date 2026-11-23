import {useState} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CopyCheck,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FileText,
  FolderArchive,
  RefreshCw,
} from 'lucide-react';
import type {BundledExample} from '../../data/examples/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import type {
  AnalyzedBackupScriptItem,
  LibraryBackupImportPreflight,
  SingleScriptImportPreflight,
} from '../../ui/scriptFileIO.ts';
import type {ScriptRecord} from '../../ui/scriptLibraryDb.ts';
import type {ActiveScriptRef} from '../../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../../ui/tokens/ui.ts';

export interface SingleScriptImportViewProps {
  report: SingleScriptImportPreflight;
  activeScript: ActiveScriptRef;
  activeSceneTitle: string;
  customScripts: readonly ScriptRecord[];
  examples: readonly BundledExample[];
  draftTitle: string;
  onDraftTitleChange: (nextTitle: string) => void;
  importMode: 'new' | 'replace';
  onImportModeChange: (mode: 'new' | 'replace') => void;
  updateTitleOnReplace: boolean;
  onUpdateTitleOnReplaceChange: (checked: boolean) => void;
  onChooseAnotherFile: () => void;
  onOpenExistingCustomScript: (record: ScriptRecord) => void;
  onForkExample: (example: BundledExample) => void;
}

export function SingleScriptImportView({
  report,
  activeScript,
  activeSceneTitle,
  customScripts,
  examples,
  draftTitle,
  onDraftTitleChange,
  importMode,
  onImportModeChange,
  updateTitleOnReplace,
  onUpdateTitleOnReplaceChange,
  onChooseAnotherFile,
  onOpenExistingCustomScript,
  onForkExample,
}: SingleScriptImportViewProps) {
  const labels = UI_LABELS.importModal;
  const {validation} = report;
  const [showDiagnostics, setShowDiagnostics] = useState(validation.errorCount > 0);
  const [showPreview, setShowPreview] = useState(true);

  const canReplaceCurrent = activeScript.kind === 'custom';
  const customDuplicates = report.contentDuplicates.filter((d) => d.kind === 'custom');
  const firstCustomDup = customDuplicates[0];
  const firstCustomRecord = firstCustomDup
    ? customScripts.find((s) => s.id === firstCustomDup.id)
    : undefined;
  const firstExampleDup = report.contentDuplicates.find((d) => d.kind === 'example');
  const firstExampleRecord = firstExampleDup
    ? examples.find((e) => e.id === firstExampleDup.id)
    : undefined;

  const trimmedTitleLower = draftTitle.trim().toLowerCase();
  const liveHasTitleCollision =
    trimmedTitleLower.length > 0 &&
    customScripts.some((s) => s.title.trim().toLowerCase() === trimmedTitleLower);

  const topologyLabel =
    UI_LABELS.graph.topologyLabels[validation.sceneTopology] ?? validation.sceneTopology;

  const duplicateTitlesSummary = report.contentDuplicates
    .map((d) => `"${d.title}"`)
    .slice(0, 3)
    .join(', ');

  return (
    <div className="space-y-4">
      {/* File Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-main bg-surface-subtle px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-sky-500 shrink-0" />
          <span className="text-xs font-semibold text-text-main truncate max-w-[260px]">
            {report.filename}
          </span>
          <span className="rounded-md border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
            {labels.sourceFormatLabels[report.sourceFormat]}
          </span>
          <span className="rounded-md border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
            #{validation.snapshotHash}
          </span>
        </div>

        <button
          type="button"
          onClick={onChooseAnotherFile}
          className={UI_TOKENS.button.actionPill}
        >
          {labels.chooseAnotherFileButton}
        </button>
      </div>

      {/* Duplicate Content Alert */}
      {report.contentDuplicates.length > 0 && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <CopyCheck className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text-main">
                {labels.duplicateContentTitle}
              </div>
              <p className="mt-0.5 text-[11px] text-text-muted leading-snug">
                {labels.duplicateContentDesc(
                  duplicateTitlesSummary,
                  customDuplicates.length === 0
                )}
              </p>
            </div>
          </div>

          {firstCustomRecord ? (
            <button
              type="button"
              onClick={() => onOpenExistingCustomScript(firstCustomRecord)}
              className={UI_TOKENS.button.actionPill}
            >
              <ExternalLink className="h-3 w-3 text-amber-500" />
              <span>{labels.openExistingButton}</span>
            </button>
          ) : (
            firstExampleRecord && (
              <button
                type="button"
                onClick={() => onForkExample(firstExampleRecord)}
                className={UI_TOKENS.button.actionPill}
              >
                <ExternalLink className="h-3 w-3 text-amber-500" />
                <span>{labels.forkExampleButton}</span>
              </button>
            )
          )}
        </div>
      )}

      {/* v0.4.0 Fit & Structure Scorecard */}
      <div className="rounded-xl border border-border-main bg-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border-subtle bg-surface-subtle">
          <div className="flex items-center gap-2">
            {validation.fitStatus === 'ready' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            )}
            <span
              className={`text-xs font-semibold ${
                validation.fitStatus === 'ready'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {labels.fitBadges[validation.fitStatus]}
            </span>
          </div>

          <span className="font-mono text-[10px] text-text-faint">
            {topologyLabel}
          </span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-3.5 py-2.5 text-center border-b border-border-subtle">
          <MetricCell label={labels.metricsStaging} value={`${validation.stagingBlockCount} MB`} />
          <MetricCell label={labels.metricsMacroStates} value={`${validation.macroStateCount} S`} />
          <MetricCell label={labels.metricsSubStates} value={String(validation.subStateCount)} />
          <MetricCell label={labels.metricsCast} value={String(validation.castCount)} />
          <MetricCell label={labels.metricsTokens} value={String(validation.tokenCount)} />
          <MetricCell
            label={labels.metricsTopology}
            value={validation.sceneTopology === 'empty' ? '—' : topologyLabel.split(' ')[0]}
          />
        </div>

        {/* Compatibility Notes */}
        {validation.compatibilityNotes.length > 0 && (
          <div className="px-3.5 py-2.5 space-y-1.5 border-b border-border-subtle bg-amber-500/5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {labels.compatibilityHeading}
            </div>
            <ul className="space-y-1">
              {validation.compatibilityNotes.map((note) => (
                <li
                  key={note.kind}
                  className="flex items-start gap-2 text-[11px] text-text-body leading-snug"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{note.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Deterministic Script Supervisor Diagnostics */}
        {validation.diagnostics.length > 0 && (
          <div className="px-3.5 py-2">
            <button
              type="button"
              onClick={() => setShowDiagnostics((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-text-body hover:text-text-main cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                {showDiagnostics ? (
                  <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
                )}
                <span>
                  {labels.diagnosticsHeading(validation.errorCount, validation.warningCount)}
                </span>
              </span>
            </button>

            {showDiagnostics && (
              <ul className="mt-2 space-y-1.5 max-h-36 overflow-y-auto auteur-pane-scroll pr-1">
                {validation.diagnostics.map((diag, idx) => (
                  <li
                    key={`${diag.ruleId ?? 'lint'}-${idx}`}
                    className="rounded-lg border border-border-subtle bg-surface-subtle px-2.5 py-1.5 text-[11px]"
                  >
                    <div className="flex items-center gap-1.5 font-medium text-text-main">
                      {diag.severity === 'error' ? (
                        <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                      )}
                      <span>{diag.message}</span>
                    </div>
                    {diag.repairHint && (
                      <div className="mt-0.5 pl-4.5 text-[10px] text-text-muted">
                        {UI_LABELS.diagnostics.repairPrefix}
                        {diag.repairHint}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Destination Mode Selector: Import as New vs Replace Current */}
      <div className="space-y-2">
        <div className={UI_TOKENS.input.labelMini}>{labels.importModeHeading}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onImportModeChange('new')}
            className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
              importMode === 'new'
                ? 'border-sky-500/60 bg-sky-500/10'
                : 'border-border-main bg-surface hover:bg-surface-subtle'
            }`}
          >
            <FilePlus2
              className={`h-4 w-4 shrink-0 mt-0.5 ${
                importMode === 'new' ? 'text-sky-500' : 'text-text-muted'
              }`}
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text-main">{labels.modeNewTitle}</div>
              <div className="mt-0.5 text-[11px] text-text-muted leading-snug">
                {labels.modeNewDesc}
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={!canReplaceCurrent}
            onClick={() => {
              if (canReplaceCurrent) onImportModeChange('replace');
            }}
            className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
              !canReplaceCurrent
                ? 'border-border-subtle bg-surface-subtle opacity-55 cursor-not-allowed'
                : importMode === 'replace'
                  ? 'border-sky-500/60 bg-sky-500/10 cursor-pointer'
                  : 'border-border-main bg-surface hover:bg-surface-subtle cursor-pointer'
            }`}
          >
            <RefreshCw
              className={`h-4 w-4 shrink-0 mt-0.5 ${
                importMode === 'replace' ? 'text-sky-500' : 'text-text-muted'
              }`}
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text-main">{labels.modeReplaceTitle}</div>
              <div className="mt-0.5 text-[11px] text-text-muted leading-snug">
                {canReplaceCurrent
                  ? labels.modeReplaceDesc(activeSceneTitle)
                  : labels.modeReplaceDisabledDesc}
              </div>
            </div>
          </button>
        </div>

        {importMode === 'new' ? (
          <div className="pt-1 space-y-1.5">
            <label className={UI_TOKENS.input.labelMini} htmlFor="import-scene-title">
              {labels.sceneTitleLabel}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="import-scene-title"
                type="text"
                data-native-undo="true"
                aria-label={labels.sceneTitleAria}
                placeholder={labels.sceneTitlePlaceholder}
                value={draftTitle}
                onChange={(e) => onDraftTitleChange(e.target.value)}
                className={UI_TOKENS.input.field}
              />
            </div>
            {liveHasTitleCollision && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-600 dark:text-amber-400">
                <span>{labels.titleCollisionNote(report.disambiguatedTitle)}</span>
                {draftTitle.trim() !== report.disambiguatedTitle && (
                  <button
                    type="button"
                    onClick={() => onDraftTitleChange(report.disambiguatedTitle)}
                    className="underline font-medium hover:opacity-80 cursor-pointer"
                  >
                    {labels.useSuggestedTitleButton(report.disambiguatedTitle)}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <label className="flex items-center gap-2 pt-1 text-xs text-text-body cursor-pointer select-none">
            <input
              type="checkbox"
              checked={updateTitleOnReplace}
              onChange={(e) => onUpdateTitleOnReplaceChange(e.target.checked)}
              className="rounded border-border-main accent-sky-500"
            />
            <span>{labels.updateTitleOnReplaceLabel}</span>
          </label>
        )}
      </div>

      {/* Collapsible Script Preview */}
      <div className="rounded-xl border border-border-main bg-surface overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-border-subtle bg-surface-subtle">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-main">
            <FileCode2 className="h-3.5 w-3.5 text-text-muted" />
            <span>{labels.previewHeading}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview((prev) => !prev)}
            className="text-[11px] font-medium text-text-muted hover:text-text-main cursor-pointer"
          >
            {showPreview ? labels.previewHide : labels.previewShow}
          </button>
        </div>

        {showPreview && (
          <pre className="max-h-44 overflow-y-auto auteur-pane-scroll bg-app/50 p-3 font-mono text-[11px] leading-relaxed text-text-body whitespace-pre-wrap break-words">
            {validation.canonicalText || labels.previewEmpty}
          </pre>
        )}
      </div>
    </div>
  );
}

function MetricCell({label, value}: {label: string; value: string}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-surface-subtle/60 px-1.5 py-1">
      <span className="font-mono text-xs font-semibold text-text-main truncate max-w-full">
        {value}
      </span>
      <span className="text-[9.5px] uppercase tracking-wider text-text-faint">{label}</span>
    </div>
  );
}

export interface LibraryBackupImportViewProps {
  report: LibraryBackupImportPreflight;
  selectedIds: ReadonlySet<string>;
  onToggleId: (id: string) => void;
  onSelectDefaults: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onChooseAnotherFile: () => void;
}

export function LibraryBackupImportView({
  report,
  selectedIds,
  onToggleId,
  onSelectDefaults,
  onSelectAll,
  onClearSelection,
  onChooseAnotherFile,
}: LibraryBackupImportViewProps) {
  const labels = UI_LABELS.importModal;
  const exportedDate = report.backup.exportedAt
    ? report.backup.exportedAt.slice(0, 10)
    : '';

  return (
    <div className="space-y-3.5">
      {/* Backup Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-main bg-surface-subtle px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <FolderArchive className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-xs font-semibold text-text-main truncate max-w-[260px]">
            {report.filename}
          </span>
          {exportedDate && (
            <span className="rounded-md border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
              {labels.backupExportedLabel(exportedDate)}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onChooseAnotherFile}
          className={UI_TOKENS.button.actionPill}
        >
          {labels.chooseAnotherFileButton}
        </button>
      </div>

      {/* Duplicate Content Summary Banner */}
      {report.duplicateContentCount > 0 && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 flex items-start gap-2.5">
          <CopyCheck className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-text-body leading-snug">
            {labels.backupDuplicateBanner(report.duplicateContentCount)}
          </p>
        </div>
      )}

      {/* Counts + Quick Selection Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
            {labels.backupCountNew(report.newCount)}
          </span>
          <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-600 dark:text-sky-400">
            {labels.backupCountModified(report.modifiedCount)}
          </span>
          <span className="rounded-md border border-border-main bg-surface-subtle px-2 py-0.5 text-text-muted">
            {labels.backupCountDuplicate(report.duplicateContentCount)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={onSelectDefaults}
            className="rounded-md border border-border-main bg-surface px-2 py-1 font-medium text-text-body hover:bg-surface-subtle cursor-pointer"
          >
            {labels.backupSelectDefaults}
          </button>
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-md border border-border-main bg-surface px-2 py-1 font-medium text-text-body hover:bg-surface-subtle cursor-pointer"
          >
            {labels.backupSelectAll}
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-md border border-border-main bg-surface px-2 py-1 font-medium text-text-muted hover:bg-surface-subtle cursor-pointer"
          >
            {labels.backupClearSelection}
          </button>
        </div>
      </div>

      {/* Checklist */}
      <div className="rounded-xl border border-border-main bg-surface divide-y divide-border-subtle max-h-72 overflow-y-auto auteur-pane-scroll">
        {report.items.map((item) => (
          <BackupScriptRow
            key={item.record.id}
            item={item}
            checked={selectedIds.has(item.record.id)}
            onToggle={() => onToggleId(item.record.id)}
          />
        ))}
      </div>
    </div>
  );
}

function BackupScriptRow({
  item,
  checked,
  onToggle,
}: {
  item: AnalyzedBackupScriptItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const labels = UI_LABELS.importModal;
  const {record, validation, status, matchedExisting, disambiguatedTitle} = item;

  const statusBadgeClass =
    status === 'new'
      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : status === 'modified_conflict'
        ? 'border-sky-500/35 bg-sky-500/10 text-sky-600 dark:text-sky-400'
        : 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400';

  return (
    <label className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-surface-subtle/70 transition-colors cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 rounded border-border-main accent-sky-500 cursor-pointer"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-serif text-xs font-bold text-text-main truncate">
            {record.title}
          </span>
          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass}`}>
            {labels.backupStatusBadges[status]}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-faint">
          <span>#{validation.snapshotHash}</span>
          <span>·</span>
          <span>
            {validation.macroStateCount} {UI_LABELS.topBar.beatUnit(validation.macroStateCount)}
          </span>
          <span>·</span>
          <span
            className={
              validation.fitStatus === 'ready'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }
          >
            {validation.errorCount === 0 && validation.warningCount === 0
              ? labels.backupLintClean
              : labels.backupLintIssues(validation.errorCount, validation.warningCount)}
          </span>
          {matchedExisting && status === 'duplicate_content' && (
            <>
              <span>·</span>
              <span className="font-sans text-amber-600 dark:text-amber-400">
                {labels.backupMatchedExisting(matchedExisting.title)}
              </span>
            </>
          )}
          {status === 'modified_conflict' && (
            <>
              <span>·</span>
              <span className="font-sans text-sky-600 dark:text-sky-400">
                {labels.backupForkTitleHint(disambiguatedTitle)}
              </span>
            </>
          )}
        </div>
      </div>
    </label>
  );
}
