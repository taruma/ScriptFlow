import {lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  deleteExecutionBeat,
  deleteExecutionSubState,
  deleteStagingBlock,
  exportPlainText,
  exportTagless,
  extractMetadata,
  formatAuteurScript,
  insertExecutionBeat,
  insertExecutionSubState,
  insertStagingBlock,
  isMultiBlockAuteurScript,
  lintDocument,
  mergeExecutionSubStateWithPrevious,
  parseAuteurScript,
  reorderExecutionBeats,
  reorderExecutionSubStates,
  reorderStagingBlocks,
  toAuteurEnvelope,
  updateExecutionSubState,
  updateStagingBlock,
  type HistoryCommitMode,
} from './core/index.ts';
import type {AiLivePatchActionHandlers} from './components/AiAssistantSidebar.tsx';
import {ConfirmDialog, type ConfirmDialogRequest} from './components/ConfirmDialog.tsx';
import {LiveDocument} from './components/LiveDocument.tsx';
import {ScriptLibraryModal} from './components/ScriptLibraryModal.tsx';
import {SourceEditor} from './components/SourceEditor.tsx';
import type {StagingBlockCommitOptions} from './components/stagingBlockRegistry.ts';
import {TopSlateBar, type CopyFormatKind, type ViewMode} from './components/TopSlateBar.tsx';
import {BUNDLED_EXAMPLES} from './data/examples/index.ts';
import type {QuickScanResult} from './services/geminiDecisions.ts';
import type {DraftSuggestion, PatchSuggestion} from './services/scriptTools.ts';
import {resolveEditorJumpTarget} from './ui/aiAssistant.ts';
import {copyTextToClipboard} from './ui/clipboard.ts';
import {useEditorSettings} from './ui/editorSettings.ts';
import {matchHistoryShortcut} from './ui/historyShortcuts.ts';
import {APP_META, UI_LABELS} from './ui/labels.ts';
import type {ActiveAiPatchItem} from './ui/patchIndicators.ts';
import {stabilizeAestheticTokens} from './ui/referenceStability.ts';
import {buildAiSnapshotLabel} from './ui/scriptSnapshots.ts';
import {useScriptLibrary} from './ui/useScriptLibrary.ts';
import {useStableValue} from './ui/useStableValue.ts';

const JsonIrDebugDrawer = lazy(() =>
  import('./components/debug/JsonIrDebugDrawer.tsx').then((mod) => ({
    default: mod.JsonIrDebugDrawer,
  }))
);

const AiAssistantSidebar = lazy(() =>
  import('./components/AiAssistantSidebar.tsx').then((mod) => ({
    default: mod.AiAssistantSidebar,
  }))
);

const VersionHistoryModal = lazy(() =>
  import('./components/VersionHistoryModal.tsx').then((mod) => ({
    default: mod.VersionHistoryModal,
  }))
);

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  return (el as HTMLElement).isContentEditable === true;
}

function isWritableEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    return !field.readOnly && !field.disabled;
  }
  return (el as HTMLElement).isContentEditable === true;
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const {settings, updateSettings} = useEditorSettings();
  const [copiedKind, setCopiedKind] = useState<CopyFormatKind | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState<boolean>(false);
  const [isAiOpen, setIsAiOpen] = useState<boolean>(false);
  const [activeAiPatches, setActiveAiPatches] = useState<ActiveAiPatchItem[]>([]);
  const [activeQuickScan, setActiveQuickScan] = useState<QuickScanResult | null>(null);
  const livePatchActionsRef = useRef<AiLivePatchActionHandlers | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);

  const handleActiveAiPatchesChange = useCallback((next: ActiveAiPatchItem[]) => {
    setActiveAiPatches((prev) => (prev.length === 0 && next.length === 0 ? prev : next));
  }, []);

  const handleActiveQuickScanChange = useCallback((next: QuickScanResult | null) => {
    setActiveQuickScan((prev) => (prev === next ? prev : next));
  }, []);

  const handleRegisterLivePatchActions = useCallback(
    (actions: AiLivePatchActionHandlers | null) => {
      livePatchActionsRef.current = actions;
    },
    []
  );

  const handleApplyLivePatch = useCallback((patchId: string) => {
    livePatchActionsRef.current?.applyPatchById(patchId);
  }, []);

  const handleDismissLivePatch = useCallback((patchId: string) => {
    livePatchActionsRef.current?.dismissPatchById(patchId);
  }, []);

  const handleAuditQuickScanBeat = useCallback((beatIndex: number) => {
    livePatchActionsRef.current?.auditQuickScanBeat?.(beatIndex);
  }, []);

  useEffect(() => {
    if (!isAiOpen) {
      setActiveAiPatches((prev) => (prev.length === 0 ? prev : []));
      setActiveQuickScan((prev) => (prev === null ? prev : null));
      livePatchActionsRef.current = null;
    }
  }, [isAiOpen]);

  const handleSwitchToLive = useCallback(() => {
    setViewMode('live');
  }, []);

  const library = useScriptLibrary({
    ruleOverrides: settings.lintRuleOverrides,
    onSwitchToLive: handleSwitchToLive,
    onRequestConfirm: setConfirmRequest,
    onToast: setToastMessage,
  });

  const {
    history,
    rawText,
    canUndo,
    canRedo,
    activeScript,
    isReadOnly,
    sceneTitle,
    customScripts,
    importFileInputRef,
    restoreBackupInputRef,
    commitRawText,
    handleTitleChange,
    handleUndo,
    handleRedo,
    breakCoalescing,
  } = library;

  const [aiScriptSessionKey, setAiScriptSessionKey] = useState<string>(
    () => `${activeScript.kind}:${activeScript.id}`
  );
  const skipNextAiResetRef = useRef<boolean>(false);

  useEffect(() => {
    const nextKey = `${activeScript.kind}:${activeScript.id}`;
    if (skipNextAiResetRef.current) {
      skipNextAiResetRef.current = false;
      return;
    }
    setAiScriptSessionKey(nextKey);
  }, [activeScript.kind, activeScript.id]);

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      breakCoalescing();
    },
    [breakCoalescing]
  );

  // Transient toast & copy feedback timers
  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!copiedKind) return;
    const timer = window.setTimeout(() => setCopiedKind(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedKind]);

  // Synchronous pure derivations from Plain-Text-as-Truth
  const doc = useMemo(() => parseAuteurScript(rawText), [rawText]);
  const metadata = useMemo(() => extractMetadata(doc), [doc]);
  const diagnostics = useMemo(
    () => lintDocument(doc, metadata, settings.lintRuleOverrides),
    [doc, metadata, settings.lintRuleOverrides]
  );
  const stableAestheticTokens = useStableValue(metadata.aestheticTokens, stabilizeAestheticTokens);

  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // Global Paste-and-Hydrate with Active-Editor & Read-Only Guards
  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      if (isDebugOpen || confirmRequest !== null || isLibraryOpen || isVersionHistoryOpen) return;
      if (document.querySelector('[aria-modal="true"]')) return;

      const pasted = event.clipboardData?.getData('text/plain');
      if (!pasted || pasted.trim().length === 0) return;

      const targetEl = event.target instanceof Element ? event.target : null;
      const active = document.activeElement;
      if (
        (active instanceof Element && active.closest('[data-ai-sidebar="true"]')) ||
        (targetEl && targetEl.closest('[data-ai-sidebar="true"]'))
      ) {
        return;
      }
      const inEditable = isEditableElement(active);
      const inWritableEditable = isWritableEditableElement(active);
      const hasMultiBlockScript = isMultiBlockAuteurScript(pasted);

      if (isReadOnly) {
        if (inWritableEditable && !hasMultiBlockScript) {
          return;
        }
        event.preventDefault();
        setToastMessage(UI_LABELS.toasts.readOnlyPasteBlocked);
        return;
      }

      if (viewMode === 'source' && inEditable) {
        return;
      }

      if (inEditable && !hasMultiBlockScript) {
        return;
      }

      event.preventDefault();
      if (active instanceof HTMLElement) {
        active.blur();
      }
      commitRawText(pasted.replace(/\r\n?/g, '\n'), {mode: 'checkpoint'});
      setViewMode('live');
      setToastMessage(UI_LABELS.toasts.scriptHydrated);
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [
    viewMode,
    isReadOnly,
    isDebugOpen,
    confirmRequest,
    isLibraryOpen,
    isVersionHistoryOpen,
    commitRawText,
  ]);

  // Document-level Undo / Redo keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const action = matchHistoryShortcut(event);
      if (!action) return;

      if (
        isReadOnly ||
        isDebugOpen ||
        confirmRequest !== null ||
        isLibraryOpen ||
        isVersionHistoryOpen
      ) {
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;

      const active = document.activeElement;
      if (active instanceof Element && active.closest('[data-native-undo="true"]')) {
        return;
      }

      event.preventDefault();
      if (action === 'undo') {
        handleUndo();
      } else {
        handleRedo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isReadOnly,
    isDebugOpen,
    confirmRequest,
    isLibraryOpen,
    isVersionHistoryOpen,
    handleUndo,
    handleRedo,
  ]);

  // Pure Serializer Mutations
  const handleUpdateStaging = useCallback(
    (blockIndex: number, nextBody: string, options?: StagingBlockCommitOptions) => {
      const mode = options?.mode ?? 'coalesce';
      const groupKey = options?.groupKey
        ? `staging:${blockIndex}:${options.groupKey}`
        : `staging:${blockIndex}`;
      commitRawText((prev) => updateStagingBlock(prev, blockIndex, nextBody), {
        mode,
        groupKey: mode === 'coalesce' ? groupKey : null,
      });
    },
    [commitRawText]
  );

  const handleInsertStaging = useCallback(
    (headerName: string, afterBlockIndex?: number) => {
      commitRawText((prev) => insertStagingBlock(prev, headerName, '', afterBlockIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleRequestDeleteStaging = useCallback(
    (blockIndex: number) => {
      if (isReadOnly) return;
      const target = docRef.current.stagingBlocks[blockIndex];
      if (!target) return;
      const excerpt = target.lines.find((line) => line.trim().length > 0)?.trim();
      setConfirmRequest({
        title: UI_LABELS.confirm.deleteMacroBlockTitle(target.name),
        description: UI_LABELS.confirm.deleteMacroBlockDesc,
        excerpt,
        confirmLabel: UI_LABELS.confirm.delete,
        cancelLabel: UI_LABELS.confirm.cancel,
        tone: 'danger',
        onConfirm: () => {
          commitRawText((prev) => deleteStagingBlock(prev, blockIndex), {mode: 'checkpoint'});
        },
      });
    },
    [isReadOnly, commitRawText]
  );

  const handleReorderStaging = useCallback(
    (fromBlockIndex: number, toBlockIndex: number) => {
      commitRawText((prev) => reorderStagingBlocks(prev, fromBlockIndex, toBlockIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleUpdateSubState = useCallback(
    (
      beatIndex: number,
      subStateIndex: number,
      nextSubStateRaw: string,
      mode: HistoryCommitMode = 'coalesce'
    ) => {
      commitRawText(
        (prev) => updateExecutionSubState(prev, beatIndex, subStateIndex, nextSubStateRaw),
        {
          mode,
          groupKey: mode === 'coalesce' ? `beat:${beatIndex}:step:${subStateIndex}` : null,
        }
      );
    },
    [commitRawText]
  );

  const handleInsertSubState = useCallback(
    (
      beatIndex: number,
      afterSubStateIndex: number,
      starterText: string,
      mode: HistoryCommitMode = 'checkpoint'
    ) => {
      commitRawText(
        (prev) => insertExecutionSubState(prev, beatIndex, afterSubStateIndex, starterText),
        {
          mode,
          groupKey: mode === 'coalesce' ? `beat:${beatIndex}:step:${afterSubStateIndex + 1}` : null,
        }
      );
    },
    [commitRawText]
  );

  const handleDeleteSubState = useCallback(
    (beatIndex: number, subStateIndex: number) => {
      commitRawText((prev) => deleteExecutionSubState(prev, beatIndex, subStateIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleMergeSubState = useCallback(
    (beatIndex: number, subStateIndex: number) => {
      commitRawText((prev) => mergeExecutionSubStateWithPrevious(prev, beatIndex, subStateIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleReorderSubState = useCallback(
    (beatIndex: number, fromSubStateIndex: number, toSubStateIndex: number) => {
      commitRawText(
        (prev) => reorderExecutionSubStates(prev, beatIndex, fromSubStateIndex, toSubStateIndex),
        {
          mode: 'checkpoint',
        }
      );
    },
    [commitRawText]
  );

  const handleInsertBeat = useCallback(
    (afterBeatIndex: number, starterLine: string) => {
      commitRawText((prev) => insertExecutionBeat(prev, afterBeatIndex, starterLine), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleRequestDeleteBeat = useCallback(
    (beatIndex: number) => {
      if (isReadOnly) return;
      const target = docRef.current.execution?.beats.find((b) => b.index === beatIndex);
      setConfirmRequest({
        title: UI_LABELS.confirm.deleteMacroStateTitle(beatIndex),
        description: UI_LABELS.confirm.deleteMacroStateDesc,
        excerpt: target?.raw,
        confirmLabel: UI_LABELS.confirm.delete,
        cancelLabel: UI_LABELS.confirm.cancel,
        tone: 'danger',
        onConfirm: () => {
          commitRawText((prev) => deleteExecutionBeat(prev, beatIndex), {mode: 'checkpoint'});
        },
      });
    },
    [isReadOnly, commitRawText]
  );

  const handleReorderBeats = useCallback(
    (fromBeatIndex: number, toBeatIndex: number) => {
      commitRawText((prev) => reorderExecutionBeats(prev, fromBeatIndex, toBeatIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  const handleUpdateSource = useCallback(
    (nextRawText: string) => {
      commitRawText(nextRawText, {mode: 'coalesce', groupKey: 'source'});
    },
    [commitRawText]
  );

  const handleFormatScript = useCallback(() => {
    if (isReadOnly) return;
    const formatted = formatAuteurScript(rawText);
    if (formatted === rawText) {
      setToastMessage(UI_LABELS.toasts.scriptAlreadyFormatted);
      return;
    }
    commitRawText(formatted, {mode: 'checkpoint'});
    setToastMessage(UI_LABELS.toasts.scriptFormatted);
  }, [isReadOnly, rawText, commitRawText]);

  // Clipboard Export & Debug Commit
  const handleCopyPlainText = useCallback(async () => {
    const text = exportPlainText(rawText);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKind('plain');
    }
  }, [rawText]);

  const handleCopyTagless = useCallback(async () => {
    const text = exportTagless(rawText);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKind('tagless');
    }
  }, [rawText]);

  const handleCopyJsonEnvelope = useCallback(async () => {
    const envelope = toAuteurEnvelope(rawText, settings.lintRuleOverrides);
    const text = JSON.stringify(envelope, null, 2);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKind('json');
    }
  }, [rawText, settings.lintRuleOverrides]);

  const handleCommitFromDebug = useCallback(
    (nextRawText: string, message?: string) => {
      if (isReadOnly) return;
      commitRawText(nextRawText, {mode: 'checkpoint'});
      if (message) {
        setToastMessage(message);
      }
    },
    [isReadOnly, commitRawText]
  );

  const handleJumpToFirstDiagnostic = useCallback(() => {
    const first = diagnostics[0];
    if (!first) return;
    if (viewMode !== 'live') {
      setViewMode('live');
    }

    requestAnimationFrame(() => {
      const targetId =
        first.target.phase === 'staging'
          ? `staging-block-${first.target.blockIndex}`
          : `execution-beat-${first.target.beatIndex}`;
      const el = document.getElementById(targetId);
      el?.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
  }, [diagnostics, viewMode]);

  const handleJumpToAiTarget = useCallback(
    (targetId: string) => {
      const resolved = resolveEditorJumpTarget(targetId, docRef.current);
      if (!resolved) return;
      if (viewMode !== 'live') {
        setViewMode('live');
      }

      requestAnimationFrame(() => {
        const el =
          document.getElementById(resolved.domId) ??
          (resolved.phase === 'execution' && resolved.fallbackDomId
            ? document.getElementById(resolved.fallbackDomId)
            : null);
        if (!el) return;
        el.scrollIntoView({behavior: 'smooth', block: 'center'});
        el.classList.add('ring-2', 'ring-[var(--tok-continuity)]', 'rounded-lg');
        window.setTimeout(() => {
          el.classList.remove('ring-2', 'ring-[var(--tok-continuity)]', 'rounded-lg');
        }, 1200);
      });
    },
    [viewMode]
  );

  const handleApplyAiPatchSuggestion = useCallback(
    async (
      suggestion: PatchSuggestion,
      kind: 'patch' | 'fix',
      options?: {batchCount?: number}
    ): Promise<boolean> => {
      const trigger = kind === 'fix' ? 'ai_fix' : 'ai_patch';
      const snapshotLabel = buildAiSnapshotLabel(trigger, suggestion.summary, options);
      if (isReadOnly) {
        skipNextAiResetRef.current = true;
        return library.handleForkCurrentExampleWithContent(suggestion.candidateRawText, {
          snapshotMeta: {trigger, label: snapshotLabel},
        });
      }
      void library.handleCreateSnapshot({
        trigger,
        label: snapshotLabel,
        rawText,
      });
      commitRawText(suggestion.candidateRawText, {mode: 'checkpoint'});
      setToastMessage(
        kind === 'fix'
          ? options?.batchCount && options.batchCount > 1
            ? UI_LABELS.toasts.aiFixesBatchApplied(options.batchCount)
            : UI_LABELS.toasts.aiFixApplied
          : UI_LABELS.toasts.aiPatchApplied
      );
      return true;
    },
    [isReadOnly, library, rawText, commitRawText]
  );

  const handleApplyAiDraftSuggestion = useCallback(
    async (suggestion: DraftSuggestion): Promise<boolean> => {
      const snapshotLabel = buildAiSnapshotLabel(
        'ai_draft',
        suggestion.title || suggestion.summary
      );
      if (isReadOnly) {
        skipNextAiResetRef.current = true;
        return library.handleForkCurrentExampleWithContent(suggestion.candidateRawText, {
          title: suggestion.title,
          snapshotMeta: {trigger: 'ai_draft', label: snapshotLabel},
        });
      }
      void library.handleCreateSnapshot({
        trigger: 'ai_draft',
        label: snapshotLabel,
        rawText,
      });
      commitRawText(suggestion.candidateRawText, {mode: 'checkpoint'});
      if (
        suggestion.title &&
        (sceneTitle.trim() === '' || sceneTitle.startsWith(APP_META.untitledScene))
      ) {
        handleTitleChange(suggestion.title);
      }
      setToastMessage(UI_LABELS.toasts.aiDraftApplied);
      return true;
    },
    [isReadOnly, library, rawText, commitRawText, sceneTitle, handleTitleChange]
  );

  const beatCount = doc.execution?.beats.length ?? 0;

  return (
    <div className="min-h-screen lg:h-dvh lg:overflow-hidden bg-app text-text-main flex flex-col">
      <TopSlateBar
        title={sceneTitle}
        onTitleChange={handleTitleChange}
        readOnly={isReadOnly}
        onForkExample={library.handleForkCurrentExample}
        beatCount={beatCount}
        diagnostics={diagnostics}
        onJumpToFirstDiagnostic={handleJumpToFirstDiagnostic}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onNewBlank={() => void library.handleNewBlank()}
        onImportFile={library.handleTriggerImportFile}
        onFormatScript={handleFormatScript}
        onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
        onDownloadCanonical={library.handleDownloadCanonical}
        onDownloadTagless={library.handleDownloadTagless}
        onDownloadJsonEnvelope={library.handleDownloadJsonEnvelope}
        onBackupAll={() => void library.handleBackupAll()}
        onRestoreBackup={library.handleTriggerRestoreBackup}
        onOpenLibrary={() => setIsLibraryOpen(true)}
        isLibraryOpen={isLibraryOpen}
        settings={settings}
        onUpdateSettings={updateSettings}
        onCopyPlainText={handleCopyPlainText}
        onCopyTagless={handleCopyTagless}
        onCopyJsonEnvelope={handleCopyJsonEnvelope}
        copiedKind={copiedKind}
        onOpenDebug={() => setIsDebugOpen(true)}
        onToggleAi={() => setIsAiOpen((prev) => !prev)}
        isAiOpen={isAiOpen}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row lg:overflow-hidden">
        <div
          className={`flex-1 min-w-0 min-h-0 lg:h-full ${
            viewMode === 'source'
              ? 'lg:overflow-y-auto auteur-pane-scroll'
              : 'lg:overflow-hidden'
          }`}
        >
          {viewMode === 'live' ? (
            <LiveDocument
              rawText={rawText}
              doc={doc}
              metadata={metadata}
              diagnostics={diagnostics}
              activeAiPatches={activeAiPatches}
              onApplyAiPatch={handleApplyLivePatch}
              onDismissAiPatch={handleDismissLivePatch}
              activeQuickScan={activeQuickScan}
              onAuditQuickScanBeat={handleAuditQuickScanBeat}
              historyRevision={history.revision}
              readOnly={isReadOnly}
              onUpdateStaging={handleUpdateStaging}
              onInsertStaging={handleInsertStaging}
              onDeleteStaging={handleRequestDeleteStaging}
              onReorderStaging={handleReorderStaging}
              onUpdateSubState={handleUpdateSubState}
              onInsertSubState={handleInsertSubState}
              onDeleteSubState={handleDeleteSubState}
              onMergeSubState={handleMergeSubState}
              onReorderSubState={handleReorderSubState}
              onInsertBeat={handleInsertBeat}
              onDeleteBeat={handleRequestDeleteBeat}
              onReorderBeats={handleReorderBeats}
            />
          ) : (
            <SourceEditor
              rawText={rawText}
              aestheticTokens={stableAestheticTokens}
              readOnly={isReadOnly}
              onChange={handleUpdateSource}
              onFormatScript={handleFormatScript}
            />
          )}
        </div>

        {isAiOpen && (
          <Suspense fallback={null}>
            <AiAssistantSidebar
              scriptSessionKey={aiScriptSessionKey}
              rawText={rawText}
              doc={doc}
              readOnly={isReadOnly}
              ruleOverrides={settings.lintRuleOverrides}
              onClose={() => setIsAiOpen(false)}
              onApplyPatchSuggestion={handleApplyAiPatchSuggestion}
              onApplyDraftSuggestion={handleApplyAiDraftSuggestion}
              onJumpToTarget={handleJumpToAiTarget}
              onActivePatchesChange={handleActiveAiPatchesChange}
              onActiveQuickScanChange={handleActiveQuickScanChange}
              onRegisterLivePatchActions={handleRegisterLivePatchActions}
            />
          </Suspense>
        )}
      </div>

      {/* Hidden File Pickers for Import (.txt / .md / .json) & Restore Backup (.json) */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".txt,.md,.markdown,.json"
        onChange={(e) => void library.handleImportFileChange(e)}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={restoreBackupInputRef}
        type="file"
        accept=".json"
        onChange={(e) => void library.handleRestoreBackupChange(e)}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      {isLibraryOpen && (
        <ScriptLibraryModal
          isOpen={isLibraryOpen}
          onClose={() => setIsLibraryOpen(false)}
          customScripts={customScripts}
          examples={BUNDLED_EXAMPLES}
          activeScript={activeScript}
          isConfirmDialogOpen={confirmRequest !== null}
          onOpenCustomScript={(record) => void library.handleOpenCustomScript(record)}
          onOpenExample={(example) => void library.handleOpenExample(example)}
          onForkExample={(example) => void library.handleForkExample(example)}
          onNewBlank={() => void library.handleNewBlank()}
          onImportFile={library.handleTriggerImportFile}
          onDuplicateScript={(record) => void library.handleDuplicateScript(record)}
          onRenameScript={(record, nextTitle) =>
            void library.handleRenameScript(record, nextTitle)
          }
          onTogglePinScript={(record) => void library.handleTogglePinScript(record)}
          onUpdateScriptMetadata={(record, patch) =>
            void library.handleUpdateScriptMetadata(record, patch)
          }
          onExportScriptTxt={(record) => void library.handleExportScriptTxt(record)}
          onBulkExportScripts={(records) => void library.handleBulkExportScripts(records)}
          onRequestDeleteScript={library.handleRequestDeleteScript}
          onRequestBulkDeleteScripts={library.handleRequestBulkDeleteScripts}
          onRequestClearLibrary={library.handleRequestClearLibrary}
        />
      )}

      {isVersionHistoryOpen && (
        <Suspense fallback={null}>
          <VersionHistoryModal
            isOpen={isVersionHistoryOpen}
            onClose={() => setIsVersionHistoryOpen(false)}
            scriptId={activeScript.id}
            scriptTitle={sceneTitle || APP_META.untitledScene}
            currentRawText={rawText}
            isReadOnly={isReadOnly}
            onForkCurrentExample={library.handleForkCurrentExample}
            onSaveMilestone={(label) =>
              library.handleCreateSnapshot({
                trigger: 'manual',
                label,
                rawText,
              })
            }
            onRestoreSnapshot={library.handleRestoreSnapshot}
            onForkSnapshot={library.handleForkSnapshotAsNewScript}
            onToast={setToastMessage}
          />
        </Suspense>
      )}

      {isDebugOpen && (
        <Suspense fallback={null}>
          <JsonIrDebugDrawer
            isOpen={isDebugOpen}
            onClose={() => setIsDebugOpen(false)}
            rawText={rawText}
            readOnly={isReadOnly}
            ruleOverrides={settings.lintRuleOverrides}
            onCommitRawText={handleCommitFromDebug}
          />
        </Suspense>
      )}

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />

      {/* Subtle transient feedback toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[120] rounded-xl border border-border-main bg-surface px-4 py-2 text-xs font-medium text-text-main shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
