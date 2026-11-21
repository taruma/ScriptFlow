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
  formatToolCallTooltip,
  isNearScrollBottom,
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
