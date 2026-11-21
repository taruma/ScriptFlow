import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {createPortal} from 'react-dom';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  HelpCircle,
  KeyRound,
  Layers,
  Loader2,
  RotateCcw,
  ScanSearch,
  Settings2,
  ShieldAlert,
  Sparkles,
  Square,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import type {AuteurDocument, AuteurLensPresetId, LintRuleOverrides} from '../core/index.ts';
import {
  composeAgentContext,
  type AskQuestionMode,
  type AssistantFocus,
} from '../services/auteurKnowledge.ts';
import {
  AUDIT_LENS_PRESET_IDS,
  buildQuickScanEscalationPrompt,
  runQuickScan,
  type QuickScanResult,
} from '../services/geminiDecisions.ts';
import {
  GeminiServiceError,
  runGeminiAgentTurn,
  type AgentTurnTrace,
} from '../services/geminiInteractions.ts';
import {
  rebaseAuditReviewAfterFix,
  upsertStagedSuggestion,
  type DraftSuggestion,
  type PatchSuggestion,
  type QuestionSuggestion,
  type StagedSuggestion,
} from '../services/scriptTools.ts';
import {
  AUDIT_QUICK_CHECKS,
  AUTO_GROW_MAX_COMPOSER_HEIGHT,
  buildAiTargetOptions,
  buildAuditQuickPrompt,
  buildBriefSummaryBadge,
  buildScopedRefinePrompt,
  clampComposerHeight,
  collectPendingBriefAttachments,
  EMPTY_DRAFT_BRIEF,
  focusToLegacyMode,
  formatQuestionAnswersPrompt,
  formatSceneBriefContext,
  formatToolCallTooltip,
  getBriefReferenceHandles,
  getLatestActiveQuickScan,
  getNextReferenceHandle,
  hasDraftBriefContent,
  isDraftBriefActive,
  isNearScrollBottom,
  isSuggestionStale,
  MIN_COMPOSER_HEIGHT,
  reconcileTargetScope,
  shouldShowSettingsLinkForError,
  upsertLoadedSkill,
  type AiChatMessage,
  type AiLoadedSkillItem,
  type AiToolCallItem,
  type AuditQuickCheckId,
  type DraftBriefState,
  type QuestionAnswerDraft,
  type ReferenceEntry,
} from '../ui/aiAssistant.ts';
import {
  aggregateSessionCost,
  estimateTraceCost,
  formatEstimatedUsd,
  formatUsdBreakdown,
} from '../ui/aiPricing.ts';
import {
  getGeminiModelOption,
  REASONING_LEVEL_OPTIONS,
  useAiSettings,
} from '../ui/aiSettings.ts';
import {useAiSkills} from '../ui/aiSkillsStore.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {collectActiveAiPatches, type ActiveAiPatchItem} from '../ui/patchIndicators.ts';
import {useQuickScanRulesStore} from '../ui/quickScanRulesStore.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import type {NewReferenceEntryDraft} from './AiBriefModal.tsx';
import type {ContextInspectorTabId} from './AiContextInspectorModal.tsx';
import {
  AuditReviewSuggestionCard,
  DraftSuggestionCard,
  PatchSuggestionCard,
  QuestionSuggestionCard,
} from './AiSuggestionCards.tsx';
import type {AiInspectableTrace} from './AiTraceModal.tsx';
import {MarkdownContent} from './MarkdownContent.tsx';
import {QuickScanCard} from './QuickScanCard.tsx';

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

const AiBriefModal = lazy(() =>
  import('./AiBriefModal.tsx').then((mod) => ({
    default: mod.AiBriefModal,
  }))
);

const ASSISTANT_FOCUSES: readonly AssistantFocus[] = ['auto', 'draft', 'refine', 'audit'];
const EMPTY_TOOL_CALLS: readonly AiToolCallItem[] = [];
const EMPTY_LOADED_SKILLS: readonly AiLoadedSkillItem[] = [];
const EMPTY_REFERENCE_HANDLES: readonly string[] = [];
const MIN_SIDEBAR_WIDTH = 340;
const MAX_SIDEBAR_WIDTH = 580;
const DEFAULT_SIDEBAR_WIDTH = 410;

export interface AiLivePatchActionHandlers {
  applyPatchById: (patchId: string) => void;
  dismissPatchById: (patchId: string) => void;
  auditQuickScanBeat?: (beatIndex: number) => void;
}

export interface AiAssistantSidebarProps {
  scriptSessionKey: string;
  rawText: string;
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
  onJumpToTarget: (targetId: string) => void;
  onActivePatchesChange?: (patches: ActiveAiPatchItem[]) => void;
  onActiveQuickScanChange?: (quickScan: QuickScanResult | null) => void;
  onRegisterLivePatchActions?: (actions: AiLivePatchActionHandlers | null) => void;
}

interface HoverTooltipRow {
  label: string;
  secondary?: string;
  value: string;
}

interface ActivityHoverTooltip {
  title: string;
  subtitle: string;
  badge?: string;
  detail?: string;
  rows?: readonly HoverTooltipRow[];
  footer?: string;
  top: number;
  left: number;
  placeAbove: boolean;
}

function buildTooltipPosition(
  rect: DOMRect,
  options?: {width?: number; forceAbove?: boolean}
): {top: number; left: number; placeAbove: boolean} {
  const tooltipWidth = options?.width ?? 264;
  const pad = 12;
  const left = Math.max(pad, Math.min(rect.left, window.innerWidth - tooltipWidth - pad));
  const placeAbove = options?.forceAbove ?? rect.top > 150;
  const top = placeAbove ? rect.top - 8 : rect.bottom + 8;
  return {top, left, placeAbove};
}

function HoverTooltipPortal({tooltip}: {tooltip: ActivityHoverTooltip | null}) {
  if (!tooltip || typeof document === 'undefined') return null;
  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: `${tooltip.top}px`,
        left: `${tooltip.left}px`,
        transform: tooltip.placeAbove ? 'translateY(-100%)' : undefined,
      }}
      className="pointer-events-none z-[120] w-[264px] max-w-[calc(100vw-24px)] rounded-lg border border-border-main bg-surface px-2.5 py-2 shadow-xl text-text-main space-y-1.5"
    >
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-text-main truncate">
            {tooltip.title}
          </span>
          {tooltip.badge && (
            <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[9px] text-text-muted tabular-nums shrink-0">
              {tooltip.badge}
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] text-text-faint truncate">{tooltip.subtitle}</div>
      </div>

      {tooltip.detail && (
        <p className="text-[11px] leading-snug text-text-body break-words">{tooltip.detail}</p>
      )}

      {tooltip.rows && tooltip.rows.length > 0 && (
        <div className="border-t border-border-subtle pt-1.5 space-y-1 font-mono text-[10px] tabular-nums">
          {tooltip.rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <span className="text-text-muted truncate">{row.label}</span>
              <span className="flex items-center gap-2 shrink-0">
                {row.secondary && <span className="text-text-faint">{row.secondary}</span>}
                <span className="text-text-main font-medium">{row.value}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {tooltip.footer && (
        <p className="border-t border-border-subtle pt-1 text-[10px] leading-snug text-text-faint">
          {tooltip.footer}
        </p>
      )}
    </div>,
    document.body
  );
}

interface ReasoningAccordionProps {
  isStreaming: boolean;
  showThinkingSummary: boolean;
  showEstimatedCost: boolean;
  showDebugTrace: boolean;
  hasError: boolean;
  thoughtSummary: string;
  toolCalls: readonly AiToolCallItem[];
  loadedSkills: readonly AiLoadedSkillItem[];
  trace?: AgentTurnTrace;
  onInspectTrace: (trace: AiInspectableTrace) => void;
}

const ReasoningAccordion = memo(function ReasoningAccordion({
  isStreaming,
  showThinkingSummary,
  showEstimatedCost,
  showDebugTrace,
  hasError,
  thoughtSummary,
  toolCalls,
  loadedSkills,
  trace,
  onInspectTrace,
}: ReasoningAccordionProps) {
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const [tooltip, setTooltip] = useState<ActivityHoverTooltip | null>(null);
  const wasStreamingRef = useRef(isStreaming);
  const thoughtBodyRef = useRef<HTMLDivElement | null>(null);
  const thoughtStickyRef = useRef<boolean>(true);

  // Auto-collapse thinking summary once a streaming turn completes
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setUserOverride(null);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const turnCost = useMemo(
    () => (!isStreaming && trace ? estimateTraceCost(trace) : null),
    [isStreaming, trace]
  );

  const hasVisibleThought = showThinkingSummary && thoughtSummary.trim().length > 0;
  const showThinkingCard = (showThinkingSummary && isStreaming) || hasVisibleThought;
  const hasTools = toolCalls.length > 0;
  const hasSkills = loadedSkills.length > 0;
  const hasActivity = hasTools || hasSkills;
  const canInspect = showDebugTrace && !isStreaming && Boolean(trace);
  const showCost = showEstimatedCost && Boolean(turnCost);
  const showMetaOnlyBar = ((canInspect && !hasError) || showCost) && !showThinkingCard && !hasActivity;

  const isOpen = showThinkingCard && (userOverride !== null ? userOverride : isStreaming);

  // Keep long streaming thought summaries pinned to the bottom unless the user scrolled up inside the box
  useEffect(() => {
    if (!isOpen || !isStreaming || !thoughtStickyRef.current) return;
    const el = thoughtBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thoughtSummary.length, isOpen, isStreaming]);

  if (!showThinkingCard && !hasActivity && !showMetaOnlyBar) {
    return null;
  }

  const openPillTooltip = (
    event: ReactMouseEvent<HTMLElement>,
    content: Omit<ActivityHoverTooltip, 'top' | 'left' | 'placeAbove'>
  ) => {
    const pos = buildTooltipPosition(event.currentTarget.getBoundingClientRect());
    setTooltip({...content, ...pos});
  };

  const renderCostBadge = () => {
    if (!showCost || !turnCost || !trace) return null;
    const costLabels = UI_LABELS.ai.cost;
    const formattedTotal = formatEstimatedUsd(turnCost.totalCostUsd);
    const modelLabel = getGeminiModelOption(trace.model).label;
    const roundsCount = Math.max(1, trace.rounds.length);
    const nonCachedInputOnlyCost =
      (turnCost.usage.nonCachedInputTokens * turnCost.rates.inputPer1M) / 1_000_000;
    const rows: HoverTooltipRow[] = [
      {
        label: costLabels.rowInput,
        secondary: costLabels.formatTokens(turnCost.usage.nonCachedInputTokens),
        value: formatUsdBreakdown(nonCachedInputOnlyCost),
      },
    ];
    if (turnCost.usage.cachedTokens > 0) {
      rows.push({
        label: costLabels.rowCached,
        secondary: costLabels.formatTokens(turnCost.usage.cachedTokens),
        value: formatUsdBreakdown(turnCost.cachedCostUsd),
      });
    }
    if (turnCost.usage.toolUseTokens > 0) {
      const toolInputCost = (turnCost.usage.toolUseTokens * turnCost.rates.inputPer1M) / 1_000_000;
      rows.push({
        label: costLabels.rowToolInput,
        secondary: costLabels.formatTokens(turnCost.usage.toolUseTokens),
        value: formatUsdBreakdown(toolInputCost),
      });
    }
    rows.push({
      label: costLabels.rowOutput,
      secondary: costLabels.formatTokens(turnCost.usage.outputTokens),
      value: formatUsdBreakdown(turnCost.outputCostUsd),
    });
    if (turnCost.usage.thoughtTokens > 0) {
      rows.push({
        label: costLabels.rowThinking,
        secondary: costLabels.formatTokens(turnCost.usage.thoughtTokens),
        value: formatUsdBreakdown(turnCost.thoughtCostUsd),
      });
    }

    return (
      <span
        aria-label={costLabels.turnBadgeAria(formattedTotal)}
        onMouseEnter={(event) =>
          openPillTooltip(event, {
            title: costLabels.turnTooltipTitle,
            subtitle: costLabels.turnTooltipSubtitle(
              modelLabel,
              roundsCount,
              turnCost.rates.isPromoRate
            ),
            badge: formattedTotal,
            rows,
            footer: costLabels.disclaimer,
          })
        }
        onMouseLeave={() => setTooltip(null)}
        className="inline-flex items-center rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted tabular-nums hover:border-border-main hover:text-text-main transition-colors cursor-default select-none shrink-0"
      >
        {formattedTotal}
      </span>
    );
  };

  const renderInspectButton = () =>
    canInspect && trace ? (
      <button
        type="button"
        onClick={() => onInspectTrace(trace)}
        title={UI_LABELS.ai.inspectTraceTitle}
        aria-label={UI_LABELS.ai.inspectTraceAria}
        className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer shrink-0"
      >
        <Terminal className="h-2.5 w-2.5 text-text-faint" />
        <span>{UI_LABELS.ai.inspectTraceButton}</span>
      </button>
    ) : null;

  return (
    <div className="space-y-1.5">
      {/* Part 1: Dedicated Thinking Summary Accordion */}
      {showThinkingCard && (
        <div className="rounded-xl border border-border-subtle bg-surface-subtle overflow-hidden">
          <div className="flex items-center justify-between gap-1">
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
              </div>
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-faint" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" />
              )}
            </button>
            {(showCost || canInspect) && (
              <div className="pr-1.5 flex items-center gap-1 shrink-0">
                {renderCostBadge()}
                {renderInspectButton()}
              </div>
            )}
          </div>

          {isOpen && (
            <div
              ref={thoughtBodyRef}
              onScroll={(event) => {
                thoughtStickyRef.current = isNearScrollBottom(event.currentTarget);
              }}
              className="border-t border-border-subtle px-2.5 py-2 max-h-56 overflow-y-auto auteur-pane-scroll"
            >
              {thoughtSummary.trim().length > 0 ? (
                <MarkdownContent content={thoughtSummary} compact />
              ) : (
                <p className="text-[11px] italic text-text-faint">
                  {UI_LABELS.ai.reasoningRunning}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Part 2: Separated Skills & Tools Activity Strip (Always Scannable + Hover Tooltips) */}
      {(hasActivity || showMetaOnlyBar) && (
        <div
          aria-label={UI_LABELS.ai.toolsSkillsRegionAria}
          className="flex flex-wrap items-center justify-between gap-1.5 px-0.5"
        >
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {loadedSkills.map((skill) => (
              <span
                key={skill.id}
                onMouseEnter={(event) =>
                  openPillTooltip(event, {
                    title: skill.name,
                    subtitle: skill.id,
                    badge: UI_LABELS.ai.skillSources[skill.source],
                    detail: UI_LABELS.ai.skillSourceDescriptions[skill.source],
                  })
                }
                onMouseLeave={() => setTooltip(null)}
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] cursor-default select-none ${
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

            {toolCalls.map((tool) => {
              const info = formatToolCallTooltip(tool);
              return (
                <span
                  key={tool.callId}
                  onMouseEnter={(event) =>
                    openPillTooltip(event, {
                      title: info.title,
                      subtitle: info.toolName,
                      badge: info.statusLabel,
                      detail: info.detail,
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] cursor-default select-none ${
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
                  <span>{info.title}</span>
                </span>
              );
            })}
          </div>

          {!showThinkingCard && (showCost || (canInspect && !hasError)) && (
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {renderCostBadge()}
              {!hasError && renderInspectButton()}
            </div>
          )}
        </div>
      )}

      {/* Portal Hover Tooltip for Tool, Skill & Cost Pills */}
      <HoverTooltipPortal tooltip={tooltip} />
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
  onActivePatchesChange,
  onActiveQuickScanChange,
  onRegisterLivePatchActions,
}: AiAssistantSidebarProps) {
  const {
    settings,
    hasApiKey,
    updateSettings,
    setApiKey,
    setSessionOnly,
    clearStoredApiKey,
    resetPreferencesToDefault,
  } = useAiSettings();

  const {
    skillsState,
    customizationCount,
    hasUpstreamUpdate,
    setFoundationalCraft,
    setPinMode,
    setBodyOverride,
    resetSkill,
    saveCustomSkill,
    removeCustomSkill,
    resetAll,
    acknowledgeUpdate,
  } = useAiSkills();

  const {
    rulesState: quickScanRulesState,
    customizationCount: quickScanCustomizationCount,
    hasUpstreamUpdate: hasQuickScanUpstreamUpdate,
    setRuleEnabled: setQuickScanRuleEnabled,
    setRuleTextOverride: setQuickScanRuleTextOverride,
    resetRule: resetQuickScanRule,
    saveCustomRule: saveCustomQuickScanRule,
    deleteCustomRule: deleteCustomQuickScanRule,
    resetAllRules: resetAllQuickScanRules,
    acknowledgeRulesUpdate: acknowledgeQuickScanRulesUpdate,
  } = useQuickScanRulesStore();

  const totalCustomizationCount = customizationCount + quickScanCustomizationCount;
  const hasAnyUpstreamUpdate = hasUpstreamUpdate || hasQuickScanUpstreamUpdate;

  const [focus, setFocus] = useState<AssistantFocus>('auto');
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>('whole');
  const [brief, setBrief] = useState<DraftBriefState>(EMPTY_DRAFT_BRIEF);
  const [isBriefOpen, setIsBriefOpen] = useState<boolean>(false);
  const [askFirstEnabled, setAskFirstEnabled] = useState<boolean>(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isContextOpen, setIsContextOpen] = useState<boolean>(false);
  const [contextInitialTab, setContextInitialTab] = useState<ContextInspectorTabId>('preview');
  const [inspectedTrace, setInspectedTrace] = useState<AiInspectableTrace | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_SIDEBAR_WIDTH);
  const [manualComposerHeight, setManualComposerHeight] = useState<number | null>(null);
  const [lastTurnSnapshotHash, setLastTurnSnapshotHash] = useState<string | undefined>(undefined);
  const [isScrolledUp, setIsScrolledUp] = useState<boolean>(false);
  const [sessionCostTooltip, setSessionCostTooltip] = useState<ActivityHoverTooltip | null>(null);

  const previousInteractionIdRef = useRef<string | undefined>(undefined);
  const lastTurnSnapshotHashRef = useRef<string | undefined>(undefined);
  const sentAttachmentFingerprintsRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<number>(0);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef<boolean>(true);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSessionKeyRef = useRef<string>(scriptSessionKey);

  const briefHasContent = useMemo(() => hasDraftBriefContent(brief), [brief]);
  const briefIsActive = useMemo(() => isDraftBriefActive(brief), [brief]);
  const referenceHandles = useMemo(() => getBriefReferenceHandles(brief), [brief]);
  const activeReferenceHandles = briefIsActive ? referenceHandles : EMPTY_REFERENCE_HANDLES;
  const activeBriefContext = useMemo(() => formatSceneBriefContext(brief), [brief]);
  const briefSummaryLabel = useMemo(() => buildBriefSummaryBadge(brief), [brief]);

  const effectivePreviewAskMode: AskQuestionMode =
    askFirstEnabled && focus !== 'audit' ? 'ask_first' : 'off';

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
        referenceHandles: activeReferenceHandles,
        briefContext: activeBriefContext,
        askQuestionMode: effectivePreviewAskMode,
      }),
    [
      focus,
      rawText,
      ruleOverrides,
      lastTurnSnapshotHash,
      skillsState.foundationalCraftOverride,
      skillsState.skillOverrides,
      skillsState.customSkills,
      activeReferenceHandles,
      activeBriefContext,
      effectivePreviewAskMode,
    ]
  );

  const isEmpty = previewComposedContext.editorState.isEmpty;
  const currentSnapshotHash = previewComposedContext.editorState.snapshotHash;

  const activePatches = useMemo(
    () => collectActiveAiPatches(messages, currentSnapshotHash),
    [messages, currentSnapshotHash]
  );

  const activeQuickScan = useMemo(
    () => getLatestActiveQuickScan(messages, currentSnapshotHash),
    [messages, currentSnapshotHash]
  );

  useEffect(() => {
    onActivePatchesChange?.(activePatches);
  }, [activePatches, onActivePatchesChange]);

  useEffect(() => {
    return () => {
      onActivePatchesChange?.([]);
    };
  }, [onActivePatchesChange]);

  useEffect(() => {
    onActiveQuickScanChange?.(activeQuickScan);
  }, [activeQuickScan, onActiveQuickScanChange]);

  useEffect(() => {
    return () => {
      onActiveQuickScanChange?.(null);
    };
  }, [onActiveQuickScanChange]);

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

  const sessionCost = useMemo(() => aggregateSessionCost(messages), [messages]);
  const formattedSessionCost = formatEstimatedUsd(sessionCost.totalCostUsd);

  const handleSessionCostMouseEnter = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (sessionCost.turnCount === 0) return;
      const costLabels = UI_LABELS.ai.cost;
      const rows: HoverTooltipRow[] = [
        {
          label: costLabels.rowInput,
          secondary: costLabels.formatTokens(sessionCost.nonCachedInputTokens + sessionCost.toolUseTokens),
          value: formatUsdBreakdown(sessionCost.inputCostUsd),
        },
      ];
      if (sessionCost.cachedTokens > 0) {
        rows.push({
          label: costLabels.rowCached,
          secondary: costLabels.formatTokens(sessionCost.cachedTokens),
          value: formatUsdBreakdown(sessionCost.cachedCostUsd),
        });
      }
      rows.push({
        label: costLabels.rowOutput,
        secondary: costLabels.formatTokens(sessionCost.outputTokens),
        value: formatUsdBreakdown(sessionCost.outputCostUsd),
      });
      if (sessionCost.thoughtTokens > 0) {
        rows.push({
          label: costLabels.rowThinking,
          secondary: costLabels.formatTokens(sessionCost.thoughtTokens),
          value: formatUsdBreakdown(sessionCost.thoughtCostUsd),
        });
      }
      rows.push({
        label: costLabels.rowTotalTokens,
        value: costLabels.formatTokens(sessionCost.totalTokens),
      });
      const pos = buildTooltipPosition(event.currentTarget.getBoundingClientRect(), {
        forceAbove: true,
      });
      setSessionCostTooltip({
        title: costLabels.sessionTooltipTitle,
        subtitle: costLabels.sessionTooltipSubtitle(sessionCost.turnCount),
        badge: formattedSessionCost,
        rows,
        footer: costLabels.disclaimer,
        ...pos,
      });
    },
    [sessionCost, formattedSessionCost]
  );

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
          handle: getNextReferenceHandle(prev.references, 'text'),
          kind: 'text',
          label: '',
          note: '',
        },
      ],
    }));
  }, []);

  const handleAddReferenceEntry = useCallback((draft: NewReferenceEntryDraft) => {
    setBrief((prev) => ({
      ...prev,
      references: [
        ...prev.references,
        {
          id: `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          handle: getNextReferenceHandle(prev.references, draft.kind),
          kind: draft.kind,
          label: draft.label,
          note: draft.note ?? '',
          ...(draft.attachment ? {attachment: draft.attachment} : {}),
        },
      ],
    }));
  }, []);

  const handleUpdateReference = useCallback(
    (
      refId: string,
      patch: Partial<Pick<ReferenceEntry, 'handle' | 'label' | 'note' | 'attachment'>>
    ) => {
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
    setBrief((prev) => {
      const target = prev.references.find((entry) => entry.id === refId);
      if (target?.attachment?.localMediaUrl) {
        URL.revokeObjectURL(target.attachment.localMediaUrl);
      }
      return {
        ...prev,
        references: prev.references.filter((entry) => entry.id !== refId),
      };
    });
  }, []);

  const handleClearBrief = useCallback(() => {
    setBrief((prev) => {
      for (const entry of prev.references) {
        if (entry.attachment?.localMediaUrl) {
          URL.revokeObjectURL(entry.attachment.localMediaUrl);
        }
      }
      return EMPTY_DRAFT_BRIEF;
    });
  }, []);

  const handleSetBriefEnabled = useCallback((enabled: boolean) => {
    setBrief((prev) => ({...prev, enabled}));
  }, []);

  const handleUpdateBriefSpecs = useCallback((specs: string) => {
    setBrief((prev) => ({...prev, specs}));
  }, []);

  const handleUpdateBriefSubtext = useCallback((subtext: string) => {
    setBrief((prev) => ({...prev, subtext}));
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
    setSessionCostTooltip(null);
    previousInteractionIdRef.current = undefined;
    lastTurnSnapshotHashRef.current = undefined;
    sentAttachmentFingerprintsRef.current.clear();
    shouldAutoScrollRef.current = true;
    setIsScrolledUp(false);
    setLastTurnSnapshotHash(undefined);
    setAskFirstEnabled(false);
    setMessages([]);
  }, []);

  const handleInspectTrace = useCallback((trace: AiInspectableTrace) => {
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

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const streamingScrollKey = `${messages.length}:${isRunning ? 1 : 0}:${lastMessage?.thoughtSummary?.length ?? 0}:${lastMessage?.text.length ?? 0}:${lastMessage?.toolCalls?.length ?? 0}:${lastMessage?.loadedSkills?.length ?? 0}:${lastMessage?.suggestions?.length ?? 0}:${lastMessage?.error?.code ?? ''}`;

  // Sticky-bottom auto-scroll: follows live streaming updates unless the user scrolled up to read earlier messages
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [streamingScrollKey]);

  // Auto-grow composer textarea smoothly unless the user manually dragged its height
  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    if (manualComposerHeight !== null) {
      textarea.style.height = `${manualComposerHeight}px`;
      return;
    }
    textarea.style.height = 'auto';
    const nextHeight = Math.max(
      MIN_COMPOSER_HEIGHT,
      Math.min(AUTO_GROW_MAX_COMPOSER_HEIGHT, textarea.scrollHeight)
    );
    textarea.style.height = `${nextHeight}px`;
  }, [inputValue, manualComposerHeight, sidebarWidth]);

  // Subtle desktop drag-to-resize left edge handler
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

  // Vertical drag-to-resize top handle for the composer prompt box
  const handleComposerResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight =
        manualComposerHeight ?? composerRef.current?.offsetHeight ?? MIN_COMPOSER_HEIGHT;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = startY - moveEvent.clientY;
        const nextHeight = clampComposerHeight(
          startHeight + delta,
          sidebarRef.current?.clientHeight
        );
        setManualComposerHeight(nextHeight);
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [manualComposerHeight]
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
      options?: {
        overrideFocus?: AssistantFocus;
        displayText?: string;
        scopeLabel?: string;
        askQuestionMode?: AskQuestionMode;
      }
    ) => {
      const activeFocus = options?.overrideFocus ?? focus;
      const legacyMode = focusToLegacyMode(activeFocus, isEmpty);
      const effectiveAskMode: AskQuestionMode =
        activeFocus === 'audit' ? 'off' : (options?.askQuestionMode ?? 'off');
      const trimmed = rawUserPrompt.trim();
      if (!trimmed || isRunning) return;

      if (!hasApiKey) {
        setIsSettingsOpen(true);
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
        Boolean(previousInteractionIdRef.current)
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

      shouldAutoScrollRef.current = true;
      setIsScrolledUp(false);
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
          referenceHandles: activeReferenceHandles,
          briefContext: activeBriefContext,
          askQuestionMode: effectiveAskMode,
          attachments: pendingAttachments,
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
                suggestions: upsertStagedSuggestion(msg.suggestions ?? [], suggestion),
              }));
            },
          },
        });

        if (activeRunIdRef.current !== runId) return;

        if (result.interactionId) {
          previousInteractionIdRef.current = result.interactionId;
          for (const att of pendingAttachments) {
            sentAttachmentFingerprintsRef.current.add(att.fingerprint);
          }
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
      briefIsActive,
      briefSummaryLabel,
      activeReferenceHandles,
      activeBriefContext,
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
      skillsState.skillOverrides,
      skillsState.customSkills,
      updateAssistantMessage,
    ]
  );

  const handleComposerSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isRunning) return;
    const turnAskMode: AskQuestionMode =
      askFirstEnabled && focus !== 'audit' ? 'ask_first' : 'off';
    setInputValue('');
    if (askFirstEnabled) {
      setAskFirstEnabled(false);
    }
    void submitPrompt(trimmed, {askQuestionMode: turnAskMode});
  }, [inputValue, isRunning, askFirstEnabled, focus, submitPrompt]);

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

  const handleQuickScan = useCallback(async () => {
    if (isRunning || isEmpty) return;

    if (!hasApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    const userMsgId = `msg-u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const assistantMsgId = `msg-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const runId = ++activeRunIdRef.current;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRunning(true);
    shouldAutoScrollRef.current = true;
    setIsScrolledUp(false);

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
        apiKey: settings.apiKey,
        rawText,
        sensitivity: settings.quickScanSensitivity,
        lintRuleOverrides: ruleOverrides,
        ruleOverrides: quickScanRulesState.ruleOverrides,
        customRules: quickScanRulesState.customRules,
        briefContext: briefForTurn,
        attachments: allBriefAttachments,
        signal: controller.signal,
      });

      if (activeRunIdRef.current !== runId) return;

      updateAssistantMessage(assistantMsgId, (msg) => ({
        ...msg,
        quickScan: result,
        quickScanTrace: trace,
        isStreaming: false,
      }));
    } catch (error) {
      if (activeRunIdRef.current !== runId) return;

      const normalized =
        error instanceof GeminiServiceError
          ? error
          : new GeminiServiceError(
              'api_error',
              error instanceof Error ? error.message : 'Quick Scan request failed.'
            );

      updateAssistantMessage(assistantMsgId, (msg) => ({
        ...msg,
        isStreaming: false,
        quickScanErrorFallback: normalized.code !== 'aborted',
        error: {
          code: normalized.code,
          message: normalized.message,
        },
      }));
    } finally {
      if (activeRunIdRef.current === runId) {
        abortControllerRef.current = null;
        setIsRunning(false);
      }
    }
  }, [
    isRunning,
    isEmpty,
    hasApiKey,
    briefIsActive,
    activeBriefContext,
    brief,
    briefSummaryLabel,
    settings.apiKey,
    settings.quickScanSensitivity,
    rawText,
    ruleOverrides,
    quickScanRulesState.ruleOverrides,
    quickScanRulesState.customRules,
    updateAssistantMessage,
  ]);

  const handleDismissQuickScan = useCallback(
    (messageId: string) => {
      updateAssistantMessage(messageId, (msg) => ({
        ...msg,
        quickScanDismissed: true,
      }));
    },
    [updateAssistantMessage]
  );

  const handleDeepAuditFromQuickScan = useCallback(
    (
      selectedLenses: AuteurLensPresetId[],
      result: QuickScanResult,
      targetBeatIndex?: number
    ) => {
      if (isRunning) return;
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
    [isRunning, submitPrompt]
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

  const handleSubmitQuestionAnswers = useCallback(
    (
      messageId: string,
      suggestion: QuestionSuggestion,
      answers: Record<string, QuestionAnswerDraft>
    ) => {
      if (isRunning) return;
      const formatted = formatQuestionAnswersPrompt(suggestion, answers);
      markSuggestionApplied(messageId, suggestion.id);
      if (askFirstEnabled) {
        setAskFirstEnabled(false);
      }
      void submitPrompt(formatted.promptText, {
        displayText: formatted.displayText,
        askQuestionMode: 'followup',
      });
    },
    [isRunning, askFirstEnabled, markSuggestionApplied, submitPrompt]
  );

  const handleApplyPatch = useCallback(
    async (messageId: string, suggestion: PatchSuggestion, kind: 'patch' | 'fix') => {
      if (isSuggestionStale(suggestion.baseSnapshotHash, currentSnapshotHash)) {
        return;
      }
      const ok = await onApplyPatchSuggestion(suggestion, kind);
      if (!ok) return;

      if (kind === 'fix') {
        updateAssistantMessage(messageId, (msg) => {
          const nextApplied = [...(msg.appliedSuggestionIds ?? []), suggestion.id];
          const appliedSet = new Set(nextApplied);
          const nextSuggestions = (msg.suggestions ?? []).map((entry) =>
            entry.kind === 'audit_review'
              ? rebaseAuditReviewAfterFix(
                  entry,
                  suggestion,
                  suggestion.candidateRawText,
                  appliedSet,
                  ruleOverrides
                )
              : entry
          );
          return {
            ...msg,
            appliedSuggestionIds: nextApplied,
            suggestions: nextSuggestions,
          };
        });
      } else {
        markSuggestionApplied(messageId, suggestion.id);
      }
    },
    [
      currentSnapshotHash,
      onApplyPatchSuggestion,
      updateAssistantMessage,
      ruleOverrides,
      markSuggestionApplied,
    ]
  );

  // Sync live-editor Apply / Dismiss popover actions directly into the sidebar state & Audit rebase flow
  useEffect(() => {
    if (!onRegisterLivePatchActions) return;
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

      updateAssistantMessage(messageId, (msg) => {
        const nextApplied = Array.from(
          new Set([...(msg.appliedSuggestionIds ?? []), ...includedFixIds])
        );
        return {
          ...msg,
          appliedSuggestionIds: nextApplied,
        };
      });
    },
    [currentSnapshotHash, onApplyPatchSuggestion, updateAssistantMessage]
  );

  const handleApplyDraft = useCallback(
    async (messageId: string, suggestion: DraftSuggestion) => {
      const ok = await onApplyDraftSuggestion(suggestion);
      if (ok) {
        markSuggestionApplied(messageId, suggestion.id);
        setIsBriefOpen(false);
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
        ref={sidebarRef}
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
                        {(msg.scopeLabel || msg.briefSummary || msg.askFirst) && (
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
                            {msg.askFirst && (
                              <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-logic">
                                {UI_LABELS.ai.askFirstBadge}
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
                const isQuickScanMsg =
                  Boolean(msg.quickScan) ||
                  Boolean(msg.quickScanTrace) ||
                  Boolean(msg.quickScanErrorFallback) ||
                  (Boolean(msg.isStreaming) &&
                    msg.mode === 'check' &&
                    !msg.thoughtSummary &&
                    (!msg.toolCalls || msg.toolCalls.length === 0) &&
                    !msg.text &&
                    messages.some(
                      (prevMsg, idx) =>
                        idx < messages.indexOf(msg) &&
                        idx === messages.indexOf(msg) - 1 &&
                        prevMsg.role === 'user' &&
                        prevMsg.text === UI_LABELS.ai.quickScanButton
                    ));
                const quickScanCost =
                  msg.quickScanTrace && !msg.isStreaming
                    ? estimateTraceCost(msg.quickScanTrace)
                    : null;

                return (
                  <div key={msg.id} className="space-y-2">
                    {!isQuickScanMsg && (
                      <ReasoningAccordion
                        isStreaming={Boolean(msg.isStreaming)}
                        showThinkingSummary={settings.showThinkingSummary}
                        showEstimatedCost={settings.showEstimatedCost}
                        showDebugTrace={settings.showDebugTrace}
                        hasError={Boolean(msg.error)}
                        thoughtSummary={msg.thoughtSummary ?? ''}
                        toolCalls={msg.toolCalls ?? EMPTY_TOOL_CALLS}
                        loadedSkills={msg.loadedSkills ?? EMPTY_LOADED_SKILLS}
                        trace={msg.trace}
                        onInspectTrace={handleInspectTrace}
                      />
                    )}

                    {isQuickScanMsg && msg.isStreaming && (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-border-main bg-surface-subtle px-3 py-2 text-[11px] text-text-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--phase-continuity-text)]" />
                        <span>{UI_LABELS.ai.quickScan.runningLabel}</span>
                      </div>
                    )}

                    {msg.quickScan && (
                      <div className="space-y-1.5">
                        <QuickScanCard
                          result={msg.quickScan}
                          currentSnapshotHash={currentSnapshotHash}
                          dismissed={Boolean(msg.quickScanDismissed)}
                          disabled={isRunning}
                          onJumpToTarget={onJumpToTarget}
                          onDeepAuditSelected={(lenses, res) =>
                            handleDeepAuditFromQuickScan(lenses, res)
                          }
                          onRescan={() => void handleQuickScan()}
                          onDismiss={() => handleDismissQuickScan(msg.id)}
                        />
                        {((settings.showEstimatedCost && quickScanCost) ||
                          (settings.showDebugTrace && msg.quickScanTrace)) && (
                          <div className="flex items-center justify-end gap-1.5">
                            {settings.showEstimatedCost && quickScanCost && (
                              <span
                                title={`gemini-decision-1 · ${quickScanCost.usage.inputTokens.toLocaleString()} input tok · 0 output tok`}
                                className="inline-flex items-center rounded-md border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted tabular-nums"
                              >
                                {formatEstimatedUsd(quickScanCost.totalCostUsd)}
                              </span>
                            )}
                            {settings.showDebugTrace && msg.quickScanTrace && (
                              <button
                                type="button"
                                onClick={() => handleInspectTrace(msg.quickScanTrace!)}
                                title={UI_LABELS.ai.inspectTraceTitle}
                                aria-label={UI_LABELS.ai.inspectTraceAria}
                                className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
                              >
                                <Terminal className="h-2.5 w-2.5 text-text-faint" />
                                <span>{UI_LABELS.ai.inspectTraceButton}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

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
                          if (suggestion.kind === 'question') {
                            return (
                              <QuestionSuggestionCard
                                key={suggestion.id}
                                suggestion={suggestion}
                                isStreaming={msgStreaming}
                                isRunning={isRunning}
                                isAnswered={applied.includes(suggestion.id)}
                                isDismissed={dismissed.includes(suggestion.id)}
                                onSubmit={(s, answers) =>
                                  handleSubmitQuestionAnswers(msg.id, s, answers)
                                }
                                onDismiss={(id) => markSuggestionDismissed(msg.id, id)}
                              />
                            );
                          }
                          return (
                            <AuditReviewSuggestionCard
                              key={suggestion.id}
                              suggestion={suggestion}
                              rawText={rawText}
                              ruleOverrides={ruleOverrides}
                              currentSnapshotHash={currentSnapshotHash}
                              readOnly={readOnly}
                              isStreaming={msgStreaming}
                              appliedIds={applied}
                              onJumpToTarget={onJumpToTarget}
                              onApplyIssueFix={(patch) => void handleApplyPatch(msg.id, patch, 'fix')}
                              onApplyAllFixes={(batchPatch, includedFixIds) =>
                                void handleApplyAuditFixesBatch(msg.id, batchPatch, includedFixIds)
                              }
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
                            Boolean(msg.quickScanErrorFallback) ||
                            (settings.showDebugTrace &&
                              Boolean(msg.trace ?? msg.quickScanTrace))) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {msg.quickScanErrorFallback && !isEmpty && (
                                <button
                                  type="button"
                                  disabled={isRunning}
                                  onClick={() => handleQuickAudit('all')}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-main hover:bg-surface-subtle transition-colors cursor-pointer disabled:opacity-45"
                                >
                                  <ShieldAlert className="h-3 w-3" />
                                  <span>{UI_LABELS.ai.quickScanFallbackButton}</span>
                                </button>
                              )}
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
                              {settings.showDebugTrace && (msg.trace ?? msg.quickScanTrace) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleInspectTrace((msg.trace ?? msg.quickScanTrace)!)
                                  }
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

            {isScrolledUp && messages.length > 0 && (
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

          {/* Bottom Composer Dock (Resizable Prompt + Focus / Scope / Brief / Model Controls) */}
          <div className="relative border-t border-border-main bg-surface px-3 pb-2.5 pt-2 shrink-0 space-y-2">
            {/* Drag-to-resize top handle for the prompt box */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label={UI_LABELS.ai.composerResizeAria}
              title={UI_LABELS.ai.composerResizeTitle}
              onPointerDown={handleComposerResizePointerDown}
              onDoubleClick={() => setManualComposerHeight(null)}
              className="group absolute -top-1.5 inset-x-0 h-3 flex items-center justify-center cursor-row-resize z-10 select-none"
            >
              <span
                aria-hidden="true"
                className="h-1 w-9 rounded-full bg-border-main/90 group-hover:bg-text-faint/70 transition-colors"
              />
            </div>

            {/* Resizable Prompt Box */}
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
                className="min-h-[56px] flex-1 resize-none overflow-y-auto bg-transparent text-xs leading-relaxed text-text-main placeholder-text-placeholder outline-none auteur-pane-scroll"
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
                  title={`${UI_LABELS.ai.sendButton} (${UI_LABELS.ai.composerHint})`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-btn-primary-bg text-btn-primary-text hover:bg-btn-primary-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* 4-Tab Focus Bar (Auto | Draft | Refine | Audit) */}
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

            {/* Contextual Scope / Quick Audit Controls */}
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
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => void handleQuickScan()}
                      title={UI_LABELS.ai.quickScanTitle}
                      className={`${UI_TOKENS.ai.pillButton} text-[10px] py-1 px-2`}
                    >
                      <ScanSearch className="h-3 w-3 text-text-faint" />
                      <span>{UI_LABELS.ai.quickScanButton}</span>
                    </button>
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
                  </div>
                )}
              </div>
            )}

            {focus === 'audit' && (
              <div
                role="group"
                aria-label={UI_LABELS.ai.auditQuickGroupAria}
                className="flex flex-wrap gap-1"
              >
                {!isEmpty && (
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => void handleQuickScan()}
                    title={UI_LABELS.ai.quickScanTitle}
                    className={`${UI_TOKENS.ai.pillButton} text-[10px] py-0.5 px-2 font-semibold`}
                  >
                    <ScanSearch className="h-3 w-3 text-text-faint" />
                    <span>{UI_LABELS.ai.quickScanButton}</span>
                  </button>
                )}
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

            {/* Bottom Utility Row: Brief + Ask First Toggle | Session Cost + Model Settings Chip */}
            <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-border-subtle">
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={isBriefOpen}
                  aria-label={UI_LABELS.ai.briefToggleAria(
                    isBriefOpen,
                    briefHasContent,
                    briefIsActive
                  )}
                  title={UI_LABELS.ai.briefToggleTitle}
                  onClick={() => setIsBriefOpen(true)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-medium text-[11px] transition-colors cursor-pointer shrink-0 ${
                    isBriefOpen || briefIsActive
                      ? 'auteur-phase-aesthetic'
                      : 'border-border-main bg-surface text-text-body hover:bg-surface-hover hover:text-text-main'
                  }`}
                >
                  <FileText className="h-3 w-3" />
                  <span>
                    {briefSummaryLabel ??
                      (briefHasContent ? UI_LABELS.ai.briefPausedLabel : UI_LABELS.ai.briefToggle)}
                  </span>
                </button>

                {focus !== 'audit' && (
                  <button
                    type="button"
                    aria-pressed={askFirstEnabled}
                    aria-label={UI_LABELS.ai.askFirstAria(askFirstEnabled)}
                    title={UI_LABELS.ai.askFirstTitle}
                    onClick={() => setAskFirstEnabled((prev) => !prev)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-medium text-[11px] transition-colors cursor-pointer shrink-0 ${
                      askFirstEnabled
                        ? 'auteur-phase-logic'
                        : 'border-border-main bg-surface text-text-muted hover:bg-surface-hover hover:text-text-main'
                    }`}
                  >
                    <HelpCircle className="h-3 w-3" />
                    <span>{UI_LABELS.ai.askFirstToggle}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 min-w-0">
                {settings.showEstimatedCost && sessionCost.turnCount > 0 && (
                  <span
                    aria-label={UI_LABELS.ai.cost.sessionBadgeAria(
                      formattedSessionCost,
                      sessionCost.turnCount
                    )}
                    onMouseEnter={handleSessionCostMouseEnter}
                    onMouseLeave={() => setSessionCostTooltip(null)}
                    className="inline-flex items-center rounded-lg border border-border-subtle bg-surface-subtle px-2 py-1 font-mono text-[10px] font-medium text-text-muted tabular-nums hover:border-border-main hover:text-text-main transition-colors cursor-default select-none shrink-0"
                  >
                    {formattedSessionCost}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  title={UI_LABELS.ai.settingsChipTitle}
                  aria-label={UI_LABELS.ai.settingsChipAria(
                    modelOption.shortLabel,
                    reasoningOption.label
                  )}
                  className={`${UI_TOKENS.ai.statusChip} min-w-0`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      hasApiKey ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span className="truncate">
                    {modelOption.shortLabel} · {reasoningOption.label}
                  </span>
                  <Settings2 className="h-3 w-3 shrink-0 text-text-faint" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <HoverTooltipPortal tooltip={sessionCostTooltip} />

      {isBriefOpen && (
        <Suspense fallback={null}>
          <AiBriefModal
            isOpen={isBriefOpen}
            apiKey={settings.apiKey}
            hasApiKey={hasApiKey}
            brief={brief}
            briefHasContent={briefHasContent}
            onClose={() => setIsBriefOpen(false)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onSetEnabled={handleSetBriefEnabled}
            onAddReference={handleAddReference}
            onAddReferenceEntry={handleAddReferenceEntry}
            onUpdateReference={handleUpdateReference}
            onRemoveReference={handleRemoveReference}
            onUpdateSpecs={handleUpdateBriefSpecs}
            onUpdateSubtext={handleUpdateBriefSubtext}
            onClearBrief={handleClearBrief}
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
            onUpdateSettings={updateSettings}
            onSetApiKey={setApiKey}
            onSetSessionOnly={setSessionOnly}
            onClearApiKey={clearStoredApiKey}
            onResetDefaults={resetPreferencesToDefault}
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
            onSetPinMode={setPinMode}
            onSetBodyOverride={setBodyOverride}
            onResetSkill={resetSkill}
            onSaveCustomSkill={saveCustomSkill}
            onDeleteCustomSkill={removeCustomSkill}
            onResetAll={resetAll}
            onAcknowledgeUpdate={acknowledgeUpdate}
            quickScanRulesState={quickScanRulesState}
            quickScanCustomizationCount={quickScanCustomizationCount}
            hasQuickScanUpstreamUpdate={hasQuickScanUpstreamUpdate}
            onSetQuickScanRuleEnabled={setQuickScanRuleEnabled}
            onSetQuickScanRuleTextOverride={setQuickScanRuleTextOverride}
            onResetQuickScanRule={resetQuickScanRule}
            onSaveCustomQuickScanRule={saveCustomQuickScanRule}
            onDeleteCustomQuickScanRule={deleteCustomQuickScanRule}
            onResetAllQuickScanRules={resetAllQuickScanRules}
            onAcknowledgeQuickScanUpdate={acknowledgeQuickScanRulesUpdate}
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
