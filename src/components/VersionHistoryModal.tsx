import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowRight,
  BookmarkPlus,
  BookOpen,
  Check,
  Clock,
  FileText,
  GitCompare,
  GitFork,
  History,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type {BundledExample} from '../data/examples/index.ts';
import {APP_META, getMacroBlockMeta, UI_LABELS} from '../ui/labels.ts';
import {scriptLibraryDb, type ScriptRecord} from '../ui/scriptLibraryDb.ts';
import {
  countExecutionBeatsFast,
  extractLibraryScriptPreview,
  formatRelativeUpdatedTime,
  getScriptFamilyTree,
  type ActiveScriptRef,
} from '../ui/scriptLibraryView.ts';
import {
  buildCompactDiffRows,
  computeRestoreDiff,
  formatSnapshotTimestamp,
  getSnapshotOrigin,
  type ScriptSnapshot,
  type SnapshotTrigger,
} from '../ui/scriptSnapshots.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {ConfirmDialog, type ConfirmDialogRequest} from './ConfirmDialog.tsx';
import {ScriptLineageTree} from './library/ScriptLineageTree.tsx';

export interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeScript: ActiveScriptRef;
  scriptId: string;
  scriptTitle: string;
  currentRawText: string;
  isReadOnly: boolean;
  customScripts: readonly ScriptRecord[];
  examples: readonly BundledExample[];
  onTitleChange: (nextTitle: string) => void;
  onUpdateBranchNote: (nextBranchNote: string) => void;
  onBranchCurrentScript: (options?: {branchNote?: string}) => Promise<ScriptRecord | null>;
  onBranchFromScript: (record: ScriptRecord) => Promise<ScriptRecord | null>;
  onOpenCustomScript: (record: ScriptRecord) => Promise<void>;
  onOpenExample: (example: BundledExample) => Promise<void>;
  onForkCurrentExample: () => void;
  onSaveMilestone: (label: string) => Promise<ScriptSnapshot | null>;
  onRestoreSnapshot: (snapshot: ScriptSnapshot) => Promise<boolean>;
  onForkSnapshot: (snapshot: ScriptSnapshot) => Promise<unknown>;
  onToast: (message: string) => void;
}

type ModalTab = 'snapshots' | 'lineage';
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
  activeScript,
  scriptId,
  scriptTitle,
  currentRawText,
  isReadOnly,
  customScripts,
  examples,
  onTitleChange,
  onUpdateBranchNote,
  onBranchCurrentScript,
  onBranchFromScript,
  onOpenCustomScript,
  onOpenExample,
  onForkCurrentExample,
  onSaveMilestone,
  onRestoreSnapshot,
  onForkSnapshot,
  onToast,
}: Omit<VersionHistoryModalProps, 'isOpen'>) {
  const labels = UI_LABELS.versionHistory;

  const familyTree = useMemo(
    () => getScriptFamilyTree(scriptId, customScripts, examples),
    [scriptId, customScripts, examples]
  );

  const activeCustomRecord = useMemo(
    () =>
      activeScript.kind === 'custom'
        ? (customScripts.find((item) => item.id === activeScript.id) ?? null)
        : null,
    [activeScript, customScripts]
  );

  const familyMemberCount =
    familyTree?.kind === 'custom'
      ? familyTree.totalMembers
      : familyTree?.kind === 'example'
        ? familyTree.nodes.length
        : 1;

  const [activeTab, setActiveTab] = useState<ModalTab>(() =>
    familyMemberCount > 1 ? 'lineage' : 'snapshots'
  );
  const [snapshots, setSnapshots] = useState<ScriptSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(activeScript.kind === 'custom');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [selectedLineageNodeId, setSelectedLineageNodeId] = useState<string | null>(
    () => (activeScript.kind === 'custom' ? activeScript.id : (familyTree?.nodes[0]?.id ?? null))
  );
  const [previewMode, setPreviewMode] = useState<PreviewMode>('diff');
  const [milestoneLabel, setMilestoneLabel] = useState<string>('');
  const [branchNoteDraft, setBranchNoteDraft] = useState<string>(
    () => activeCustomRecord?.branchNote ?? ''
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isBranching, setIsBranching] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);
  const [openedAt] = useState<number>(() => Date.now());

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const branchNoteInputRef = useRef<HTMLInputElement | null>(null);

  // Sync branchNoteDraft whenever active script or stored branchNote changes
  useEffect(() => {
    setBranchNoteDraft(activeCustomRecord?.branchNote ?? '');
  }, [activeScript.id, activeCustomRecord?.branchNote]);

  // Keep selected lineage node valid whenever scriptId or family tree changes
  useEffect(() => {
    if (!familyTree) {
      setSelectedLineageNodeId(null);
      return;
    }
    setSelectedLineageNodeId((prev) => {
      if (prev && familyTree.nodes.some((n) => n.id === prev)) return prev;
      if (familyTree.nodes.some((n) => n.id === scriptId)) return scriptId;
      return familyTree.nodes[0]?.id ?? null;
    });
  }, [familyTree, scriptId]);

  const loadSnapshots = useCallback(async () => {
    if (activeScript.kind !== 'custom') {
      setSnapshots([]);
      setSelectedSnapshotId(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const items = await scriptLibraryDb.listSnapshots(scriptId);
      setSnapshots(items);
      setSelectedSnapshotId((prev) => {
        if (prev && items.some((s) => s.id === prev)) return prev;
        return items[0]?.id ?? null;
      });
    } finally {
      setIsLoading(false);
    }
  }, [scriptId, activeScript.kind]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((s) => s.id === selectedSnapshotId) ?? snapshots[0] ?? null,
    [snapshots, selectedSnapshotId]
  );

  const selectedLineageNode = useMemo(() => {
    if (!familyTree || familyTree.nodes.length === 0) return null;
    return (
      familyTree.nodes.find((n) => n.id === selectedLineageNodeId) ?? familyTree.nodes[0] ?? null
    );
  }, [familyTree, selectedLineageNodeId]);

  const selectedLineagePreview = useMemo(
    () =>
      selectedLineageNode
        ? extractLibraryScriptPreview(selectedLineageNode.record.rawText, 3)
        : null,
    [selectedLineageNode]
  );

  const selectedOrigin = selectedSnapshot ? getSnapshotOrigin(selectedSnapshot.trigger) : null;

  const [expandedOmittedIds, setExpandedOmittedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const restoreDiff = useMemo(() => {
    if (!selectedSnapshot) return null;
    return computeRestoreDiff(currentRawText, selectedSnapshot.rawText);
  }, [currentRawText, selectedSnapshot]);

  const compactDiffRows = useMemo(() => {
    if (!restoreDiff || restoreDiff.isIdentical) return [];
    return buildCompactDiffRows(restoreDiff.lines, 2);
  }, [restoreDiff]);

  useEffect(() => {
    setExpandedOmittedIds(new Set());
  }, [selectedSnapshot?.id, currentRawText]);

  const handleExpandOmitted = useCallback((id: string) => {
    setExpandedOmittedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const commitBranchNote = useCallback(() => {
    if (isReadOnly || activeScript.kind !== 'custom') return;
    const cleaned = branchNoteDraft.trim().replace(/\s+/g, ' ').slice(0, 160);
    const current = activeCustomRecord?.branchNote ?? '';
    setBranchNoteDraft(cleaned);
    if (cleaned !== current) {
      onUpdateBranchNote(cleaned);
    }
  }, [isReadOnly, activeScript.kind, branchNoteDraft, activeCustomRecord?.branchNote, onUpdateBranchNote]);

  const handleBranchCurrentClick = async () => {
    if (isReadOnly || isBranching) return;
    setIsBranching(true);
    try {
      commitBranchNote();
      const created = await onBranchCurrentScript();
      if (created) {
        setActiveTab('lineage');
        setSelectedLineageNodeId(created.id);
        requestAnimationFrame(() => {
          titleInputRef.current?.focus();
          titleInputRef.current?.select();
        });
      }
    } finally {
      setIsBranching(false);
    }
  };

  const handleBranchFromSelectedNode = async (record: ScriptRecord) => {
    if (isReadOnly || isBranching) return;
    setIsBranching(true);
    try {
      commitBranchNote();
      const created = await onBranchFromScript(record);
      if (created) {
        setActiveTab('lineage');
        setSelectedLineageNodeId(created.id);
        requestAnimationFrame(() => {
          titleInputRef.current?.focus();
          titleInputRef.current?.select();
        });
      }
    } finally {
      setIsBranching(false);
    }
  };

  const handleSwitchToNode = useCallback(
    async (record: ScriptRecord) => {
      if (activeScript.kind === 'custom' && activeScript.id === record.id) return;
      commitBranchNote();
      await onOpenCustomScript(record);
      onClose();
    },
    [activeScript, commitBranchNote, onOpenCustomScript, onClose]
  );

  const handleJumpToOriginExample = useCallback(
    async (exampleId: string) => {
      const target = examples.find((ex) => ex.id === exampleId);
      if (!target) return;
      commitBranchNote();
      await onOpenExample(target);
      onClose();
    },
    [examples, commitBranchNote, onOpenExample, onClose]
  );

  // Keyboard navigation: Esc closes, Up/Down navigates active tab list, Enter switches in Lineage Map
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (confirmRequest) return;

      if (event.key === 'Escape') {
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
        event.preventDefault();
        onClose();
        return;
      }

      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (activeTab === 'snapshots') {
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
          setSelectedSnapshotId(snapshots[nextIdx].id);
        }
      } else if (familyTree && familyTree.nodes.length > 0) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const nodes = familyTree.nodes;
          const currentIdx = selectedLineageNode
            ? nodes.findIndex((n) => n.id === selectedLineageNode.id)
            : -1;
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          const nextIdx =
            currentIdx === -1
              ? 0
              : Math.max(0, Math.min(nodes.length - 1, currentIdx + delta));
          setSelectedLineageNodeId(nodes[nextIdx].id);
        } else if (
          event.key === 'Enter' &&
          selectedLineageNode &&
          !(activeScript.kind === 'custom' && activeScript.id === selectedLineageNode.id)
        ) {
          event.preventDefault();
          void handleSwitchToNode(selectedLineageNode.record);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    confirmRequest,
    onClose,
    activeTab,
    snapshots,
    selectedSnapshot,
    familyTree,
    selectedLineageNode,
    activeScript,
    handleSwitchToNode,
  ]);

  const handleSaveMilestoneSubmit = async () => {
    if (isReadOnly || activeScript.kind !== 'custom' || isSaving) return;
    setIsSaving(true);
    try {
      const effectiveLabel = milestoneLabel.trim() || labels.saveMilestoneDefaultLabel;
      const saved = await onSaveMilestone(effectiveLabel);
      if (saved) {
        setMilestoneLabel('');
        const items = await scriptLibraryDb.listSnapshots(scriptId);
        setSnapshots(items);
        setSelectedSnapshotId(saved.id);
        onToast(UI_LABELS.toasts.snapshotSaved(saved.label));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePin = async (snapshot: ScriptSnapshot) => {
    if (isReadOnly) return;
    const updated = await scriptLibraryDb.updateSnapshot(snapshot.id, {
      pinned: !snapshot.pinned,
    });
    if (updated) {
      setSnapshots((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    }
  };

  const handleRequestDeleteSnapshot = (snapshot: ScriptSnapshot) => {
    if (isReadOnly) return;
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
          setSelectedSnapshotId((prev) => (prev === snapshot.id ? items[0]?.id ?? null : prev));
          onToast(UI_LABELS.toasts.snapshotDeleted);
        })();
      },
    });
  };

  const handleRequestClearHistory = () => {
    if (isReadOnly || snapshots.length === 0) return;
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
          setSelectedSnapshotId(null);
          onToast(UI_LABELS.toasts.snapshotsCleared);
        })();
      },
    });
  };

  const handleRestoreClick = async () => {
    if (isReadOnly || !selectedSnapshot || isRestoring || restoreDiff?.isIdentical) return;
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
    if (isReadOnly || !selectedSnapshot) return;
    await onForkSnapshot(selectedSnapshot);
    onClose();
  };

  const isExample = activeScript.kind === 'example';
  const lineageTabCount =
    familyTree?.kind === 'custom'
      ? familyTree.totalMembers
      : familyTree?.kind === 'example'
        ? familyTree.nodes.length
        : 1;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.dialogAria}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            commitBranchNote();
            onClose();
          }
        }}
        className={UI_TOKENS.modal.overlay}
      >
        <div className="bg-surface w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col h-[min(680px,90dvh)]">
          {/* Top Modal Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-text-main"
              >
                {activeTab === 'lineage' ? (
                  <GitFork className="h-3.5 w-3.5 text-sky-500" />
                ) : (
                  <History className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0">
                <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main leading-tight">
                  {labels.title}
                </h2>
                <p className="text-[11px] text-text-muted truncate">
                  {isExample
                    ? labels.subtitleReadOnly(scriptTitle || APP_META.untitledScene)
                    : labels.subtitleUnified(snapshots.length, familyMemberCount)}
                </p>
              </div>
            </div>

            {/* Mode Switcher: [ Snapshots | Lineage Map ] */}
            <div
              role="tablist"
              aria-label={labels.tabGroupAria}
              className={UI_TOKENS.button.segmentedGroup}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'snapshots'}
                onClick={() => setActiveTab('snapshots')}
                className={
                  activeTab === 'snapshots'
                    ? UI_TOKENS.button.segmentedItemActive
                    : UI_TOKENS.button.segmentedItem
                }
              >
                <History className="h-3.5 w-3.5 shrink-0" />
                <span>{labels.tabSnapshots(snapshots.length)}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'lineage'}
                onClick={() => setActiveTab('lineage')}
                className={
                  activeTab === 'lineage'
                    ? UI_TOKENS.button.segmentedItemActive
                    : UI_TOKENS.button.segmentedItem
                }
              >
                <GitFork className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                <span>{labels.tabLineage(lineageTabCount)}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isReadOnly && activeTab === 'snapshots' && snapshots.length > 0 && (
                <button
                  type="button"
                  onClick={handleRequestClearHistory}
                  aria-label={labels.clearHistoryAria}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="hidden sm:inline">{labels.clearHistoryButton}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  commitBranchNote();
                  onClose();
                }}
                aria-label={labels.closeAria}
                className={UI_TOKENS.button.iconClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Project Control Header: Inline Title + Branch Intention + Parent Breadcrumb + Branch CTA */}
          <div className="px-4 py-3 border-b border-border-main bg-surface shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                {isReadOnly ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="truncate font-serif text-base font-bold tracking-tight text-text-main">
                      {scriptTitle || APP_META.untitledScene}
                    </h3>
                    {isExample && (
                      <span
                        title={UI_LABELS.topBar.exampleBadgeTitle}
                        className="auteur-phase-logic inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide"
                      >
                        {UI_LABELS.topBar.exampleBadge}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Pencil className="h-3.5 w-3.5 text-text-faint shrink-0" />
                    <input
                      ref={titleInputRef}
                      type="text"
                      data-native-undo="true"
                      value={scriptTitle}
                      onChange={(e) => onTitleChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          branchNoteInputRef.current?.focus();
                        }
                      }}
                      aria-label={labels.sceneTitleInputAria}
                      placeholder={labels.sceneTitlePlaceholder}
                      className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 font-serif text-base font-bold tracking-tight text-text-main hover:bg-surface-subtle focus:border-border-main focus:bg-surface-subtle focus:outline-none"
                    />
                  </div>
                )}

                {/* Branch Intention / Note + Parent Origin Breadcrumb */}
                {!isExample ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {familyTree?.parentRecord && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('lineage');
                          setSelectedLineageNodeId(familyTree.parentRecord!.id);
                        }}
                        title={labels.jumpToParentTitle(familyTree.parentRecord.title)}
                        className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer shrink-0 max-w-[220px]"
                      >
                        <GitFork className="h-3 w-3 text-sky-500 shrink-0" />
                        <span className="shrink-0 text-text-faint">{labels.forkedFromPrefix}:</span>
                        <span className="truncate font-serif font-semibold text-text-main">
                          {familyTree.parentRecord.title}
                        </span>
                      </button>
                    )}

                    {!familyTree?.parentRecord && familyTree?.originExample && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-subtle px-2 py-0.5 text-[11px] text-text-muted shrink-0 max-w-[240px]">
                        <BookOpen className="h-3 w-3 text-text-faint shrink-0" />
                        <span className="truncate">
                          {labels.lineageOriginExampleLabel(familyTree.originExample.title)}
                        </span>
                      </span>
                    )}

                    {isReadOnly ? (
                      activeCustomRecord?.branchNote && (
                        <p className="text-xs text-text-muted truncate">
                          {activeCustomRecord.branchNote}
                        </p>
                      )
                    ) : (
                      <input
                        ref={branchNoteInputRef}
                        type="text"
                        data-native-undo="true"
                        value={branchNoteDraft}
                        onChange={(e) => setBranchNoteDraft(e.target.value)}
                        onBlur={commitBranchNote}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitBranchNote();
                            e.currentTarget.blur();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            setBranchNoteDraft(activeCustomRecord?.branchNote ?? '');
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder={labels.branchNotePlaceholder}
                        aria-label={labels.branchNoteInputAria}
                        className="min-w-[200px] flex-1 rounded-lg border border-transparent bg-surface-subtle/60 px-2 py-1 text-xs text-text-body placeholder:text-text-faint/80 hover:bg-surface-subtle focus:border-border-main focus:bg-surface focus:outline-none"
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">{labels.lineageExampleHeader}</p>
                )}
              </div>

              {/* Primary Branch / Fork Action */}
              <div className="flex items-center gap-1.5 shrink-0 sm:pt-0.5">
                {isExample ? (
                  !isReadOnly || activeScript.kind === 'example' ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onForkCurrentExample();
                      }}
                      className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 py-1.5`}
                    >
                      <GitFork className="h-3.5 w-3.5" />
                      <span>{labels.forkToEditButton}</span>
                    </button>
                  ) : null
                ) : (
                  !isReadOnly && (
                    <button
                      type="button"
                      disabled={isBranching}
                      onClick={() => void handleBranchCurrentClick()}
                      title={labels.branchScriptTitle}
                      className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 py-1.5 disabled:opacity-50`}
                    >
                      <GitFork className="h-3.5 w-3.5" />
                      <span>{labels.branchScriptButton}</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Body: Snapshots Tab vs. Lineage Map Tab */}
          {activeTab === 'lineage' ? (
            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
              {/* Left Pane: Family Tree */}
              <div className="w-full md:w-[360px] shrink-0 border-b md:border-b-0 md:border-r border-border-subtle flex flex-col bg-surface-subtle/40 min-h-0 max-h-[45%] md:max-h-none">
                <div className="px-3.5 py-2 border-b border-border-subtle bg-surface flex items-center justify-between shrink-0">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                    {labels.lineageTreeHeading}
                  </span>
                  <span className="font-mono text-[10px] text-text-faint tabular-nums">
                    {lineageTabCount}
                  </span>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll p-3 space-y-2.5">
                  {familyTree && familyTree.nodes.length > 0 ? (
                    <>
                      <ScriptLineageTree
                        nodes={familyTree.nodes}
                        activeScriptId={activeScript.id}
                        selectedNodeId={selectedLineageNode?.id ?? null}
                        originExample={
                          familyTree.kind === 'custom' ? familyTree.originExample : null
                        }
                        nowMs={openedAt}
                        onSelectNode={(record) => setSelectedLineageNodeId(record.id)}
                        onActivateNode={(record) => void handleSwitchToNode(record)}
                        onSelectOriginExample={(exampleId) =>
                          void handleJumpToOriginExample(exampleId)
                        }
                      />
                      {familyTree.kind === 'custom' && familyTree.totalMembers === 1 && (
                        <p className="px-1 pt-1 text-[11px] leading-relaxed text-text-faint">
                          {labels.lineageStandaloneHint}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="p-4 text-center space-y-2">
                      <GitFork className="h-5 w-5 mx-auto text-text-faint" />
                      <p className="text-xs leading-relaxed text-text-muted">
                        {isExample ? labels.lineageExampleNoForks : labels.lineageStandaloneHint}
                      </p>
                    </div>
                  )}
                </div>

                <div className="hidden md:flex items-center justify-between px-3 py-1.5 border-t border-border-subtle bg-surface text-[10px] font-mono text-text-faint shrink-0">
                  <span>{labels.lineageKeyboardHint}</span>
                </div>
              </div>

              {/* Right Pane: Selected Branch Inspector */}
              <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-app/30">
                {selectedLineageNode && selectedLineagePreview ? (
                  <>
                    <div className="px-4 py-3 border-b border-border-subtle bg-surface shrink-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h3 className="truncate font-serif text-base font-bold tracking-tight text-text-main">
                            {selectedLineageNode.record.title}
                          </h3>
                          {selectedLineageNode.depth === 0 && familyMemberCount > 1 && (
                            <span className="inline-flex shrink-0 items-center rounded border border-border-subtle bg-surface-subtle px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase tracking-wide text-text-faint">
                              {labels.lineageRootBadge}
                            </span>
                          )}
                          {activeScript.kind === 'custom' &&
                            selectedLineageNode.id === activeScript.id && (
                              <span className="auteur-phase-continuity inline-flex shrink-0 items-center rounded border px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase tracking-wide">
                                {labels.lineageCurrentBadge}
                              </span>
                            )}
                        </div>
                        <span className="font-mono text-[10.5px] text-text-faint shrink-0 tabular-nums">
                          {labels.beatCountLabel(selectedLineagePreview.beatCount)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-text-faint">
                        <span>
                          {labels.lineageInspectorUpdated}:{' '}
                          {formatRelativeUpdatedTime(selectedLineageNode.record.updatedAt, openedAt)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {labels.lineageInspectorCreated}:{' '}
                          {new Date(selectedLineageNode.record.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll p-4 space-y-4">
                      {/* Branch Intention */}
                      <section className="space-y-1.5">
                        <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                          {labels.lineageInspectorNoteHeading}
                        </h4>
                        <div className="rounded-xl border border-border-subtle bg-surface px-3.5 py-2.5 text-xs leading-relaxed text-text-body">
                          {selectedLineageNode.record.branchNote ? (
                            selectedLineageNode.record.branchNote
                          ) : (
                            <span className="italic text-text-faint">
                              {labels.lineageInspectorNoNote}
                            </span>
                          )}
                        </div>
                      </section>

                      {/* Brief Phase 1 / Phase 2 Scene Overview */}
                      <section className="space-y-2">
                        <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                          {labels.lineageInspectorOverviewHeading}
                        </h4>
                        {selectedLineagePreview.stagingBlocks.length > 0 && (
                          <div className="space-y-1.5">
                            {selectedLineagePreview.stagingBlocks.slice(0, 3).map((block, idx) => {
                              const meta = getMacroBlockMeta(block.kind);
                              return (
                                <div
                                  key={`${block.name}-${idx}`}
                                  className="rounded-xl border border-border-subtle bg-surface px-3 py-2"
                                >
                                  <span
                                    className={`${meta.badgeClass} inline-flex items-center rounded border px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase tracking-wide`}
                                  >
                                    [{block.name}]
                                  </span>
                                  {block.excerpt && (
                                    <p className="mt-1 font-script text-[12px] leading-relaxed text-text-body line-clamp-2">
                                      {block.excerpt}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {selectedLineagePreview.previewBeats.length > 0 && (
                          <div className="space-y-1">
                            {selectedLineagePreview.previewBeats.map((beat) => (
                              <div
                                key={beat.index}
                                className="flex items-baseline gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-1.5"
                              >
                                <span className="font-mono text-[10px] font-semibold text-text-faint tabular-nums shrink-0">
                                  S{beat.index}
                                </span>
                                <p className="min-w-0 flex-1 truncate font-script text-[12px] text-text-body">
                                  {beat.raw}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>

                    <div className="px-4 py-2.5 border-t border-border-subtle bg-surface flex flex-wrap items-center justify-end gap-2 shrink-0">
                      {!isReadOnly && (
                        <button
                          type="button"
                          disabled={isBranching}
                          onClick={() =>
                            void handleBranchFromSelectedNode(selectedLineageNode.record)
                          }
                          className={`${UI_TOKENS.button.secondary} inline-flex items-center gap-1.5 py-1.5`}
                        >
                          <GitFork className="h-3.5 w-3.5" />
                          <span>{labels.lineageBranchFromHere}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={
                          activeScript.kind === 'custom' &&
                          selectedLineageNode.id === activeScript.id
                        }
                        onClick={() => void handleSwitchToNode(selectedLineageNode.record)}
                        className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 py-1.5 disabled:opacity-45 disabled:cursor-not-allowed`}
                      >
                        {activeScript.kind === 'custom' &&
                        selectedLineageNode.id === activeScript.id ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>{labels.lineageAlreadyActive}</span>
                          </>
                        ) : (
                          <>
                            <ArrowRight className="h-3.5 w-3.5" />
                            <span>{labels.lineageSwitchToScript}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
                    <GitFork className="h-6 w-6 text-text-faint" />
                    <p className="text-xs text-text-muted max-w-sm leading-relaxed">
                      {isExample ? labels.lineageExampleNoForks : labels.lineageStandaloneHint}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : isExample ? (
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
                {!isReadOnly && (
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
                )}

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
                          onClick={() => setSelectedSnapshotId(snapshot.id)}
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

                        {!isReadOnly && (
                          <>
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
                          </>
                        )}
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
                            <div className="rounded-xl border border-border-subtle bg-surface font-mono text-[11px] leading-relaxed overflow-hidden">
                              {compactDiffRows.map((row) => {
                                if (row.kind === 'omitted') {
                                  if (expandedOmittedIds.has(row.id)) {
                                    return row.lines.map((entry, offset) => (
                                      <div
                                        key={`expanded-${row.startIndex + offset}`}
                                        className="flex px-2.5 py-0.5 text-text-muted"
                                      >
                                        <span className="w-7 shrink-0 select-none pr-2 text-right text-[10px] opacity-50 tabular-nums">
                                          {entry.lineNumber ?? ''}
                                        </span>
                                        <span className="w-4 shrink-0 select-none opacity-65">
                                          {' '}
                                        </span>
                                        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                                          {entry.text || ' '}
                                        </span>
                                      </div>
                                    ));
                                  }

                                  return (
                                    <button
                                      key={row.id}
                                      type="button"
                                      onClick={() => handleExpandOmitted(row.id)}
                                      title={labels.expandOmittedTitle}
                                      className="w-full flex items-center justify-center px-3 py-1 border-y first:border-t-0 last:border-b-0 border-border-subtle bg-surface-subtle/70 hover:bg-surface-hover text-[10px] font-mono text-text-faint hover:text-text-muted transition-colors cursor-pointer select-none"
                                    >
                                      {labels.omittedLines(row.count)}
                                    </button>
                                  );
                                }

                                const {entry, sourceIndex} = row;
                                const rowToneClass =
                                  entry.kind === 'added'
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    : entry.kind === 'removed'
                                      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                                      : entry.kind === 'changed'
                                        ? 'bg-surface-subtle/40 text-text-body'
                                        : 'text-text-muted';
                                const gutterSymbol =
                                  entry.kind === 'added'
                                    ? '+'
                                    : entry.kind === 'removed'
                                      ? '-'
                                      : entry.kind === 'changed'
                                        ? '~'
                                        : ' ';

                                return (
                                  <div
                                    key={`${entry.kind}-${sourceIndex}`}
                                    className={`flex px-2.5 py-0.5 ${rowToneClass}`}
                                  >
                                    <span className="w-7 shrink-0 select-none pr-2 text-right text-[10px] opacity-50 tabular-nums">
                                      {entry.lineNumber ?? ''}
                                    </span>
                                    <span
                                      className={`w-4 shrink-0 select-none ${
                                        entry.kind === 'changed'
                                          ? 'text-[var(--tok-continuity)] font-semibold'
                                          : 'opacity-65'
                                      }`}
                                    >
                                      {gutterSymbol}
                                    </span>
                                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                                      {entry.kind === 'changed' ? (
                                        entry.tokens.length > 0 ? (
                                          entry.tokens.map((token, tokenIdx) =>
                                            token.type === 'added' ? (
                                              <span key={tokenIdx} className="auteur-word-diff-added">
                                                {token.text}
                                              </span>
                                            ) : token.type === 'removed' ? (
                                              <span
                                                key={tokenIdx}
                                                className="auteur-word-diff-removed"
                                              >
                                                {token.text}
                                              </span>
                                            ) : (
                                              <span key={tokenIdx}>{token.text}</span>
                                            )
                                          )
                                        ) : (
                                          ' '
                                        )
                                      ) : (
                                        entry.text || ' '
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
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
                    {!isReadOnly && (
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
                    )}
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
