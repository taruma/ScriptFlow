import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {AuteurLensPresetId, LintRuleOverrides} from '../../../core/index.ts';
import type {AskQuestionMode, AssistantFocus} from '../../../services/auteurKnowledge.ts';
import {
  AUDIT_LENS_PRESET_IDS,
  buildQuickScanEscalationPrompt,
  runQuickScan,
  type QuickScanResult,
} from '../../../services/geminiDecisions.ts';
import {
  GeminiServiceError,
  runGeminiAgentTurn,
} from '../../../services/geminiInteractions.ts';
import type {
  DraftSuggestion,
  PatchSuggestion,
  QuestionSuggestion,
  StagedSuggestion,
  TitleSuggestion,
} from '../../../services/scriptTools.ts';
import {
  buildAuditQuickPrompt,
  buildScopedRefinePrompt,
  collectPendingBriefAttachments,
  focusToLegacyMode,
  formatQuestionAnswersPrompt,
  getLatestActiveQuickScan,
  isSuggestionStale,
  type AiChatMessage,
  type AiTargetScope,
  type AuditQuickCheckId,
  type DraftBriefState,
  type QuestionAnswerDraft,
} from '../../../ui/aiAssistant.ts';
import {
  appendTextDeltaInMessages,
  appendThoughtSummaryDeltaInMessages,
  applyBatchFixesReceiptToMessages,
  applyPatchReceiptToMessages,
  completeAssistantTurnInMessages,
  completeQuickScanInMessages,
  dismissQuickScanInMessages,
  failAssistantTurnInMessages,
  failQuickScanInMessages,
  markQuestionAnsweredInMessages,
  markSuggestionAppliedInMessages,
  markSuggestionDismissedInMessages,
  recordSkillLoadedInMessages,
  recordToolCallResultInMessages,
  recordToolCallStartInMessages,
  stageSuggestionInMessages,
} from '../../../ui/ai/messageReducers.ts';
import type {GeminiModelId, QuickScanSensitivity, ReasoningLevel} from '../../../ui/aiSettings.ts';
import type {AiSkillsState} from '../../../ui/aiSkillsStore.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {collectActiveAiPatches, type ActiveAiPatchItem} from '../../../ui/patchIndicators.ts';
import type {QuickScanRulesState} from '../../../ui/quickScanRulesStore.ts';

const EMPTY_ACTIVE_PATCHES: ActiveAiPatchItem[] = [];

export interface AiLivePatchActionHandlers {
  applyPatchById: (patchId: string) => void;
  dismissPatchById: (patchId: string) => void;
  auditQuickScanBeat?: (beatIndex: number) => void;
}

export interface SubmitPromptOptions {
  overrideFocus?: AssistantFocus;
  displayText?: string;
  scopeLabel?: string;
  askQuestionMode?: AskQuestionMode;
}

export interface UseAiChatOrchestratorOptions {
  isOpen: boolean;
  scriptSessionKey: string;
  rawText: string;
  sceneTitle?: string;
  ruleOverrides?: LintRuleOverrides;
  focus: AssistantFocus;
  isEmpty: boolean;
  currentSnapshotHash: string;
  activeTarget: AiTargetScope;
  brief: DraftBriefState;
  briefIsActive: boolean;
  briefSummaryLabel: string | undefined;
  activeReferenceHandles: readonly string[];
  activeBriefContext: string | undefined;
  hasApiKey: boolean;
  apiKey: string;
  model: GeminiModelId;
  reasoningLevel: ReasoningLevel;
  quickScanSensitivity: QuickScanSensitivity;
  skillsState: AiSkillsState;
  quickScanRulesState: QuickScanRulesState;
  onApplyPatchSuggestion: (
    suggestion: PatchSuggestion,
    kind: 'patch' | 'fix',
    options?: {batchCount?: number}
  ) => Promise<boolean> | boolean;
  onApplyDraftSuggestion: (suggestion: DraftSuggestion) => Promise<boolean> | boolean;
  onApplyTitleSuggestion: (suggestion: TitleSuggestion) => Promise<boolean> | boolean;
  onActivePatchesChange?: (patches: ActiveAiPatchItem[]) => void;
  onActiveQuickScanChange?: (quickScan: QuickScanResult | null) => void;
  onRegisterLivePatchActions?: (actions: AiLivePatchActionHandlers | null) => void;
  onLastTurnSnapshotHashChange: (hash: string | undefined) => void;
  onLastTurnRawTextChange: (rawText: string | undefined) => void;
  onOpenSettings: () => void;
  onStreamStart: () => void;
  onResetChatUi: () => void;
  onScriptSwitchReset: () => void;
  onDraftApplied: () => void;
  onClearAskFirst: () => void;
}

export interface AiChatOrchestrator {
  messages: AiChatMessage[];
  isStreaming: boolean;
  submitPrompt: (rawUserPrompt: string, options?: SubmitPromptOptions) => Promise<void>;
  handleStopRun: () => void;
  handleResetChat: () => void;
  handleQuickAudit: (checkId: AuditQuickCheckId) => void;
  handleQuickScan: () => Promise<void>;
  handleDismissQuickScan: (messageId: string) => void;
  handleDeepAuditFromQuickScan: (
    selectedLenses: AuteurLensPresetId[],
    result: QuickScanResult,
    targetBeatIndex?: number
  ) => void;
  handleApplyPatch: (
    messageId: string,
    suggestion: PatchSuggestion,
    kind: 'patch' | 'fix'
  ) => Promise<void>;
  handleApplyAuditFixesBatch: (
    messageId: string,
    batchPatch: PatchSuggestion,
    includedFixIds: string[]
  ) => Promise<void>;
  handleApplyDraft: (messageId: string, suggestion: DraftSuggestion) => Promise<void>;
  handleApplyTitle: (messageId: string, suggestion: TitleSuggestion) => Promise<void>;
  handleSubmitQuestionAnswers: (
    messageId: string,
    suggestion: QuestionSuggestion,
    answers: Record<string, QuestionAnswerDraft>
  ) => void;
  markSuggestionApplied: (messageId: string, suggestionId: string) => void;
  markSuggestionDismissed: (messageId: string, suggestionId: string) => void;
}

export function useAiChatOrchestrator({
  isOpen,
  scriptSessionKey,
  rawText,
  sceneTitle,
  ruleOverrides,
  focus,
  isEmpty,
  currentSnapshotHash,
  activeTarget,
  brief,
  briefIsActive,
  briefSummaryLabel,
  activeReferenceHandles,
  activeBriefContext,
  hasApiKey,
  apiKey,
  model,
  reasoningLevel,
  quickScanSensitivity,
  skillsState,
  quickScanRulesState,
  onApplyPatchSuggestion,
  onApplyDraftSuggestion,
  onApplyTitleSuggestion,
  onActivePatchesChange,
  onActiveQuickScanChange,
  onRegisterLivePatchActions,
  onLastTurnSnapshotHashChange,
  onLastTurnRawTextChange,
  onOpenSettings,
  onStreamStart,
  onResetChatUi,
  onScriptSwitchReset,
  onDraftApplied,
  onClearAskFirst,
}: UseAiChatOrchestratorOptions): AiChatOrchestrator {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  const lastInteractionIdRef = useRef<string | undefined>(undefined);
  const lastTurnSnapshotHashRef = useRef<string | undefined>(undefined);
  const lastTurnRawTextRef = useRef<string | undefined>(undefined);
  const sentAttachmentFingerprintsRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<number>(0);
  const lastSessionKeyRef = useRef<string>(scriptSessionKey);

  const activePatches = useMemo(
    () => (isOpen ? collectActiveAiPatches(messages, currentSnapshotHash) : EMPTY_ACTIVE_PATCHES),
    [isOpen, messages, currentSnapshotHash]
  );

  const activeQuickScan = useMemo(
    () => (isOpen ? getLatestActiveQuickScan(messages, currentSnapshotHash) : null),
    [isOpen, messages, currentSnapshotHash]
  );

  useEffect(() => {
    onActivePatchesChange?.(isOpen ? activePatches : EMPTY_ACTIVE_PATCHES);
  }, [isOpen, activePatches, onActivePatchesChange]);

  useEffect(() => {
    return () => {
      onActivePatchesChange?.(EMPTY_ACTIVE_PATCHES);
    };
  }, [onActivePatchesChange]);

  useEffect(() => {
    onActiveQuickScanChange?.(isOpen ? activeQuickScan : null);
  }, [isOpen, activeQuickScan, onActiveQuickScanChange]);

  useEffect(() => {
    return () => {
      onActiveQuickScanChange?.(null);
    };
  }, [onActiveQuickScanChange]);

  const handleStopRun = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleResetChat = useCallback(() => {
    activeRunIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    lastInteractionIdRef.current = undefined;
    lastTurnSnapshotHashRef.current = undefined;
    lastTurnRawTextRef.current = undefined;
    sentAttachmentFingerprintsRef.current.clear();
    onLastTurnSnapshotHashChange(undefined);
    onLastTurnRawTextChange(undefined);
    onResetChatUi();
    setMessages([]);
  }, [onLastTurnSnapshotHashChange, onLastTurnRawTextChange, onResetChatUi]);

  // Reset in-memory chat, interaction chain, and brief tray automatically when switching scripts
  useEffect(() => {
    if (lastSessionKeyRef.current !== scriptSessionKey) {
      lastSessionKeyRef.current = scriptSessionKey;
      handleResetChat();
      onScriptSwitchReset();
    }
  }, [scriptSessionKey, handleResetChat, onScriptSwitchReset]);

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const submitPrompt = useCallback(
    async (rawUserPrompt: string, options?: SubmitPromptOptions) => {
      const activeFocus = options?.overrideFocus ?? focus;
      const legacyMode = focusToLegacyMode(activeFocus, isEmpty);
      const effectiveAskMode: AskQuestionMode =
        activeFocus === 'audit' ? 'off' : (options?.askQuestionMode ?? 'off');
      const trimmed = rawUserPrompt.trim();
      if (!trimmed || isStreaming) return;

      if (!hasApiKey) {
        onOpenSettings();
        return;
      }

      const useTargetScope =
        !options?.displayText &&
        !isEmpty &&
        (activeFocus === 'auto' || activeFocus === 'refine') &&
        activeTarget.kind !== 'whole';

      const effectivePrompt = useTargetScope
        ? buildScopedRefinePrompt(trimmed, activeTarget)
        : trimmed;

      const scopeLabel = options?.scopeLabel ?? (useTargetScope ? activeTarget.label : undefined);
      const briefSummary = briefIsActive ? briefSummaryLabel : undefined;
      const pendingAttachments = collectPendingBriefAttachments(
        brief,
        sentAttachmentFingerprintsRef.current,
        Boolean(lastInteractionIdRef.current)
      );

      const userMessageId = `msg-u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const assistantMessageId = `msg-a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

      const userMessage: AiChatMessage = {
        id: userMessageId,
        role: 'user',
        mode: legacyMode,
        focus: activeFocus,
        text: options?.displayText ?? trimmed,
        ...(scopeLabel ? {scopeLabel} : {}),
        ...(briefSummary ? {briefSummary} : {}),
        ...(effectiveAskMode === 'ask_first' ? {askFirst: true} : {}),
      };

      const turnSnapshotHash = currentSnapshotHash;
      const turnRawText = rawText;

      const initialAssistantMessage: AiChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        mode: legacyMode,
        focus: activeFocus,
        text: '',
        thoughtSummary: '',
        toolCalls: [],
        loadedSkills: [],
        suggestions: [],
        dismissedSuggestionIds: [],
        appliedSuggestionIds: [],
        isStreaming: true,
      };

      onStreamStart();
      setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const runId = ++activeRunIdRef.current;

      try {
        const result = await runGeminiAgentTurn({
          apiKey,
          model,
          reasoningLevel,
          mode: legacyMode,
          focus: activeFocus,
          prompt: effectivePrompt,
          rawText,
          sceneTitle,
          ruleOverrides,
          previousInteractionId: lastInteractionIdRef.current,
          previousSnapshotHash: lastTurnSnapshotHashRef.current,
          previousRawText: lastTurnRawTextRef.current,
          foundationalCraftOverride: skillsState.foundationalCraftOverride ?? undefined,
          skillOverrides: skillsState.skillOverrides,
          customSkills: skillsState.customSkills,
          referenceHandles: activeReferenceHandles,
          briefContext: activeBriefContext,
          askQuestionMode: effectiveAskMode,
          attachments: pendingAttachments,
          signal: controller.signal,
          callbacks: {
            onInteractionId: (interactionId) => {
              if (activeRunIdRef.current !== runId) return;
              lastInteractionIdRef.current = interactionId;
            },
            onThoughtSummaryDelta: (delta) => {
              if (activeRunIdRef.current !== runId) return;
              setMessages((prev) =>
                appendThoughtSummaryDeltaInMessages(prev, assistantMessageId, delta)
              );
            },
            onTextDelta: (delta) => {
              if (activeRunIdRef.current !== runId) return;
              setMessages((prev) => appendTextDeltaInMessages(prev, assistantMessageId, delta));
            },
            onToolCallStart: (call) => {
              if (activeRunIdRef.current !== runId) return;
              setMessages((prev) => recordToolCallStartInMessages(prev, assistantMessageId, call));
            },
            onToolCallResult: (trace) => {
              if (activeRunIdRef.current !== runId) return;
              setMessages((prev) =>
                recordToolCallResultInMessages(prev, assistantMessageId, trace)
              );
            },
            onSkillLoaded: (skillEvent) => {
              if (activeRunIdRef.current !== runId) return;
              setMessages((prev) =>
                recordSkillLoadedInMessages(prev, assistantMessageId, skillEvent)
              );
            },
            onSuggestionStaged: (suggestion: StagedSuggestion) => {
              if (activeRunIdRef.current !== runId) return;
              setMessages((prev) =>
                stageSuggestionInMessages(prev, assistantMessageId, suggestion)
              );
            },
          },
        });

        if (activeRunIdRef.current !== runId) return;

        if (result.interactionId) {
          lastInteractionIdRef.current = result.interactionId;
          for (const att of pendingAttachments) {
            sentAttachmentFingerprintsRef.current.add(att.fingerprint);
          }
        }
        lastTurnSnapshotHashRef.current = turnSnapshotHash;
        lastTurnRawTextRef.current = turnRawText;
        onLastTurnSnapshotHashChange(turnSnapshotHash);
        onLastTurnRawTextChange(turnRawText);

        setMessages((prev) =>
          completeAssistantTurnInMessages(prev, assistantMessageId, {
            text: result.text,
            thoughtSummary: result.thoughtSummary,
            hitToolRoundLimit: result.hitToolRoundLimit,
            trace: result.trace,
          })
        );
      } catch (err) {
        if (activeRunIdRef.current !== runId) return;
        const serviceErr =
          err instanceof GeminiServiceError
            ? err
            : new GeminiServiceError(
                'api_error',
                err instanceof Error ? err.message : 'Unexpected Gemini error.'
              );

        setMessages((prev) =>
          failAssistantTurnInMessages(prev, assistantMessageId, {
            code: serviceErr.code,
            message: serviceErr.message,
            trace: serviceErr.trace,
          })
        );
      } finally {
        if (activeRunIdRef.current === runId) {
          abortControllerRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [
      focus,
      isEmpty,
      brief,
      briefIsActive,
      briefSummaryLabel,
      activeReferenceHandles,
      activeBriefContext,
      isStreaming,
      hasApiKey,
      activeTarget,
      currentSnapshotHash,
      apiKey,
      model,
      reasoningLevel,
      rawText,
      sceneTitle,
      ruleOverrides,
      skillsState.foundationalCraftOverride,
      skillsState.skillOverrides,
      skillsState.customSkills,
      onOpenSettings,
      onStreamStart,
      onLastTurnSnapshotHashChange,
      onLastTurnRawTextChange,
    ]
  );

  const handleQuickAudit = useCallback(
    (checkId: AuditQuickCheckId) => {
      const displayLabel =
        checkId === 'all'
          ? UI_LABELS.ai.auditQuickAll
          : UI_LABELS.ai.auditQuickLensShort[checkId];
      void submitPrompt(buildAuditQuickPrompt(checkId), {
        overrideFocus: 'audit',
        displayText: `Audit: ${displayLabel}`,
      });
    },
    [submitPrompt]
  );

  const handleQuickScan = useCallback(async () => {
    if (isStreaming || isEmpty) return;

    if (!hasApiKey) {
      onOpenSettings();
      return;
    }

    const userMsgId = `msg-u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const assistantMsgId = `msg-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const runId = ++activeRunIdRef.current;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);
    onStreamStart();

    const briefForTurn = briefIsActive ? activeBriefContext : undefined;
    const allBriefAttachments = briefIsActive
      ? collectPendingBriefAttachments(brief, new Set(), false)
      : undefined;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        mode: 'check',
        focus: 'audit',
        text: UI_LABELS.ai.quickScanButton,
        ...(briefIsActive && briefSummaryLabel ? {briefSummary: briefSummaryLabel} : {}),
      },
      {
        id: assistantMsgId,
        role: 'assistant',
        mode: 'check',
        focus: 'audit',
        text: '',
        isStreaming: true,
      },
    ]);

    try {
      const {result, trace} = await runQuickScan({
        apiKey,
        rawText,
        sensitivity: quickScanSensitivity,
        lintRuleOverrides: ruleOverrides,
        ruleOverrides: quickScanRulesState.ruleOverrides,
        customRules: quickScanRulesState.customRules,
        briefContext: briefForTurn,
        attachments: allBriefAttachments,
        signal: controller.signal,
      });

      if (activeRunIdRef.current !== runId) return;

      setMessages((prev) => completeQuickScanInMessages(prev, assistantMsgId, result, trace));
    } catch (error) {
      if (activeRunIdRef.current !== runId) return;

      const normalized =
        error instanceof GeminiServiceError
          ? error
          : new GeminiServiceError(
              'api_error',
              error instanceof Error ? error.message : 'Quick Scan request failed.'
            );

      setMessages((prev) =>
        failQuickScanInMessages(prev, assistantMsgId, {
          code: normalized.code,
          message: normalized.message,
        })
      );
    } finally {
      if (activeRunIdRef.current === runId) {
        abortControllerRef.current = null;
        setIsStreaming(false);
      }
    }
  }, [
    isStreaming,
    isEmpty,
    hasApiKey,
    briefIsActive,
    activeBriefContext,
    brief,
    briefSummaryLabel,
    apiKey,
    quickScanSensitivity,
    rawText,
    ruleOverrides,
    quickScanRulesState.ruleOverrides,
    quickScanRulesState.customRules,
    onOpenSettings,
    onStreamStart,
  ]);

  const handleDismissQuickScan = useCallback((messageId: string) => {
    setMessages((prev) => dismissQuickScanInMessages(prev, messageId));
  }, []);

  const handleDeepAuditFromQuickScan = useCallback(
    (
      selectedLenses: AuteurLensPresetId[],
      result: QuickScanResult,
      targetBeatIndex?: number
    ) => {
      if (isStreaming) return;
      const {prompt, displayText} = buildQuickScanEscalationPrompt({
        result,
        selectedLenses,
        targetBeatIndex,
      });
      void submitPrompt(prompt, {
        overrideFocus: 'audit',
        displayText,
      });
    },
    [isStreaming, submitPrompt]
  );

  const markSuggestionApplied = useCallback((messageId: string, suggestionId: string) => {
    setMessages((prev) => markSuggestionAppliedInMessages(prev, messageId, suggestionId));
  }, []);

  const markSuggestionDismissed = useCallback((messageId: string, suggestionId: string) => {
    setMessages((prev) => markSuggestionDismissedInMessages(prev, messageId, suggestionId));
  }, []);

  const handleSubmitQuestionAnswers = useCallback(
    (
      messageId: string,
      suggestion: QuestionSuggestion,
      answers: Record<string, QuestionAnswerDraft>
    ) => {
      if (isStreaming) return;
      const formatted = formatQuestionAnswersPrompt(suggestion, answers);
      setMessages((prev) => markQuestionAnsweredInMessages(prev, messageId, suggestion.id));
      onClearAskFirst();
      void submitPrompt(formatted.promptText, {
        displayText: formatted.displayText,
        askQuestionMode: 'followup',
      });
    },
    [isStreaming, onClearAskFirst, submitPrompt]
  );

  const handleApplyPatch = useCallback(
    async (messageId: string, suggestion: PatchSuggestion, kind: 'patch' | 'fix') => {
      if (isSuggestionStale(suggestion.baseSnapshotHash, currentSnapshotHash)) {
        return;
      }
      const ok = await onApplyPatchSuggestion(suggestion, kind);
      if (!ok) return;

      setMessages((prev) =>
        applyPatchReceiptToMessages(prev, messageId, suggestion, kind, ruleOverrides)
      );
    },
    [currentSnapshotHash, onApplyPatchSuggestion, ruleOverrides]
  );

  // Sync live-editor Apply / Dismiss popover actions directly into the sidebar state & Audit rebase flow
  useEffect(() => {
    if (!onRegisterLivePatchActions) return;
    if (!isOpen) {
      onRegisterLivePatchActions(null);
      return;
    }
    const handlers: AiLivePatchActionHandlers = {
      applyPatchById: (patchId: string) => {
        const target = activePatches.find((item) => item.id === patchId);
        if (!target || target.isStreaming) return;
        void handleApplyPatch(
          target.messageId,
          target.suggestion,
          target.sourceKind === 'audit_fix' ? 'fix' : 'patch'
        );
      },
      dismissPatchById: (patchId: string) => {
        const target = activePatches.find((item) => item.id === patchId);
        if (!target || target.sourceKind !== 'patch') return;
        markSuggestionDismissed(target.messageId, target.id);
      },
      auditQuickScanBeat: (beatIndex: number) => {
        if (!activeQuickScan) return;
        const beat = activeQuickScan.suspectBeats.find((b) => b.beatIndex === beatIndex);
        if (!beat) return;
        const lenses = Array.from(
          new Set(
            beat.items
              .map((item) => item.lens)
              .filter((lens): lens is AuteurLensPresetId => lens !== 'brief')
          )
        );
        handleDeepAuditFromQuickScan(
          lenses.length > 0 ? lenses : [...AUDIT_LENS_PRESET_IDS],
          activeQuickScan,
          beatIndex
        );
      },
    };
    onRegisterLivePatchActions(handlers);
    return () => {
      onRegisterLivePatchActions(null);
    };
  }, [
    isOpen,
    activePatches,
    activeQuickScan,
    handleApplyPatch,
    handleDeepAuditFromQuickScan,
    markSuggestionDismissed,
    onRegisterLivePatchActions,
  ]);

  const handleApplyAuditFixesBatch = useCallback(
    async (messageId: string, batchPatch: PatchSuggestion, includedFixIds: string[]) => {
      if (
        includedFixIds.length === 0 ||
        isSuggestionStale(batchPatch.baseSnapshotHash, currentSnapshotHash)
      ) {
        return;
      }
      const ok = await onApplyPatchSuggestion(batchPatch, 'fix', {
        batchCount: includedFixIds.length,
      });
      if (!ok) return;

      setMessages((prev) => applyBatchFixesReceiptToMessages(prev, messageId, includedFixIds));
    },
    [currentSnapshotHash, onApplyPatchSuggestion]
  );

  const handleApplyDraft = useCallback(
    async (messageId: string, suggestion: DraftSuggestion) => {
      const ok = await onApplyDraftSuggestion(suggestion);
      if (ok) {
        markSuggestionApplied(messageId, suggestion.id);
        onDraftApplied();
      }
    },
    [onApplyDraftSuggestion, markSuggestionApplied, onDraftApplied]
  );

  const handleApplyTitle = useCallback(
    async (messageId: string, suggestion: TitleSuggestion) => {
      const ok = await onApplyTitleSuggestion(suggestion);
      if (ok) {
        markSuggestionApplied(messageId, suggestion.id);
      }
    },
    [onApplyTitleSuggestion, markSuggestionApplied]
  );

  return {
    messages,
    isStreaming,
    submitPrompt,
    handleStopRun,
    handleResetChat,
    handleQuickAudit,
    handleQuickScan,
    handleDismissQuickScan,
    handleDeepAuditFromQuickScan,
    handleApplyPatch,
    handleApplyAuditFixesBatch,
    handleApplyDraft,
    handleApplyTitle,
    handleSubmitQuestionAnswers,
    markSuggestionApplied,
    markSuggestionDismissed,
  };
}
