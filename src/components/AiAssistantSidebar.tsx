import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlertCircle,
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  KeyRound,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import type {AuteurDocument, LintRuleOverrides} from '../core/index.ts';
import {composeAgentContext, type AssistantFocus} from '../services/auteurKnowledge.ts';
import {
  GeminiServiceError,
  runGeminiAgentTurn,
  type AgentTurnTrace,
} from '../services/geminiInteractions.ts';
import type {
  DraftSuggestion,
  PatchSuggestion,
  StagedSuggestion,
} from '../services/scriptTools.ts';
import {
  AUDIT_QUICK_CHECKS,
  buildAiTargetOptions,
  buildAuditQuickPrompt,
  buildBriefSummaryBadge,
  buildScopedRefinePrompt,
  EMPTY_DRAFT_BRIEF,
  focusToLegacyMode,
  formatDraftBriefPrompt,
  formatToolDisplayName,
  getBriefReferenceHandles,
  getNextReferenceHandle,
  hasDraftBriefContent,
  isSuggestionStale,
  reconcileTargetScope,
  shouldApplyDraftWrapperTemplate,
  shouldShowSettingsLinkForError,
  upsertLoadedSkill,
  type AiChatMessage,
  type AiLoadedSkillItem,
  type AiToolCallItem,
  type AuditQuickCheckId,
  type DraftBriefState,
  type ReferenceEntry,
} from '../ui/aiAssistant.ts';
import {
  getGeminiModelOption,
  REASONING_LEVEL_OPTIONS,
  useAiSettings,
} from '../ui/aiSettings.ts';
import {useAiSkills} from '../ui/aiSkillsStore.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import type {ContextInspectorTabId} from './AiContextInspectorModal.tsx';
import {
  AuditReviewSuggestionCard,
  DraftSuggestionCard,
  PatchSuggestionCard,
} from './AiSuggestionCards.tsx';
import {MarkdownContent} from './MarkdownContent.tsx';

const AiSettingsModal = lazy(() =>
  import('./AiSettingsModal.tsx').then((mod) => ({
    default: mod.AiSettingsModal,
  }))
);

const AiTraceModal = lazy(() =>
  import('./AiTraceModal.tsx').then((mod) => ({
    default: mod.AiTraceModal,
  }))
);

const AiContextInspectorModal = lazy(() =>
  import('./AiContextInspectorModal.tsx').then((mod) => ({
    default: mod.AiContextInspectorModal,
  }))
);

const ASSISTANT_FOCUSES: readonly AssistantFocus[] = ['auto', 'draft', 'refine', 'audit'];
const EMPTY_TOOL_CALLS: readonly AiToolCallItem[] = [];
const EMPTY_LOADED_SKILLS: readonly AiLoadedSkillItem[] = [];
const MIN_SIDEBAR_WIDTH = 340;
const MAX_SIDEBAR_WIDTH = 580;
const DEFAULT_SIDEBAR_WIDTH = 410;

export interface AiAssistantSidebarProps {
  scriptSessionKey: string;
  rawText: string;
  doc: AuteurDocument;
  readOnly: boolean;
  ruleOverrides?: LintRuleOverrides;
  onClose: () => void;
  onApplyPatchSuggestion: (
    suggestion: PatchSuggestion,
    kind: 'patch' | 'fix'
  ) => Promise<boolean> | boolean;
  onApplyDraftSuggestion: (suggestion: DraftSuggestion) => Promise<boolean> | boolean;
  onJumpToTarget: (targetId: string) => void;
}

interface ReasoningAccordionProps {
  isStreaming: boolean;
  showThinkingSummary: boolean;
  showDebugTrace: boolean;
  hasError: boolean;
  thoughtSummary: string;
  toolCalls: readonly AiToolCallItem[];
  loadedSkills: readonly AiLoadedSkillItem[];
  trace?: AgentTurnTrace;
  onInspectTrace: (trace: AgentTurnTrace) => void;
}

const ReasoningAccordion = memo(function ReasoningAccordion({
  isStreaming,
  showThinkingSummary,
  showDebugTrace,
  hasError,
  thoughtSummary,
  toolCalls,
  loadedSkills,
  trace,
  onInspectTrace,
}: ReasoningAccordionProps) {
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const wasStreamingRef = useRef(isStreaming);

  // Auto-collapse once a streaming turn completes
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setUserOverride(null);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const hasVisibleThought = showThinkingSummary && thoughtSummary.trim().length > 0;
  const hasTools = toolCalls.length > 0;
  const hasSkills = loadedSkills.length > 0;
  const hasAccordionContent = isStreaming || hasVisibleThought || hasTools || hasSkills;
  const canInspect = showDebugTrace && !isStreaming && Boolean(trace);
  const showTraceOnlyBar = canInspect && !hasAccordionContent && !hasError;

  if (!hasAccordionContent && !showTraceOnlyBar) {
    return null;
  }

  const isOpen = hasAccordionContent && (userOverride !== null ? userOverride : isStreaming);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-subtle overflow-hidden">
      <div className="flex items-center justify-between gap-1">
        {hasAccordionContent ? (
          <button
            type="button"
            onClick={() => setUserOverride(!isOpen)}
            aria-expanded={isOpen}
            className="flex flex-1 min-w-0 items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-medium text-text-muted hover:bg-surface-hover/50 hover:text-text-main transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {isStreaming ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--phase-logic-text)]" />
              ) : (
                <Brain className="h-3 w-3 shrink-0 text-text-faint" />
              )}
              <span className="truncate">
                {isStreaming ? UI_LABELS.ai.reasoningRunning : UI_LABELS.ai.reasoningToggleLabel}
              </span>
              {hasSkills && (
                <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-text-faint tabular-nums shrink-0">
                  {UI_LABELS.ai.reasoningSkillCount(loadedSkills.length)}
                </span>
              )}
              {hasTools && (
                <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-text-faint tabular-nums shrink-0">
                  {UI_LABELS.ai.reasoningToolCount(toolCalls.length)}
                </span>
              )}
            </div>
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-faint" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" />
            )}
          </button>
        ) : (
          <div className="flex flex-1 min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-text-faint">
            <Brain className="h-3 w-3 shrink-0" />
            <span className="truncate">{UI_LABELS.ai.reasoningToggleLabel}</span>
          </div>
        )}

        {canInspect && trace && (
          <button
            type="button"
            onClick={() => onInspectTrace(trace)}
            title={UI_LABELS.ai.inspectTraceTitle}
            aria-label={UI_LABELS.ai.inspectTraceAria}
            className="mr-1.5 inline-flex items-center gap-1 rounded-md border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer shrink-0"
          >
            <Terminal className="h-2.5 w-2.5 text-text-faint" />
            <span>{UI_LABELS.ai.inspectTraceButton}</span>
          </button>
        )}
      </div>

      {isOpen && (
        <div className="border-t border-border-subtle px-2.5 py-2 space-y-2">
          {showThinkingSummary ? (
            thoughtSummary.trim().length > 0 ? (
              <MarkdownContent content={thoughtSummary} compact />
            ) : isStreaming ? (
              <p className="text-[11px] italic text-text-faint">{UI_LABELS.ai.reasoningRunning}</p>
            ) : null
          ) : (
            !hasTools &&
            !hasSkills && (
              <p className="text-[11px] italic text-text-faint">
                {UI_LABELS.ai.reasoningNoSummary}
              </p>
            )
          )}

          {hasSkills && (
            <div className="flex flex-wrap gap-1.5">
              {loadedSkills.map((skill) => (
                <span
                  key={skill.id}
                  title={skill.id}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${
                    skill.source === 'tool'
                      ? 'auteur-phase-logic'
                      : skill.source === 'pinned'
                        ? 'auteur-phase-continuity'
                        : 'auteur-phase-aesthetic'
                  }`}
                >
                  <Layers className="h-2.5 w-2.5 shrink-0 opacity-80" />
                  <span>{skill.name}</span>
                  <span className="opacity-70">· {UI_LABELS.ai.skillSources[skill.source]}</span>
                </span>
              ))}
            </div>
          )}

          {hasTools && (
            <div className="flex flex-wrap gap-1.5">
              {toolCalls.map((tool) => (
                <span
                  key={tool.callId}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${
                    tool.status === 'running'
                      ? 'auteur-phase-logic'
                      : tool.status === 'error'
                        ? 'auteur-phase-intent'
                        : 'border-border-main bg-surface text-text-muted'
                  }`}
                >
                  {tool.status === 'running' ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : tool.status === 'error' ? (
                    <AlertCircle className="h-2.5 w-2.5" />
                  ) : tool.status === 'stopped' ? (
                    <Square className="h-2 w-2 fill-current text-text-faint" />
                  ) : (
                    <Check className="h-2.5 w-2.5 text-[var(--phase-aesthetic-text)]" />
                  )}
                  <span>{formatToolDisplayName(tool.name)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export function AiAssistantSidebar({
  scriptSessionKey,
  rawText,
  doc,
  readOnly,
  ruleOverrides,
  onClose,
  onApplyPatchSuggestion,
  onApplyDraftSuggestion,
  onJumpToTarget,
}: AiAssistantSidebarProps) {
  const {
    settings,
    hasApiKey,
    updateSettings,
    setApiKey,
    setSessionOnly,
    clearStoredApiKey,
  } = useAiSettings();

  const {
    skillsState,
    customizationCount,
    hasUpstreamUpdate,
    setFoundationalCraft,
    setDraftWrapperTemplate,
    setPinMode,
    setBodyOverride,
    resetSkill,
    saveCustomSkill,
    removeCustomSkill,
    resetAll,
    acknowledgeUpdate,
  } = useAiSkills();

  const [focus, setFocus] = useState<AssistantFocus>('auto');
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>('whole');
  const [brief, setBrief] = useState<DraftBriefState>(EMPTY_DRAFT_BRIEF);
  const [isBriefOpen, setIsBriefOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isContextOpen, setIsContextOpen] = useState<boolean>(false);
  const [contextInitialTab, setContextInitialTab] = useState<ContextInspectorTabId>('preview');
  const [inspectedTrace, setInspectedTrace] = useState<AgentTurnTrace | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_SIDEBAR_WIDTH);
  const [lastTurnSnapshotHash, setLastTurnSnapshotHash] = useState<string | undefined>(undefined);

  const previousInteractionIdRef = useRef<string | undefined>(undefined);
  const lastTurnSnapshotHashRef = useRef<string | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<number>(0);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSessionKeyRef = useRef<string>(scriptSessionKey);

  const referenceHandles = useMemo(() => getBriefReferenceHandles(brief), [brief]);
  const briefHasContent = useMemo(() => hasDraftBriefContent(brief), [brief]);
  const briefSummaryLabel = useMemo(() => buildBriefSummaryBadge(brief), [brief]);

  // Compose live agent context lazily inside sidebar so closed sidebar incurs zero composition cost
  const previewComposedContext = useMemo(
    () =>
      composeAgentContext({
        focus,
        rawText,
        ruleOverrides,
        previousSnapshotHash: lastTurnSnapshotHash,
        foundationalCraftOverride: skillsState.foundationalCraftOverride ?? undefined,
        skillOverrides: skillsState.skillOverrides,
        customSkills: skillsState.customSkills,
        referenceHandles,
      }),
    [
      focus,
      rawText,
      ruleOverrides,
      lastTurnSnapshotHash,
      skillsState.foundationalCraftOverride,
      skillsState.skillOverrides,
      skillsState.customSkills,
      referenceHandles,
    ]
  );

  const isEmpty = previewComposedContext.editorState.isEmpty;
  const currentSnapshotHash = previewComposedContext.editorState.snapshotHash;

  // Target scope options for Refine / Auto modes on non-empty scripts
  const targetOptions = useMemo(
    () => buildAiTargetOptions(doc, UI_LABELS.ai.refineWholeScript),
    [doc]
  );
  const activeTarget = useMemo(
    () => reconcileTargetScope(selectedTargetKey, targetOptions),
    [selectedTargetKey, targetOptions]
  );

  const modelOption = getGeminiModelOption(settings.model);
  const reasoningOption =
    REASONING_LEVEL_OPTIONS.find((r) => r.id === settings.reasoningLevel) ??
    REASONING_LEVEL_OPTIONS[1];

  const handleOpenContext = useCallback((tab: ContextInspectorTabId = 'preview') => {
    setContextInitialTab(tab);
    setIsContextOpen(true);
  }, []);

  const handleAddReference = useCallback(() => {
    setBrief((prev) => ({
      ...prev,
      references: [
        ...prev.references,
        {
          id: `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          handle: getNextReferenceHandle(prev.references),
          kind: 'text',
          label: '',
          note: '',
        },
      ],
    }));
  }, []);

  const handleUpdateReference = useCallback(
    (refId: string, patch: Partial<Pick<ReferenceEntry, 'handle' | 'label' | 'note'>>) => {
      setBrief((prev) => ({
        ...prev,
        references: prev.references.map((entry) =>
          entry.id === refId ? {...entry, ...patch} : entry
        ),
      }));
    },
    []
  );

  const handleRemoveReference = useCallback((refId: string) => {
    setBrief((prev) => ({
      ...prev,
      references: prev.references.filter((entry) => entry.id !== refId),
    }));
  }, []);

  const handleClearBrief = useCallback(() => {
    setBrief(EMPTY_DRAFT_BRIEF);
  }, []);

  const handleStopRun = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleResetChat = useCallback(() => {
    activeRunIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setInspectedTrace(null);
    previousInteractionIdRef.current = undefined;
    lastTurnSnapshotHashRef.current = undefined;
    setLastTurnSnapshotHash(undefined);
    setMessages([]);
  }, []);

  const handleInspectTrace = useCallback((trace: AgentTurnTrace) => {
    setInspectedTrace(trace);
  }, []);

  // Reset in-memory chat, interaction chain, and brief tray automatically when switching scripts
  useEffect(() => {
    if (lastSessionKeyRef.current !== scriptSessionKey) {
      lastSessionKeyRef.current = scriptSessionKey;
      handleResetChat();
      setSelectedTargetKey('whole');
      setBrief(EMPTY_DRAFT_BRIEF);
      setIsBriefOpen(false);
    }
  }, [scriptSessionKey, handleResetChat]);

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Keep message list scrolled cleanly to latest update
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'});
  }, [messages.length, isRunning]);

  // Subtle desktop drag-to-resize handler
  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebarWidth;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        const nextWidth = Math.max(
          MIN_SIDEBAR_WIDTH,
          Math.min(MAX_SIDEBAR_WIDTH, startWidth + delta)
        );
        setSidebarWidth(nextWidth);
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [sidebarWidth]
  );

  const updateAssistantMessage = useCallback(
    (assistantId: string, updater: (msg: AiChatMessage) => AiChatMessage) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantId ? updater(msg) : msg))
      );
    },
    []
  );

  const submitPrompt = useCallback(
    async (
      rawUserPrompt: string,
      options?: {overrideFocus?: AssistantFocus; displayText?: string; scopeLabel?: string}
    ) => {
      const activeFocus = options?.overrideFocus ?? focus;
      const legacyMode = focusToLegacyMode(activeFocus, isEmpty);
      const trimmed = rawUserPrompt.trim();
      if (!trimmed || isRunning) return;

      if (!hasApiKey) {
        setIsSettingsOpen(true);
        return;
      }

      const useDraftWrapper =
        !options?.displayText &&
        shouldApplyDraftWrapperTemplate({
          focus: activeFocus,
          isEmpty,
          brief,
        });

      const useTargetScope =
        !options?.displayText &&
        !useDraftWrapper &&
        !isEmpty &&
        (activeFocus === 'auto' || activeFocus === 'refine') &&
        activeTarget.kind !== 'whole';

      const effectivePrompt = useDraftWrapper
        ? formatDraftBriefPrompt(trimmed, brief, skillsState.draftWrapperTemplateOverride)
        : useTargetScope
          ? buildScopedRefinePrompt(trimmed, activeTarget)
          : trimmed;

      const scopeLabel = options?.scopeLabel ?? (useTargetScope ? activeTarget.label : undefined);
      const briefSummary = useDraftWrapper ? buildBriefSummaryBadge(brief) : undefined;

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
      };

      const turnSnapshotHash = currentSnapshotHash;

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

      setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
      setIsRunning(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const runId = ++activeRunIdRef.current;

      try {
        const result = await runGeminiAgentTurn({
          apiKey: settings.apiKey,
          model: settings.model,
          reasoningLevel: settings.reasoningLevel,
          mode: legacyMode,
          focus: activeFocus,
          prompt: effectivePrompt,
          rawText,
          ruleOverrides,
          previousInteractionId: previousInteractionIdRef.current,
          previousSnapshotHash: lastTurnSnapshotHashRef.current,
          foundationalCraftOverride: skillsState.foundationalCraftOverride ?? undefined,
          skillOverrides: skillsState.skillOverrides,
          customSkills: skillsState.customSkills,
          referenceHandles,
          signal: controller.signal,
          callbacks: {
            onInteractionId: (interactionId) => {
              if (activeRunIdRef.current !== runId) return;
              previousInteractionIdRef.current = interactionId;
            },
            onThoughtSummaryDelta: (delta) => {
              if (activeRunIdRef.current !== runId) return;
              updateAssistantMessage(assistantMessageId, (msg) => ({
                ...msg,
                thoughtSummary: `${msg.thoughtSummary ?? ''}${delta}`,
              }));
            },
            onTextDelta: (delta) => {
              if (activeRunIdRef.current !== runId) return;
              updateAssistantMessage(assistantMessageId, (msg) => ({
                ...msg,
                text: `${msg.text}${delta}`,
              }));
            },
            onToolCallStart: (call) => {
              if (activeRunIdRef.current !== runId) return;
              updateAssistantMessage(assistantMessageId, (msg) => ({
                ...msg,
                toolCalls: [
                  ...(msg.toolCalls ?? []),
                  {
                    callId: call.callId,
                    name: call.name,
                    arguments: call.arguments,
                    status: 'running',
                  },
                ],
              }));
            },
            onToolCallResult: (trace) => {
              if (activeRunIdRef.current !== runId) return;
              updateAssistantMessage(assistantMessageId, (msg) => ({
                ...msg,
                toolCalls: (msg.toolCalls ?? []).map((item) =>
                  item.callId === trace.callId
                    ? {
                        ...item,
                        status: trace.ok ? 'ok' : 'error',
                        ...(trace.stagedSuggestionId
                          ? {stagedSuggestionId: trace.stagedSuggestionId}
                          : {}),
                      }
                    : item
                ),
              }));
            },
            onSkillLoaded: (skillEvent) => {
              if (activeRunIdRef.current !== runId) return;
              updateAssistantMessage(assistantMessageId, (msg) => ({
                ...msg,
                loadedSkills: upsertLoadedSkill(msg.loadedSkills ?? [], skillEvent),
              }));
            },
            onSuggestionStaged: (suggestion: StagedSuggestion) => {
              if (activeRunIdRef.current !== runId) return;
              updateAssistantMessage(assistantMessageId, (msg) => ({
                ...msg,
                suggestions: [...(msg.suggestions ?? []), suggestion],
              }));
            },
          },
        });

        if (activeRunIdRef.current !== runId) return;

        if (result.interactionId) {
          previousInteractionIdRef.current = result.interactionId;
        }
        lastTurnSnapshotHashRef.current = turnSnapshotHash;
        setLastTurnSnapshotHash(turnSnapshotHash);

        updateAssistantMessage(assistantMessageId, (msg) => ({
          ...msg,
          text: result.text || msg.text,
          thoughtSummary: result.thoughtSummary || msg.thoughtSummary,
          isStreaming: false,
          hitToolRoundLimit: result.hitToolRoundLimit,
          trace: result.trace,
        }));
      } catch (err) {
        if (activeRunIdRef.current !== runId) return;
        const serviceErr =
          err instanceof GeminiServiceError
            ? err
            : new GeminiServiceError(
                'api_error',
                err instanceof Error ? err.message : 'Unexpected Gemini error.'
              );

        updateAssistantMessage(assistantMessageId, (msg) => ({
          ...msg,
          isStreaming: false,
          toolCalls: (msg.toolCalls ?? []).map((item) =>
            item.status === 'running'
              ? {
                  ...item,
                  status: serviceErr.code === 'aborted' ? 'stopped' : 'error',
                }
              : item
          ),
          error: {
            code: serviceErr.code,
            message: serviceErr.message,
          },
          ...(serviceErr.trace ? {trace: serviceErr.trace} : {}),
        }));
      } finally {
        if (activeRunIdRef.current === runId) {
          abortControllerRef.current = null;
          setIsRunning(false);
        }
      }
    },
    [
      focus,
      isEmpty,
      brief,
      referenceHandles,
      isRunning,
      hasApiKey,
      activeTarget,
      currentSnapshotHash,
      settings.apiKey,
      settings.model,
      settings.reasoningLevel,
      rawText,
      ruleOverrides,
      skillsState.foundationalCraftOverride,
      skillsState.draftWrapperTemplateOverride,
      skillsState.skillOverrides,
      skillsState.customSkills,
      updateAssistantMessage,
    ]
  );

  const handleComposerSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isRunning) return;
    setInputValue('');
    void submitPrompt(trimmed);
  }, [inputValue, isRunning, submitPrompt]);

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        handleComposerSend();
      }
    },
    [handleComposerSend]
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

  const markSuggestionApplied = useCallback(
    (messageId: string, suggestionId: string) => {
      updateAssistantMessage(messageId, (msg) => ({
        ...msg,
        appliedSuggestionIds: [...(msg.appliedSuggestionIds ?? []), suggestionId],
      }));
    },
    [updateAssistantMessage]
  );

  const markSuggestionDismissed = useCallback(
    (messageId: string, suggestionId: string) => {
      updateAssistantMessage(messageId, (msg) => ({
        ...msg,
        dismissedSuggestionIds: [...(msg.dismissedSuggestionIds ?? []), suggestionId],
      }));
    },
    [updateAssistantMessage]
  );

  const handleApplyPatch = useCallback(
    async (messageId: string, suggestion: PatchSuggestion, kind: 'patch' | 'fix') => {
      if (isSuggestionStale(suggestion.baseSnapshotHash, currentSnapshotHash)) {
        return;
      }
      const ok = await onApplyPatchSuggestion(suggestion, kind);
      if (ok) {
        markSuggestionApplied(messageId, suggestion.id);
      }
    },
    [currentSnapshotHash, onApplyPatchSuggestion, markSuggestionApplied]
  );

  const handleApplyDraft = useCallback(
    async (messageId: string, suggestion: DraftSuggestion) => {
      const ok = await onApplyDraftSuggestion(suggestion);
      if (ok) {
        markSuggestionApplied(messageId, suggestion.id);
      }
    },
    [onApplyDraftSuggestion, markSuggestionApplied]
  );

  const focusMeta =
    focus === 'auto'
      ? isEmpty
        ? UI_LABELS.ai.focuses.autoEmpty
        : UI_LABELS.ai.focuses.autoActive
      : UI_LABELS.ai.focuses[focus];

  return (
    <>
      {/* Narrow-viewport backdrop (< lg) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 top-12 z-40 bg-overlay-bg backdrop-blur-[1px] lg:hidden"
      />

      <aside
        data-ai-sidebar="true"
        aria-label={UI_LABELS.ai.sidebarAria}
        style={{'--ai-sidebar-width': `${sidebarWidth}px`} as CSSProperties}
        className="fixed inset-y-0 right-0 top-12 z-50 flex w-[min(100vw,420px)] flex-col overflow-hidden border-l border-border-main bg-surface text-text-main shadow-2xl lg:static lg:top-auto lg:z-20 lg:h-full lg:min-h-0 lg:w-[var(--ai-sidebar-width)] lg:max-w-[580px] lg:min-w-[340px] lg:shadow-none shrink-0"
      >
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
          {/* Desktop drag-to-resize left edge handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={UI_LABELS.ai.resizeAria}
            onPointerDown={handleResizePointerDown}
            className="hidden lg:block absolute inset-y-0 -left-1 w-2 cursor-col-resize z-30 hover:bg-border-main/60 transition-colors"
          />

          {/* Sidebar Header */}
          <div className={UI_TOKENS.ai.sidebarHeader}>
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--phase-continuity-text)]" />
              <span className="font-serif text-xs font-bold tracking-tight text-text-main truncate">
                {UI_LABELS.ai.title}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenContext('preview')}
                title={UI_LABELS.ai.contextButtonTitle}
                aria-label={UI_LABELS.ai.contextButtonAria(
                  previewComposedContext.activeSkills.length,
                  customizationCount
                )}
                className={UI_TOKENS.ai.statusChip}
              >
                <Layers className="h-3 w-3 text-text-faint" />
                <span>{UI_LABELS.ai.contextButton}</span>
                {previewComposedContext.activeSkills.length > 0 && (
                  <span className="font-mono text-[10px] text-text-faint tabular-nums">
                    {previewComposedContext.activeSkills.length}
                  </span>
                )}
                {(customizationCount > 0 || hasUpstreamUpdate) && (
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${
                      hasUpstreamUpdate
                        ? 'bg-amber-500'
                        : 'bg-[var(--phase-continuity-text)]'
                    }`}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                title={UI_LABELS.ai.settingsChipTitle}
                aria-label={UI_LABELS.ai.settingsChipAria(
                  modelOption.shortLabel,
                  reasoningOption.label
                )}
                className={UI_TOKENS.ai.statusChip}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    hasApiKey ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>
                  {modelOption.shortLabel} · {reasoningOption.label}
                </span>
                <Settings2 className="h-3 w-3 text-text-faint" />
              </button>

              <button
                type="button"
                onClick={handleResetChat}
                disabled={messages.length === 0 && !isRunning}
                title={UI_LABELS.ai.newChatTitle}
                aria-label={UI_LABELS.ai.newChatButton}
                className={UI_TOKENS.button.iconGhost}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label={UI_LABELS.ai.closeAria}
                className={UI_TOKENS.button.iconGhost}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Unified Focus Bar + Contextual Controls */}
          <div className="border-b border-border-subtle bg-surface px-3 py-2.5 space-y-2 shrink-0">
            <div
              role="group"
              aria-label={UI_LABELS.ai.focusAria}
              className={`${UI_TOKENS.button.segmentedGroup} grid grid-cols-4 w-full`}
            >
              {ASSISTANT_FOCUSES.map((item) => {
                const active = focus === item;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFocus(item)}
                    className={`${
                      active
                        ? UI_TOKENS.button.segmentedItemActive
                        : UI_TOKENS.button.segmentedItem
                    } justify-center`}
                  >
                    <span>{UI_LABELS.ai.focusLabels[item]}</span>
                  </button>
                );
              })}
            </div>

            {!isEmpty && (focus === 'auto' || focus === 'refine') && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="auteur-ai-target-scope"
                  className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0"
                >
                  {UI_LABELS.ai.refineTargetLabel}
                </label>
                <select
                  id="auteur-ai-target-scope"
                  aria-label={UI_LABELS.ai.refineTargetAria}
                  value={activeTarget.key}
                  onChange={(e) => setSelectedTargetKey(e.target.value)}
                  className="min-w-0 flex-1 truncate rounded-lg border border-border-main bg-surface-subtle px-2 py-1 font-mono text-[11px] text-text-body focus:outline-none focus:ring-1 focus:ring-border-main cursor-pointer"
                >
                  {targetOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {focus === 'auto' && (
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleQuickAudit('all')}
                    title={UI_LABELS.ai.quickAuditAllTitle}
                    className={`${UI_TOKENS.ai.pillButton} text-[10px] py-1 px-2`}
                  >
                    <ShieldAlert className="h-3 w-3 text-text-faint" />
                    <span>{UI_LABELS.ai.quickAuditAllButton}</span>
                  </button>
                )}
              </div>
            )}

            {focus === 'audit' && (
              <div
                role="group"
                aria-label={UI_LABELS.ai.auditQuickGroupAria}
                className="flex flex-wrap gap-1"
              >
                {AUDIT_QUICK_CHECKS.map((check) => {
                  const label =
                    check.id === 'all'
                      ? UI_LABELS.ai.auditQuickAll
                      : UI_LABELS.ai.auditQuickLensShort[check.id];
                  return (
                    <button
                      key={check.id}
                      type="button"
                      disabled={isRunning}
                      onClick={() => handleQuickAudit(check.id)}
                      className={`${UI_TOKENS.ai.pillButton} text-[10px] py-0.5 px-2`}
                    >
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scrollable Message Stream */}
          <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll px-3 py-3 space-y-3 bg-app/50">
            {!hasApiKey && (
              <div className="rounded-xl border border-border-main bg-surface p-3.5 space-y-2.5 shadow-2xs">
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface-subtle text-text-main"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-serif text-xs font-bold text-text-main">
                      {UI_LABELS.ai.missingKeyTitle}
                    </h3>
                    <p className="text-[11px] leading-relaxed text-text-muted">
                      {UI_LABELS.ai.missingKeyDesc}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px]`}
                  >
                    <Settings2 className="h-3 w-3" />
                    <span>{UI_LABELS.ai.missingKeyCta}</span>
                  </button>
                </div>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-main bg-surface/60 px-4 py-5 text-center space-y-1.5">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border-main bg-surface text-text-muted mx-auto">
                  {focus === 'refine' ? (
                    <Wrench className="h-4 w-4" />
                  ) : focus === 'audit' ? (
                    <ShieldAlert className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>
                <h3 className="font-serif text-xs font-bold text-text-main">
                  {focusMeta.emptyTitle}
                </h3>
                <p className="text-[11px] leading-relaxed text-text-muted max-w-[300px] mx-auto">
                  {focusMeta.emptyDesc}
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[88%] rounded-2xl rounded-br-sm border border-border-main bg-surface px-3 py-2 text-xs text-text-main shadow-2xs space-y-1">
                        {(msg.scopeLabel || msg.briefSummary) && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {msg.scopeLabel && (
                              <span className="font-mono text-[10px] text-text-faint truncate">
                                {msg.scopeLabel}
                              </span>
                            )}
                            {msg.briefSummary && (
                              <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-aesthetic">
                                {msg.briefSummary}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                      </div>
                    </div>
                  );
                }

                const dismissed = msg.dismissedSuggestionIds ?? [];
                const applied = msg.appliedSuggestionIds ?? [];

                return (
                  <div key={msg.id} className="space-y-2">
                    <ReasoningAccordion
                      isStreaming={Boolean(msg.isStreaming)}
                      showThinkingSummary={settings.showThinkingSummary}
                      showDebugTrace={settings.showDebugTrace}
                      hasError={Boolean(msg.error)}
                      thoughtSummary={msg.thoughtSummary ?? ''}
                      toolCalls={msg.toolCalls ?? EMPTY_TOOL_CALLS}
                      loadedSkills={msg.loadedSkills ?? EMPTY_LOADED_SKILLS}
                      trace={msg.trace}
                      onInspectTrace={handleInspectTrace}
                    />

                    {msg.text.trim().length > 0 && (
                      <div className="rounded-xl border border-border-subtle bg-surface px-3 py-2.5 shadow-2xs">
                        <MarkdownContent content={msg.text} />
                      </div>
                    )}

                    {msg.hitToolRoundLimit && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                        {UI_LABELS.ai.hitToolLimitNote}
                      </div>
                    )}

                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="space-y-2">
                        {msg.suggestions.map((suggestion) => {
                          const msgStreaming = Boolean(msg.isStreaming);
                          if (suggestion.kind === 'patch') {
                            return (
                              <PatchSuggestionCard
                                key={suggestion.id}
                                suggestion={suggestion}
                                currentSnapshotHash={currentSnapshotHash}
                                readOnly={readOnly}
                                isStreaming={msgStreaming}
                                isApplied={applied.includes(suggestion.id)}
                                isDismissed={dismissed.includes(suggestion.id)}
                                onApply={(s) => void handleApplyPatch(msg.id, s, 'patch')}
                                onDismiss={(id) => markSuggestionDismissed(msg.id, id)}
                              />
                            );
                          }
                          if (suggestion.kind === 'draft') {
                            return (
                              <DraftSuggestionCard
                                key={suggestion.id}
                                suggestion={suggestion}
                                readOnly={readOnly}
                                isStreaming={msgStreaming}
                                isApplied={applied.includes(suggestion.id)}
                                isDismissed={dismissed.includes(suggestion.id)}
                                onApply={(s) => void handleApplyDraft(msg.id, s)}
                                onDismiss={(id) => markSuggestionDismissed(msg.id, id)}
                              />
                            );
                          }
                          return (
                            <AuditReviewSuggestionCard
                              key={suggestion.id}
                              suggestion={suggestion}
                              currentSnapshotHash={currentSnapshotHash}
                              readOnly={readOnly}
                              isStreaming={msgStreaming}
                              appliedIds={applied}
                              onJumpToTarget={onJumpToTarget}
                              onApplyIssueFix={(patch) => void handleApplyPatch(msg.id, patch, 'fix')}
                            />
                          );
                        })}
                      </div>
                    )}

                    {msg.error &&
                      (msg.error.code === 'aborted' ? (
                        <div
                          role="status"
                          className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-subtle px-2.5 py-1.5 text-[11px] text-text-muted"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Square className="h-2.5 w-2.5 fill-current text-text-faint" />
                            <span>{UI_LABELS.ai.stoppedNote}</span>
                          </span>
                          {settings.showDebugTrace && msg.trace && (
                            <button
                              type="button"
                              onClick={() => handleInspectTrace(msg.trace!)}
                              title={UI_LABELS.ai.inspectTraceTitle}
                              aria-label={UI_LABELS.ai.inspectTraceAria}
                              className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
                            >
                              <Terminal className="h-2.5 w-2.5 text-text-faint" />
                              <span>{UI_LABELS.ai.inspectTraceButton}</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div
                          role="alert"
                          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300 space-y-2"
                        >
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <div className="min-w-0 space-y-0.5">
                              <p className="font-medium leading-snug">{msg.error.message}</p>
                              <p className="text-[11px] opacity-85">{UI_LABELS.ai.retryHint}</p>
                            </div>
                          </div>
                          {(shouldShowSettingsLinkForError(msg.error.code) ||
                            (settings.showDebugTrace && Boolean(msg.trace))) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {shouldShowSettingsLinkForError(msg.error.code) && (
                                <button
                                  type="button"
                                  onClick={() => setIsSettingsOpen(true)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-main hover:bg-surface-subtle transition-colors cursor-pointer"
                                >
                                  <Settings2 className="h-3 w-3" />
                                  <span>{UI_LABELS.ai.openSettingsAction}</span>
                                </button>
                              )}
                              {settings.showDebugTrace && msg.trace && (
                                <button
                                  type="button"
                                  onClick={() => handleInspectTrace(msg.trace!)}
                                  title={UI_LABELS.ai.inspectTraceTitle}
                                  aria-label={UI_LABELS.ai.inspectTraceAria}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-surface px-2 py-1 font-mono text-[10px] font-medium text-text-main hover:bg-surface-subtle transition-colors cursor-pointer"
                                >
                                  <Terminal className="h-3 w-3 text-text-muted" />
                                  <span>{UI_LABELS.ai.inspectTraceButton}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                );
              })
            )}
            <div ref={threadEndRef} />
          </div>

          {/* Collapsible Brief / Refs Tray */}
          {isBriefOpen && (
            <section
              aria-label={UI_LABELS.ai.briefTray.regionAria}
              className="border-t border-border-main bg-surface-subtle/70 px-3 py-2.5 max-h-60 overflow-y-auto auteur-pane-scroll shrink-0 space-y-2.5"
            >
              {/* Cast & References */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                    {UI_LABELS.ai.briefTray.refsHeading}
                  </span>
                  <button
                    type="button"
                    onClick={handleAddReference}
                    aria-label={UI_LABELS.ai.briefTray.addRefAria}
                    className={`${UI_TOKENS.ai.pillButton} text-[10px] py-0.5 px-2`}
                  >
                    <Plus className="h-2.5 w-2.5" />
                    <span>{UI_LABELS.ai.briefTray.addRefButton}</span>
                  </button>
                </div>

                {brief.references.length === 0 ? (
                  <p className="text-[11px] text-text-faint leading-snug">
                    {UI_LABELS.ai.briefTray.emptyRefsHint}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {brief.references.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-border-subtle bg-surface p-1.5 space-y-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            data-native-undo="true"
                            value={entry.handle}
                            onChange={(event) =>
                              handleUpdateReference(entry.id, {handle: event.target.value})
                            }
                            placeholder={UI_LABELS.ai.briefTray.handlePlaceholder}
                            aria-label={UI_LABELS.ai.briefTray.handleAria}
                            className="w-24 shrink-0 rounded-md border border-border-main bg-surface-subtle px-2 py-1 font-mono text-[11px] text-text-main placeholder-text-placeholder focus:bg-surface focus:outline-none focus:ring-1 focus:ring-border-main"
                          />
                          <input
                            type="text"
                            data-native-undo="true"
                            value={entry.label}
                            onChange={(event) =>
                              handleUpdateReference(entry.id, {label: event.target.value})
                            }
                            placeholder={UI_LABELS.ai.briefTray.labelPlaceholder}
                            aria-label={UI_LABELS.ai.briefTray.labelAria}
                            className="min-w-0 flex-1 rounded-md border border-border-main bg-surface-subtle px-2 py-1 text-[11px] text-text-main placeholder-text-placeholder focus:bg-surface focus:outline-none focus:ring-1 focus:ring-border-main"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveReference(entry.id)}
                            aria-label={UI_LABELS.ai.briefTray.removeRefAria}
                            className="p-1 rounded-md text-text-faint hover:text-red-600 dark:hover:text-red-400 hover:bg-surface-subtle transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <input
                          type="text"
                          data-native-undo="true"
                          value={entry.note ?? ''}
                          onChange={(event) =>
                            handleUpdateReference(entry.id, {note: event.target.value})
                          }
                          placeholder={UI_LABELS.ai.briefTray.notePlaceholder}
                          aria-label={UI_LABELS.ai.briefTray.noteAria}
                          className="w-full rounded-md border border-border-subtle bg-surface-subtle px-2 py-1 text-[11px] text-text-body placeholder-text-placeholder focus:bg-surface focus:border-border-main focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Format & Specs */}
              <div className="space-y-1">
                <label
                  htmlFor="auteur-ai-brief-specs"
                  className="block text-[10px] font-semibold uppercase tracking-wider text-text-faint"
                >
                  {UI_LABELS.ai.briefTray.specsLabel}
                </label>
                <textarea
                  id="auteur-ai-brief-specs"
                  rows={2}
                  data-native-undo="true"
                  value={brief.specs}
                  onChange={(event) =>
                    setBrief((prev) => ({...prev, specs: event.target.value}))
                  }
                  placeholder={UI_LABELS.ai.briefTray.specsPlaceholder}
                  aria-label={UI_LABELS.ai.briefTray.specsAria}
                  className="w-full resize-none rounded-lg border border-border-main bg-surface px-2.5 py-1.5 text-[11px] leading-snug text-text-main placeholder-text-placeholder focus:outline-none focus:ring-1 focus:ring-border-main auteur-pane-scroll"
                />
              </div>

              {/* Subtext & Context */}
              <div className="space-y-1">
                <label
                  htmlFor="auteur-ai-brief-subtext"
                  className="block text-[10px] font-semibold uppercase tracking-wider text-text-faint"
                >
                  {UI_LABELS.ai.briefTray.subtextLabel}
                </label>
                <textarea
                  id="auteur-ai-brief-subtext"
                  rows={2}
                  data-native-undo="true"
                  value={brief.subtext}
                  onChange={(event) =>
                    setBrief((prev) => ({...prev, subtext: event.target.value}))
                  }
                  placeholder={UI_LABELS.ai.briefTray.subtextPlaceholder}
                  aria-label={UI_LABELS.ai.briefTray.subtextAria}
                  className="w-full resize-none rounded-lg border border-border-main bg-surface px-2.5 py-1.5 text-[11px] leading-snug text-text-main placeholder-text-placeholder focus:outline-none focus:ring-1 focus:ring-border-main auteur-pane-scroll"
                />
              </div>

              {/* Brief Tray Footer */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleOpenContext('craft')}
                  title={UI_LABELS.ai.briefTray.editTemplateTitle}
                  className="text-[11px] font-medium text-text-muted hover:text-text-main underline underline-offset-2 transition-colors cursor-pointer"
                >
                  {UI_LABELS.ai.briefTray.editTemplateButton}
                </button>

                {briefHasContent && (
                  <button
                    type="button"
                    onClick={handleClearBrief}
                    aria-label={UI_LABELS.ai.briefTray.clearAria}
                    className="text-[11px] font-medium text-text-faint hover:text-text-main transition-colors cursor-pointer"
                  >
                    {UI_LABELS.ai.briefTray.clearButton}
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Composer Footer */}
          <div className="border-t border-border-main bg-surface p-3 shrink-0 space-y-1.5">
            <div className="flex items-end gap-2 rounded-xl border border-border-main bg-surface-subtle px-2.5 py-2 focus-within:bg-surface focus-within:ring-1 focus-within:ring-border-main transition-colors">
              <textarea
                ref={composerRef}
                rows={2}
                data-native-undo="true"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={focusMeta.placeholder}
                aria-label={UI_LABELS.ai.composerAria}
                className="max-h-36 min-h-[42px] flex-1 resize-none bg-transparent text-xs leading-relaxed text-text-main placeholder-text-placeholder outline-none auteur-pane-scroll"
              />

              {isRunning ? (
                <button
                  type="button"
                  onClick={handleStopRun}
                  aria-label={UI_LABELS.ai.stopAria}
                  title={UI_LABELS.ai.stopButton}
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-red-500 px-2.5 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors cursor-pointer shrink-0"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  <span>{UI_LABELS.ai.stopButton}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={inputValue.trim().length === 0}
                  onClick={handleComposerSend}
                  aria-label={UI_LABELS.ai.sendAria}
                  title={UI_LABELS.ai.sendButton}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-btn-primary-bg text-btn-primary-text hover:bg-btn-primary-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-0.5 text-[10px] text-text-faint">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  aria-expanded={isBriefOpen}
                  aria-label={UI_LABELS.ai.briefToggleAria(isBriefOpen, briefHasContent)}
                  title={UI_LABELS.ai.briefToggleTitle}
                  onClick={() => setIsBriefOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium text-[10px] transition-colors cursor-pointer shrink-0 ${
                    isBriefOpen || briefHasContent
                      ? 'auteur-phase-aesthetic'
                      : 'border-border-subtle bg-surface-subtle text-text-muted hover:text-text-main hover:border-border-main'
                  }`}
                >
                  <FileText className="h-2.5 w-2.5" />
                  <span>{briefSummaryLabel ?? UI_LABELS.ai.briefToggle}</span>
                </button>
                <span className="truncate">{UI_LABELS.ai.composerHint}</span>
              </div>
              <span className="font-mono shrink-0">{UI_LABELS.ai.focusLabels[focus]}</span>
            </div>
          </div>
        </div>
      </aside>

      {isSettingsOpen && (
        <Suspense fallback={null}>
          <AiSettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            hasApiKey={hasApiKey}
            onUpdateSettings={updateSettings}
            onSetApiKey={setApiKey}
            onSetSessionOnly={setSessionOnly}
            onClearApiKey={clearStoredApiKey}
          />
        </Suspense>
      )}

      {isContextOpen && (
        <Suspense fallback={null}>
          <AiContextInspectorModal
            isOpen={isContextOpen}
            onClose={() => setIsContextOpen(false)}
            initialTab={contextInitialTab}
            composedContext={previewComposedContext}
            skillsState={skillsState}
            customizationCount={customizationCount}
            hasUpstreamUpdate={hasUpstreamUpdate}
            onSetFoundationalCraft={setFoundationalCraft}
            onSetDraftWrapperTemplate={setDraftWrapperTemplate}
            onSetPinMode={setPinMode}
            onSetBodyOverride={setBodyOverride}
            onResetSkill={resetSkill}
            onSaveCustomSkill={saveCustomSkill}
            onDeleteCustomSkill={removeCustomSkill}
            onResetAll={resetAll}
            onAcknowledgeUpdate={acknowledgeUpdate}
          />
        </Suspense>
      )}

      {inspectedTrace && (
        <Suspense fallback={null}>
          <AiTraceModal
            isOpen={true}
            trace={inspectedTrace}
            onClose={() => setInspectedTrace(null)}
          />
        </Suspense>
      )}
    </>
  );
}
