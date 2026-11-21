import {memo, useMemo, useState} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Crosshair,
  FileCode2,
  GitCompare,
  GitFork,
  Loader2,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import type {LintRuleOverrides} from '../core/index.ts';
import {
  composeAuditFixesBatch,
  type AuditReviewIssueItem,
  type AuditReviewSuggestion,
  type DraftSuggestion,
  type PatchSuggestion,
  type ScriptLineDiff,
} from '../services/scriptTools.ts';
import {
  formatLensShort,
  formatTopologyLabel,
  isSuggestionStale,
} from '../ui/aiAssistant.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

interface ScriptLineDiffViewProps {
  diff: ScriptLineDiff;
}

const ScriptLineDiffView = memo(function ScriptLineDiffView({diff}: ScriptLineDiffViewProps) {
  const labels = UI_LABELS.ai.suggestions;

  if (!diff.hasChanges) {
    return (
      <div className="rounded-lg border border-border-subtle bg-app px-3 py-2 text-[11px] text-text-muted">
        {labels.noTextChanges}
      </div>
    );
  }

  return (
    <div className={UI_TOKENS.ai.diffContainer}>
      <div className="min-w-max py-1">
        {diff.lines.map((line, index) => {
          const isAdded = line.type === 'added';
          const isRemoved = line.type === 'removed';
          const rowClass = isAdded
            ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
            : isRemoved
              ? 'bg-red-500/12 text-red-700 dark:text-red-300'
              : 'text-text-muted';
          const marker = isAdded ? '+' : isRemoved ? '−' : ' ';
          const lineNo = isAdded
            ? line.afterLineNumber
            : isRemoved
              ? line.beforeLineNumber
              : line.afterLineNumber;

          return (
            <div key={index} className={`flex px-2 py-0.5 ${rowClass}`}>
              <span className="w-7 shrink-0 select-none pr-2 text-right text-[10px] opacity-55 tabular-nums">
                {lineNo ?? ''}
              </span>
              <span className="w-3.5 shrink-0 select-none font-bold">{marker}</span>
              <span className="whitespace-pre">{line.text || ' '}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export interface PatchSuggestionCardProps {
  suggestion: PatchSuggestion;
  currentSnapshotHash: string;
  readOnly: boolean;
  isStreaming?: boolean;
  isApplied: boolean;
  isDismissed: boolean;
  onApply: (suggestion: PatchSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}

export const PatchSuggestionCard = memo(function PatchSuggestionCard({
  suggestion,
  currentSnapshotHash,
  readOnly,
  isStreaming = false,
  isApplied,
  isDismissed,
  onApply,
  onDismiss,
}: PatchSuggestionCardProps) {
  const [showDiff, setShowDiff] = useState(false);
  const labels = UI_LABELS.ai.suggestions;
  const stale = !isApplied && !isDismissed && isSuggestionStale(suggestion.baseSnapshotHash, currentSnapshotHash);

  const {lintDelta} = suggestion;
  const resolvedCount = lintDelta.resolvedDiagnostics.length;

  return (
    <div className={`${UI_TOKENS.ai.suggestionCard} ${isDismissed ? 'opacity-60' : ''}`}>
      <div className={UI_TOKENS.ai.suggestionHeader}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="auteur-phase-logic inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium">
              <Wrench className="h-2.5 w-2.5" />
              <span>{labels.patchLabel}</span>
            </span>

            {suggestion.affectedIds.slice(0, 4).map((id) => (
              <span
                key={id}
                className="rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
              >
                {id}
              </span>
            ))}

            {resolvedCount > 0 ? (
              <span className="auteur-phase-aesthetic rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                {labels.lintDeltaResolved(resolvedCount)}
              </span>
            ) : lintDelta.afterErrors === 0 && lintDelta.afterWarnings === 0 ? (
              <span className="auteur-phase-aesthetic rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                {labels.lintClean}
              </span>
            ) : (
              <span className="auteur-phase-intent rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                {labels.lintWarnings(lintDelta.afterWarnings)}
              </span>
            )}
          </div>

          <p className="text-xs font-medium leading-snug text-text-main">{suggestion.summary}</p>
        </div>

        <span className="font-mono text-[10px] text-text-faint shrink-0 tabular-nums">
          +{suggestion.diff.addedCount} / −{suggestion.diff.removedCount}
        </span>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {stale && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{labels.staleWarning}</span>
          </div>
        )}

        {showDiff && <ScriptLineDiffView diff={suggestion.diff} />}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowDiff((prev) => !prev)}
            className={UI_TOKENS.ai.pillButton}
          >
            <GitCompare className="h-3 w-3" />
            <span>{showDiff ? labels.hideDiff : labels.showDiff}</span>
            {showDiff ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>

          <div className="flex items-center gap-1.5">
            {isApplied ? (
              <span className="auteur-phase-aesthetic inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold">
                <Check className="h-3 w-3" />
                <span>{labels.appliedBadge}</span>
              </span>
            ) : isDismissed ? (
              <span className="inline-flex items-center gap-1 rounded-lg border border-border-main bg-surface px-2 py-1 text-[11px] text-text-faint">
                {labels.dismissedBadge}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onDismiss(suggestion.id)}
                  className={UI_TOKENS.ai.pillButton}
                >
                  <X className="h-3 w-3" />
                  <span>{labels.dismissButton}</span>
                </button>
                <button
                  type="button"
                  disabled={stale || isStreaming}
                  title={isStreaming ? labels.waitUntilFinishedTitle : undefined}
                  onClick={() => onApply(suggestion)}
                  className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] disabled:opacity-45 disabled:cursor-not-allowed`}
                >
                  {isStreaming ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : readOnly ? (
                    <GitFork className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  <span>
                    {isStreaming
                      ? labels.finishingLabel
                      : readOnly
                        ? labels.forkAndApplyButton
                        : labels.applyButton}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export interface DraftSuggestionCardProps {
  suggestion: DraftSuggestion;
  readOnly: boolean;
  isStreaming?: boolean;
  isApplied: boolean;
  isDismissed: boolean;
  onApply: (suggestion: DraftSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}

export const DraftSuggestionCard = memo(function DraftSuggestionCard({
  suggestion,
  readOnly,
  isStreaming = false,
  isApplied,
  isDismissed,
  onApply,
  onDismiss,
}: DraftSuggestionCardProps) {
  const [expandedMode, setExpandedMode] = useState<'closed' | 'preview' | 'diff'>('closed');
  const labels = UI_LABELS.ai.suggestions;

  return (
    <div className={`${UI_TOKENS.ai.suggestionCard} ${isDismissed ? 'opacity-60' : ''}`}>
      <div className={UI_TOKENS.ai.suggestionHeader}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="auteur-phase-continuity inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium">
              <Sparkles className="h-2.5 w-2.5" />
              <span>{labels.draftLabel}</span>
            </span>

            <span className="rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
              {formatTopologyLabel(suggestion.sceneTopology)}
            </span>

            {suggestion.errorCount === 0 && suggestion.warningCount === 0 ? (
              <span className="auteur-phase-aesthetic rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                {labels.lintClean}
              </span>
            ) : (
              <span className="auteur-phase-intent rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                {labels.lintWarnings(suggestion.warningCount)}
              </span>
            )}
          </div>

          {suggestion.title && (
            <div className="font-serif text-[13px] font-bold text-text-main leading-snug">
              {suggestion.title}
            </div>
          )}
          <p className="text-xs leading-snug text-text-body">{suggestion.summary}</p>
          <div className="font-mono text-[10px] text-text-faint tabular-nums">
            {labels.draftStats(suggestion.stagingBlockCount, suggestion.beatCount)}
          </div>
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {expandedMode === 'preview' && (
          <pre className={`${UI_TOKENS.ai.diffContainer} p-2.5 whitespace-pre-wrap text-text-body`}>
            {suggestion.candidateRawText}
          </pre>
        )}

        {expandedMode === 'diff' && <ScriptLineDiffView diff={suggestion.diff} />}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setExpandedMode((prev) => (prev === 'preview' ? 'closed' : 'preview'))
              }
              className={UI_TOKENS.ai.pillButton}
            >
              <FileCode2 className="h-3 w-3" />
              <span>
                {expandedMode === 'preview' ? labels.hidePreview : labels.viewModePreview}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setExpandedMode((prev) => (prev === 'diff' ? 'closed' : 'diff'))}
              className={UI_TOKENS.ai.pillButton}
            >
              <GitCompare className="h-3 w-3" />
              <span>{expandedMode === 'diff' ? labels.hideDiff : labels.viewModeDiff}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {isApplied ? (
              <span className="auteur-phase-aesthetic inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold">
                <Check className="h-3 w-3" />
                <span>{labels.appliedBadge}</span>
              </span>
            ) : isDismissed ? (
              <span className="inline-flex items-center gap-1 rounded-lg border border-border-main bg-surface px-2 py-1 text-[11px] text-text-faint">
                {labels.dismissedBadge}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onDismiss(suggestion.id)}
                  className={UI_TOKENS.ai.pillButton}
                >
                  <X className="h-3 w-3" />
                  <span>{labels.dismissButton}</span>
                </button>
                <button
                  type="button"
                  disabled={isStreaming}
                  title={isStreaming ? labels.waitUntilFinishedTitle : undefined}
                  onClick={() => onApply(suggestion)}
                  className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] disabled:opacity-45 disabled:cursor-not-allowed`}
                >
                  {isStreaming ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : readOnly ? (
                    <GitFork className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  <span>
                    {isStreaming
                      ? labels.finishingLabel
                      : readOnly
                        ? labels.forkAndApplyButton
                        : labels.applyButton}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

interface AuditIssueRowProps {
  issue: AuditReviewIssueItem;
  currentSnapshotHash: string;
  readOnly: boolean;
  isStreaming: boolean;
  isFixApplied: boolean;
  onJumpToTarget: (targetId: string) => void;
  onApplyIssueFix: (patchSuggestion: PatchSuggestion) => void;
}

const AuditIssueRow = memo(function AuditIssueRow({
  issue,
  currentSnapshotHash,
  readOnly,
  isStreaming,
  isFixApplied,
  onJumpToTarget,
  onApplyIssueFix,
}: AuditIssueRowProps) {
  const [showDiff, setShowDiff] = useState(false);
  const labels = UI_LABELS.ai.suggestions;
  const isError = issue.severity === 'error';
  const patch = issue.patchSuggestion;
  const stale =
    patch !== undefined &&
    !isFixApplied &&
    isSuggestionStale(patch.baseSnapshotHash, currentSnapshotHash);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onJumpToTarget(issue.targetId)}
          title={labels.jumpToTargetTitle(issue.targetId)}
          className="group flex min-w-0 flex-1 items-start gap-2 text-left cursor-pointer"
        >
          <span
            className={`mt-0.5 shrink-0 ${
              isError
                ? 'text-red-500'
                : 'text-amber-500'
            }`}
          >
            {isError ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted">
                {formatLensShort(issue.lens)}
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-border-main bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-main group-hover:border-text-faint transition-colors">
                <Crosshair className="h-2.5 w-2.5 text-text-faint" />
                <span>{issue.targetId}</span>
              </span>
            </div>
            <p className="text-xs font-medium leading-snug text-text-main group-hover:underline">
              {issue.message}
            </p>
            <p className="text-[11px] leading-snug text-text-muted">{issue.rationale}</p>
            {issue.repairHint && (
              <p className="text-[11px] leading-snug text-text-body">
                <span className="font-semibold text-text-muted">{labels.repairHintPrefix}</span>
                {issue.repairHint}
              </p>
            )}
          </div>
        </button>
      </div>

      {patch && (
        <div className="pt-1 border-t border-border-subtle space-y-2">
          {stale && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{labels.staleWarning}</span>
            </div>
          )}

          {showDiff && <ScriptLineDiffView diff={patch.diff} />}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowDiff((prev) => !prev)}
              className={UI_TOKENS.ai.pillButton}
            >
              <GitCompare className="h-3 w-3" />
              <span>{showDiff ? labels.hideDiff : labels.showDiff}</span>
            </button>

            {isFixApplied ? (
              <span className="auteur-phase-aesthetic inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold">
                <Check className="h-3 w-3" />
                <span>{labels.appliedBadge}</span>
              </span>
            ) : (
              <button
                type="button"
                disabled={stale || isStreaming}
                title={isStreaming ? labels.waitUntilFinishedTitle : undefined}
                onClick={() => onApplyIssueFix(patch)}
                className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1 px-2.5 py-1 text-[11px] disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                {isStreaming ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : readOnly ? (
                  <GitFork className="h-3 w-3" />
                ) : (
                  <Wrench className="h-3 w-3" />
                )}
                <span>
                  {isStreaming
                    ? labels.finishingLabel
                    : readOnly
                      ? labels.forkAndApplyButton
                      : labels.applyFixButton}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {!patch && issue.patchValidationErrors && issue.patchValidationErrors.length > 0 && (
        <p className="text-[10px] text-text-faint italic">{labels.embeddedPatchUnavailable}</p>
      )}
    </div>
  );
});

export interface AuditReviewSuggestionCardProps {
  suggestion: AuditReviewSuggestion;
  rawText: string;
  ruleOverrides?: LintRuleOverrides;
  currentSnapshotHash: string;
  readOnly: boolean;
  isStreaming?: boolean;
  appliedIds: readonly string[];
  onJumpToTarget: (targetId: string) => void;
  onApplyIssueFix: (patchSuggestion: PatchSuggestion) => void;
  onApplyAllFixes: (batchPatch: PatchSuggestion, includedFixIds: string[]) => void;
}

export const AuditReviewSuggestionCard = memo(function AuditReviewSuggestionCard({
  suggestion,
  rawText,
  ruleOverrides,
  currentSnapshotHash,
  readOnly,
  isStreaming = false,
  appliedIds,
  onJumpToTarget,
  onApplyIssueFix,
  onApplyAllFixes,
}: AuditReviewSuggestionCardProps) {
  const labels = UI_LABELS.ai.suggestions;
  const hasErrors = suggestion.errorCount > 0;
  const hasWarnings = suggestion.warningCount > 0;

  const {totalFixCount, appliedFixCount} = useMemo(() => {
    let total = 0;
    let applied = 0;
    for (const issue of suggestion.issues) {
      if (issue.patchSuggestion) {
        total += 1;
        if (appliedIds.includes(issue.patchSuggestion.id)) {
          applied += 1;
        }
      }
    }
    return {totalFixCount: total, appliedFixCount: applied};
  }, [suggestion.issues, appliedIds]);

  const allFixesApplied = totalFixCount > 0 && appliedFixCount === totalFixCount;

  const batchPlan = useMemo(
    () =>
      composeAuditFixesBatch(
        rawText,
        suggestion,
        appliedIds,
        currentSnapshotHash,
        ruleOverrides
      ),
    [rawText, suggestion, appliedIds, currentSnapshotHash, ruleOverrides]
  );

  const canApplyBatch =
    !allFixesApplied &&
    batchPlan.combinedPatch !== null &&
    batchPlan.includedFixIds.length >= 2;

  return (
    <div className={UI_TOKENS.ai.suggestionCard}>
      <div className={UI_TOKENS.ai.suggestionHeader}>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="auteur-phase-intent inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium">
                <AlertTriangle className="h-2.5 w-2.5" />
                <span>{labels.auditLabel}</span>
              </span>

              <span
                className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                  hasErrors
                    ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                    : hasWarnings
                      ? 'auteur-phase-intent'
                      : 'auteur-phase-aesthetic'
                }`}
              >
                {labels.auditCounts(suggestion.errorCount, suggestion.warningCount)}
              </span>
            </div>

            {allFixesApplied ? (
              <span className="auteur-phase-aesthetic inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold shrink-0">
                <Check className="h-3 w-3" />
                <span>{labels.allFixesAppliedBadge}</span>
              </span>
            ) : (
              canApplyBatch &&
              batchPlan.combinedPatch && (
                <button
                  type="button"
                  disabled={isStreaming}
                  title={isStreaming ? labels.waitUntilFinishedTitle : undefined}
                  onClick={() =>
                    onApplyAllFixes(batchPlan.combinedPatch!, batchPlan.includedFixIds)
                  }
                  className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1 px-2.5 py-1 text-[11px] shrink-0 disabled:opacity-45 disabled:cursor-not-allowed`}
                >
                  {isStreaming ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : readOnly ? (
                    <GitFork className="h-3 w-3" />
                  ) : (
                    <Wrench className="h-3 w-3" />
                  )}
                  <span>
                    {isStreaming
                      ? labels.finishingLabel
                      : readOnly
                        ? labels.forkAndApplyAllFixesButton(batchPlan.includedFixIds.length)
                        : labels.applyAllFixesButton(batchPlan.includedFixIds.length)}
                  </span>
                </button>
              )
            )}
          </div>

          <p className="text-xs leading-snug text-text-main">{suggestion.overallSummary}</p>

          {canApplyBatch && batchPlan.skippedCount > 0 && (
            <p className="text-[10.5px] text-text-faint">
              {labels.batchPartialNote(batchPlan.includedFixIds.length, batchPlan.eligibleCount)}
            </p>
          )}
        </div>
      </div>

      <div className="px-2.5 py-2.5 space-y-2">
        {suggestion.issues.length === 0 ? (
          <div className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-xs text-text-muted">
            {labels.auditNoIssues}
          </div>
        ) : (
          suggestion.issues.map((issue) => (
            <AuditIssueRow
              key={issue.id}
              issue={issue}
              currentSnapshotHash={currentSnapshotHash}
              readOnly={readOnly}
              isStreaming={isStreaming}
              isFixApplied={
                issue.patchSuggestion !== undefined &&
                appliedIds.includes(issue.patchSuggestion.id)
              }
              onJumpToTarget={onJumpToTarget}
              onApplyIssueFix={onApplyIssueFix}
            />
          ))
        )}
      </div>
    </div>
  );
});
