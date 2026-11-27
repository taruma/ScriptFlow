import {useEffect, useMemo, useState} from 'react';
import {Check, Download, FolderArchive, Pin, Search, X} from 'lucide-react';
import {
  buildAiSessionsBackupExport,
  formatBackupByteSize,
  hasSessionTraces,
  selectSessionsForBackup,
  writeLastAiHistoryBackupMeta,
  type AiHistoryLastBackupMeta,
  type AiSessionBackupScope,
  type ResolvedAiSessionSummary,
} from '../../../ui/aiSessions.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {triggerTextFileDownload} from '../../../ui/scriptFileIO.ts';
import {formatRelativeUpdatedTime} from '../../../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface AiSessionBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  resolvedSessions: readonly ResolvedAiSessionSummary[];
  initialSelectedIds?: ReadonlySet<string>;
  onBackupDownloaded?: (meta: AiHistoryLastBackupMeta) => void;
}

export function AiSessionBackupModal(props: AiSessionBackupModalProps) {
  if (!props.isOpen) return null;
  return <AiSessionBackupModalContent {...props} />;
}

function AiSessionBackupModalContent({
  onClose,
  resolvedSessions,
  initialSelectedIds,
  onBackupDownloaded,
}: Omit<AiSessionBackupModalProps, 'isOpen'>) {
  const historyLabels = UI_LABELS.ai.history;
  const labels = historyLabels.backup;

  const [scope, setScope] = useState<AiSessionBackupScope>('all');
  const [includeTraces, setIncludeTraces] = useState(true);
  const [pickQuery, setPickQuery] = useState('');
  const [pickedIds, setPickedIds] = useState<Set<string>>(() => {
    if (initialSelectedIds && initialSelectedIds.size > 0) {
      return new Set(initialSelectedIds);
    }
    return new Set(resolvedSessions.map((item) => item.session.id));
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, {capture: true});
    return () => document.removeEventListener('keydown', handleKeyDown, {capture: true});
  }, [onClose]);

  const scopeCounts = useMemo(() => {
    let currentScript = 0;
    let pinned = 0;
    for (const item of resolvedSessions) {
      if (item.scriptStatus === 'current') currentScript += 1;
      if (item.session.pinned) pinned += 1;
    }
    return {
      all: resolvedSessions.length,
      current_script: currentScript,
      pinned,
      selected: pickedIds.size,
    };
  }, [resolvedSessions, pickedIds]);

  const filteredPickList = useMemo(() => {
    const needle = pickQuery.trim().toLowerCase();
    if (!needle) return resolvedSessions;
    return resolvedSessions.filter(
      (item) =>
        item.session.title.toLowerCase().includes(needle) ||
        item.resolvedScriptTitle.toLowerCase().includes(needle)
    );
  }, [resolvedSessions, pickQuery]);

  const selectedSessions = useMemo(
    () => selectSessionsForBackup(resolvedSessions, scope, pickedIds),
    [resolvedSessions, scope, pickedIds]
  );

  const builtBackup = useMemo(
    () =>
      selectedSessions.length > 0
        ? buildAiSessionsBackupExport(selectedSessions, {includeTraces})
        : null,
    [selectedSessions, includeTraces]
  );

  const togglePickedId = (id: string) => {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownload = () => {
    if (!builtBackup) return;
    triggerTextFileDownload(builtBackup.filename, builtBackup.content, builtBackup.mimeType);
    const meta: AiHistoryLastBackupMeta = {
      exportedAt: Date.now(),
      sessionCount: builtBackup.sessionCount,
      scope,
      includesTraces: includeTraces,
    };
    writeLastAiHistoryBackupMeta(meta);
    onBackupDownloaded?.(meta);
    onClose();
  };

  const scopeOptions: Array<{id: AiSessionBackupScope; label: string; count: number}> = [
    {id: 'all', label: labels.scopeAll, count: scopeCounts.all},
    {id: 'current_script', label: labels.scopeCurrentScript, count: scopeCounts.current_script},
    {id: 'pinned', label: labels.scopePinned, count: scopeCounts.pinned},
    {id: 'selected', label: labels.scopeSelected, count: scopeCounts.selected},
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlay}
    >
      <div className="bg-surface w-full max-w-xl max-h-[84dvh] rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col">
        {/* Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-emerald-500"
            >
              <FolderArchive className="h-3.5 w-3.5" />
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
            onClick={onClose}
            aria-label={labels.closeAria}
            className={UI_TOKENS.button.iconClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll p-4 space-y-4">
          {/* Scope Selector */}
          <div className="space-y-2">
            <div className={UI_TOKENS.input.label}>{labels.scopeHeading}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {scopeOptions.map((option) => {
                const active = scope === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setScope(option.id)}
                    className={`flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-btn-primary-bg bg-btn-primary-bg/10 text-text-main font-semibold'
                        : 'border-border-main bg-surface-subtle/60 text-text-body hover:bg-surface-subtle'
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    <span className="font-mono text-[10px] text-text-faint tabular-nums shrink-0">
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Specific Session Picker */}
          {scope === 'selected' && (
            <div className="rounded-xl border border-border-main bg-surface-subtle/40 overflow-hidden">
              <div className="p-2 border-b border-border-subtle flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-faint" />
                  <input
                    type="text"
                    data-native-undo="true"
                    value={pickQuery}
                    onChange={(e) => setPickQuery(e.target.value)}
                    placeholder={labels.pickSearchPlaceholder}
                    aria-label={labels.pickSearchAria}
                    className={`${UI_TOKENS.input.search} py-1.5`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPickedIds(new Set(resolvedSessions.map((item) => item.session.id)))
                  }
                  className={UI_TOKENS.ai.pillButton}
                >
                  {labels.selectAllButton}
                </button>
                <button
                  type="button"
                  onClick={() => setPickedIds(new Set())}
                  className={UI_TOKENS.ai.pillButton}
                >
                  {labels.clearSelectionButton}
                </button>
              </div>

              <div className="max-h-52 overflow-y-auto auteur-pane-scroll p-1.5 space-y-1">
                {filteredPickList.length === 0 ? (
                  <p className="p-3 text-center text-xs text-text-muted">{labels.emptyScopeHint}</p>
                ) : (
                  filteredPickList.map((item) => {
                    const checked = pickedIds.has(item.session.id);
                    const hasTraces = hasSessionTraces(item.session);
                    return (
                      <label
                        key={item.session.id}
                        className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ${
                          checked
                            ? 'border-border-main bg-surface'
                            : 'border-transparent hover:bg-surface/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePickedId(item.session.id)}
                          className="h-3.5 w-3.5 rounded border-border-main accent-[var(--btn-primary-bg)] shrink-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {item.session.pinned && (
                              <Pin className="h-3 w-3 text-[var(--phase-continuity-text)] shrink-0" />
                            )}
                            <span className="text-xs font-medium text-text-main truncate">
                              {item.session.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                            <span className="truncate max-w-[180px]">
                              {item.scriptStatus === 'current'
                                ? historyLabels.thisScriptBadge
                                : item.resolvedScriptTitle}
                            </span>
                            <span className="text-text-faint">·</span>
                            <span className="tabular-nums">
                              {historyLabels.turnsLabel(item.session.turnCount)}
                            </span>
                            <span className="text-text-faint">·</span>
                            <span>{formatRelativeUpdatedTime(item.session.updatedAt)}</span>
                          </div>
                        </div>
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[9.5px] shrink-0 ${
                            hasTraces
                              ? 'border-border-main bg-surface-subtle text-text-muted'
                              : 'border-border-subtle bg-app text-text-faint'
                          }`}
                        >
                          {hasTraces ? labels.traceBadge : labels.noTraceBadge}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {scope !== 'selected' && selectedSessions.length === 0 && (
            <div className="rounded-xl border border-border-subtle bg-surface-subtle/50 p-4 text-center text-xs text-text-muted">
              {labels.emptyScopeHint}
            </div>
          )}

          {/* Include API Traces Toggle */}
          <label className="flex items-start gap-3 rounded-xl border border-border-main bg-surface-subtle/50 p-3 cursor-pointer hover:bg-surface-subtle transition-colors">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                includeTraces
                  ? 'border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text'
                  : 'border-border-main bg-surface'
              }`}
            >
              <input
                type="checkbox"
                checked={includeTraces}
                onChange={(e) => setIncludeTraces(e.target.checked)}
                className="sr-only"
              />
              {includeTraces && <Check className="h-3 w-3" />}
            </span>
            <span className="min-w-0 space-y-0.5">
              <span className="block text-xs font-semibold text-text-main">
                {labels.includeTracesLabel}
              </span>
              <span className="block text-[11px] text-text-muted leading-relaxed">
                {labels.includeTracesDesc}
              </span>
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-subtle bg-surface-subtle flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-text-muted flex items-center gap-2">
            <span className="font-medium text-text-body">
              {labels.summarySelected(selectedSessions.length)}
            </span>
            {builtBackup && (
              <>
                <span className="text-text-faint">·</span>
                <span className="font-mono tabular-nums">
                  {labels.summaryEstimatedSize(formatBackupByteSize(builtBackup.byteSize))}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={UI_TOKENS.button.secondary}>
              {labels.cancelButton}
            </button>
            <button
              type="button"
              disabled={!builtBackup}
              onClick={handleDownload}
              className={`${UI_TOKENS.button.primary} disabled:opacity-45 disabled:cursor-not-allowed`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                <span>{labels.downloadButton(selectedSessions.length)}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
