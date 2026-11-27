import {lazy, Suspense, useEffect, useMemo, useState} from 'react';
import {
  Clock,
  FolderArchive,
  HardDrive,
  History,
  Pin,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type {BundledExample} from '../data/examples/index.ts';
import {formatEstimatedUsd} from '../ui/aiPricing.ts';
import {useAiSettings} from '../ui/aiSettings.ts';
import {
  computeAiSessionsStorageStats,
  countSessionsUpdatedSinceBackup,
  filterAiSessions,
  formatBackupByteSize,
  readLastAiHistoryBackupMeta,
  resolveSessionScriptStatus,
  sortAiSessions,
  stripTracesFromSession,
  type AiHistoryLastBackupMeta,
  type AiSessionFilterTab,
  type AiSessionRecord,
  type ResolvedAiSessionSummary,
} from '../ui/aiSessions.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {scriptLibraryDb, type ScriptRecord} from '../ui/scriptLibraryDb.ts';
import {formatRelativeUpdatedTime} from '../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import type {AiInspectableTrace} from './AiTraceModal.tsx';
import {ConfirmDialog, type ConfirmDialogRequest} from './ConfirmDialog.tsx';
import {AiSessionBackupModal} from './ai/history/AiSessionBackupModal.tsx';
import {AiSessionCleanupModal} from './ai/history/AiSessionCleanupModal.tsx';
import {AiSessionImportModal} from './ai/history/AiSessionImportModal.tsx';
import {AiSessionPreviewPane} from './ai/history/AiSessionPreviewPane.tsx';

const AiTraceModal = lazy(() =>
  import('./AiTraceModal.tsx').then((mod) => ({default: mod.AiTraceModal}))
);

export interface AiSessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentScriptSessionKey: string;
  customScripts: readonly ScriptRecord[];
  examples: readonly BundledExample[];
  refreshNonce?: number;
  onLoadInSidebar: (session: AiSessionRecord, isCrossScript: boolean) => void;
  onSwitchScriptAndLoad: (
    target: {kind: 'custom'; record: ScriptRecord} | {kind: 'example'; example: BundledExample},
    session: AiSessionRecord
  ) => void;
  onSessionsChanged?: () => void;
}

export function AiSessionHistoryModal(props: AiSessionHistoryModalProps) {
  if (!props.isOpen) return null;
  return <AiSessionHistoryModalContent {...props} />;
}

function AiSessionHistoryModalContent({
  onClose,
  currentScriptSessionKey,
  customScripts,
  examples,
  refreshNonce = 0,
  onLoadInSidebar,
  onSwitchScriptAndLoad,
  onSessionsChanged,
}: Omit<AiSessionHistoryModalProps, 'isOpen'>) {
  const labels = UI_LABELS.ai.history;
  const {settings} = useAiSettings();

  const [sessions, setSessions] = useState<AiSessionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<AiSessionFilterTab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectedTrace, setInspectedTrace] = useState<AiInspectableTrace | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [lastBackupMeta, setLastBackupMeta] = useState<AiHistoryLastBackupMeta | null>(() =>
    readLastAiHistoryBackupMeta()
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void scriptLibraryDb
      .listAiSessions()
      .then((list) => {
        if (!cancelled) {
          setSessions(list);
          setSelectedId((prev) => prev ?? list[0]?.id ?? null);
        }
      })
      .catch((error) => {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('[AiSessionHistoryModal] Failed to load AI sessions:', error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  const resolvedSessions = useMemo(
    () =>
      sortAiSessions(sessions).map((session) =>
        resolveSessionScriptStatus(session, currentScriptSessionKey, customScripts, examples)
      ),
    [sessions, currentScriptSessionKey, customScripts, examples]
  );

  const filteredSessions = useMemo(
    () => filterAiSessions(resolvedSessions, {query: searchQuery, filter: activeFilter}),
    [resolvedSessions, searchQuery, activeFilter]
  );

  useEffect(() => {
    if (filteredSessions.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && filteredSessions.some((item) => item.session.id === prev)
        ? prev
        : filteredSessions[0].session.id
    );
  }, [filteredSessions]);

  const selectedSummary = useMemo(
    () => filteredSessions.find((item) => item.session.id === selectedId) ?? null,
    [filteredSessions, selectedId]
  );

  const storageStats = useMemo(() => computeAiSessionsStorageStats(sessions), [sessions]);

  const updatedSinceBackupCount = useMemo(
    () => countSessionsUpdatedSinceBackup(sessions, lastBackupMeta),
    [sessions, lastBackupMeta]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !inspectedTrace &&
        !confirmRequest &&
        !isBackupOpen &&
        !isImportOpen &&
        !isCleanupOpen
      ) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () =>
      document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, inspectedTrace, confirmRequest, isBackupOpen, isImportOpen, isCleanupOpen]);

  useEffect(() => {
    if (!statusNotice) return;
    const timer = window.setTimeout(() => setStatusNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [statusNotice]);

  const handleConfirmImport = async (
    recordsToWrite: readonly AiSessionRecord[],
    stats: {addedCount: number; forkedCount: number}
  ) => {
    const saved = await scriptLibraryDb.bulkPutAiSessions(recordsToWrite);
    const updatedList = await scriptLibraryDb.listAiSessions();
    setSessions(updatedList);
    if (saved.length > 0) {
      setActiveFilter('all');
      setSearchQuery('');
      setSelectedId(saved[0].id);
    }
    setStatusNotice(labels.importSuccessToast(stats.addedCount, stats.forkedCount));
    onSessionsChanged?.();
  };

  const handleStripTraces = async (
    targets: readonly AiSessionRecord[],
    estimatedFreedBytes: number
  ) => {
    const stripped = targets.map((sess) => stripTracesFromSession(sess));
    await scriptLibraryDb.bulkPutAiSessions(stripped);
    const updatedList = await scriptLibraryDb.listAiSessions();
    setSessions(updatedList);
    setStatusNotice(
      labels.cleanupSuccessStrippedToast(stripped.length, formatBackupByteSize(estimatedFreedBytes))
    );
    onSessionsChanged?.();
  };

  const handleDeleteSessions = async (ids: readonly string[], estimatedFreedBytes: number) => {
    await scriptLibraryDb.bulkDeleteAiSessions(ids);
    const updatedList = await scriptLibraryDb.listAiSessions();
    setSessions(updatedList);
    setStatusNotice(
      labels.cleanupSuccessDeletedToast(ids.length, formatBackupByteSize(estimatedFreedBytes))
    );
    onSessionsChanged?.();
  };

  const handleRenameSession = async (id: string, nextTitle: string) => {
    try {
      const updated = await scriptLibraryDb.updateAiSessionMeta(id, {title: nextTitle});
      if (updated) {
        setSessions((prev) => prev.map((item) => (item.id === id ? updated : item)));
        onSessionsChanged?.();
      }
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[AiSessionHistoryModal] Failed to rename session:', error);
      }
    }
  };

  const handleTogglePin = async (id: string, nextPinned: boolean) => {
    try {
      const updated = await scriptLibraryDb.updateAiSessionMeta(id, {pinned: nextPinned});
      if (updated) {
        setSessions((prev) => prev.map((item) => (item.id === id ? updated : item)));
        onSessionsChanged?.();
      }
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[AiSessionHistoryModal] Failed to pin session:', error);
      }
    }
  };

  const handleRequestDelete = (summary: ResolvedAiSessionSummary) => {
    setConfirmRequest({
      title: labels.deleteConfirmTitle,
      description: labels.deleteConfirmMessage(summary.session.title),
      confirmLabel: labels.deleteConfirmLabel,
      tone: 'danger',
      onConfirm: async () => {
        try {
          await scriptLibraryDb.deleteAiSession(summary.session.id);
          setSessions((prev) => prev.filter((item) => item.id !== summary.session.id));
          onSessionsChanged?.();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('[AiSessionHistoryModal] Failed to delete session:', error);
          }
        }
      },
    });
  };

  const handleLoadInSidebar = (summary: ResolvedAiSessionSummary) => {
    const isCrossScript = summary.scriptStatus !== 'current';
    onLoadInSidebar(summary.session, isCrossScript);
  };

  const handleSwitchScriptAndLoad = (summary: ResolvedAiSessionSummary) => {
    if (summary.liveCustomScript) {
      onSwitchScriptAndLoad({kind: 'custom', record: summary.liveCustomScript}, summary.session);
    } else if (summary.liveExample) {
      onSwitchScriptAndLoad({kind: 'example', example: summary.liveExample}, summary.session);
    }
  };

  return (
    <>
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
        <div className="bg-surface w-full max-w-5xl h-[84dvh] rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col">
          {/* Header */}
          <div className={UI_TOKENS.modal.header}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-[var(--phase-continuity-text)]"
              >
                <History className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main">
                  {labels.title}
                </h2>
                <p className="text-[11px] text-text-muted truncate">{labels.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={sessions.length === 0 || isLoading}
                onClick={() => setIsCleanupOpen(true)}
                title={labels.cleanupButtonTitle}
                aria-label={labels.cleanupButtonAria}
                className={`${UI_TOKENS.button.actionPill} disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span className="hidden sm:inline">{labels.cleanupButton}</span>
              </button>
              <button
                type="button"
                disabled={sessions.length === 0 || isLoading}
                onClick={() => setIsBackupOpen(true)}
                title={labels.backupButtonTitle}
                aria-label={labels.backupButtonAria}
                className={`${UI_TOKENS.button.actionPill} disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                <FolderArchive className="h-3.5 w-3.5 text-emerald-500" />
                <span className="hidden sm:inline">{labels.backupButton}</span>
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setIsImportOpen(true)}
                title={labels.importButtonTitle}
                aria-label={labels.importButtonAria}
                className={`${UI_TOKENS.button.actionPill} disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                <Upload className="h-3.5 w-3.5 text-text-muted" />
                <span className="hidden sm:inline">{labels.importButton}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={labels.closeAria}
                className={UI_TOKENS.button.iconClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quiet Storage & Last Backup Indicator Strip */}
          <div className="px-4 py-1.5 border-b border-border-subtle bg-surface-subtle/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted shrink-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <HardDrive className="h-3 w-3 text-text-faint shrink-0" />
              <span className="font-medium text-text-body tabular-nums">
                {labels.storageSummary(
                  storageStats.sessionCount,
                  formatBackupByteSize(storageStats.totalBytes)
                )}
              </span>
              {storageStats.traceBytes > 0 && (
                <span className="rounded border border-border-subtle bg-surface px-1.5 py-0.25 font-mono text-[10px] text-text-muted tabular-nums">
                  {labels.storageTracesHint(formatBackupByteSize(storageStats.traceBytes))}
                </span>
              )}
            </div>

            <div
              title={
                lastBackupMeta
                  ? labels.lastBackupTooltip(
                      new Date(lastBackupMeta.exportedAt).toLocaleString(),
                      lastBackupMeta.sessionCount,
                      lastBackupMeta.includesTraces
                    )
                  : undefined
              }
              className="flex flex-wrap items-center gap-1.5"
            >
              <Clock className="h-3 w-3 text-text-faint shrink-0" />
              {lastBackupMeta ? (
                <>
                  <span>
                    {labels.lastBackupLabel(formatRelativeUpdatedTime(lastBackupMeta.exportedAt))}
                  </span>
                  {updatedSinceBackupCount > 0 && (
                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.25 text-[10px] font-medium text-amber-700 dark:text-amber-300 tabular-nums">
                      {labels.lastBackupUpdatedSince(updatedSinceBackupCount)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-text-faint">{labels.lastBackupNever}</span>
              )}
            </div>
          </div>

          {statusNotice && (
            <div className="px-4 py-2 border-b border-border-subtle bg-surface-subtle/80 text-xs text-text-main flex items-center justify-between gap-2 shrink-0">
              <span>{statusNotice}</span>
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                aria-label={labels.closeAria}
                className="text-text-faint hover:text-text-main cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Two-Pane Body */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* Left Pane: Search, Filters, Session Rows */}
            <div className="w-full md:w-[340px] max-h-[42%] md:max-h-none border-b md:border-b-0 md:border-r border-border-subtle flex flex-col min-h-0 bg-surface-subtle/40 shrink-0">
              <div className="p-3 space-y-2.5 border-b border-border-subtle shrink-0">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-faint" />
                  <input
                    type="text"
                    data-native-undo="true"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={labels.searchPlaceholder}
                    aria-label={labels.searchAria}
                    className={UI_TOKENS.input.search}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label={labels.clearSearchAria}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-faint hover:text-text-main cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div
                  role="tablist"
                  aria-label={labels.filterGroupAria}
                  className={UI_TOKENS.button.segmentedGroup}
                >
                  {(
                    [
                      {id: 'all', label: labels.filterAll},
                      {id: 'current_script', label: labels.filterCurrentScript},
                      {id: 'pinned', label: labels.filterPinned},
                    ] as const
                  ).map((tab) => {
                    const active = activeFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActiveFilter(tab.id)}
                        className={`flex-1 justify-center ${
                          active
                            ? UI_TOKENS.button.segmentedItemActive
                            : UI_TOKENS.button.segmentedItem
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll p-2 space-y-1">
                {isLoading ? (
                  <div className="p-4 text-center text-xs text-text-muted">Loading...</div>
                ) : filteredSessions.length === 0 ? (
                  <div className="p-5 text-center text-xs text-text-muted leading-relaxed">
                    {sessions.length === 0 ? labels.emptyList : labels.emptySearch}
                  </div>
                ) : (
                  filteredSessions.map((item) => {
                    const {session, scriptStatus, resolvedScriptTitle} = item;
                    const isSelected = session.id === selectedId;
                    const isDeleted = scriptStatus === 'deleted';
                    const isCurrent = scriptStatus === 'current';

                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedId(session.id)}
                        className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors cursor-pointer space-y-1 ${
                          isSelected
                            ? 'border-border-main bg-surface shadow-2xs'
                            : 'border-transparent hover:border-border-subtle hover:bg-surface/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-main">
                            {session.pinned && (
                              <Pin className="h-3 w-3 text-[var(--phase-continuity-text)] shrink-0" />
                            )}
                            <span className="truncate">{session.title}</span>
                          </span>
                          <span className="text-[10px] text-text-faint tabular-nums shrink-0">
                            {formatRelativeUpdatedTime(session.updatedAt)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[10px] text-text-muted">
                          <span
                            className={`rounded border px-1.5 py-0.25 truncate max-w-[190px] ${
                              isCurrent
                                ? 'auteur-phase-continuity'
                                : isDeleted
                                  ? 'border-border-subtle bg-surface-subtle text-text-faint italic'
                                  : 'border-border-subtle bg-surface-subtle text-text-muted'
                            }`}
                          >
                            {isCurrent
                              ? labels.thisScriptBadge
                              : isDeleted
                                ? `${resolvedScriptTitle} · ${labels.scriptDeletedBadge}`
                                : resolvedScriptTitle}
                          </span>

                          <span className="flex items-center gap-1.5 shrink-0 font-mono text-[9.5px] text-text-faint tabular-nums">
                            <span>{labels.turnsLabel(session.turnCount)}</span>
                            {session.estimatedCostUsd > 0 && (
                              <span>{formatEstimatedUsd(session.estimatedCostUsd)}</span>
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Pane: Preview & Actions */}
            <AiSessionPreviewPane
              summary={selectedSummary}
              showThinkingSummary={settings.showThinkingSummary}
              showEstimatedCost={settings.showEstimatedCost}
              onLoadInSidebar={handleLoadInSidebar}
              onSwitchScriptAndLoad={handleSwitchScriptAndLoad}
              onRenameSession={handleRenameSession}
              onTogglePinSession={handleTogglePin}
              onRequestDeleteSession={handleRequestDelete}
              onInspectTrace={setInspectedTrace}
            />
          </div>
        </div>
      </div>

      {inspectedTrace && (
        <Suspense fallback={null}>
          <AiTraceModal
            isOpen={true}
            trace={inspectedTrace}
            onClose={() => setInspectedTrace(null)}
          />
        </Suspense>
      )}

      <AiSessionBackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        resolvedSessions={resolvedSessions}
        initialSelectedIds={selectedId ? new Set([selectedId]) : undefined}
        onBackupDownloaded={setLastBackupMeta}
      />

      <AiSessionImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        existingSessions={sessions}
        currentScriptSessionKey={currentScriptSessionKey}
        customScripts={customScripts}
        examples={examples}
        onConfirmImport={handleConfirmImport}
      />

      <AiSessionCleanupModal
        isOpen={isCleanupOpen}
        onClose={() => setIsCleanupOpen(false)}
        resolvedSessions={resolvedSessions}
        storageStats={storageStats}
        onBackupRecorded={setLastBackupMeta}
        onStripTraces={handleStripTraces}
        onDeleteSessions={handleDeleteSessions}
      />

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </>
  );
}
