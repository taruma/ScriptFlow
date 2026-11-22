import {lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {extractMetadata, lintDocument, parseAuteurScript} from './core/index.ts';
import type {AiLivePatchActionHandlers} from './components/AiAssistantSidebar.tsx';
import {ConfirmDialog, type ConfirmDialogRequest} from './components/ConfirmDialog.tsx';
import {LiveDocument} from './components/LiveDocument.tsx';
import {ScriptLibraryModal} from './components/ScriptLibraryModal.tsx';
import {SourceEditor} from './components/SourceEditor.tsx';
import {TopSlateBar, type ViewMode} from './components/TopSlateBar.tsx';
import {BUNDLED_EXAMPLES} from './data/examples/index.ts';
import type {QuickScanResult} from './services/geminiDecisions.ts';
import {resolveEditorJumpTarget} from './ui/aiAssistant.ts';
import {useEditorSettings} from './ui/editorSettings.ts';
import {APP_META, UI_LABELS} from './ui/labels.ts';
import type {ActiveAiPatchItem} from './ui/patchIndicators.ts';
import {stabilizeAestheticTokens} from './ui/referenceStability.ts';
import {useDocumentMutations} from './ui/useDocumentMutations.ts';
import {useGlobalEditorShortcuts} from './ui/useGlobalEditorShortcuts.ts';
import {resolveNarrowWorkspaceState, useNarrowViewport} from './ui/useNarrowViewport.ts';
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

const AuteurGraphView = lazy(() =>
  import('./components/canvas/AuteurGraphView.tsx').then((mod) => ({
    default: mod.AuteurGraphView,
  }))
);

const AppInfoModal = lazy(() =>
  import('./components/AppInfoModal.tsx').then((mod) => ({
    default: mod.AppInfoModal,
  }))
);

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const {settings, updateSettings} = useEditorSettings();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState<boolean>(false);
  const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);
  const [isAiOpen, setIsAiOpen] = useState<boolean>(false);
  const [hasOpenedAi, setHasOpenedAi] = useState<boolean>(false);
  const isNarrow = useNarrowViewport();
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

  // Close desktop-only drawers/modals when entering narrow read-only mode (< 640px)
  useEffect(() => {
    if (!isNarrow) return;
    setIsAiOpen(false);
    setIsDebugOpen(false);
    setIsVersionHistoryOpen(false);
  }, [isNarrow]);

  const handleToggleAi = useCallback(() => {
    setIsAiOpen((prev) => {
      const next = !prev;
      if (next) {
        setHasOpenedAi(true);
      }
      return next;
    });
  }, []);

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

  const handleSkipNextAiReset = useCallback(() => {
    skipNextAiResetRef.current = true;
  }, []);

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

  // Transient toast feedback timer
  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

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

  const {effectiveReadOnly, effectiveViewMode} = resolveNarrowWorkspaceState(
    isNarrow,
    isReadOnly,
    viewMode
  );

  const isModalOpen =
    isDebugOpen ||
    confirmRequest !== null ||
    isLibraryOpen ||
    isVersionHistoryOpen ||
    isInfoOpen;

  useGlobalEditorShortcuts({
    viewMode: effectiveViewMode,
    isReadOnly: effectiveReadOnly,
    isNarrowReadOnly: isNarrow,
    isModalOpen,
    commitRawText,
    onSwitchToLive: handleSwitchToLive,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onToast: setToastMessage,
  });

  const mutations = useDocumentMutations({
    rawText,
    sceneTitle,
    isReadOnly: effectiveReadOnly,
    ruleOverrides: settings.lintRuleOverrides,
    docRef,
    commitRawText,
    onTitleChange: handleTitleChange,
    onCreateSnapshot: library.handleCreateSnapshot,
    onForkCurrentExampleWithContent: library.handleForkCurrentExampleWithContent,
    onSkipNextAiReset: handleSkipNextAiReset,
    onRequestConfirm: setConfirmRequest,
    onToast: setToastMessage,
  });

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

  const handleChangeLiveSplit = useCallback(
    (liveSplitPercent: number) => {
      updateSettings({liveSplitPercent});
    },
    [updateSettings]
  );

  return (
    <div className="min-h-screen lg:h-dvh lg:overflow-hidden bg-app text-text-main flex flex-col">
      <TopSlateBar
        title={sceneTitle}
        onTitleChange={handleTitleChange}
        readOnly={isReadOnly}
        isNarrow={isNarrow}
        onForkExample={library.handleForkCurrentExample}
        diagnostics={diagnostics}
        onJumpToFirstDiagnostic={handleJumpToFirstDiagnostic}
        viewMode={effectiveViewMode}
        onViewModeChange={handleViewModeChange}
        onNewBlank={() => void library.handleNewBlank()}
        onDuplicateScript={() => void library.handleDuplicateActiveScript()}
        onImportFile={library.handleTriggerImportFile}
        onFormatScript={mutations.handleFormatScript}
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
        onCopyPlainText={mutations.handleCopyPlainText}
        onCopyTagless={mutations.handleCopyTagless}
        onCopyJsonEnvelope={mutations.handleCopyJsonEnvelope}
        copiedKind={mutations.copiedKind}
        onOpenDebug={isNarrow ? undefined : () => setIsDebugOpen(true)}
        onToggleAi={isNarrow ? undefined : handleToggleAi}
        isAiOpen={isAiOpen}
        onOpenInfo={() => setIsInfoOpen(true)}
        isInfoOpen={isInfoOpen}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row lg:overflow-hidden">
        <div
          className={`flex-1 min-w-0 min-h-0 lg:h-full ${
            effectiveViewMode === 'source'
              ? 'lg:overflow-y-auto auteur-pane-scroll'
              : effectiveViewMode === 'graph'
                ? 'h-[calc(100dvh-3rem)] overflow-hidden'
                : 'lg:overflow-hidden'
          }`}
        >
          {effectiveViewMode === 'live' ? (
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
              readOnly={effectiveReadOnly}
              narrowReadOnly={isNarrow}
              liveSplitPercent={settings.liveSplitPercent}
              onChangeLiveSplit={handleChangeLiveSplit}
              onUpdateStaging={mutations.handleUpdateStaging}
              onInsertStaging={mutations.handleInsertStaging}
              onDeleteStaging={mutations.handleRequestDeleteStaging}
              onReorderStaging={mutations.handleReorderStaging}
              onUpdateSubState={mutations.handleUpdateSubState}
              onInsertSubState={mutations.handleInsertSubState}
              onDeleteSubState={mutations.handleDeleteSubState}
              onMergeSubState={mutations.handleMergeSubState}
              onReorderSubState={mutations.handleReorderSubState}
              onInsertBeat={mutations.handleInsertBeat}
              onDeleteBeat={mutations.handleRequestDeleteBeat}
              onReorderBeats={mutations.handleReorderBeats}
            />
          ) : effectiveViewMode === 'source' ? (
            <SourceEditor
              rawText={rawText}
              aestheticTokens={stableAestheticTokens}
              readOnly={effectiveReadOnly}
              onChange={mutations.handleUpdateSource}
              onFormatScript={mutations.handleFormatScript}
            />
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center bg-app text-xs font-medium text-text-muted">
                  {UI_LABELS.graph.loading}
                </div>
              }
            >
              <AuteurGraphView
                doc={doc}
                metadata={metadata}
                scriptSessionKey={aiScriptSessionKey}
              />
            </Suspense>
          )}
        </div>

        {!isNarrow && hasOpenedAi && (
          <Suspense fallback={null}>
            <AiAssistantSidebar
              isOpen={isAiOpen}
              scriptSessionKey={aiScriptSessionKey}
              rawText={rawText}
              doc={doc}
              readOnly={isReadOnly}
              ruleOverrides={settings.lintRuleOverrides}
              onClose={() => setIsAiOpen(false)}
              onApplyPatchSuggestion={mutations.handleApplyAiPatchSuggestion}
              onApplyDraftSuggestion={mutations.handleApplyAiDraftSuggestion}
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
          readOnly={isNarrow}
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

      {!isNarrow && isVersionHistoryOpen && (
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

      {!isNarrow && isDebugOpen && (
        <Suspense fallback={null}>
          <JsonIrDebugDrawer
            isOpen={isDebugOpen}
            onClose={() => setIsDebugOpen(false)}
            rawText={rawText}
            readOnly={isReadOnly}
            ruleOverrides={settings.lintRuleOverrides}
            onCommitRawText={mutations.handleCommitFromDebug}
          />
        </Suspense>
      )}

      {isInfoOpen && (
        <Suspense fallback={null}>
          <AppInfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
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
