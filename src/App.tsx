import {lazy, Suspense, useCallback, useEffect, useMemo, useState} from 'react';
import {
  breakHistoryCoalescing,
  canRedoDocument,
  canUndoDocument,
  commitDocumentHistory,
  createDocumentHistory,
  deleteExecutionBeat,
  deleteExecutionSubState,
  deleteStagingBlock,
  exportPlainText,
  exportTagless,
  extractMetadata,
  insertExecutionBeat,
  insertExecutionSubState,
  insertStagingBlock,
  isMultiBlockAuteurScript,
  lintDocument,
  mergeExecutionSubStateWithPrevious,
  parseAuteurScript,
  redoDocumentHistory,
  reorderExecutionBeats,
  reorderStagingBlocks,
  undoDocumentHistory,
  updateExecutionSubState,
  updateStagingBlock,
  type DocumentHistoryState,
  type HistoryCommitMode,
  type HistoryCommitOptions,
} from './core/index.ts';
import {ConfirmDialog, type ConfirmDialogRequest} from './components/ConfirmDialog.tsx';
import {LiveDocument} from './components/LiveDocument.tsx';
import {SourceEditor} from './components/SourceEditor.tsx';
import type {StagingBlockCommitOptions} from './components/stagingBlockRegistry.ts';
import {TopSlateBar, type ViewMode} from './components/TopSlateBar.tsx';
import {
  BLANK_SCRIPT_TEMPLATE,
  DEFAULT_PRESET,
  SCRIPT_PRESETS,
  type ScriptPreset,
} from './data/presets.ts';
import {copyTextToClipboard} from './ui/clipboard.ts';
import {useEditorSettings} from './ui/editorSettings.ts';
import {matchHistoryShortcut} from './ui/historyShortcuts.ts';
import {APP_META, UI_LABELS} from './ui/labels.ts';
import {
  readSavedScript,
  readSavedTitle,
  writeSavedScript,
  writeSavedTitle,
} from './ui/scriptStorage.ts';

const JsonIrDebugDrawer = lazy(() =>
  import('./components/debug/JsonIrDebugDrawer.tsx').then((mod) => ({
    default: mod.JsonIrDebugDrawer,
  }))
);

function loadInitialScript(): string {
  return readSavedScript() ?? DEFAULT_PRESET.content;
}

function loadInitialTitle(): string {
  return readSavedTitle() ?? DEFAULT_PRESET.title;
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  return (el as HTMLElement).isContentEditable === true;
}

export default function App() {
  // Plain-Text-as-Truth: document-level Undo / Redo history over canonical raw Auteur Script
  const [history, setHistory] = useState<DocumentHistoryState>(() =>
    createDocumentHistory(loadInitialScript())
  );
  const rawText = history.present;
  const canUndo = canUndoDocument(history);
  const canRedo = canRedoDocument(history);

  const [sceneTitle, setSceneTitle] = useState<string>(loadInitialTitle);
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const {settings, updateSettings} = useEditorSettings();
  const [copiedKind, setCopiedKind] = useState<'plain' | 'tagless' | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);

  const commitRawText = useCallback(
    (
      updater: string | ((prev: string) => string),
      options: Omit<HistoryCommitOptions, 'timestamp'> = {mode: 'checkpoint'}
    ) => {
      setHistory((prev) => {
        const nextText = typeof updater === 'function' ? updater(prev.present) : updater;
        return commitDocumentHistory(prev, nextText, {
          ...options,
          timestamp: options.mode === 'coalesce' ? Date.now() : null,
        });
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setHistory((prev) => undoDocumentHistory(prev));
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((prev) => redoDocumentHistory(prev));
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setHistory((prev) => breakHistoryCoalescing(prev));
  }, []);

  // Persist canonical plain text & title to localStorage
  useEffect(() => {
    writeSavedScript(rawText);
  }, [rawText]);

  useEffect(() => {
    writeSavedTitle(sceneTitle);
  }, [sceneTitle]);

  // Transient toast timer
  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2400);
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
  const diagnostics = useMemo(() => lintDocument(doc, metadata), [doc, metadata]);

  const activePresetId = useMemo(() => {
    const normalized = exportPlainText(rawText);
    const match = SCRIPT_PRESETS.find((p) => exportPlainText(p.content) === normalized);
    return match?.id ?? null;
  }, [rawText]);

  // Global Paste-and-Hydrate with Active-Editor Guard (07 §1)
  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      if (isDebugOpen || confirmRequest) return;
      const pasted = event.clipboardData?.getData('text/plain');
      if (!pasted || pasted.trim().length === 0) return;

      const active = document.activeElement;
      const inEditable = isEditableElement(active);

      const hasMultiBlockScript = isMultiBlockAuteurScript(pasted);

      // In Source Mode inside the main textarea, let native paste work normally
      if (viewMode === 'source' && inEditable) {
        return;
      }

      // If focused inside an active block/beat editor or title input and pasting a normal inline snippet,
      // keep paste scoped normally to that active input so edits are never clobbered.
      if (inEditable && !hasMultiBlockScript) {
        return;
      }

      // Outside a focused input OR pasting a multi-block Auteur Script: hydrate immediately
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
  }, [viewMode, isDebugOpen, confirmRequest, commitRawText]);

  // Document-level Undo / Redo keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const action = matchHistoryShortcut(event);
      if (!action) return;

      // Never interfere with open modals/dialogs (ConfirmDialog, JsonIrDebugDrawer, etc.)
      if (isDebugOpen || confirmRequest !== null) return;
      if (document.querySelector('[aria-modal="true"]')) return;

      // Never interfere with non-document inputs (Scene Title, custom block header input)
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
  }, [isDebugOpen, confirmRequest, handleUndo, handleRedo]);

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
      const target = doc.stagingBlocks[blockIndex];
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
    [doc.stagingBlocks, commitRawText]
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
      const target = doc.execution?.beats.find((b) => b.index === beatIndex);
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
    [doc.execution, commitRawText]
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

  const handleSelectPreset = useCallback(
    (preset: ScriptPreset) => {
      commitRawText(preset.content, {mode: 'checkpoint'});
      setSceneTitle(preset.title);
      setViewMode('live');
    },
    [commitRawText]
  );

  const handleNewBlank = useCallback(() => {
    commitRawText(BLANK_SCRIPT_TEMPLATE, {mode: 'checkpoint'});
    setSceneTitle(APP_META.untitledScene);
    setViewMode('live');
  }, [commitRawText]);

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

  const handleCommitFromDebug = useCallback(
    (nextRawText: string, message?: string) => {
      commitRawText(nextRawText, {mode: 'checkpoint'});
      if (message) {
        setToastMessage(message);
      }
    },
    [commitRawText]
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

  const beatCount = doc.execution?.beats.length ?? 0;

  return (
    <div className="min-h-screen bg-app text-text-main flex flex-col">
      <TopSlateBar
        title={sceneTitle}
        onTitleChange={setSceneTitle}
        beatCount={beatCount}
        diagnostics={diagnostics}
        onJumpToFirstDiagnostic={handleJumpToFirstDiagnostic}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        presets={SCRIPT_PRESETS}
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        onNewBlank={handleNewBlank}
        settings={settings}
        onUpdateSettings={updateSettings}
        onCopyPlainText={handleCopyPlainText}
        onCopyTagless={handleCopyTagless}
        copiedKind={copiedKind}
        onOpenDebug={() => setIsDebugOpen(true)}
        isDebugOpen={isDebugOpen}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <div className="flex-1">
        {viewMode === 'live' ? (
          <LiveDocument
            doc={doc}
            metadata={metadata}
            diagnostics={diagnostics}
            historyRevision={history.revision}
            onUpdateStaging={handleUpdateStaging}
            onInsertStaging={handleInsertStaging}
            onDeleteStaging={handleRequestDeleteStaging}
            onReorderStaging={handleReorderStaging}
            onUpdateSubState={handleUpdateSubState}
            onInsertSubState={handleInsertSubState}
            onDeleteSubState={handleDeleteSubState}
            onMergeSubState={handleMergeSubState}
            onInsertBeat={handleInsertBeat}
            onDeleteBeat={handleRequestDeleteBeat}
            onReorderBeats={handleReorderBeats}
          />
        ) : (
          <SourceEditor
            rawText={rawText}
            aestheticTokens={metadata.aestheticTokens}
            onChange={handleUpdateSource}
          />
        )}
      </div>

      {isDebugOpen && (
        <Suspense fallback={null}>
          <JsonIrDebugDrawer
            isOpen={isDebugOpen}
            onClose={() => setIsDebugOpen(false)}
            rawText={rawText}
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
