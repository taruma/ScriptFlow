import {useMemo, useState} from 'react';
import {AlertTriangle, ChevronDown, ChevronRight, Wrench} from 'lucide-react';
import type {
  AgentRoundTrace,
  AgentToolCallTrace,
} from '../../../services/geminiInteractions.ts';
import {
  estimateTraceCost,
  formatCacheHitPercent,
  formatUsdBreakdown,
  parseInteractionUsage,
  type PricingModelId,
} from '../../../ui/aiPricing.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {
  formatJsonPretty,
  formatUsageEntries,
  getRoundStatusBadgeClass,
} from './traceFormatters.ts';

export interface RoundTraceCardProps {
  round: AgentRoundTrace;
  model?: PricingModelId;
  startedAt?: string;
}

export function RoundTraceCard({round, model, startedAt}: RoundTraceCardProps) {
  const labels = UI_LABELS.ai.traceModal;
  const costLabels = UI_LABELS.ai.cost;
  const hasTools = round.toolCalls.length > 0;
  const [requestOpen, setRequestOpen] = useState<boolean>(!hasTools);
  const [toolsOpen, setToolsOpen] = useState<boolean>(hasTools);
  const [systemInstructionOpen, setSystemInstructionOpen] = useState<boolean>(false);

  const roundUsageEntries = useMemo(() => formatUsageEntries(round.usage), [round.usage]);
  const roundCacheSummary = useMemo(() => {
    if (!round.usage) return null;
    if (model) {
      const est = estimateTraceCost({model, startedAt: startedAt ?? '', usage: round.usage});
      if (!est || est.cacheHitRate === null) return null;
      return {
        hitRate: est.cacheHitRate,
        cachedTokens: est.usage.cachedTokens,
        missedTokens: est.usage.nonCachedInputTokens,
        savingsUsd: est.cacheSavingsUsd,
      };
    }
    const parsed = parseInteractionUsage(round.usage);
    if (!parsed || parsed.inputTokens <= 0) return null;
    return {
      hitRate: Math.min(1, parsed.cachedTokens / parsed.inputTokens),
      cachedTokens: parsed.cachedTokens,
      missedTokens: parsed.nonCachedInputTokens,
      savingsUsd: 0,
    };
  }, [model, round.usage, startedAt]);
  const formattedInput = useMemo(() => {
    if (typeof round.request.input === 'string') return round.request.input;
    return formatJsonPretty(round.request.input);
  }, [round.request.input]);
  const formattedGenConfig = useMemo(
    () => formatJsonPretty(round.request.generation_config),
    [round.request.generation_config]
  );

  return (
    <article className="rounded-xl border border-border-main bg-surface overflow-hidden shadow-2xs">
      {/* Round Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border-subtle bg-surface-subtle">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] font-bold text-text-main">
            {labels.roundTitle(round.roundIndex)}
          </span>
          {round.interactionId && (
            <span
              title={round.interactionId}
              className="max-w-[200px] truncate rounded border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
            >
              {round.interactionId}
            </span>
          )}
          {round.status && (
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${getRoundStatusBadgeClass(round.status)}`}
            >
              {round.status}
            </span>
          )}
          {roundCacheSummary && (
            <span
              title={labels.roundCacheBadgeTooltip(
                formatCacheHitPercent(roundCacheSummary.hitRate),
                costLabels.formatTokens(roundCacheSummary.cachedTokens),
                costLabels.formatTokens(roundCacheSummary.missedTokens),
                roundCacheSummary.savingsUsd > 0
                  ? formatUsdBreakdown(roundCacheSummary.savingsUsd)
                  : undefined
              )}
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums ${
                roundCacheSummary.cachedTokens > 0
                  ? 'auteur-phase-aesthetic'
                  : 'border-border-subtle bg-surface text-text-faint'
              }`}
            >
              {roundCacheSummary.cachedTokens > 0
                ? costLabels.cacheHitShort(formatCacheHitPercent(roundCacheSummary.hitRate))
                : costLabels.cacheMissShort}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-text-faint tabular-nums">
          {hasTools && (
            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-text-muted">
              {labels.roundToolCount(round.toolCalls.length)}
            </span>
          )}
          <span>{labels.formatDurationMs(round.durationMs)}</span>
        </div>
      </div>

      {roundUsageEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-1.5 border-b border-border-subtle bg-surface text-[10px] font-mono text-text-faint">
          {roundUsageEntries.map((entry) => (
            <span
              key={entry.key}
              className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 tabular-nums"
            >
              {entry.key}: <span className="text-text-body">{entry.value}</span>
            </span>
          ))}
          {roundCacheSummary && roundCacheSummary.savingsUsd > 0 && (
            <span className="rounded border px-1.5 py-0.5 tabular-nums auteur-phase-aesthetic">
              {labels.cacheSavedLabel}: {formatUsdBreakdown(roundCacheSummary.savingsUsd)}
            </span>
          )}
        </div>
      )}

      {round.faults && round.faults.length > 0 && (
        <div className="flex items-start gap-2 px-3.5 py-2 border-b border-border-subtle bg-red-500/5 text-[11px] text-red-700 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            {round.faults.map((fault, idx) => (
              <div key={`${fault.code ?? 'fault'}-${idx}`} className="font-mono text-[10.5px] break-words">
                {[fault.code, fault.message].filter(Boolean).join(': ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expandable Section: Request Sent */}
      <div className="border-b border-border-subtle last:border-b-0">
        <button
          type="button"
          onClick={() => setRequestOpen((prev) => !prev)}
          aria-expanded={requestOpen}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-[11px] font-semibold text-text-body hover:bg-surface-subtle transition-colors cursor-pointer"
        >
          <span>{labels.sectionRequest}</span>
          {requestOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
          )}
        </button>

        {requestOpen && (
          <div className="px-3.5 pb-3 pt-1 space-y-2.5 text-[11px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-lg border border-border-subtle bg-surface-subtle px-2.5 py-1.5 space-y-0.5">
                <div className="font-mono text-[10px] text-text-faint">
                  {labels.requestPrevIdLabel}
                </div>
                <div className="font-mono text-[11px] text-text-main break-all">
                  {round.request.previous_interaction_id ?? labels.noInteractionId}
                </div>
              </div>

              <div className="rounded-lg border border-border-subtle bg-surface-subtle px-2.5 py-1.5 space-y-0.5">
                <div className="font-mono text-[10px] text-text-faint">
                  {labels.requestGenConfigLabel}
                </div>
                <pre className="font-mono text-[10px] leading-snug text-text-body whitespace-pre-wrap break-words">
                  {formattedGenConfig}
                </pre>
              </div>
            </div>

            <div className="space-y-1">
              <div className="font-mono text-[10px] text-text-faint">{labels.requestToolsLabel}</div>
              {round.request.toolNames.length === 0 ? (
                <span className="font-mono text-[10px] text-text-faint">
                  {labels.requestNoTools}
                </span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {round.request.toolNames.map((name) => (
                    <span
                      key={name}
                      className="rounded border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-body"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="font-mono text-[10px] text-text-faint">{labels.requestInputLabel}</div>
              <pre className="rounded-lg border border-border-subtle bg-app p-2.5 font-mono text-[11px] leading-relaxed text-text-body whitespace-pre-wrap break-words max-h-56 overflow-y-auto auteur-pane-scroll">
                {formattedInput}
              </pre>
            </div>

            {/* Collapsible system_instruction */}
            <div className="rounded-lg border border-border-subtle bg-surface-subtle overflow-hidden">
              <button
                type="button"
                onClick={() => setSystemInstructionOpen((prev) => !prev)}
                aria-expanded={systemInstructionOpen}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-[10px] font-mono text-text-muted hover:text-text-main hover:bg-surface-hover/40 transition-colors cursor-pointer"
              >
                <span>{labels.requestSystemInstructionLabel}</span>
                <span className="inline-flex items-center gap-1.5 text-text-faint">
                  <span>{labels.charsCount(round.request.systemInstruction.length)}</span>
                  {systemInstructionOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </span>
              </button>
              {systemInstructionOpen && (
                <pre className="border-t border-border-subtle bg-app p-2.5 font-mono text-[10px] leading-relaxed text-text-muted whitespace-pre-wrap break-words max-h-56 overflow-y-auto auteur-pane-scroll">
                  {round.request.systemInstruction}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Expandable Section: Tool Calls & Results */}
      {hasTools && (
        <div>
          <button
            type="button"
            onClick={() => setToolsOpen((prev) => !prev)}
            aria-expanded={toolsOpen}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-[11px] font-semibold text-text-body hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5">
              <Wrench className="h-3 w-3 text-text-faint" />
              <span>{labels.sectionToolCalls(round.toolCalls.length)}</span>
            </span>
            {toolsOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
            )}
          </button>

          {toolsOpen && (
            <div className="px-3.5 pb-3 pt-1 space-y-2.5">
              {round.toolCalls.map((call) => (
                <ToolCallTraceCard key={call.callId} call={call} />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export interface ToolCallTraceCardProps {
  call: AgentToolCallTrace;
}

export function ToolCallTraceCard({call}: ToolCallTraceCardProps) {
  const labels = UI_LABELS.ai.traceModal;
  const repairHint =
    typeof call.result.repairHint === 'string' && call.result.repairHint.trim().length > 0
      ? call.result.repairHint
      : null;

  const formattedArgs = useMemo(() => formatJsonPretty(call.arguments), [call.arguments]);
  const formattedResult = useMemo(() => formatJsonPretty(call.result), [call.result]);

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        call.ok ? 'border-border-main bg-surface-subtle' : 'border-red-500/30 bg-red-500/5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 border-b border-border-subtle bg-surface">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="font-mono text-[11px] font-semibold text-text-main">{call.name}</span>
          <span className="font-mono text-[10px] text-text-faint">{call.callId}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
          {call.stagedSuggestionId && (
            <span className="rounded border border-border-main bg-surface-subtle px-1.5 py-0.5 text-text-muted">
              {labels.toolStagedLabel}: {call.stagedSuggestionId}
            </span>
          )}
          <span
            className={`rounded border px-1.5 py-0.5 font-semibold ${
              call.ok
                ? 'auteur-phase-aesthetic'
                : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
            }`}
          >
            {call.ok ? labels.toolStatusOk : labels.toolStatusError}
          </span>
        </div>
      </div>

      <div className="p-2.5 space-y-2">
        {repairHint && (
          <div className="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed auteur-phase-intent">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-semibold">{labels.toolRepairHintLabel}: </span>
              <span className="whitespace-pre-wrap break-words">{repairHint}</span>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="font-mono text-[10px] text-text-faint">{labels.toolArgumentsLabel}</div>
          <pre className="rounded-lg border border-border-subtle bg-app p-2 font-mono text-[10px] leading-relaxed text-text-body whitespace-pre-wrap break-words max-h-48 overflow-y-auto auteur-pane-scroll">
            {formattedArgs}
          </pre>
        </div>

        <div className="space-y-1">
          <div className="font-mono text-[10px] text-text-faint">{labels.toolResultLabel}</div>
          <pre className="rounded-lg border border-border-subtle bg-app p-2 font-mono text-[10px] leading-relaxed text-text-body whitespace-pre-wrap break-words max-h-56 overflow-y-auto auteur-pane-scroll">
            {formattedResult}
          </pre>
        </div>
      </div>
    </div>
  );
}
