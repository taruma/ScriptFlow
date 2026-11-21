import {memo, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Crosshair,
  GitCompare,
  GitFork,
  Loader2,
  Wrench,
} from 'lucide-react';
import type {LintRuleOverrides} from '../../../core/index.ts';
import {
  composeAuditFixesBatch,
  type AuditReviewIssueItem,
  type AuditReviewSuggestion,
  type PatchSuggestion,
} from '../../../services/scriptTools.ts';
import {formatLensShort, isSuggestionStale} from '../../../ui/aiAssistant.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import {ScriptLineDiffView} from './ScriptLineDiffView.tsx';

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
  const [isIssuesExpanded, setIsIssuesExpanded] = useState<boolean>(
    () => suggestion.issues.length <= 1
  );

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
  const wasAllAppliedRef = useRef(allFixesApplied);

  // Auto-collapse once all fixes are applied to keep the conversation stream calm
  useEffect(() => {
    if (!wasAllAppliedRef.current && allFixesApplied) {
      setIsIssuesExpanded(false);
    }
    wasAllAppliedRef.current = allFixesApplied;
  }, [allFixesApplied]);

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

          {suggestion.issues.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsIssuesExpanded((prev) => !prev)}
                aria-expanded={isIssuesExpanded}
                className={UI_TOKENS.ai.pillButton}
              >
                {isIssuesExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>
                  {isIssuesExpanded
                    ? labels.hideIssuesToggle(suggestion.issues.length)
                    : labels.showIssuesToggle(suggestion.issues.length)}
                </span>
              </button>

              {totalFixCount > 0 && appliedFixCount > 0 && !allFixesApplied && (
                <span className="auteur-phase-aesthetic rounded-md border px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                  {labels.appliedProgressBadge(appliedFixCount, totalFixCount)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {suggestion.issues.length === 0 ? (
        <div className="px-2.5 py-2.5">
          <div className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-xs text-text-muted">
            {labels.auditNoIssues}
          </div>
        </div>
      ) : (
        isIssuesExpanded && (
          <div className="px-2.5 py-2.5 space-y-2">
            {suggestion.issues.map((issue) => (
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
            ))}
          </div>
        )
      )}
    </div>
  );
});
