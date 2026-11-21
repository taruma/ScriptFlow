import {memo} from 'react';
import {
  AlertCircle,
  Loader2,
  Settings2,
  ShieldAlert,
  Square,
  Terminal,
} from 'lucide-react';
import type {AuteurLensPresetId, LintRuleOverrides} from '../../../core/index.ts';
import type {QuickScanResult} from '../../../services/geminiDecisions.ts';
import type {
  DraftSuggestion,
  PatchSuggestion,
  QuestionSuggestion,
} from '../../../services/scriptTools.ts';
import {
  shouldShowSettingsLinkForError,
  type AiChatMessage,
  type AiLoadedSkillItem,
  type AiToolCallItem,
  type AuditQuickCheckId,
  type QuestionAnswerDraft,
} from '../../../ui/aiAssistant.ts';
import {estimateTraceCost, formatEstimatedUsd} from '../../../ui/aiPricing.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {
  AuditReviewSuggestionCard,
  DraftSuggestionCard,
  PatchSuggestionCard,
  QuestionSuggestionCard,
} from '../../AiSuggestionCards.tsx';
import type {AiInspectableTrace} from '../../AiTraceModal.tsx';
import {MarkdownContent} from '../../MarkdownContent.tsx';
import {QuickScanCard} from '../../QuickScanCard.tsx';
import {ReasoningAccordion} from './ReasoningAccordion.tsx';

const EMPTY_TOOL_CALLS: readonly AiToolCallItem[] = [];
const EMPTY_LOADED_SKILLS: readonly AiLoadedSkillItem[] = [];
const EMPTY_IDS: string[] = [];

export interface AiThreadMessageProps {
  msg: AiChatMessage;
  previousMessage?: AiChatMessage;
  rawText: string;
  ruleOverrides?: LintRuleOverrides;
  currentSnapshotHash: string;
  readOnly: boolean;
  isEmpty: boolean;
  isRunning: boolean;
  showThinkingSummary: boolean;
  showEstimatedCost: boolean;
  showDebugTrace: boolean;
  onInspectTrace: (trace: AiInspectableTrace) => void;
  onJumpToTarget: (targetId: string) => void;
  onDeepAuditFromQuickScan: (
    selectedLenses: AuteurLensPresetId[],
    result: QuickScanResult,
    targetBeatIndex?: number
  ) => void;
  onQuickScan: () => void | Promise<void>;
  onDismissQuickScan: (messageId: string) => void;
  onApplyPatch: (
    messageId: string,
    suggestion: PatchSuggestion,
    kind: 'patch' | 'fix'
  ) => void | Promise<void>;
  onApplyAuditFixesBatch: (
    messageId: string,
    batchPatch: PatchSuggestion,
    includedFixIds: string[]
  ) => void | Promise<void>;
  onApplyDraft: (messageId: string, suggestion: DraftSuggestion) => void | Promise<void>;
  onSubmitQuestionAnswers: (
    messageId: string,
    suggestion: QuestionSuggestion,
    answers: Record<string, QuestionAnswerDraft>
  ) => void;
  onDismissSuggestion: (messageId: string, suggestionId: string) => void;
  onQuickAudit: (checkId: AuditQuickCheckId) => void;
  onOpenSettings: () => void;
}

export const AiThreadMessage = memo(function AiThreadMessage({
  msg,
  previousMessage,
  rawText,
  ruleOverrides,
  currentSnapshotHash,
  readOnly,
  isEmpty,
  isRunning,
  showThinkingSummary,
  showEstimatedCost,
  showDebugTrace,
  onInspectTrace,
  onJumpToTarget,
  onDeepAuditFromQuickScan,
  onQuickScan,
  onDismissQuickScan,
  onApplyPatch,
  onApplyAuditFixesBatch,
  onApplyDraft,
  onSubmitQuestionAnswers,
  onDismissSuggestion,
  onQuickAudit,
  onOpenSettings,
}: AiThreadMessageProps) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
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

  const dismissed = msg.dismissedSuggestionIds ?? EMPTY_IDS;
  const applied = msg.appliedSuggestionIds ?? EMPTY_IDS;
  const isQuickScanMsg =
    Boolean(msg.quickScan) ||
    Boolean(msg.quickScanTrace) ||
    Boolean(msg.quickScanErrorFallback) ||
    (Boolean(msg.isStreaming) &&
      msg.mode === 'check' &&
      !msg.thoughtSummary &&
      (!msg.toolCalls || msg.toolCalls.length === 0) &&
      !msg.text &&
      previousMessage?.role === 'user' &&
      previousMessage.text === UI_LABELS.ai.quickScanButton);
  const quickScanCost =
    msg.quickScanTrace && !msg.isStreaming ? estimateTraceCost(msg.quickScanTrace) : null;

  return (
    <div className="space-y-2">
      {!isQuickScanMsg && (
        <ReasoningAccordion
          isStreaming={Boolean(msg.isStreaming)}
          showThinkingSummary={showThinkingSummary}
          showEstimatedCost={showEstimatedCost}
          showDebugTrace={showDebugTrace}
          hasError={Boolean(msg.error)}
          thoughtSummary={msg.thoughtSummary ?? ''}
          toolCalls={msg.toolCalls ?? EMPTY_TOOL_CALLS}
          loadedSkills={msg.loadedSkills ?? EMPTY_LOADED_SKILLS}
          trace={msg.trace}
          onInspectTrace={onInspectTrace}
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
            onDeepAuditSelected={(lenses, res) => onDeepAuditFromQuickScan(lenses, res)}
            onRescan={onQuickScan}
            onDismiss={() => onDismissQuickScan(msg.id)}
          />
          {((showEstimatedCost && quickScanCost) || (showDebugTrace && msg.quickScanTrace)) && (
            <div className="flex items-center justify-end gap-1.5">
              {showEstimatedCost && quickScanCost && (
                <span
                  title={`gemini-decision-1 · ${quickScanCost.usage.inputTokens.toLocaleString()} input tok · 0 output tok`}
                  className="inline-flex items-center rounded-md border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted tabular-nums"
                >
                  {formatEstimatedUsd(quickScanCost.totalCostUsd)}
                </span>
              )}
              {showDebugTrace && msg.quickScanTrace && (
                <button
                  type="button"
                  onClick={() => onInspectTrace(msg.quickScanTrace!)}
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
                  onApply={(s) => onApplyPatch(msg.id, s, 'patch')}
                  onDismiss={(id) => onDismissSuggestion(msg.id, id)}
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
                  onApply={(s) => onApplyDraft(msg.id, s)}
                  onDismiss={(id) => onDismissSuggestion(msg.id, id)}
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
                  onSubmit={(s, answers) => onSubmitQuestionAnswers(msg.id, s, answers)}
                  onDismiss={(id) => onDismissSuggestion(msg.id, id)}
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
                onApplyIssueFix={(patch) => onApplyPatch(msg.id, patch, 'fix')}
                onApplyAllFixes={(batchPatch, includedFixIds) =>
                  onApplyAuditFixesBatch(msg.id, batchPatch, includedFixIds)
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
            {showDebugTrace && msg.trace && (
              <button
                type="button"
                onClick={() => onInspectTrace(msg.trace!)}
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
              (showDebugTrace && Boolean(msg.trace ?? msg.quickScanTrace))) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {msg.quickScanErrorFallback && !isEmpty && (
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => onQuickAudit('all')}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-main hover:bg-surface-subtle transition-colors cursor-pointer disabled:opacity-45"
                  >
                    <ShieldAlert className="h-3 w-3" />
                    <span>{UI_LABELS.ai.quickScanFallbackButton}</span>
                  </button>
                )}
                {shouldShowSettingsLinkForError(msg.error.code) && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-main hover:bg-surface-subtle transition-colors cursor-pointer"
                  >
                    <Settings2 className="h-3 w-3" />
                    <span>{UI_LABELS.ai.openSettingsAction}</span>
                  </button>
                )}
                {showDebugTrace && (msg.trace ?? msg.quickScanTrace) && (
                  <button
                    type="button"
                    onClick={() => onInspectTrace((msg.trace ?? msg.quickScanTrace)!)}
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
});
