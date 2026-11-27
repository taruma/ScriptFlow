import {useEffect, useMemo, useState} from 'react';
import {Check, Download, Pin, Sparkles, Trash2, X} from 'lucide-react';
import {
  buildAiSessionsBackupExport,
  estimateCleanupImpact,
  formatBackupByteSize,
  selectSessionsForCleanup,
  writeLastAiHistoryBackupMeta,
  type AiHistoryLastBackupMeta,
  type AiSessionCleanupAction,
  type AiSessionCleanupAgePreset,
  type AiSessionCleanupScriptFilter,
  type AiSessionRecord,
  type AiSessionsStorageStats,
  type ResolvedAiSessionSummary,
} from '../../../ui/aiSessions.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {triggerTextFileDownload} from '../../../ui/scriptFileIO.ts';
import {formatRelativeUpdatedTime} from '../../../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import {ConfirmDialog, type ConfirmDialogRequest} from '../../ConfirmDialog.tsx';

export interface AiSessionCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  resolvedSessions: readonly ResolvedAiSessionSummary[];
  storageStats: AiSessionsStorageStats;
  onBackupRecorded: (meta: AiHistoryLastBackupMeta) => void;
  onStripTraces: (
    sessions: readonly AiSessionRecord[],
    estimatedFreedBytes: number
  ) => Promise<void>;
  onDeleteSessions: (ids: readonly string[], estimatedFreedBytes: number) => Promise<void>;
}

export function AiSessionCleanupModal(props: AiSessionCleanupModalProps) {
  if (!props.isOpen) return null;
  return <AiSessionCleanupModalContent {...props} />;
}

function AiSessionCleanupModalContent({
  onClose,
  resolvedSessions,
  storageStats,
  onBackupRecorded,
  onStripTraces,
  onDeleteSessions,
}: Omit<AiSessionCleanupModalProps, 'isOpen'>) {
  const historyLabels = UI_LABELS.ai.history;
  const labels = historyLabels.cleanup;

  const [action, setAction] = useState<AiSessionCleanupAction>('strip_traces');
  const [agePreset, setAgePreset] = useState<AiSessionCleanupAgePreset>('30d');
  const [scriptFilter, setScriptFilter] = useState<AiSessionCleanupScriptFilter>('all');
  const [onlyWithTraces, setOnlyWithTraces] = useState(true);
  const [includePinned, setIncludePinned] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirmRequest && !isSubmitting) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, {capture: true});
    return () => document.removeEventListener('keydown', handleKeyDown, {capture: true});
  }, [onClose, confirmRequest, isSubmitting]);

  // Build script filter options from currently saved sessions
  const scriptOptions = useMemo(() => {
    const byKey = new Map<string, {key: string; title: string; count: number; isDeleted: boolean}>();
    let orphanedCount = 0;
    for (const item of resolvedSessions) {
      const key = item.session.scriptSessionKey;
      const isDeleted = item.scriptStatus === 'deleted';
      if (isDeleted) orphanedCount += 1;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byKey.set(key, {
          key,
          title: item.resolvedScriptTitle,
          count: 1,
          isDeleted,
        });
      }
    }
    return {
      orphanedCount,
      scripts: Array.from(byKey.values()).sort((a, b) => a.title.localeCompare(b.title)),
    };
  }, [resolvedSessions]);

  const effectiveOnlyWithTraces = action === 'strip_traces' ? true : onlyWithTraces;

  const matched = useMemo(
    () =>
      selectSessionsForCleanup(resolvedSessions, {
        agePreset,
        scriptFilter,
        onlyWithTraces: effectiveOnlyWithTraces,
        includePinned,
      }),
    [resolvedSessions, agePreset, scriptFilter, effectiveOnlyWithTraces, includePinned]
  );

  const impact = useMemo(
    () => estimateCleanupImpact(matched, action, storageStats),
    [matched, action, storageStats]
  );

  useEffect(() => {
    setBackupDone(false);
  }, [action, agePreset, scriptFilter, effectiveOnlyWithTraces, includePinned]);

  const handleBackupMatching = () => {
    if (matched.length === 0) return;
    const now = new Date();
    const built = buildAiSessionsBackupExport(
      matched.map((item) => item.session),
      {includeTraces: true, now}
    );
    triggerTextFileDownload(built.filename, built.content, built.mimeType);
    const meta: AiHistoryLastBackupMeta = {
      exportedAt: now.getTime(),
      sessionCount: built.sessionCount,
      scope: 'cleanup_pre_backup',
      includesTraces: true,
    };
    writeLastAiHistoryBackupMeta(meta);
    onBackupRecorded(meta);
    setBackupDone(true);
  };

  const executeCleanup = async () => {
    if (impact.actionableCount === 0 || isSubmitting) return;
    if (action === 'strip_traces') {
      const targets = matched
        .filter((item) => storageStats.byId[item.session.id]?.hasTraces)
        .map((item) => item.session);
      if (targets.length === 0) return;
      setIsSubmitting(true);
      try {
        await onStripTraces(targets, impact.estimatedBytesFreed);
        onClose();
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const ids = matched.map((item) => item.session.id);
    setConfirmRequest({
      title: labels.deleteConfirmTitle,
      description: labels.deleteConfirmMessage(
        ids.length,
        formatBackupByteSize(impact.estimatedBytesFreed)
      ),
      confirmLabel: labels.deleteConfirmLabel,
      tone: 'danger',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await onDeleteSessions(ids, impact.estimatedBytesFreed);
          onClose();
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const ageOptions: Array<{id: AiSessionCleanupAgePreset; label: string}> = [
    {id: 'any', label: labels.ageAny},
    {id: '7d', label: labels.age7d},
    {id: '30d', label: labels.age30d},
    {id: '90d', label: labels.age90d},
  ];

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.dialogAria}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !confirmRequest && !isSubmitting) {
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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-amber-500"
              >
                <Sparkles className="h-3.5 w-3.5" />
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

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll p-4 space-y-4">
            {/* Action Mode Selector */}
            <div className="space-y-2">
              <div className={UI_TOKENS.input.label}>{labels.actionHeading}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAction('strip_traces')}
                  className={`text-left rounded-xl border p-3 transition-colors cursor-pointer space-y-1 ${
                    action === 'strip_traces'
                      ? 'border-btn-primary-bg bg-btn-primary-bg/10'
                      : 'border-border-main bg-surface-subtle/50 hover:bg-surface-subtle'
                  }`}
                >
                  <div className="text-xs font-semibold text-text-main">
                    {labels.actionStripLabel}
                  </div>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    {labels.actionStripDesc}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAction('delete')}
                  className={`text-left rounded-xl border p-3 transition-colors cursor-pointer space-y-1 ${
                    action === 'delete'
                      ? 'border-red-500/60 bg-red-500/10'
                      : 'border-border-main bg-surface-subtle/50 hover:bg-surface-subtle'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-text-main">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    <span>{labels.actionDeleteLabel}</span>
                  </div>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    {labels.actionDeleteDesc}
                  </p>
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="space-y-2.5 rounded-xl border border-border-main bg-surface-subtle/40 p-3">
              <div className={UI_TOKENS.input.labelMini}>{labels.filtersHeading}</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-medium text-text-body">
                    {labels.ageLabel}
                  </span>
                  <div className="grid grid-cols-2 gap-1">
                    {ageOptions.map((opt) => {
                      const active = agePreset === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAgePreset(opt.id)}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                            active
                              ? 'border-btn-primary-bg bg-surface text-text-main font-semibold shadow-2xs'
                              : 'border-border-subtle bg-surface/50 text-text-muted hover:text-text-main'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="cleanup-script-filter"
                    className="block text-[11px] font-medium text-text-body"
                  >
                    {labels.scriptLabel}
                  </label>
                  <select
                    id="cleanup-script-filter"
                    value={scriptFilter}
                    onChange={(e) => setScriptFilter(e.target.value)}
                    className={UI_TOKENS.input.field}
                  >
                    <option value="all">
                      {labels.scriptAll} ({resolvedSessions.length})
                    </option>
                    <option value="orphaned">
                      {labels.scriptOrphaned} ({scriptOptions.orphanedCount})
                    </option>
                    {scriptOptions.scripts.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.title}
                        {s.isDeleted ? ` (${historyLabels.scriptDeletedBadge})` : ''} ({s.count})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
                {action === 'delete' && (
                  <label className="inline-flex items-center gap-2 text-xs text-text-body cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyWithTraces}
                      onChange={(e) => setOnlyWithTraces(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border-main accent-[var(--btn-primary-bg)] cursor-pointer"
                    />
                    <span>{labels.onlyWithTracesLabel}</span>
                  </label>
                )}

                <label className="inline-flex items-center gap-2 text-xs text-text-body cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePinned}
                    onChange={(e) => setIncludePinned(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border-main accent-[var(--btn-primary-bg)] cursor-pointer"
                  />
                  <span>{labels.includePinnedLabel}</span>
                </label>
              </div>
            </div>

            {/* Matched Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-text-main">
                  {labels.previewHeading(
                    impact.matchedCount,
                    impact.actionableCount,
                    formatBackupByteSize(impact.estimatedBytesFreed)
                  )}
                </span>
              </div>

              {matched.length === 0 ? (
                <div className="rounded-xl border border-border-subtle bg-surface-subtle/40 p-4 text-center text-xs text-text-muted">
                  {action === 'strip_traces' ? labels.noTracesToStripHint : labels.emptyMatchHint}
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto auteur-pane-scroll rounded-xl border border-border-main bg-surface-subtle/30 p-1.5 space-y-1">
                  {matched.map((item) => {
                    const entry = storageStats.byId[item.session.id];
                    const bytes =
                      action === 'strip_traces'
                        ? (entry?.traceBytes ?? 0)
                        : (entry?.totalBytes ?? 0);
                    return (
                      <div
                        key={item.session.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface px-2.5 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {item.session.pinned && (
                              <Pin className="h-3 w-3 text-[var(--phase-continuity-text)] shrink-0" />
                            )}
                            <span className="text-xs font-medium text-text-main truncate">
                              {item.session.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                            <span className="truncate max-w-[190px]">
                              {item.scriptStatus === 'current'
                                ? historyLabels.thisScriptBadge
                                : item.scriptStatus === 'deleted'
                                  ? `${item.resolvedScriptTitle} · ${historyLabels.scriptDeletedBadge}`
                                  : item.resolvedScriptTitle}
                            </span>
                            <span className="text-text-faint">·</span>
                            <span>{formatRelativeUpdatedTime(item.session.updatedAt)}</span>
                          </div>
                        </div>

                        <span className="font-mono text-[10.5px] text-text-muted tabular-nums shrink-0">
                          {formatBackupByteSize(bytes)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border-subtle bg-surface-subtle flex flex-wrap items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              disabled={matched.length === 0 || isSubmitting}
              onClick={handleBackupMatching}
              className={`${UI_TOKENS.button.actionPill} disabled:opacity-45 disabled:cursor-not-allowed`}
            >
              {backupDone ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Download className="h-3.5 w-3.5 text-emerald-500" />
              )}
              <span>{backupDone ? labels.backupFirstDoneButton : labels.backupFirstButton}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className={UI_TOKENS.button.secondary}
              >
                {labels.cancelButton}
              </button>
              <button
                type="button"
                disabled={impact.actionableCount === 0 || isSubmitting}
                onClick={() => void executeCleanup()}
                className={`${
                  action === 'delete' ? UI_TOKENS.button.danger : UI_TOKENS.button.primary
                } disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                {isSubmitting
                  ? labels.processingButton
                  : action === 'delete'
                    ? labels.confirmDeleteButton(impact.actionableCount)
                    : labels.confirmStripButton(impact.actionableCount)}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </>
  );
}
