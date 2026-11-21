import {memo, useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Info,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  X,
} from 'lucide-react';
import type {AuteurLensPresetId} from '../core/index.ts';
import type {QuickScanRuleLens} from '../data/knowledge/index.ts';
import {
  AUDIT_LENS_PRESET_IDS,
  getDefaultSelectedAuditLenses,
  type QuickScanFindingItem,
  type QuickScanLensSummary,
  type QuickScanResult,
  type QuickScanStatus,
} from '../services/geminiDecisions.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

export interface QuickScanCardProps {
  result: QuickScanResult;
  currentSnapshotHash: string;
  dismissed: boolean;
  disabled?: boolean;
  onJumpToTarget: (targetId: string) => void;
  onDeepAuditSelected: (selectedLenses: AuteurLensPresetId[], result: QuickScanResult) => void;
  onRescan: () => void;
  onDismiss: () => void;
}

function getStatusPillClass(status: QuickScanStatus): string {
  if (status === 'flagged') {
    return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
  }
  if (status === 'borderline') {
    return 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
}

function getStatusLabel(status: QuickScanStatus): string {
  const qs = UI_LABELS.ai.quickScan;
  if (status === 'flagged') return qs.statusFlagged;
  if (status === 'borderline') return qs.statusBorderline;
  return qs.statusClean;
}

function isAuditLensPreset(lens: QuickScanRuleLens): lens is AuteurLensPresetId {
  return lens !== 'brief';
}

function formatDurationCompact(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const QuickScanCard = memo(function QuickScanCard({
  result,
  currentSnapshotHash,
  dismissed,
  disabled = false,
  onJumpToTarget,
  onDeepAuditSelected,
  onRescan,
  onDismiss,
}: QuickScanCardProps) {
  const qsLabels = UI_LABELS.ai.quickScan;
  const isStale = result.snapshotHash !== currentSnapshotHash;

  const defaultSelected = useMemo(() => getDefaultSelectedAuditLenses(result), [result]);
  const [selectedLenses, setSelectedLenses] = useState<Set<AuteurLensPresetId>>(
    () => new Set(defaultSelected)
  );
  const [expandedLenses, setExpandedLenses] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const summary of result.lensSummaries) {
      if (summary.status !== 'clean') {
        initial[summary.lens] = true;
      }
    }
    return initial;
  });
  const [expandedDismissed, setExpandedDismissed] = useState(false);

  // Sync defaults if a new result object arrives on this card
  useEffect(() => {
    setSelectedLenses(new Set(getDefaultSelectedAuditLenses(result)));
  }, [result]);

  const toggleLensSelection = (lens: AuteurLensPresetId) => {
    setSelectedLenses((prev) => {
      const next = new Set(prev);
      if (next.has(lens)) next.delete(lens);
      else next.add(lens);
      return next;
    });
  };

  const toggleLensExpand = (lens: QuickScanRuleLens) => {
    setExpandedLenses((prev) => ({
      ...prev,
      [lens]: !prev[lens],
    }));
  };

  const orderedSelectedLenses = useMemo(
    () => AUDIT_LENS_PRESET_IDS.filter((lens) => selectedLenses.has(lens)),
    [selectedLenses]
  );

  const hasAnySignal = result.flaggedCount > 0 || result.borderlineCount > 0;
  const summaryText = hasAnySignal
    ? qsLabels.summaryCounts(result.flaggedCount, result.borderlineCount)
    : qsLabels.summaryAllClean;

  if (dismissed && !expandedDismissed) {
    return (
      <button
        type="button"
        onClick={() => setExpandedDismissed(true)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-subtle/70 px-3 py-2 text-left text-[11px] text-text-muted hover:bg-surface-muted/70 transition-colors cursor-pointer"
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <ScanSearch className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          <span className="font-medium text-text-main truncate">{qsLabels.cardTitle}</span>
          <span className="text-text-faint truncate">· {summaryText}</span>
        </span>
        <span className="shrink-0 rounded-md border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
          {qsLabels.dismissedBadge}
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border-main bg-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-subtle px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {result.flaggedCount > 0 ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          ) : result.borderlineCount > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}
          <span className="text-[11px] font-semibold tracking-wide text-text-main">
            {qsLabels.cardTitle}
          </span>
          <span
            className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium ${getStatusPillClass(
              result.flaggedCount > 0
                ? 'flagged'
                : result.borderlineCount > 0
                  ? 'borderline'
                  : 'clean'
            )}`}
          >
            {summaryText}
          </span>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[10px] text-text-faint">
          <span>{qsLabels.checksSummary(result.totalQuestions)}</span>
          <span>·</span>
          <span>{formatDurationCompact(result.durationMs)}</span>
          <span className="rounded border border-border-subtle bg-surface px-1 py-0.5 capitalize text-[9px] text-text-muted">
            {result.sensitivity}
          </span>
          {dismissed && (
            <button
              type="button"
              onClick={() => setExpandedDismissed(false)}
              className="rounded p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main cursor-pointer"
              aria-label={UI_LABELS.ai.suggestions.collapseDetailsAria}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Conditional Stale / YouTube Notices */}
      {isStale && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{qsLabels.staleNotice}</span>
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={onRescan}
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-surface px-2 py-0.5 text-[10px] font-medium text-text-main hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-45"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            <span>{qsLabels.rescanButton}</span>
          </button>
        </div>
      )}

      {result.skippedYoutubeHandles.length > 0 && (
        <div className="flex items-start gap-1.5 border-b border-border-subtle bg-surface-subtle/60 px-3 py-1.5 text-[10px] text-text-muted">
          <Info className="h-3 w-3 shrink-0 mt-0.5 text-text-faint" />
          <span>{qsLabels.youtubeNotice(result.skippedYoutubeHandles)}</span>
        </div>
      )}

      {/* Body: Lens Rows */}
      <div className="divide-y divide-border-subtle">
        {result.totalQuestions === 0 && result.deterministicCount === 0 ? (
          <div className="px-3 py-3 text-[11px] text-text-muted">{qsLabels.noRulesRanNote}</div>
        ) : (
          result.lensSummaries.map((summary) => (
            <LensSummaryRow
              key={summary.lens}
              summary={summary}
              checked={isAuditLensPreset(summary.lens) && selectedLenses.has(summary.lens)}
              selectable={isAuditLensPreset(summary.lens)}
              expanded={Boolean(expandedLenses[summary.lens])}
              onToggleSelect={() => {
                if (isAuditLensPreset(summary.lens)) {
                  toggleLensSelection(summary.lens);
                }
              }}
              onToggleExpand={() => toggleLensExpand(summary.lens)}
              onJumpToTarget={onJumpToTarget}
            />
          ))
        )}
      </div>

      {/* Suspect Macro-States Jump Strip */}
      {result.suspectBeats.length > 0 && (
        <div className="border-t border-border-subtle bg-surface-subtle/50 px-3 py-2 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
            {qsLabels.suspectStatesHeading}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.suspectBeats.map((beat) => {
              const topItem = beat.items[0];
              const pct = Math.round(beat.maxProbability * 100);
              return (
                <button
                  key={beat.targetId}
                  type="button"
                  onClick={() => onJumpToTarget(beat.targetId)}
                  title={qsLabels.jumpToStateTitle(
                    beat.targetId,
                    topItem?.ruleLabel ?? '',
                    pct
                  )}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium transition-colors cursor-pointer hover:opacity-85 ${getStatusPillClass(
                    beat.status
                  )}`}
                >
                  <Crosshair className="h-2.5 w-2.5" />
                  <span>{beat.targetId}</span>
                  <span className="opacity-75">· {pct}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Footer */}
      {!dismissed && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-surface-subtle px-3 py-2">
          <button
            type="button"
            onClick={onDismiss}
            className={`${UI_TOKENS.ai.pillButton} text-[11px]`}
          >
            <X className="h-3 w-3" />
            <span>{qsLabels.dismissButton}</span>
          </button>

          <div className="flex items-center gap-1.5">
            {orderedSelectedLenses.length > 0 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDeepAuditSelected(orderedSelectedLenses, result)}
                className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                <ShieldAlert className="h-3 w-3" />
                <span>{qsLabels.deepAuditSelectedButton(orderedSelectedLenses.length)}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDeepAuditSelected([...AUDIT_LENS_PRESET_IDS], result)}
                className={`${UI_TOKENS.ai.pillButton} text-[11px] disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                <ShieldAlert className="h-3 w-3" />
                <span>{qsLabels.runFullDeepAuditButton}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

interface LensSummaryRowProps {
  summary: QuickScanLensSummary;
  checked: boolean;
  selectable: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onJumpToTarget: (targetId: string) => void;
}

function LensSummaryRow({
  summary,
  checked,
  selectable,
  expanded,
  onToggleSelect,
  onToggleExpand,
  onJumpToTarget,
}: LensSummaryRowProps) {
  const qsLabels = UI_LABELS.ai.quickScan;
  const label = qsLabels.lensLabels[summary.lens];
  const hasItems = summary.items.length > 0;
  const nonCleanCount = summary.flaggedCount + summary.borderlineCount;

  return (
    <div className="bg-surface">
      <div className="flex items-center gap-2 px-3 py-1.5">
        {selectable ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={qsLabels.lensCheckboxAria(label)}
            onClick={onToggleSelect}
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer ${
              checked
                ? 'border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text'
                : 'border-border-main bg-surface-subtle hover:border-text-muted'
            }`}
          >
            {checked && <Check className="h-2.5 w-2.5 stroke-[3]" />}
          </button>
        ) : (
          <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={onToggleExpand}
          disabled={!hasItems}
          aria-expanded={expanded}
          aria-label={expanded ? qsLabels.lensCollapseAria(label) : qsLabels.lensExpandAria(label)}
          className="flex flex-1 items-center justify-between gap-2 min-w-0 text-left cursor-pointer disabled:cursor-default"
        >
          <span className="inline-flex items-center gap-1 min-w-0">
            {hasItems ? (
              expanded ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-text-faint" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-text-faint" />
              )
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <span className="text-[11px] font-medium text-text-main truncate">{label}</span>
          </span>

          <span className="flex items-center gap-1.5 shrink-0">
            {summary.totalChecked > 0 && (
              <span className="font-mono text-[10px] text-text-faint">
                {nonCleanCount > 0 ? `${nonCleanCount}/${summary.totalChecked}` : `${summary.totalChecked}`}
              </span>
            )}
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${getStatusPillClass(
                summary.status
              )}`}
            >
              {getStatusLabel(summary.status)}
            </span>
          </span>
        </button>
      </div>

      {expanded && hasItems && (
        <div className="border-t border-border-subtle/60 bg-surface-subtle/40 px-3 py-1.5 space-y-1">
          {summary.items.map((item) => (
            <FindingRow key={item.key} item={item} onJumpToTarget={onJumpToTarget} />
          ))}
        </div>
      )}
    </div>
  );
}

function FindingRow({
  item,
  onJumpToTarget,
}: {
  item: QuickScanFindingItem;
  onJumpToTarget: (targetId: string) => void;
}) {
  const qsLabels = UI_LABELS.ai.quickScan;
  const pct = Math.round(item.probability * 100);
  const isJumpable = item.beatIndex !== undefined || /^MB\d+/i.test(item.targetId);

  return (
    <div className="flex items-center justify-between gap-2 text-[11px] py-0.5">
      <div className="flex items-center gap-1.5 min-w-0">
        {isJumpable ? (
          <button
            type="button"
            onClick={() => onJumpToTarget(item.targetId)}
            title={UI_LABELS.ai.suggestions.jumpToTargetTitle(item.targetId)}
            className="shrink-0 rounded border border-border-main bg-surface px-1 py-0.5 font-mono text-[9px] font-semibold text-text-main hover:bg-surface-muted cursor-pointer"
          >
            {item.targetId}
          </button>
        ) : (
          <span className="shrink-0 rounded border border-border-subtle bg-surface-subtle px-1 py-0.5 font-mono text-[9px] text-text-faint">
            {item.targetId}
          </span>
        )}
        <span
          className={`truncate ${
            item.status === 'clean' ? 'text-text-muted' : 'font-medium text-text-main'
          }`}
          title={item.deterministicMessage ?? item.ruleLabel}
        >
          {item.ruleLabel}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
        {item.source === 'deterministic' ? (
          <span className="rounded border border-border-main bg-surface px-1 py-0.5 text-[9px] text-text-muted">
            {qsLabels.deterministicBadge}
          </span>
        ) : (
          <span
            className={`tabular-nums ${
              item.status === 'flagged'
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : item.status === 'borderline'
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-text-faint'
            }`}
            title={`P(issue) = ${pct}% · confidence = ${Math.round(item.confidence * 100)}%`}
          >
            {pct}%
          </span>
        )}
      </div>
    </div>
  );
}
