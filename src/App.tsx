import {useCallback, useEffect, useMemo, useState} from 'react';
import {
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
  reorderExecutionBeats,
  updateExecutionSubState,
  updateStagingBlock,
} from './core/index.ts';
import {ConfirmDialog, type ConfirmDialogRequest} from './components/ConfirmDialog.tsx';
import {LiveDocument} from './components/LiveDocument.tsx';
import {SourceEditor} from './components/SourceEditor.tsx';
import {TopSlateBar, type ViewMode} from './components/TopSlateBar.tsx';
import {JsonIrDebugDrawer} from './components/debug/JsonIrDebugDrawer.tsx';
import {
  BLANK_SCRIPT_TEMPLATE,
  DEFAULT_PRESET,
  SCRIPT_PRESETS,
  type ScriptPreset,
} from './data/presets.ts';
import {useEditorSettings} from './ui/editorSettings.ts';
import {APP_META, UI_LABELS} from './ui/labels.ts';

const SCRIPT_STORAGE_KEY = 'auteur-editor-raw-script-v1';
const TITLE_STORAGE_KEY = 'auteur-editor-scene-title-v1';

function loadInitialScript(): string {
  try {
    const saved = window.localStorage.getItem(SCRIPT_STORAGE_KEY);
    if (saved && saved.trim().length > 0) {
      return saved;
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_PRESET.content;
}

function loadInitialTitle(): string {
  try {
    const saved = window.localStorage.getItem(TITLE_STORAGE_KEY);
    if (saved && saved.trim().length > 0) {
      return saved;
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_PRESET.title;
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  return (el as HTMLElement).isContentEditable === true;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy textarea copy
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export default function App() {
  // Plain-Text-as-Truth: canonical raw Auteur Script string
  const [rawText, setRawText] = useState<string>(loadInitialScript);
  const [sceneTitle, setSceneTitle] = useState<string>(loadInitialTitle);
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const {settings, updateSettings} = useEditorSettings();
  const [copiedKind, setCopiedKind] = useState<'plain' | 'tagless' | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);

  // Persist canonical plain text & title to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(SCRIPT_STORAGE_KEY, rawText);
    } catch {
      // Ignore storage quota errors
    }
  }, [rawText]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TITLE_STORAGE_KEY, sceneTitle);
    } catch {
      // Ignore storage quota errors
    }
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
      setRawText(pasted.replace(/\r\n?/g, '\n'));
      setViewMode('live');
      setToastMessage(UI_LABELS.toasts.scriptHydrated);
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [viewMode, isDebugOpen, confirmRequest]);

  // Pure Serializer Mutations
  const handleUpdateStaging = useCallback((blockIndex: number, nextBody: string) => {
    setRawText((prev) => updateStagingBlock(prev, blockIndex, nextBody));
  }, []);

  const handleInsertStaging = useCallback((headerName: string, afterBlockIndex?: number) => {
    setRawText((prev) => insertStagingBlock(prev, headerName, '', afterBlockIndex));
  }, []);

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
          setRawText((prev) => deleteStagingBlock(prev, blockIndex));
        },
      });
    },
    [doc.stagingBlocks]
  );

  const handleUpdateSubState = useCallback(
    (beatIndex: number, subStateIndex: number, nextSubStateRaw: string) => {
      setRawText((prev) =>
        updateExecutionSubState(prev, beatIndex, subStateIndex, nextSubStateRaw)
      );
    },
    []
  );

  const handleInsertSubState = useCallback(
    (beatIndex: number, afterSubStateIndex: number, starterText: string) => {
      setRawText((prev) =>
        insertExecutionSubState(prev, beatIndex, afterSubStateIndex, starterText)
      );
    },
    []
  );

  const handleDeleteSubState = useCallback((beatIndex: number, subStateIndex: number) => {
    setRawText((prev) => deleteExecutionSubState(prev, beatIndex, subStateIndex));
  }, []);

  const handleMergeSubState = useCallback((beatIndex: number, subStateIndex: number) => {
    setRawText((prev) => mergeExecutionSubStateWithPrevious(prev, beatIndex, subStateIndex));
  }, []);

  const handleInsertBeat = useCallback((afterBeatIndex: number, starterLine: string) => {
    setRawText((prev) => insertExecutionBeat(prev, afterBeatIndex, starterLine));
  }, []);

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
          setRawText((prev) => deleteExecutionBeat(prev, beatIndex));
        },
      });
    },
    [doc.execution]
  );

  const handleReorderBeats = useCallback((fromBeatIndex: number, toBeatIndex: number) => {
    setRawText((prev) => reorderExecutionBeats(prev, fromBeatIndex, toBeatIndex));
  }, []);

  const handleSelectPreset = useCallback((preset: ScriptPreset) => {
    setRawText(preset.content);
    setSceneTitle(preset.title);
    setViewMode('live');
  }, []);

  const handleNewBlank = useCallback(() => {
    setRawText(BLANK_SCRIPT_TEMPLATE);
    setSceneTitle(APP_META.untitledScene);
    setViewMode('live');
  }, []);

  const handleCopyPlainText = useCallback(async () => {
    const text = exportPlainText(rawText);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKind('plain');
    }
  }, [rawText]);

  const handleCopyTagless = useCallback(async () => {
    const text = exportTagless(rawText);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKind('tagless');
    }
  }, [rawText]);

  const handleCommitFromDebug = useCallback((nextRawText: string, message?: string) => {
    setRawText(nextRawText);
    if (message) {
      setToastMessage(message);
    }
  }, []);

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
        onViewModeChange={setViewMode}
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
      />

      <div className="flex-1">
        {viewMode === 'live' ? (
          <LiveDocument
            doc={doc}
            metadata={metadata}
            diagnostics={diagnostics}
            onUpdateStaging={handleUpdateStaging}
            onInsertStaging={handleInsertStaging}
            onDeleteStaging={handleRequestDeleteStaging}
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
            onChange={setRawText}
          />
        )}
      </div>

      <JsonIrDebugDrawer
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        rawText={rawText}
        onCommitRawText={handleCommitFromDebug}
      />

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
