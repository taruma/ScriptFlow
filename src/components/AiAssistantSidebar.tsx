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
  KeyRound,
  Loader2,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Sparkles,
  Square,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import {toAuteurEnvelope, type AuteurDocument, type LintRuleOverrides} from '../core/index.ts';
import {
  GeminiServiceError,
  runGeminiAgentTurn,
  type AgentTurnTrace,
} from '../services/geminiInteractions.ts';
import type {
  AssistantMode,
  DraftSuggestion,
  PatchSuggestion,
  StagedSuggestion,
} from '../services/scriptTools.ts';
import {
  AUDIT_QUICK_CHECKS,
  buildAiTargetOptions,
  buildAuditQuickPrompt,
  buildScopedRefinePrompt,
  formatToolDisplayName,
  isSuggestionStale,
  reconcileTargetScope,
  shouldShowSettingsLinkForError,
  type AiChatMessage,
  type AiToolCallItem,
  type AuditQuickCheckId,
} from '../ui/aiAssistant.ts';
import {
  getGeminiModelOption,
  REASONING_LEVEL_OPTIONS,
  useAiSettings,
} from '../ui/aiSettings.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
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

const ASSISTANT_MODES: readonly AssistantMode[] = ['refine', 'check', 'draft'];
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
  const hasAccordionContent = isStreaming || hasVisibleThought || hasTools;
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
              {hasTools && (
                <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-text-faint tabular-nums">
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
            !hasTools && (
              <p className="text-[11px] italic text-text-faint">
                {UI_LABELS.ai.reasoningNoSummary}
              </p>
            )
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

  const [mode, setMode] = useState<AssistantMode>('refine');
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>('whole');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [inspectedTrace, setInspectedTrace] = useState<AgentTurnTrace | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_SIDEBAR_WIDTH);

  const previousInteractionIdRef = useRef<string | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<number>(0);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSessionKeyRef = useRef<string>(scriptSessionKey);

  // Derive current snapshot hash lazily inside sidebar so closed sidebar incurs zero hashing cost
  const currentSnapshotHash = useMemo(
    () => toAuteurEnvelope(rawText, ruleOverrides).snapshotHash,
    [rawText, ruleOverrides]
  );

  // Target scope options for Refine mode
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
    setMessages([]);
  }, []);

  const handleInspectTrace = useCallback((trace: AgentTurnTrace) => {
    setInspectedTrace(trace);
  }, []);

  // Reset in-memory chat & interaction chain automatically when switching scripts
  useEffect(() => {
    if (lastSessionKeyRef.current !== scriptSessionKey) {
      lastSessionKeyRef.current = scriptSessionKey;
      handleResetChat();
      setSelectedTargetKey('whole');
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
      options?: {overrideMode?: AssistantMode; displayText?: string; scopeLabel?: string}
    ) => {
      const activeMode = options?.overrideMode ?? mode;
      const trimmed = rawUserPrompt.trim();
      if (!trimmed || isRunning) return;

      if (!hasApiKey) {
        setIsSettingsOpen(true);
        return;
      }

      const effectivePrompt =
        activeMode === 'refine' && !options?.displayText
          ? buildScopedRefinePrompt(trimmed, activeTarget)
          : trimmed;

      const scopeLabel =
        options?.scopeLabel ??
        (activeMode === 'refine' && activeTarget.kind !== 'whole'
          ? activeTarget.label
          : undefined);

      const userMessageId = `msg-u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const assistantMessageId = `msg-a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

      const userMessage: AiChatMessage = {
        id: userMessageId,
        role: 'user',
        mode: activeMode,
        text: options?.displayText ?? trimmed,
        ...(scopeLabel ? {scopeLabel} : {}),
      };

      const initialAssistantMessage: AiChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        mode: activeMode,
        text: '',
        thoughtSummary: '',
        toolCalls: [],
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
          mode: activeMode,
          prompt: effectivePrompt,
          rawText,
          ruleOverrides,
          previousInteractionId: previousInteractionIdRef.current,
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
      mode,
      isRunning,
      hasApiKey,
      activeTarget,
      settings.apiKey,
      settings.model,
      settings.reasoningLevel,
      rawText,
      ruleOverrides,
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
        overrideMode: 'check',
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

  const modeMeta = UI_LABELS.ai.modes[mode];

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

          {/* Mode Switcher + Mode-Specific Context Bar */}
          <div className="border-b border-border-subtle bg-surface px-3 py-2.5 space-y-2 shrink-0">
            <div
              role="tablist"
              aria-label={UI_LABELS.ai.modesAria}
              className={`${UI_TOKENS.button.segmentedGroup} grid grid-cols-3 w-full`}
            >
              {ASSISTANT_MODES.map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setMode(m)}
                    className={`${
                      active
                        ? UI_TOKENS.button.segmentedItemActive
                        : UI_TOKENS.button.segmentedItem
                    } justify-center`}
                  >
                    <span>{UI_LABELS.ai.modes[m].label}</span>
                  </button>
                );
              })}
            </div>

            {mode === 'refine' && (
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
              </div>
            )}

            {mode === 'check' && (
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
                  {mode === 'refine' ? (
                    <Wrench className="h-4 w-4" />
                  ) : mode === 'check' ? (
                    <ShieldAlert className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>
                <h3 className="font-serif text-xs font-bold text-text-main">
                  {modeMeta.emptyTitle}
                </h3>
                <p className="text-[11px] leading-relaxed text-text-muted max-w-[300px] mx-auto">
                  {modeMeta.emptyDesc}
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[88%] rounded-2xl rounded-br-sm border border-border-main bg-surface px-3 py-2 text-xs text-text-main shadow-2xs space-y-1">
                        {msg.scopeLabel && (
                          <div className="font-mono text-[10px] text-text-faint truncate">
                            {msg.scopeLabel}
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
                      toolCalls={msg.toolCalls ?? []}
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
                placeholder={modeMeta.placeholder}
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

            <div className="flex items-center justify-between px-0.5 text-[10px] text-text-faint">
              <span>{UI_LABELS.ai.composerHint}</span>
              <span className="font-mono">{UI_LABELS.ai.modes[mode].label}</span>
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
