import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  ArrowDown,
  KeyRound,
  Layers,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import type {AuteurDocument, LintRuleOverrides} from '../core/index.ts';
import {
  composeAgentContext,
  type AskQuestionMode,
  type AssistantFocus,
} from '../services/auteurKnowledge.ts';
import type {QuickScanResult} from '../services/geminiDecisions.ts';
import type {DraftSuggestion, PatchSuggestion, TitleSuggestion} from '../services/scriptTools.ts';
import {
  buildAiTargetOptions,
  isNearScrollBottom,
  reconcileTargetScope,
} from '../ui/aiAssistant.ts';
import {aggregateSessionCost, formatEstimatedUsd} from '../ui/aiPricing.ts';
import {
  getGeminiModelOption,
  REASONING_LEVEL_OPTIONS,
  useAiSettings,
} from '../ui/aiSettings.ts';
import {useAiSkills} from '../ui/aiSkillsStore.ts';
import {UI_LABELS} from '../ui/labels.ts';
import type {ActiveAiPatchItem} from '../ui/patchIndicators.ts';
import {useQuickScanRulesStore} from '../ui/quickScanRulesStore.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import type {ContextInspectorTabId} from './AiContextInspectorModal.tsx';
import type {AiInspectableTrace} from './AiTraceModal.tsx';
import {AiComposerDock} from './ai/sidebar/AiComposerDock.tsx';
import {AiThreadMessage} from './ai/sidebar/AiThreadMessage.tsx';
import {
  buildSessionCostTooltip,
  HoverTooltipPortal,
  type ActivityHoverTooltip,
} from './ai/sidebar/HoverTooltipPortal.tsx';
import {useAiBriefController} from './ai/sidebar/useAiBriefController.ts';
import {
  useAiChatOrchestrator,
  type AiLivePatchActionHandlers,
} from './ai/sidebar/useAiChatOrchestrator.ts';
import {useSidebarResize} from './ai/sidebar/useSidebarResize.ts';

const AiSettingsModal = lazy(() =>
  import('./AiSettingsModal.tsx').then((mod) => ({default: mod.AiSettingsModal}))
);

const AiTraceModal = lazy(() =>
  import('./AiTraceModal.tsx').then((mod) => ({default: mod.AiTraceModal}))
);

const AiContextInspectorModal = lazy(() =>
  import('./AiContextInspectorModal.tsx').then((mod) => ({default: mod.AiContextInspectorModal}))
);

const AiBriefModal = lazy(() =>
  import('./AiBriefModal.tsx').then((mod) => ({default: mod.AiBriefModal}))
);

export type {AiLivePatchActionHandlers};

export interface AiAssistantSidebarProps {
  isOpen?: boolean;
  scriptSessionKey: string;
  rawText: string;
  sceneTitle: string;
  doc: AuteurDocument;
  readOnly: boolean;
  ruleOverrides?: LintRuleOverrides;
  onClose: () => void;
  onApplyPatchSuggestion: (
    suggestion: PatchSuggestion,
    kind: 'patch' | 'fix',
    options?: {batchCount?: number}
  ) => Promise<boolean> | boolean;
  onApplyDraftSuggestion: (suggestion: DraftSuggestion) => Promise<boolean> | boolean;
  onApplyTitleSuggestion: (suggestion: TitleSuggestion) => Promise<boolean> | boolean;
  onJumpToTarget: (targetId: string) => void;
  onActivePatchesChange?: (patches: ActiveAiPatchItem[]) => void;
  onActiveQuickScanChange?: (quickScan: QuickScanResult | null) => void;
  onRegisterLivePatchActions?: (actions: AiLivePatchActionHandlers | null) => void;
}

export function AiAssistantSidebar({
  isOpen = true,
  scriptSessionKey,
  rawText,
  sceneTitle,
  doc,
  readOnly,
  ruleOverrides,
  onClose,
  onApplyPatchSuggestion,
  onApplyDraftSuggestion,
  onApplyTitleSuggestion,
  onJumpToTarget,
  onActivePatchesChange,
  onActiveQuickScanChange,
  onRegisterLivePatchActions,
}: AiAssistantSidebarProps) {
  const aiSettings = useAiSettings();
  const aiSkills = useAiSkills();
  const quickScanRules = useQuickScanRulesStore();
  const {settings, hasApiKey} = aiSettings;

  const totalCustomizationCount = aiSkills.customizationCount + quickScanRules.customizationCount;
  const hasAnyUpstreamUpdate = aiSkills.hasUpstreamUpdate || quickScanRules.hasUpstreamUpdate;

  const [focus, setFocus] = useState<AssistantFocus>('auto');
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>('whole');
  const [askFirstEnabled, setAskFirstEnabled] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isContextOpen, setIsContextOpen] = useState<boolean>(false);
  const [contextInitialTab, setContextInitialTab] = useState<ContextInspectorTabId>('preview');
  const [inspectedTrace, setInspectedTrace] = useState<AiInspectableTrace | null>(null);
  const [hasActiveInteraction, setHasActiveInteraction] = useState<boolean>(false);
  const [lastTurnSnapshotHash, setLastTurnSnapshotHash] = useState<string | undefined>(undefined);
  const [lastTurnRawText, setLastTurnRawText] = useState<string | undefined>(undefined);
  const [lastTurnSceneTitle, setLastTurnSceneTitle] = useState<string | undefined>(undefined);
  const [lastTurnDiagnosticsFingerprint, setLastTurnDiagnosticsFingerprint] = useState<
    string | undefined
  >(undefined);
  const [lastTurnBriefContext, setLastTurnBriefContext] = useState<string | undefined>(undefined);
  const [isScrolledUp, setIsScrolledUp] = useState<boolean>(false);
  const [sessionCostTooltip, setSessionCostTooltip] = useState<ActivityHoverTooltip | null>(null);

  const sidebarRef = useRef<HTMLElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef<boolean>(true);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const briefCtrl = useAiBriefController();
  const resizeCtrl = useSidebarResize({isOpen, inputValue, sidebarRef, composerRef});

  const isAskQuestionToolDisabled =
    aiSkills.skillsState.toolOverrides?.ask_question?.activationMode === 'disabled';
  const effectiveAskFirstEnabled = askFirstEnabled && !isAskQuestionToolDisabled;

  const effectivePreviewAskMode: AskQuestionMode =
    effectiveAskFirstEnabled && focus !== 'audit' ? 'ask_first' : 'off';

  // Compose live agent context lazily only while sidebar is open so closed typing incurs zero composition cost
  const previewComposedContext = useMemo(
    () =>
      isOpen
        ? composeAgentContext({
            focus,
            rawText,
            sceneTitle,
            ruleOverrides,
            hasPreviousInteraction: hasActiveInteraction,
            previousSnapshotHash: lastTurnSnapshotHash,
            previousRawText: lastTurnRawText,
            previousSceneTitle: lastTurnSceneTitle,
            previousDiagnosticsFingerprint: lastTurnDiagnosticsFingerprint,
            previousBriefContext: lastTurnBriefContext,
            foundationalCraftOverride: aiSkills.skillsState.foundationalCraftOverride ?? undefined,
            skillOverrides: aiSkills.skillsState.skillOverrides,
            customSkills: aiSkills.skillsState.customSkills,
            toolProtocolOverride: aiSkills.skillsState.toolProtocolOverride ?? undefined,
            enforceToolLinterGate: aiSkills.skillsState.enforceToolLinterGate,
            toolOverrides: aiSkills.skillsState.toolOverrides,
            referenceHandles: briefCtrl.activeReferenceHandles,
            briefContext: briefCtrl.activeBriefContext,
            askQuestionMode: effectivePreviewAskMode,
          })
        : null,
    [
      isOpen,
      focus,
      rawText,
      sceneTitle,
      ruleOverrides,
      hasActiveInteraction,
      lastTurnSnapshotHash,
      lastTurnRawText,
      lastTurnSceneTitle,
      lastTurnDiagnosticsFingerprint,
      lastTurnBriefContext,
      aiSkills.skillsState.foundationalCraftOverride,
      aiSkills.skillsState.skillOverrides,
      aiSkills.skillsState.customSkills,
      aiSkills.skillsState.toolProtocolOverride,
      aiSkills.skillsState.enforceToolLinterGate,
      aiSkills.skillsState.toolOverrides,
      briefCtrl.activeReferenceHandles,
      briefCtrl.activeBriefContext,
      effectivePreviewAskMode,
    ]
  );

  const isEmpty = previewComposedContext?.editorState.isEmpty ?? rawText.trim().length === 0;
  const currentSnapshotHash = previewComposedContext?.editorState.snapshotHash ?? '';
  const currentDiagnosticsFingerprint =
    previewComposedContext?.editorState.diagnosticsFingerprint ?? 'clean';

  const targetOptions = useMemo(
    () => buildAiTargetOptions(doc, UI_LABELS.ai.refineWholeScript),
    [doc]
  );
  const activeTarget = useMemo(
    () => reconcileTargetScope(selectedTargetKey, targetOptions),
    [selectedTargetKey, targetOptions]
  );

  const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
  const handleOpenBrief = useCallback(
    () => briefCtrl.setIsBriefOpen(true),
    [briefCtrl.setIsBriefOpen]
  );
  const handleToggleAskFirst = useCallback(() => setAskFirstEnabled((prev) => !prev), []);
  const handleClearAskFirst = useCallback(() => setAskFirstEnabled(false), []);
  const handleClearSessionCostTooltip = useCallback(() => setSessionCostTooltip(null), []);
  const handleInspectTrace = useCallback((trace: AiInspectableTrace) => {
    setInspectedTrace(trace);
  }, []);
  const handleOpenContext = useCallback((tab: ContextInspectorTabId = 'preview') => {
    setContextInitialTab(tab);
    setIsContextOpen(true);
  }, []);

  const handleStreamStart = useCallback(() => {
    shouldAutoScrollRef.current = true;
    setIsScrolledUp(false);
  }, []);

  const handleResetChatUi = useCallback(() => {
    setInspectedTrace(null);
    setSessionCostTooltip(null);
    shouldAutoScrollRef.current = true;
    setIsScrolledUp(false);
    setAskFirstEnabled(false);
  }, []);

  const handleScriptSwitchReset = useCallback(() => {
    setSelectedTargetKey('whole');
    briefCtrl.resetBrief();
  }, [briefCtrl.resetBrief]);

  const handleDraftApplied = useCallback(() => {
    briefCtrl.setIsBriefOpen(false);
  }, [briefCtrl.setIsBriefOpen]);

  const chat = useAiChatOrchestrator({
    isOpen,
    scriptSessionKey,
    rawText,
    sceneTitle,
    ruleOverrides,
    focus,
    isEmpty,
    currentSnapshotHash,
    currentDiagnosticsFingerprint,
    activeTarget,
    brief: briefCtrl.brief,
    briefIsActive: briefCtrl.briefIsActive,
    briefSummaryLabel: briefCtrl.briefSummaryLabel,
    activeReferenceHandles: briefCtrl.activeReferenceHandles,
    activeBriefContext: briefCtrl.activeBriefContext,
    hasApiKey,
    apiKey: settings.apiKey,
    model: settings.model,
    reasoningLevel: settings.reasoningLevel,
    quickScanSensitivity: settings.quickScanSensitivity,
    skillsState: aiSkills.skillsState,
    quickScanRulesState: quickScanRules.rulesState,
    onApplyPatchSuggestion,
    onApplyDraftSuggestion,
    onApplyTitleSuggestion,
    onActivePatchesChange,
    onActiveQuickScanChange,
    onRegisterLivePatchActions,
    onHasActiveInteractionChange: setHasActiveInteraction,
    onLastTurnSnapshotHashChange: setLastTurnSnapshotHash,
    onLastTurnRawTextChange: setLastTurnRawText,
    onLastTurnSceneTitleChange: setLastTurnSceneTitle,
    onLastTurnDiagnosticsFingerprintChange: setLastTurnDiagnosticsFingerprint,
    onLastTurnBriefContextChange: setLastTurnBriefContext,
    onOpenSettings: handleOpenSettings,
    onStreamStart: handleStreamStart,
    onResetChatUi: handleResetChatUi,
    onScriptSwitchReset: handleScriptSwitchReset,
    onDraftApplied: handleDraftApplied,
    onClearAskFirst: handleClearAskFirst,
  });

  const modelOption = getGeminiModelOption(settings.model);
  const reasoningOption =
    REASONING_LEVEL_OPTIONS.find((r) => r.id === settings.reasoningLevel) ??
    REASONING_LEVEL_OPTIONS[1];

  const sessionCost = useMemo(() => aggregateSessionCost(chat.messages), [chat.messages]);
  const formattedSessionCost = formatEstimatedUsd(sessionCost.totalCostUsd);

  const handleSessionCostMouseEnter = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (sessionCost.turnCount === 0) return;
      setSessionCostTooltip(
        buildSessionCostTooltip(
          sessionCost,
          formattedSessionCost,
          event.currentTarget.getBoundingClientRect()
        )
      );
    },
    [sessionCost, formattedSessionCost]
  );

  const handleThreadScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearBottom = isNearScrollBottom(el);
    shouldAutoScrollRef.current = nearBottom;
    setIsScrolledUp((prev) => (prev === !nearBottom ? prev : !nearBottom));
  }, []);

  const handleJumpToLatest = useCallback(() => {
    shouldAutoScrollRef.current = true;
    setIsScrolledUp(false);
    threadEndRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'});
  }, []);

  const lastMessage =
    chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : undefined;
  const streamingScrollKey = `${chat.messages.length}:${chat.isStreaming ? 1 : 0}:${lastMessage?.thoughtSummary?.length ?? 0}:${lastMessage?.text.length ?? 0}:${lastMessage?.toolCalls?.length ?? 0}:${lastMessage?.loadedSkills?.length ?? 0}:${lastMessage?.suggestions?.length ?? 0}:${lastMessage?.error?.code ?? ''}`;

  // Sticky-bottom auto-scroll: follows live streaming updates unless the user scrolled up to read earlier messages
  useEffect(() => {
    if (!isOpen || !shouldAutoScrollRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isOpen, streamingScrollKey]);

  const handleComposerSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || chat.isStreaming) return;
    const turnAskMode: AskQuestionMode =
      effectiveAskFirstEnabled && focus !== 'audit' ? 'ask_first' : 'off';
    setInputValue('');
    if (askFirstEnabled) {
      setAskFirstEnabled(false);
    }
    void chat.submitPrompt(trimmed, {askQuestionMode: turnAskMode});
  }, [
    inputValue,
    chat.isStreaming,
    askFirstEnabled,
    effectiveAskFirstEnabled,
    focus,
    chat.submitPrompt,
  ]);

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        handleComposerSend();
      }
    },
    [handleComposerSend]
  );

  const focusMeta =
    focus === 'auto'
      ? isEmpty
        ? UI_LABELS.ai.focuses.autoEmpty
        : UI_LABELS.ai.focuses.autoActive
      : UI_LABELS.ai.focuses[focus];

  if (!isOpen || !previewComposedContext) {
    return null;
  }

  return (
    <>
      {/* Narrow-viewport backdrop (< lg) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 top-12 z-40 bg-overlay-bg backdrop-blur-[1px] lg:hidden"
      />

      <aside
        ref={sidebarRef}
        data-ai-sidebar="true"
        aria-label={UI_LABELS.ai.sidebarAria}
        style={{'--ai-sidebar-width': `${resizeCtrl.sidebarWidth}px`} as CSSProperties}
        className="fixed inset-y-0 right-0 top-12 z-50 flex w-[min(100vw,420px)] flex-col overflow-hidden border-l border-border-main bg-surface text-text-main shadow-2xl lg:static lg:top-auto lg:z-20 lg:h-full lg:min-h-0 lg:w-[var(--ai-sidebar-width)] lg:max-w-[580px] lg:min-w-[340px] lg:shadow-none shrink-0"
      >
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
          {/* Desktop drag-to-resize left edge handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={UI_LABELS.ai.resizeAria}
            onPointerDown={resizeCtrl.handleResizePointerDown}
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
                  totalCustomizationCount
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
                {(totalCustomizationCount > 0 || hasAnyUpstreamUpdate) && (
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${
                      hasAnyUpstreamUpdate
                        ? 'bg-amber-500'
                        : 'bg-[var(--phase-continuity-text)]'
                    }`}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={chat.handleResetChat}
                disabled={chat.messages.length === 0 && !chat.isStreaming}
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

          {/* Scrollable Message Stream */}
          <div className="relative flex-1 min-h-0 flex flex-col">
            <div
              ref={scrollContainerRef}
              onScroll={handleThreadScroll}
              className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll px-3 py-3 space-y-3 bg-app/50"
            >
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
                      onClick={handleOpenSettings}
                      className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px]`}
                    >
                      <Settings2 className="h-3 w-3" />
                      <span>{UI_LABELS.ai.missingKeyCta}</span>
                    </button>
                  </div>
                </div>
              )}

              {chat.messages.length === 0 ? (
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
                chat.messages.map((msg, idx) => (
                  <AiThreadMessage
                    key={msg.id}
                    msg={msg}
                    previousMessage={idx > 0 ? chat.messages[idx - 1] : undefined}
                    rawText={rawText}
                    ruleOverrides={ruleOverrides}
                    currentSnapshotHash={currentSnapshotHash}
                    readOnly={readOnly}
                    isEmpty={isEmpty}
                    isRunning={chat.isStreaming}
                    showThinkingSummary={settings.showThinkingSummary}
                    showEstimatedCost={settings.showEstimatedCost}
                    showDebugTrace={settings.showDebugTrace}
                    onInspectTrace={handleInspectTrace}
                    onJumpToTarget={onJumpToTarget}
                    onDeepAuditFromQuickScan={chat.handleDeepAuditFromQuickScan}
                    onQuickScan={chat.handleQuickScan}
                    onDismissQuickScan={chat.handleDismissQuickScan}
                    onApplyPatch={chat.handleApplyPatch}
                    onApplyAuditFixesBatch={chat.handleApplyAuditFixesBatch}
                    onApplyDraft={chat.handleApplyDraft}
                    onApplyTitle={chat.handleApplyTitle}
                    onSubmitQuestionAnswers={chat.handleSubmitQuestionAnswers}
                    onDismissSuggestion={chat.markSuggestionDismissed}
                    onQuickAudit={chat.handleQuickAudit}
                    onOpenSettings={handleOpenSettings}
                  />
                ))
              )}
              <div ref={threadEndRef} />
            </div>

            {isScrolledUp && chat.messages.length > 0 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center z-20">
                <button
                  type="button"
                  onClick={handleJumpToLatest}
                  aria-label={UI_LABELS.ai.jumpToLatestAria}
                  className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-border-main bg-surface/95 backdrop-blur-xs px-2.5 py-1 text-[11px] font-medium text-text-main shadow-md hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  <ArrowDown className="h-3 w-3 text-text-muted" />
                  <span>{UI_LABELS.ai.jumpToLatestButton}</span>
                </button>
              </div>
            )}
          </div>

          <AiComposerDock
            composerRef={composerRef}
            inputValue={inputValue}
            placeholder={focusMeta.placeholder}
            isStreaming={chat.isStreaming}
            isEmpty={isEmpty}
            focus={focus}
            targetOptions={targetOptions}
            activeTargetKey={activeTarget.key}
            isBriefOpen={briefCtrl.isBriefOpen}
            briefHasContent={briefCtrl.briefHasContent}
            briefIsActive={briefCtrl.briefIsActive}
            briefSummaryLabel={briefCtrl.briefSummaryLabel}
            askFirstEnabled={effectiveAskFirstEnabled}
            askFirstDisabled={isAskQuestionToolDisabled}
            showEstimatedCost={settings.showEstimatedCost}
            sessionCostTurnCount={sessionCost.turnCount}
            formattedSessionCost={formattedSessionCost}
            hasApiKey={hasApiKey}
            modelShortLabel={modelOption.shortLabel}
            reasoningLabel={reasoningOption.label}
            onInputChange={setInputValue}
            onComposerKeyDown={handleComposerKeyDown}
            onComposerSend={handleComposerSend}
            onStopRun={chat.handleStopRun}
            onComposerResizePointerDown={resizeCtrl.handleComposerResizePointerDown}
            onComposerResizeReset={resizeCtrl.resetComposerHeight}
            onFocusChange={setFocus}
            onTargetKeyChange={setSelectedTargetKey}
            onQuickScan={chat.handleQuickScan}
            onQuickAudit={chat.handleQuickAudit}
            onOpenBrief={handleOpenBrief}
            onToggleAskFirst={handleToggleAskFirst}
            onSessionCostMouseEnter={handleSessionCostMouseEnter}
            onSessionCostMouseLeave={handleClearSessionCostTooltip}
            onOpenSettings={handleOpenSettings}
          />
        </div>
      </aside>

      <HoverTooltipPortal tooltip={sessionCostTooltip} />

      {briefCtrl.isBriefOpen && (
        <Suspense fallback={null}>
          <AiBriefModal
            isOpen={briefCtrl.isBriefOpen}
            apiKey={settings.apiKey}
            hasApiKey={hasApiKey}
            brief={briefCtrl.brief}
            briefHasContent={briefCtrl.briefHasContent}
            onClose={() => briefCtrl.setIsBriefOpen(false)}
            onOpenSettings={handleOpenSettings}
            onSetEnabled={briefCtrl.handleSetBriefEnabled}
            onAddReference={briefCtrl.handleAddReference}
            onAddReferenceEntry={briefCtrl.handleAddReferenceEntry}
            onUpdateReference={briefCtrl.handleUpdateReference}
            onRemoveReference={briefCtrl.handleRemoveReference}
            onUpdateSpecs={briefCtrl.handleUpdateBriefSpecs}
            onUpdateSubtext={briefCtrl.handleUpdateBriefSubtext}
            onClearBrief={briefCtrl.handleClearBrief}
          />
        </Suspense>
      )}

      {isSettingsOpen && (
        <Suspense fallback={null}>
          <AiSettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            hasApiKey={hasApiKey}
            onUpdateSettings={aiSettings.updateSettings}
            onSetApiKey={aiSettings.setApiKey}
            onSetSessionOnly={aiSettings.setSessionOnly}
            onClearApiKey={aiSettings.clearStoredApiKey}
            onResetDefaults={aiSettings.resetPreferencesToDefault}
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
            skillsState={aiSkills.skillsState}
            customizationCount={aiSkills.customizationCount}
            toolCustomizationCount={aiSkills.toolCustomizationCount}
            hasUpstreamUpdate={aiSkills.hasUpstreamUpdate}
            onSetFoundationalCraft={aiSkills.setFoundationalCraft}
            onSetPinMode={aiSkills.setPinMode}
            onSetAllPinModes={aiSkills.setAllPinModes}
            onSetBodyOverride={aiSkills.setBodyOverride}
            onResetSkill={aiSkills.resetSkill}
            onSaveCustomSkill={aiSkills.saveCustomSkill}
            onDeleteCustomSkill={aiSkills.removeCustomSkill}
            onSetToolProtocol={aiSkills.setToolProtocol}
            onSetEnforceLinterGate={aiSkills.setEnforceLinterGate}
            onSetToolMode={aiSkills.setToolMode}
            onSetAllToolModes={aiSkills.setAllToolModes}
            onSetToolDescription={aiSkills.setToolDescription}
            onSetToolGuidance={aiSkills.setToolGuidance}
            onResetTool={aiSkills.resetTool}
            onResetAllTools={aiSkills.resetAllTools}
            onReplaceSkillsState={aiSkills.replaceSkillsState}
            onResetAll={aiSkills.resetAll}
            onAcknowledgeUpdate={aiSkills.acknowledgeUpdate}
            quickScanRulesState={quickScanRules.rulesState}
            quickScanCustomizationCount={quickScanRules.customizationCount}
            hasQuickScanUpstreamUpdate={quickScanRules.hasUpstreamUpdate}
            onSetQuickScanRuleEnabled={quickScanRules.setRuleEnabled}
            onSetAllQuickScanRulesEnabled={quickScanRules.setAllRulesEnabled}
            onSetQuickScanRuleTextOverride={quickScanRules.setRuleTextOverride}
            onResetQuickScanRule={quickScanRules.resetRule}
            onSaveCustomQuickScanRule={quickScanRules.saveCustomRule}
            onDeleteCustomQuickScanRule={quickScanRules.deleteCustomRule}
            onReplaceQuickScanRulesState={quickScanRules.replaceRulesState}
            onResetAllQuickScanRules={quickScanRules.resetAllRules}
            onAcknowledgeQuickScanUpdate={quickScanRules.acknowledgeRulesUpdate}
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
