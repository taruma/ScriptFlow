import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  BookmarkPlus,
  Check,
  Clock,
  FileText,
  GitCompare,
  GitFork,
  History,
  Pin,
  PinOff,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {scriptLibraryDb} from '../ui/scriptLibraryDb.ts';
import {countExecutionBeatsFast} from '../ui/scriptLibraryView.ts';
import {
  computeRestoreDiff,
  formatSnapshotTimestamp,
  getSnapshotOrigin,
  type ScriptSnapshot,
  type SnapshotTrigger,
} from '../ui/scriptSnapshots.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {ConfirmDialog, type ConfirmDialogRequest} from './ConfirmDialog.tsx';

export interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  scriptId: string;
  scriptTitle: string;
  currentRawText: string;
  isReadOnly: boolean;
  onForkCurrentExample: () => void;
  onSaveMilestone: (label: string) => Promise<ScriptSnapshot | null>;
  onRestoreSnapshot: (snapshot: ScriptSnapshot) => Promise<boolean>;
  onForkSnapshot: (snapshot: ScriptSnapshot) => Promise<unknown>;
  onToast: (message: string) => void;
}

type PreviewMode = 'diff' | 'full';

function getTriggerBadgeClass(trigger: SnapshotTrigger): string {
  switch (trigger) {
    case 'ai_draft':
      return 'auteur-phase-continuity';
    case 'ai_patch':
      return 'auteur-phase-logic';
    case 'ai_fix':
      return 'auteur-phase-intent';
    case 'manual':
      return 'auteur-phase-aesthetic';
    case 'pre_restore':
      return 'auteur-phase-slate';
  }
}

export function VersionHistoryModal(props: VersionHistoryModalProps) {
  if (!props.isOpen) return null;
  return <VersionHistoryModalContent {...props} />;
}

function VersionHistoryModalContent({
  onClose,
  scriptId,
  scriptTitle,
  currentRawText,
  isReadOnly,
  onForkCurrentExample,
  onSaveMilestone,
  onRestoreSnapshot,
  onForkSnapshot,
  onToast,
}: Omit<VersionHistoryModalProps, 'isOpen'>) {
  const labels = UI_LABELS.versionHistory;

  const [snapshots, setSnapshots] = useState<ScriptSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(!isReadOnly);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('diff');
  const [milestoneLabel, setMilestoneLabel] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);

  const loadSnapshots = useCallback(async () => {
    if (isReadOnly) {
      setSnapshots([]);
      setSelectedId(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const items = await scriptLibraryDb.listSnapshots(scriptId);
      setSnapshots(items);
      setSelectedId((prev) => {
        if (prev && items.some((s) => s.id === prev)) return prev;
        return items[0]?.id ?? null;
      });
    } finally {
      setIsLoading(false);
    }
  }, [scriptId, isReadOnly]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((s) => s.id === selectedId) ?? snapshots[0] ?? null,
    [snapshots, selectedId]
  );

  const selectedOrigin = selectedSnapshot ? getSnapshotOrigin(selectedSnapshot.trigger) : null;

  const restoreDiff = useMemo(() => {
    if (!selectedSnapshot) return null;
    return computeRestoreDiff(currentRawText, selectedSnapshot.rawText);
  }, [currentRawText, selectedSnapshot]);

  // Keyboard navigation: Esc closes, Up/Down navigates snapshot list
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (confirmRequest) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (snapshots.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const currentIdx = selectedSnapshot
          ? snapshots.findIndex((s) => s.id === selectedSnapshot.id)
          : -1;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIdx =
          currentIdx === -1
            ? 0
            : Math.max(0, Math.min(snapshots.length - 1, currentIdx + delta));
        setSelectedId(snapshots[nextIdx].id);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmRequest, onClose, snapshots, selectedSnapshot]);

  const handleSaveMilestoneSubmit = async () => {
    if (isReadOnly || isSaving) return;
    setIsSaving(true);
    try {
      const effectiveLabel = milestoneLabel.trim() || labels.saveMilestoneDefaultLabel;
      const saved = await onSaveMilestone(effectiveLabel);
      if (saved) {
        setMilestoneLabel('');
        const items = await scriptLibraryDb.listSnapshots(scriptId);
        setSnapshots(items);
        setSelectedId(saved.id);
        onToast(UI_LABELS.toasts.snapshotSaved(saved.label));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePin = async (snapshot: ScriptSnapshot) => {
    const updated = await scriptLibraryDb.updateSnapshot(snapshot.id, {
      pinned: !snapshot.pinned,
    });
    if (updated) {
      setSnapshots((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    }
  };

  const handleRequestDeleteSnapshot = (snapshot: ScriptSnapshot) => {
    setConfirmRequest({
      title: UI_LABELS.confirm.deleteSnapshotTitle(snapshot.label),
      description: UI_LABELS.confirm.deleteSnapshotDesc,
      confirmLabel: UI_LABELS.confirm.delete,
      cancelLabel: UI_LABELS.confirm.cancel,
      tone: 'danger',
      onConfirm: () => {
        void (async () => {
          await scriptLibraryDb.deleteSnapshot(snapshot.id);
          const items = await scriptLibraryDb.listSnapshots(scriptId);
          setSnapshots(items);
          setSelectedId((prev) => (prev === snapshot.id ? items[0]?.id ?? null : prev));
          onToast(UI_LABELS.toasts.snapshotDeleted);
        })();
      },
    });
  };

  const handleRequestClearHistory = () => {
    if (snapshots.length === 0) return;
    setConfirmRequest({
      title: UI_LABELS.confirm.clearSnapshotsTitle(snapshots.length),
      description: UI_LABELS.confirm.clearSnapshotsDesc,
      confirmLabel: UI_LABELS.confirm.clearSnapshotsConfirm,
      cancelLabel: UI_LABELS.confirm.cancel,
      tone: 'danger',
      onConfirm: () => {
        void (async () => {
          await scriptLibraryDb.clearSnapshotsForScript(scriptId);
          setSnapshots([]);
          setSelectedId(null);
          onToast(UI_LABELS.toasts.snapshotsCleared);
        })();
      },
    });
  };

  const handleRestoreClick = async () => {
    if (!selectedSnapshot || isRestoring || restoreDiff?.isIdentical) return;
    setIsRestoring(true);
    try {
      const ok = await onRestoreSnapshot(selectedSnapshot);
      if (ok) {
        onClose();
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleForkClick = async () => {
    if (!selectedSnapshot) return;
    await onForkSnapshot(selectedSnapshot);
    onClose();
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
        <div className="bg-surface w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col h-[min(640px,88dvh)]">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle bg-surface-subtle shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-text-main"
              >
                <History className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main leading-tight">
                  {labels.title}
                </h2>
                <p className="text-[11px] text-text-muted truncate">
                  {isReadOnly
                    ? labels.subtitleReadOnly(scriptTitle)
                    : labels.subtitle(scriptTitle, snapshots.length)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isReadOnly && snapshots.length > 0 && (
                <button
                  type="button"
                  onClick={handleRequestClearHistory}
                  aria-label={labels.clearHistoryAria}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>{labels.clearHistoryButton}</span>
                </button>
              )}
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

          {/* Body */}
          {isReadOnly ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 bg-app/40">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-main bg-surface text-text-muted"
              >
                <History className="h-5 w-5" />
              </span>
              <div className="space-y-1 max-w-md">
                <h3 className="font-serif text-sm font-bold text-text-main">
                  {labels.readOnlyTitle}
                </h3>
                <p className="text-xs leading-relaxed text-text-muted">{labels.readOnlyDesc}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onForkCurrentExample();
                }}
                className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5`}
              >
                <GitFork className="h-3.5 w-3.5" />
                <span>{labels.forkToEditButton}</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
              {/* Left Pane: Save Milestone + Snapshot List */}
              <div className="w-full md:w-[300px] shrink-0 border-b md:border-b-0 md:border-r border-border-subtle flex flex-col bg-surface-subtle/40 min-h-0 max-h-[40%] md:max-h-none">
                {/* Save Manual Milestone Bar */}
                <div className="p-2.5 border-b border-border-subtle bg-surface shrink-0">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      data-native-undo="true"
                      value={milestoneLabel}
                      onChange={(e) => setMilestoneLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleSaveMilestoneSubmit();
                        }
                      }}
                      placeholder={labels.saveMilestonePlaceholder}
                      aria-label={labels.saveMilestoneAria}
                      className={`${UI_TOKENS.input.field} py-1.5 px-2.5 text-[11px]`}
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void handleSaveMilestoneSubmit()}
                      className={`${UI_TOKENS.button.actionPill} py-1.5 px-2.5 text-[11px]`}
                    >
                      <BookmarkPlus className="h-3.5 w-3.5 text-text-muted" />
                      <span>{labels.saveMilestoneButton}</span>
                    </button>
                  </div>
                </div>

                {/* Snapshot List */}
                <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll divide-y divide-border-subtle">
                  {isLoading ? (
                    <div className="p-6 text-center text-xs text-text-faint">
                      {labels.loadingText}
                    </div>
                  ) : snapshots.length === 0 ? (
                    <div className="p-5 text-center space-y-1.5">
                      <Clock className="h-5 w-5 mx-auto text-text-faint" />
                      <p className="text-xs font-semibold text-text-main">{labels.emptyTitle}</p>
                      <p className="text-[11px] leading-relaxed text-text-muted">
                        {labels.emptyDesc}
                      </p>
                    </div>
                  ) : (
                    snapshots.map((snapshot) => {
                      const isSelected = selectedSnapshot?.id === snapshot.id;
                      const isCurrentMatch = snapshot.rawText === currentRawText;
                      const beats = countExecutionBeatsFast(snapshot.rawText);
                      const origin = getSnapshotOrigin(snapshot.trigger);

                      return (
                        <button
                          key={snapshot.id}
                          type="button"
                          onClick={() => setSelectedId(snapshot.id)}
                          className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer space-y-1 relative ${
                            isSelected
                              ? 'bg-surface-muted text-text-main'
                              : 'bg-transparent hover:bg-surface-hover/60 text-text-body'
                          }`}
                        >
                          {isSelected && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-0 left-0 w-0.5 bg-btn-primary-bg"
                            />
                          )}

                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1 min-w-0">
                              <span
                                title={labels.originTitles[origin]}
                                className={`inline-flex items-center rounded border px-1.5 py-0.25 font-mono text-[9px] font-semibold uppercase tracking-wider shrink-0 ${
                                  origin === 'manual'
                                    ? 'border-border-main bg-surface text-text-main'
                                    : 'border-border-subtle bg-surface-subtle text-text-muted'
                                }`}
                              >
                                {labels.origins[origin]}
                              </span>
                              <span
                                className={`inline-flex items-center rounded border px-1.5 py-0.25 font-mono text-[9px] font-medium shrink-0 ${getTriggerBadgeClass(
                                  snapshot.trigger
                                )}`}
                              >
                                {labels.triggers[snapshot.trigger]}
                              </span>
                              {snapshot.pinned && (
                                <Pin className="h-2.5 w-2.5 shrink-0 text-[var(--phase-aesthetic-text)]" />
                              )}
                              {isCurrentMatch && (
                                <span className="inline-flex items-center gap-0.5 rounded border border-border-main bg-surface px-1 py-0.25 font-mono text-[9px] text-text-muted shrink-0">
                                  <Check className="h-2 w-2" />
                                  {labels.currentMatchBadge}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-text-faint shrink-0 tabular-nums">
                              {formatSnapshotTimestamp(snapshot.createdAt)}
                            </span>
                          </div>

                          <div className="text-xs font-medium text-text-main line-clamp-2 leading-snug">
                            {snapshot.label}
                          </div>

                          <div className="font-mono text-[10px] text-text-faint tabular-nums">
                            {labels.beatCountLabel(beats)}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Keyboard Hint Footer */}
                <div className="hidden md:flex items-center justify-between px-3 py-1.5 border-t border-border-subtle bg-surface text-[10px] font-mono text-text-faint shrink-0">
                  <span>{labels.keyboardHint}</span>
                </div>
              </div>

              {/* Right Pane: Diff / Full Preview + Actions */}
              <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-app/30">
                {!selectedSnapshot ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-1.5">
                    <History className="h-6 w-6 text-text-faint" />
                    <h3 className="font-serif text-sm font-bold text-text-main">
                      {labels.selectPromptTitle}
                    </h3>
                    <p className="text-xs text-text-muted max-w-sm leading-relaxed">
                      {labels.selectPromptDesc}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Preview Header */}
                    <div className="px-4 py-2.5 border-b border-border-subtle bg-surface flex flex-wrap items-center justify-between gap-2 shrink-0">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {selectedOrigin && (
                            <span
                              title={labels.originTitles[selectedOrigin]}
                              className={`inline-flex items-center rounded border px-1.5 py-0.25 font-mono text-[9px] font-semibold uppercase tracking-wider shrink-0 ${
                                selectedOrigin === 'manual'
                                  ? 'border-border-main bg-surface text-text-main'
                                  : 'border-border-subtle bg-surface-subtle text-text-muted'
                              }`}
                            >
                              {labels.origins[selectedOrigin]}
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.25 font-mono text-[9px] font-medium shrink-0 ${getTriggerBadgeClass(
                              selectedSnapshot.trigger
                            )}`}
                          >
                            {labels.triggers[selectedSnapshot.trigger]}
                          </span>
                          <span className="text-xs font-semibold text-text-main truncate">
                            {selectedSnapshot.label}
                          </span>
                          {restoreDiff && !restoreDiff.isIdentical && (
                            <span className="font-mono text-[10px] text-text-muted tabular-nums shrink-0">
                              {labels.diffSummary(restoreDiff.added, restoreDiff.removed)}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-text-faint">
                          {new Date(selectedSnapshot.createdAt).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div
                          role="tablist"
                          aria-label={labels.viewModeAria}
                          className={UI_TOKENS.button.segmentedGroup}
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={previewMode === 'diff'}
                            onClick={() => setPreviewMode('diff')}
                            className={`${
                              previewMode === 'diff'
                                ? UI_TOKENS.button.segmentedItemActive
                                : UI_TOKENS.button.segmentedItem
                            } py-0.5 px-2 text-[11px]`}
                          >
                            <GitCompare className="h-3 w-3" />
                            <span>{labels.viewModeDiff}</span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={previewMode === 'full'}
                            onClick={() => setPreviewMode('full')}
                            className={`${
                              previewMode === 'full'
                                ? UI_TOKENS.button.segmentedItemActive
                                : UI_TOKENS.button.segmentedItem
                            } py-0.5 px-2 text-[11px]`}
                          >
                            <FileText className="h-3 w-3" />
                            <span>{labels.viewModeFull}</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleTogglePin(selectedSnapshot)}
                          title={selectedSnapshot.pinned ? labels.unpinTitle : labels.pinTitle}
                          aria-label={selectedSnapshot.pinned ? labels.unpinAria : labels.pinAria}
                          className={UI_TOKENS.button.iconGhost}
                        >
                          {selectedSnapshot.pinned ? (
                            <PinOff className="h-3.5 w-3.5 text-[var(--phase-aesthetic-text)]" />
                          ) : (
                            <Pin className="h-3.5 w-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRequestDeleteSnapshot(selectedSnapshot)}
                          aria-label={labels.deleteAria}
                          title={labels.deleteAria}
                          className={`${UI_TOKENS.button.iconGhost} hover:text-red-500`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Preview Content */}
                    <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll p-3.5">
                      {previewMode === 'diff' ? (
                        restoreDiff?.isIdentical ? (
                          <div className="rounded-xl border border-border-subtle bg-surface px-4 py-6 text-center text-xs text-text-muted">
                            {labels.matchesCurrentNote}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[11px] text-text-faint">{labels.diffLegend}</p>
                            <div className="rounded-xl border border-border-subtle bg-surface font-mono text-[11px] leading-relaxed overflow-x-auto">
                              {restoreDiff?.lines.map((line, index) => (
                                <div
                                  key={`${line.type}-${index}`}
                                  className={`px-3 py-0.5 whitespace-pre-wrap break-words ${
                                    line.type === 'added'
                                      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                                      : line.type === 'removed'
                                        ? 'bg-red-500/12 text-red-700 dark:text-red-300'
                                        : 'text-text-muted'
                                  }`}
                                >
                                  <span className="inline-block w-4 select-none opacity-65">
                                    {line.type === 'added'
                                      ? '+'
                                      : line.type === 'removed'
                                        ? '-'
                                        : ' '}
                                  </span>
                                  {line.text || ' '}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      ) : (
                        <pre className="rounded-xl border border-border-subtle bg-surface p-3.5 font-mono text-[11px] leading-relaxed text-text-body whitespace-pre-wrap break-words">
                          {selectedSnapshot.rawText}
                        </pre>
                      )}
                    </div>

                    {/* Action Footer */}
                    <div className="px-4 py-2.5 border-t border-border-subtle bg-surface flex flex-wrap items-center justify-between gap-2 shrink-0">
                      <span className="text-[10.5px] text-text-faint">{labels.retentionNote}</span>

                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        <button
                          type="button"
                          onClick={() => void handleForkClick()}
                          className={`${UI_TOKENS.button.secondary} inline-flex items-center gap-1.5 py-1.5`}
                        >
                          <GitFork className="h-3.5 w-3.5" />
                          <span>{labels.forkSnapshotButton}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isRestoring || Boolean(restoreDiff?.isIdentical)}
                          title={
                            restoreDiff?.isIdentical ? labels.restoreDisabledTitle : undefined
                          }
                          onClick={() => void handleRestoreClick()}
                          className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 py-1.5 disabled:opacity-45 disabled:cursor-not-allowed`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>{labels.restoreButton}</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </>
  );
}
