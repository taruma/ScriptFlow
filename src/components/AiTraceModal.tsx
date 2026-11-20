import {useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import type {
  AgentRoundTrace,
  AgentToolCallTrace,
  AgentTurnTrace,
} from '../services/geminiInteractions.ts';
import {getGeminiModelOption, REASONING_LEVEL_OPTIONS} from '../ui/aiSettings.ts';
import {copyTextToClipboard} from '../ui/clipboard.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

export interface AiTraceModalProps {
  isOpen: boolean;
  trace: AgentTurnTrace | null;
  onClose: () => void;
}

function formatJsonPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildInteractionChain(trace: AgentTurnTrace): string[] {
  const chain: string[] = [];
  const pushUnique = (id: string | null | undefined) => {
    if (!id) return;
    if (chain[chain.length - 1] !== id) {
      chain.push(id);
    }
  };
  pushUnique(trace.initialPreviousInteractionId);
  for (const round of trace.rounds) {
    pushUnique(round.interactionId);
  }
  pushUnique(trace.finalInteractionId);
  return chain;
}

function formatUsageEntries(usage: Record<string, unknown> | undefined): Array<{key: string; value: string}> {
  if (!usage) return [];
  const entries: Array<{key: string; value: string}> = [];
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      entries.push({key, value: value.toLocaleString()});
    } else if (typeof value === 'string' && value.length > 0) {
      entries.push({key, value});
    }
  }
  return entries;
}

function getRoundStatusBadgeClass(status: string | null): string {
  if (status === 'error') {
    return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
  }
  if (status === 'aborted') {
    return 'auteur-phase-slate';
  }
  if (status === 'requires_action' || status === 'in_progress') {
    return 'auteur-phase-logic';
  }
  if (status === 'completed') {
    return 'auteur-phase-aesthetic';
  }
  return 'border-border-main bg-surface text-text-muted';
}

export function AiTraceModal({isOpen, trace, onClose}: AiTraceModalProps) {
  if (!isOpen || !trace) return null;
  return <AiTraceModalContent trace={trace} onClose={onClose} />;
}

function AiTraceModalContent({
  trace,
  onClose,
}: {
  trace: AgentTurnTrace;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const labels = UI_LABELS.ai.traceModal;

  const modelOption = getGeminiModelOption(trace.model);
  const reasoningOption =
    REASONING_LEVEL_OPTIONS.find((r) => r.id === trace.reasoningLevel) ??
    REASONING_LEVEL_OPTIONS[1];
  const modeLabel = UI_LABELS.ai.modes[trace.mode].label;

  const interactionChain = useMemo(() => buildInteractionChain(trace), [trace]);
  const usageEntries = useMemo(() => formatUsageEntries(trace.usage), [trace.usage]);
  const serializedTraceJson = useMemo(() => formatJsonPretty(trace), [trace]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopyJson = async () => {
    const ok = await copyTextToClipboard(serializedTraceJson);
    if (ok) {
      setCopied(true);
    }
  };

  const statusBadge = trace.error
    ? trace.error.code === 'aborted'
      ? {label: labels.statusStopped, className: 'auteur-phase-slate'}
      : {
          label:
            trace.error.status !== undefined
              ? `${labels.statusError} · ${trace.error.status}`
              : `${labels.statusError} · ${trace.error.code}`,
          className: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
        }
    : trace.hitToolRoundLimit
      ? {label: labels.statusRoundLimit, className: 'auteur-phase-intent'}
      : {label: labels.statusCompleted, className: 'auteur-phase-aesthetic'};

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlay}
    >
      <div className="bg-surface w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col max-h-[88dvh]">
        {/* Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-text-main"
            >
              <Terminal className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main">
                {labels.title}
              </h2>
              <p className="text-[11px] text-text-muted truncate">{labels.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyJson()}
              aria-label={labels.copyJsonAria}
              className={UI_TOKENS.button.actionPill}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[var(--phase-aesthetic-text)]" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-text-muted" />
              )}
              <span>{copied ? labels.copiedJsonButton : labels.copyJsonButton}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={labels.closeAria}
              className={UI_TOKENS.button.iconClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Compact Summary Bar */}
        <div className="border-b border-border-subtle bg-surface px-4 py-3 md:px-5 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                {labels.summaryStatus}
              </span>
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${statusBadge.className}`}
              >
                {statusBadge.label}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                {labels.summaryModel}
              </span>
              <span className="font-medium text-text-main">{modelOption.shortLabel}</span>
              <span className="font-mono text-[10px] text-text-faint">{trace.model}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                {labels.summaryReasoning}
              </span>
              <span className="font-mono text-[11px] text-text-body">{reasoningOption.label}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                {labels.summaryMode}
              </span>
              <span className="font-mono text-[11px] text-text-body">{modeLabel}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                {labels.summaryFocus}
              </span>
              <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-continuity">
                {UI_LABELS.ai.focusLabels[trace.focus]}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                {labels.summaryDuration}
              </span>
              <span className="font-mono text-[11px] text-text-body tabular-nums">
                {labels.formatDurationMs(trace.durationMs)}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                {labels.summaryRounds}
              </span>
              <span className="font-mono text-[11px] text-text-body tabular-nums">
                {trace.toolRounds}
              </span>
              {trace.hitToolRoundLimit && (
                <span className="rounded border px-1 py-0.5 font-mono text-[10px] auteur-phase-intent">
                  {labels.roundLimitBadge}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0">
                {labels.summaryInteractionChain}
              </span>
              {interactionChain.length === 0 ? (
                <span className="font-mono text-[10px] text-text-faint">
                  {labels.noInteractionId}
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] text-text-body">
                  {interactionChain.map((id, index) => (
                    <span key={`${id}-${index}`} className="inline-flex items-center gap-1">
                      {index > 0 && <span className="text-text-faint">→</span>}
                      <span
                        title={id}
                        className="max-w-[180px] truncate rounded border border-border-main bg-surface-subtle px-1.5 py-0.5"
                      >
                        {id}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {usageEntries.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0">
                  {labels.summaryUsage}
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {usageEntries.map((entry) => (
                    <span
                      key={entry.key}
                      className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted tabular-nums"
                    >
                      {entry.key}: <span className="text-text-main">{entry.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(trace.activeSkillIds.length > 0 || trace.loadedSkillIds.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0">
                  {labels.summarySkills}
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {trace.activeSkillIds.map((skillId) => (
                    <span
                      key={`active-${skillId}`}
                      className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-aesthetic"
                    >
                      {labels.skillActivePrefix}: {skillId}
                    </span>
                  ))}
                  {trace.loadedSkillIds.map((skillId) => (
                    <span
                      key={`loaded-${skillId}`}
                      className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-logic"
                    >
                      {labels.skillLoadedPrefix}: {skillId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll px-4 py-4 md:px-5 space-y-4 bg-app/40">
          {/* Error Details Card */}
          {trace.error && (
            <section className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-xs text-red-700 dark:text-red-300 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{labels.errorDetailsHeading}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  {trace.error.status !== undefined && (
                    <span className="rounded border border-red-500/30 bg-surface px-1.5 py-0.5 text-text-main">
                      {labels.errorStatusLabel} {trace.error.status}
                    </span>
                  )}
                  <span className="rounded border border-red-500/30 bg-surface px-1.5 py-0.5 text-text-main">
                    {labels.errorCodeLabel}: {trace.error.code}
                  </span>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                {trace.error.message}
              </p>
            </section>
          )}

          {/* Round-by-Round Timeline */}
          <section className="space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {labels.roundsHeading(trace.rounds.length)}
            </div>

            {trace.rounds.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-main bg-surface/60 px-4 py-4 text-xs text-text-muted">
                {labels.noRoundsNote}
              </div>
            ) : (
              <div className="space-y-3">
                {trace.rounds.map((round) => (
                  <RoundTraceCard key={round.roundIndex} round={round} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 md:px-5 border-t border-border-subtle bg-surface-subtle flex items-center justify-between gap-3 shrink-0">
          <span className="font-mono text-[10px] text-text-faint truncate">
            {labels.summaryStartedAt}: {trace.startedAt}
          </span>
          <button type="button" onClick={onClose} className={UI_TOKENS.button.primary}>
            {labels.doneButton}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoundTraceCard({round}: {round: AgentRoundTrace}) {
  const labels = UI_LABELS.ai.traceModal;
  const hasTools = round.toolCalls.length > 0;
  const [requestOpen, setRequestOpen] = useState<boolean>(!hasTools);
  const [toolsOpen, setToolsOpen] = useState<boolean>(hasTools);
  const [systemInstructionOpen, setSystemInstructionOpen] = useState<boolean>(false);

  const roundUsageEntries = useMemo(() => formatUsageEntries(round.usage), [round.usage]);
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

function ToolCallTraceCard({call}: {call: AgentToolCallTrace}) {
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
