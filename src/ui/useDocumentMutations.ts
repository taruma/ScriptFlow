import {useCallback, useEffect, useState, type RefObject} from 'react';
import {
  deleteExecutionBeat,
  deleteExecutionSubState,
  deleteStagingBlock,
  exportPlainText,
  exportTagless,
  formatAuteurScript,
  insertExecutionBeat,
  insertExecutionSubState,
  insertStagingBlock,
  mergeExecutionSubStateWithPrevious,
  reorderExecutionBeats,
  reorderExecutionSubStates,
  reorderStagingBlocks,
  toAuteurEnvelope,
  updateExecutionSubState,
  updateStagingBlock,
  type AuteurDocument,
  type HistoryCommitMode,
  type LintRuleOverrides,
} from '../core/index.ts';
import type {ConfirmDialogRequest} from '../components/ConfirmDialog.tsx';
import type {StagingBlockCommitOptions} from '../components/stagingBlockRegistry.ts';
import type {CopyFormatKind} from '../components/TopSlateBar.tsx';
import type {DraftSuggestion, PatchSuggestion, TitleSuggestion} from '../services/scriptTools.ts';
import {copyTextToClipboard} from './clipboard.ts';
import {APP_META, UI_LABELS} from './labels.ts';
import {buildAiSnapshotLabel} from './scriptSnapshots.ts';
import type {UseScriptLibraryResult} from './useScriptLibrary.ts';

export interface UseDocumentMutationsOptions {
  rawText: string;
  sceneTitle: string;
  isReadOnly: boolean;
  ruleOverrides: LintRuleOverrides;
  docRef: RefObject<AuteurDocument>;
  commitRawText: UseScriptLibraryResult['commitRawText'];
  onTitleChange: UseScriptLibraryResult['handleTitleChange'];
  onFlushPendingSave: UseScriptLibraryResult['flushPendingSave'];
  onCreateSnapshot: UseScriptLibraryResult['handleCreateSnapshot'];
  onForkCurrentExampleWithContent: UseScriptLibraryResult['handleForkCurrentExampleWithContent'];
  onSkipNextAiReset: () => void;
  onRequestConfirm: (request: ConfirmDialogRequest) => void;
  onToast: (message: string) => void;
}

export interface UseDocumentMutationsResult {
  copiedKind: CopyFormatKind | null;
  handleUpdateStaging: (
    blockIndex: number,
    nextBody: string,
    options?: StagingBlockCommitOptions
  ) => void;
  handleInsertStaging: (headerName: string, afterBlockIndex?: number) => void;
  handleRequestDeleteStaging: (blockIndex: number) => void;
  handleReorderStaging: (fromBlockIndex: number, toBlockIndex: number) => void;
  handleUpdateSubState: (
    beatIndex: number,
    subStateIndex: number,
    nextSubStateRaw: string,
    mode?: HistoryCommitMode
  ) => void;
  handleInsertSubState: (
    beatIndex: number,
    afterSubStateIndex: number,
    starterText: string,
    mode?: HistoryCommitMode
  ) => void;
  handleDeleteSubState: (beatIndex: number, subStateIndex: number) => void;
  handleMergeSubState: (beatIndex: number, subStateIndex: number) => void;
  handleReorderSubState: (
    beatIndex: number,
    fromSubStateIndex: number,
    toSubStateIndex: number
  ) => void;
  handleInsertBeat: (afterBeatIndex: number, starterLine: string) => void;
  handleRequestDeleteBeat: (beatIndex: number) => void;
  handleReorderBeats: (fromBeatIndex: number, toBeatIndex: number) => void;
  handleUpdateSource: (nextRawText: string) => void;
  handleCommitSourceCheckpoint: (nextRawText: string, toastMessage?: string) => void;
  handleFormatScript: () => void;
  handleCopyPlainText: () => Promise<void>;
  handleCopyTagless: () => Promise<void>;
  handleCopyJsonEnvelope: () => Promise<void>;
  handleCommitFromDebug: (nextRawText: string, message?: string) => void;
  handleApplyAiPatchSuggestion: (
    suggestion: PatchSuggestion,
    kind: 'patch' | 'fix',
    options?: {batchCount?: number}
  ) => Promise<boolean>;
  handleApplyAiDraftSuggestion: (suggestion: DraftSuggestion) => Promise<boolean>;
  handleApplyAiTitleSuggestion: (suggestion: TitleSuggestion) => Promise<boolean>;
}

/**
 * Memoized pure serializer mutations, clipboard exports, debug commits, and AI patch/draft
 * application handlers for the top-level editor shell.
 *
 * All Live Mode row/card mutation handlers avoid depending on `rawText` or `doc` directly
 * so `memo()`'d Staging and Execution rows keep stable callback references across keystrokes.
 */
export function useDocumentMutations({
  rawText,
  sceneTitle,
  isReadOnly,
  ruleOverrides,
  docRef,
  commitRawText,
  onTitleChange,
  onFlushPendingSave,
  onCreateSnapshot,
  onForkCurrentExampleWithContent,
  onSkipNextAiReset,
  onRequestConfirm,
  onToast,
}: UseDocumentMutationsOptions): UseDocumentMutationsResult {
  const [copiedKind, setCopiedKind] = useState<CopyFormatKind | null>(null);

  useEffect(() => {
    if (!copiedKind) return;
    const timer = window.setTimeout(() => setCopiedKind(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedKind]);

  // Staging Macro-Block mutations
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
      onRequestConfirm({
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
    [isReadOnly, docRef, commitRawText, onRequestConfirm]
  );

  const handleReorderStaging = useCallback(
    (fromBlockIndex: number, toBlockIndex: number) => {
      commitRawText((prev) => reorderStagingBlocks(prev, fromBlockIndex, toBlockIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  // Execution Macro-State & Sub-State mutations
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
      onRequestConfirm({
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
    [isReadOnly, docRef, commitRawText, onRequestConfirm]
  );

  const handleReorderBeats = useCallback(
    (fromBeatIndex: number, toBeatIndex: number) => {
      commitRawText((prev) => reorderExecutionBeats(prev, fromBeatIndex, toBeatIndex), {
        mode: 'checkpoint',
      });
    },
    [commitRawText]
  );

  // Source mode & formatting mutations
  const handleUpdateSource = useCallback(
    (nextRawText: string) => {
      commitRawText(nextRawText, {mode: 'coalesce', groupKey: 'source'});
    },
    [commitRawText]
  );

  const handleCommitSourceCheckpoint = useCallback(
    (nextRawText: string, toastMessage?: string) => {
      if (isReadOnly) return;
      commitRawText(nextRawText, {mode: 'checkpoint'});
      if (toastMessage) {
        onToast(toastMessage);
      }
    },
    [isReadOnly, commitRawText, onToast]
  );

  const handleFormatScript = useCallback(() => {
    if (isReadOnly) return;
    const formatted = formatAuteurScript(rawText);
    if (formatted === rawText) {
      onToast(UI_LABELS.toasts.scriptAlreadyFormatted);
      return;
    }
    commitRawText(formatted, {mode: 'checkpoint'});
    onToast(UI_LABELS.toasts.scriptFormatted);
  }, [isReadOnly, rawText, commitRawText, onToast]);

  // Clipboard export & Debug commit
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
    const envelope = toAuteurEnvelope(rawText, ruleOverrides);
    const text = JSON.stringify(envelope, null, 2);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKind('json');
    }
  }, [rawText, ruleOverrides]);

  const handleCommitFromDebug = useCallback(
    (nextRawText: string, message?: string) => {
      if (isReadOnly) return;
      commitRawText(nextRawText, {mode: 'checkpoint'});
      if (message) {
        onToast(message);
      }
    },
    [isReadOnly, commitRawText, onToast]
  );

  // AI Patch / Fix & Draft application (with Fork & Apply for read-only bundled examples)
  const handleApplyAiPatchSuggestion = useCallback(
    async (
      suggestion: PatchSuggestion,
      kind: 'patch' | 'fix',
      options?: {batchCount?: number}
    ): Promise<boolean> => {
      const trigger = kind === 'fix' ? 'ai_fix' : 'ai_patch';
      const beforeLabel = buildAiSnapshotLabel(trigger, suggestion.summary, {
        ...options,
        phase: 'before',
      });
      const afterLabel = buildAiSnapshotLabel(trigger, suggestion.summary, {
        ...options,
        phase: 'after',
      });
      if (isReadOnly) {
        onSkipNextAiReset();
        return onForkCurrentExampleWithContent(suggestion.candidateRawText, {
          ...(suggestion.title ? {title: suggestion.title} : {}),
          snapshotMeta: {trigger, beforeLabel, afterLabel},
        });
      }
      const previousRawText = rawText;
      const nextRawText = suggestion.candidateRawText;
      const nextTitle = suggestion.title ? suggestion.title : sceneTitle;
      commitRawText(nextRawText, {mode: 'checkpoint'});
      if (suggestion.title) {
        onTitleChange(suggestion.title);
      }
      onToast(
        kind === 'fix'
          ? options?.batchCount && options.batchCount > 1
            ? UI_LABELS.toasts.aiFixesBatchApplied(options.batchCount)
            : UI_LABELS.toasts.aiFixApplied
          : UI_LABELS.toasts.aiPatchApplied
      );
      await onFlushPendingSave({
        rawText: nextRawText,
        ...(suggestion.title ? {title: nextTitle} : {}),
      });
      if (previousRawText !== nextRawText) {
        await onCreateSnapshot({
          trigger,
          label: beforeLabel,
          rawText: previousRawText,
        });
      }
      await onCreateSnapshot({
        trigger,
        label: afterLabel,
        rawText: nextRawText,
      });
      return true;
    },
    [
      isReadOnly,
      rawText,
      sceneTitle,
      commitRawText,
      onTitleChange,
      onFlushPendingSave,
      onCreateSnapshot,
      onForkCurrentExampleWithContent,
      onSkipNextAiReset,
      onToast,
    ]
  );

  const handleApplyAiDraftSuggestion = useCallback(
    async (suggestion: DraftSuggestion): Promise<boolean> => {
      const detail = suggestion.title || suggestion.summary;
      const beforeLabel = buildAiSnapshotLabel('ai_draft', detail, {phase: 'before'});
      const afterLabel = buildAiSnapshotLabel('ai_draft', detail, {phase: 'after'});
      if (isReadOnly) {
        onSkipNextAiReset();
        return onForkCurrentExampleWithContent(suggestion.candidateRawText, {
          title: suggestion.title,
          snapshotMeta: {trigger: 'ai_draft', beforeLabel, afterLabel},
        });
      }
      const previousRawText = rawText;
      const nextRawText = suggestion.candidateRawText;
      const shouldUpdateTitle =
        Boolean(suggestion.title) &&
        (sceneTitle.trim() === '' || sceneTitle.startsWith(APP_META.untitledScene));
      const nextTitle = shouldUpdateTitle ? suggestion.title! : sceneTitle;
      commitRawText(nextRawText, {mode: 'checkpoint'});
      if (shouldUpdateTitle) {
        onTitleChange(nextTitle);
      }
      onToast(UI_LABELS.toasts.aiDraftApplied);
      await onFlushPendingSave({rawText: nextRawText, title: nextTitle});
      if (previousRawText !== nextRawText) {
        await onCreateSnapshot({
          trigger: 'ai_draft',
          label: beforeLabel,
          rawText: previousRawText,
        });
      }
      await onCreateSnapshot({
        trigger: 'ai_draft',
        label: afterLabel,
        rawText: nextRawText,
      });
      return true;
    },
    [
      isReadOnly,
      rawText,
      sceneTitle,
      commitRawText,
      onTitleChange,
      onFlushPendingSave,
      onCreateSnapshot,
      onForkCurrentExampleWithContent,
      onSkipNextAiReset,
      onToast,
    ]
  );

  const handleApplyAiTitleSuggestion = useCallback(
    async (suggestion: TitleSuggestion): Promise<boolean> => {
      if (isReadOnly) {
        onSkipNextAiReset();
        return onForkCurrentExampleWithContent(rawText, {
          title: suggestion.title,
        });
      }
      onTitleChange(suggestion.title);
      onToast(UI_LABELS.toasts.aiTitleApplied);
      await onFlushPendingSave({title: suggestion.title});
      return true;
    },
    [
      isReadOnly,
      rawText,
      onTitleChange,
      onFlushPendingSave,
      onForkCurrentExampleWithContent,
      onSkipNextAiReset,
      onToast,
    ]
  );

  return {
    copiedKind,
    handleUpdateStaging,
    handleInsertStaging,
    handleRequestDeleteStaging,
    handleReorderStaging,
    handleUpdateSubState,
    handleInsertSubState,
    handleDeleteSubState,
    handleMergeSubState,
    handleReorderSubState,
    handleInsertBeat,
    handleRequestDeleteBeat,
    handleReorderBeats,
    handleUpdateSource,
    handleCommitSourceCheckpoint,
    handleFormatScript,
    handleCopyPlainText,
    handleCopyTagless,
    handleCopyJsonEnvelope,
    handleCommitFromDebug,
    handleApplyAiPatchSuggestion,
    handleApplyAiDraftSuggestion,
    handleApplyAiTitleSuggestion,
  };
}
