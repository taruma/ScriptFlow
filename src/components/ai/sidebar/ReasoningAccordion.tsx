import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  AlertCircle,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  Square,
  Terminal,
} from 'lucide-react';
import type {AgentTurnTrace} from '../../../services/geminiInteractions.ts';
import {
  dedupeTurnToolCalls,
  formatToolCallTooltip,
  formatToolDisplayName,
  formatTurnDuration,
  getActiveStreamingTool,
  isNearScrollBottom,
  summarizeTurnActivity,
  type AiLoadedSkillItem,
  type AiToolCallItem,
} from '../../../ui/aiAssistant.ts';
import {
  estimateTraceCost,
  formatEstimatedUsd,
  formatUsdBreakdown,
} from '../../../ui/aiPricing.ts';
import {getGeminiModelOption} from '../../../ui/aiSettings.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import type {AiInspectableTrace} from '../../AiTraceModal.tsx';
import {MarkdownContent} from '../../MarkdownContent.tsx';
import {
  buildTooltipPosition,
  HoverTooltipPortal,
  type ActivityHoverTooltip,
  type HoverTooltipRow,
} from './HoverTooltipPortal.tsx';

export interface ReasoningAccordionProps {
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

export const ReasoningAccordion = memo(function ReasoningAccordion({
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
  const [activityOpen, setActivityOpen] = useState(false);
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

  const visibleToolCalls = useMemo(
    () => dedupeTurnToolCalls(toolCalls, loadedSkills),
    [toolCalls, loadedSkills]
  );

  const activity = useMemo(
    () => summarizeTurnActivity(loadedSkills, visibleToolCalls),
    [loadedSkills, visibleToolCalls]
  );

  const activeRunningTool = useMemo(
    () => getActiveStreamingTool(visibleToolCalls),
    [visibleToolCalls]
  );

  const hasVisibleThought = showThinkingSummary && thoughtSummary.trim().length > 0;
  const showThinkingCard = (showThinkingSummary && isStreaming) || hasVisibleThought;
  const hasActivity = activity.totalSkillCount > 0 || activity.toolCount > 0;
  const showThinkingRow = showThinkingCard || (isStreaming && !hasActivity);
  const canInspect = showDebugTrace && !isStreaming && Boolean(trace);
  const showCost = showEstimatedCost && Boolean(turnCost);
  const showMetaOnlyBar = ((canInspect && !hasError) || showCost) && !showThinkingRow && !hasActivity;

  // Auto-open thoughts during streaming only once thought tokens arrive; keep idle turns collapsed
  const isOpen =
    showThinkingCard &&
    (userOverride !== null ? userOverride : isStreaming && hasVisibleThought);

  // Keep long streaming thought summaries pinned to the bottom unless the user scrolled up inside the box
  useEffect(() => {
    if (!isOpen || !isStreaming || !thoughtStickyRef.current) return;
    const el = thoughtBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thoughtSummary.length, isOpen, isStreaming]);

  if (!showThinkingRow && !hasActivity && !showMetaOnlyBar) {
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

  const durationLabel = !isStreaming ? formatTurnDuration(trace?.durationMs) : null;
  const thinkingTitle = isStreaming
    ? UI_LABELS.ai.reasoningRunning
    : durationLabel
      ? UI_LABELS.ai.reasoningThoughtFor(durationLabel)
      : UI_LABELS.ai.reasoningToggleLabel;

  const summaryParts: string[] = [];
  if (activity.totalSkillCount > 0) {
    summaryParts.push(UI_LABELS.ai.reasoningSkillCount(activity.totalSkillCount));
  }
  if (activity.toolCount > 0) {
    summaryParts.push(UI_LABELS.ai.reasoningToolCount(activity.toolCount));
  }
  const summaryText = summaryParts.join(' · ');

  const renderActivityStatusIcon = () => {
    if (activeRunningTool) {
      return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--phase-logic-text)]" />;
    }
    if (activity.errorToolCount > 0) {
      return <AlertCircle className="h-3 w-3 shrink-0 text-[var(--phase-intent-text)]" />;
    }
    if (activity.stoppedToolCount > 0) {
      return <Square className="h-2.5 w-2.5 shrink-0 fill-current text-text-faint" />;
    }
    if (activity.toolCount > 0) {
      return <Check className="h-3 w-3 shrink-0 text-[var(--phase-aesthetic-text)]" />;
    }
    return <Layers className="h-3 w-3 shrink-0 text-text-faint" />;
  };

  return (
    <div className="space-y-1">
      {/* Row 1: Quiet Antigravity-style Thinking Disclosure */}
      {showThinkingRow && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            {showThinkingCard ? (
              <button
                type="button"
                onClick={() => setUserOverride(!isOpen)}
                aria-expanded={isOpen}
                className="group/think inline-flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] font-medium text-text-muted hover:bg-surface-hover/50 hover:text-text-main transition-colors cursor-pointer"
              >
                {isStreaming ? (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--phase-logic-text)]" />
                ) : (
                  <Brain className="h-3 w-3 shrink-0 text-text-faint group-hover/think:text-text-muted transition-colors" />
                )}
                <span className={`truncate ${isStreaming ? 'animate-pulse text-text-main' : ''}`}>
                  {thinkingTitle}
                </span>
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-text-faint" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-text-faint" />
                )}
              </button>
            ) : (
              <div className="inline-flex min-w-0 items-center gap-1.5 px-1.5 py-1 text-[11px] font-medium text-text-muted">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--phase-logic-text)]" />
                <span className="truncate animate-pulse text-text-main">{thinkingTitle}</span>
              </div>
            )}

            {(showCost || canInspect) && (
              <div className="flex items-center gap-1 shrink-0">
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
              className="ml-2.5 pl-3 border-l-2 border-border-main max-h-56 overflow-y-auto auteur-pane-scroll py-0.5"
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

      {/* Row 2: Collapsible Turn Activity Disclosure (Skills & Function Tools) */}
      {hasActivity && (
        <div aria-label={UI_LABELS.ai.toolsSkillsRegionAria} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setTooltip(null);
                setActivityOpen((prev) => !prev);
              }}
              aria-expanded={activityOpen}
              aria-label={
                activityOpen
                  ? UI_LABELS.ai.activityCollapseAria(summaryText)
                  : UI_LABELS.ai.activityExpandAria(summaryText)
              }
              className="inline-flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] font-medium text-text-muted hover:bg-surface-hover/50 hover:text-text-main transition-colors cursor-pointer"
            >
              {renderActivityStatusIcon()}
              {activeRunningTool ? (
                <>
                  <span className="truncate animate-pulse text-text-main">
                    {UI_LABELS.ai.activityRunningTool(
                      formatToolDisplayName(activeRunningTool.name)
                    )}
                  </span>
                  {(activity.totalSkillCount > 0 || activity.toolCount > 1) && (
                    <span className="text-text-faint shrink-0">· {summaryText}</span>
                  )}
                </>
              ) : (
                <span className="truncate">{summaryText}</span>
              )}
              {activityOpen ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-text-faint" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-text-faint" />
              )}
            </button>

            {!showThinkingRow && (showCost || (canInspect && !hasError)) && (
              <div className="flex items-center gap-1 shrink-0 ml-auto">
                {renderCostBadge()}
                {!hasError && renderInspectButton()}
              </div>
            )}
          </div>

          {activityOpen && (
            <div className="ml-2.5 pl-3 border-l border-border-main space-y-0.5 py-0.5">
              {visibleToolCalls.map((tool) => {
                const info = formatToolCallTooltip(tool);
                return (
                  <div
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
                    className="flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-[11px] text-text-muted hover:bg-surface-hover/50 hover:text-text-main transition-colors cursor-default select-none"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                      {tool.status === 'running' ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--phase-logic-text)]" />
                      ) : tool.status === 'error' ? (
                        <AlertCircle className="h-3 w-3 shrink-0 text-[var(--phase-intent-text)]" />
                      ) : tool.status === 'stopped' ? (
                        <Square className="h-2.5 w-2.5 shrink-0 fill-current text-text-faint" />
                      ) : (
                        <Check className="h-3 w-3 shrink-0 text-[var(--phase-aesthetic-text)]" />
                      )}
                      <span
                        className={`font-medium ${
                          tool.status === 'running'
                            ? 'animate-pulse text-text-main'
                            : 'text-text-body'
                        }`}
                      >
                        {info.title}
                      </span>
                    </div>
                    {info.detail && (
                      <span className="truncate font-mono text-[10px] text-text-faint min-w-0">
                        {info.detail}
                      </span>
                    )}
                  </div>
                );
              })}

              {activity.orderedSkills.map((skill) => {
                const iconColor =
                  skill.source === 'tool'
                    ? 'text-[var(--phase-logic-text)]'
                    : skill.source === 'pinned'
                      ? 'text-[var(--phase-continuity-text)]'
                      : 'text-[var(--phase-aesthetic-text)]';
                return (
                  <div
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
                    className="flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-[11px] text-text-muted hover:bg-surface-hover/50 hover:text-text-main transition-colors cursor-default select-none"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Layers className={`h-3 w-3 shrink-0 ${iconColor}`} />
                      <span className="truncate text-text-body">{skill.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-text-faint shrink-0">
                      {UI_LABELS.ai.skillSources[skill.source]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Meta-only bar fallback when neither Thinking nor Activity renders */}
      {showMetaOnlyBar && (
        <div className="flex items-center justify-end gap-1 px-0.5">
          {renderCostBadge()}
          {!hasError && renderInspectButton()}
        </div>
      )}

      {/* Portal Hover Tooltip for Tool, Skill & Cost Rows */}
      <HoverTooltipPortal tooltip={tooltip} />
    </div>
  );
});
