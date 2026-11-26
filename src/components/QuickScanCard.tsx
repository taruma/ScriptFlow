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
    return 'auteur-phase-execution';
  }
  if (status === 'borderline') {
    return 'auteur-phase-intent';
  }
  return 'auteur-phase-aesthetic';
}

function getStatusAccentColor(status: QuickScanStatus): string {
  if (status === 'flagged') {
    return 'var(--phase-execution-text)';
  }
  if (status === 'borderline') {
    return 'var(--phase-intent-text)';
  }
  return 'var(--phase-aesthetic-text)';
}

function getOverallStatus(result: QuickScanResult): QuickScanStatus {
  if (result.flaggedCount > 0) return 'flagged';
  if (result.borderlineCount > 0) return 'borderline';
  return 'clean';
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
  const overallStatus = getOverallStatus(result);
  const overallAccentColor = getStatusAccentColor(overallStatus);

  const defaultSelected = useMemo(() => getDefaultSelectedAuditLenses(result), [result]);
  const [selectedLenses, setSelectedLenses] = useState<Set<AuteurLensPresetId>>(
    () => new Set(defaultSelected)
  );
  // Start all lens rows collapsed so the initial scorecard stays compact & calm
  const [expandedLenses, setExpandedLenses] = useState<Record<string, boolean>>({});
  const [isCardCollapsed, setIsCardCollapsed] = useState(false);
  const [expandedDismissed, setExpandedDismissed] = useState(false);

  // Sync defaults and collapse lenses cleanly when a new result object arrives
  useEffect(() => {
    setSelectedLenses(new Set(getDefaultSelectedAuditLenses(result)));
    setExpandedLenses({});
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

  const anyLensHasItems = useMemo(
    () => result.lensSummaries.some((summary) => summary.items.length > 0),
    [result.lensSummaries]
  );

  const anyLensExpanded = useMemo(
    () => result.lensSummaries.some((summary) => summary.items.length > 0 && Boolean(expandedLenses[summary.lens])),
    [result.lensSummaries, expandedLenses]
  );

  const toggleAllLensesExpanded = () => {
    if (anyLensExpanded) {
      setExpandedLenses({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const summary of result.lensSummaries) {
      if (summary.items.length > 0) {
        next[summary.lens] = true;
      }
    }
    setExpandedLenses(next);
  };

  const orderedSelectedLenses = useMemo(
    () => AUDIT_LENS_PRESET_IDS.filter((lens) => selectedLenses.has(lens)),
    [selectedLenses]
  );

  const hasAnySignal = result.flaggedCount > 0 || result.borderlineCount > 0;
  const summaryText = hasAnySignal
    ? qsLabels.summaryCounts(result.flaggedCount, result.borderlineCount)
    : qsLabels.summaryAllClean;

  const renderVerdictIcon = (status: QuickScanStatus) => {
    const style = {color: getStatusAccentColor(status)};
    if (status === 'flagged') {
      return <AlertCircle className="h-3.5 w-3.5 shrink-0" style={style} />;
    }
    if (status === 'borderline') {
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={style} />;
    }
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={style} />;
  };

  // Compact single-line bar when dismissed (click to expand & review)
  if (dismissed && !expandedDismissed) {
    return (
      <button
        type="button"
        onClick={() => setExpandedDismissed(true)}
        aria-expanded={false}
        aria-label={qsLabels.expandCardAria}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-subtle/70 px-3 py-2 text-left text-[11px] text-text-muted hover:bg-surface-hover/70 transition-colors cursor-pointer opacity-75"
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <ScanSearch className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          <span className="font-medium text-text-main truncate">{qsLabels.cardTitle}</span>
          <span className="font-mono text-[10px] text-text-faint truncate">· {summaryText}</span>
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <span className="rounded-md border border-border-main bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
            {qsLabels.dismissedBadge}
          </span>
          <ChevronRight className="h-3 w-3 text-text-faint" />
        </span>
      </button>
    );
  }

  // Whole-card collapsed overview bar (preserves Live Mode dots without dismissing)
  if (!dismissed && isCardCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setIsCardCollapsed(false)}
        aria-expanded={false}
        aria-label={qsLabels.expandCardAria}
        style={{borderLeftColor: overallAccentColor}}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-border-main border-l-2 bg-surface px-3 py-2 text-left hover:bg-surface-subtle transition-colors cursor-pointer shadow-2xs"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {renderVerdictIcon(overallStatus)}
          <span className="text-[11px] font-semibold text-text-main shrink-0">
            {qsLabels.cardTitle}
          </span>
          <span
            className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium truncate ${getStatusPillClass(
              overallStatus
            )}`}
          >
            {summaryText}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] text-text-faint">
          <span className="tabular-nums">
            {qsLabels.checksSummary(result.totalQuestions)} · {formatDurationCompact(result.durationMs)}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
        </div>
      </button>
    );
  }

  return (
    <div
      style={{borderLeftColor: dismissed ? undefined : overallAccentColor}}
      className={`rounded-xl border border-border-main bg-surface shadow-sm overflow-hidden ${
        dismissed ? 'opacity-75' : 'border-l-2'
      }`}
    >
      {/* 2-Tier Header */}
      <div className="border-b border-border-subtle bg-surface-subtle/75 px-3 py-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {renderVerdictIcon(overallStatus)}
            <span className="text-[11.5px] font-semibold tracking-tight text-text-main shrink-0">
              {qsLabels.cardTitle}
            </span>
            <span
              className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium truncate ${getStatusPillClass(
                overallStatus
              )}`}
            >
              {summaryText}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (dismissed) setExpandedDismissed(false);
              else setIsCardCollapsed(true);
            }}
            aria-expanded={true}
            aria-label={qsLabels.collapseCardAria}
            className="rounded-md p-0.5 text-text-faint hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer shrink-0"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-text-faint">
          <div className="flex items-center gap-1.5 min-w-0 truncate tabular-nums">
            <span>{qsLabels.checksSummary(result.totalQuestions)}</span>
            <span>·</span>
            <span>{formatDurationCompact(result.durationMs)}</span>
            <span>·</span>
            <span className="capitalize">{result.sensitivity}</span>
          </div>

          {anyLensHasItems && (
            <button
              type="button"
              onClick={toggleAllLensesExpanded}
              className="shrink-0 font-sans text-[10.5px] font-medium text-text-muted hover:text-text-main transition-colors cursor-pointer"
            >
              {anyLensExpanded ? qsLabels.collapseAllLensesButton : qsLabels.expandAllLensesButton}
            </button>
          )}
        </div>
      </div>

      {/* Conditional Stale / YouTube Notices */}
      {isStale && (
        <div className="auteur-phase-intent flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{qsLabels.staleNotice}</span>
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={onRescan}
            className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface px-2 py-0.5 text-[10px] font-medium text-text-main hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-45"
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

      {/* Body: Canonical Fixed-Order Lens Scorecard */}
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
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium transition-opacity cursor-pointer hover:opacity-85 ${getStatusPillClass(
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-surface-subtle/60 px-3 py-2">
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

          <div className="flex items-center gap-1">
            {!isStale && (
              <button
                type="button"
                disabled={disabled}
                onClick={onRescan}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                <span>{qsLabels.rescanButton}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
              <span>{qsLabels.dismissButton}</span>
            </button>
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
  const [showCleanItems, setShowCleanItems] = useState(false);
  const qsLabels = UI_LABELS.ai.quickScan;
  const label = qsLabels.lensLabels[summary.lens];
  const hasItems = summary.items.length > 0;
  const nonCleanCount = summary.flaggedCount + summary.borderlineCount;
  const isClean = summary.status === 'clean';

  const issueItems = useMemo(
    () => summary.items.filter((item) => item.status !== 'clean'),
    [summary.items]
  );
  const cleanItems = useMemo(
    () => summary.items.filter((item) => item.status === 'clean'),
    [summary.items]
  );

  // Reset passed-checks toggle cleanly whenever a new summary arrives
  useEffect(() => {
    setShowCleanItems(false);
  }, [summary]);

  return (
    <div
      style={{
        borderLeftColor: isClean ? 'transparent' : getStatusAccentColor(summary.status),
      }}
      className="bg-surface border-l-2"
    >
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-subtle/40 transition-colors">
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
            <span
              className={`text-[11px] truncate ${
                isClean ? 'text-text-muted' : 'font-medium text-text-main'
              }`}
            >
              {label}
            </span>
          </span>

          <span className="flex items-center gap-1.5 shrink-0">
            {summary.totalChecked > 0 && (
              <span className="font-mono text-[10px] text-text-faint tabular-nums">
                {nonCleanCount > 0 ? `${nonCleanCount}/${summary.totalChecked}` : `${summary.totalChecked}`}
              </span>
            )}
            {isClean ? (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-faint">
                <CheckCircle2
                  className="h-3 w-3 shrink-0"
                  style={{color: getStatusAccentColor('clean')}}
                />
                <span>{getStatusLabel('clean')}</span>
              </span>
            ) : (
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold ${getStatusPillClass(
                  summary.status
                )}`}
              >
                {getStatusLabel(summary.status)}
              </span>
            )}
          </span>
        </button>
      </div>

      {expanded && hasItems && (
        <div className="border-t border-border-subtle/60 bg-surface-subtle/40 px-3 py-1.5 space-y-1">
          {issueItems.map((item) => (
            <FindingRow key={item.key} item={item} onJumpToTarget={onJumpToTarget} />
          ))}

          {issueItems.length === 0 ? (
            cleanItems.map((item) => (
              <FindingRow key={item.key} item={item} onJumpToTarget={onJumpToTarget} />
            ))
          ) : (
            cleanItems.length > 0 && (
              <>
                {showCleanItems &&
                  cleanItems.map((item) => (
                    <FindingRow key={item.key} item={item} onJumpToTarget={onJumpToTarget} />
                  ))}
                <button
                  type="button"
                  onClick={() => setShowCleanItems((prev) => !prev)}
                  className="inline-flex items-center gap-1 pt-0.5 text-[10px] font-medium text-text-faint hover:text-text-main transition-colors cursor-pointer"
                >
                  {showCleanItems ? (
                    <ChevronDown className="h-2.5 w-2.5" />
                  ) : (
                    <ChevronRight className="h-2.5 w-2.5" />
                  )}
                  <span>
                    {showCleanItems
                      ? qsLabels.hidePassedChecksButton(cleanItems.length)
                      : qsLabels.showPassedChecksButton(cleanItems.length)}
                  </span>
                </button>
              </>
            )
          )}
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
  const [expanded, setExpanded] = useState(false);
  const qsLabels = UI_LABELS.ai.quickScan;
  const pct = Math.round(item.probability * 100);
  const isJumpable = item.beatIndex !== undefined || /^MB\d+/i.test(item.targetId);
  const hasDetail = Boolean(
    item.instructions || item.trueDescription || item.deterministicMessage
  );
  const dotColor = getStatusAccentColor(item.status);

  return (
    <div className="py-0.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            aria-hidden="true"
            style={{backgroundColor: dotColor}}
            className="h-1.5 w-1.5 shrink-0 rounded-full"
          />
          {isJumpable ? (
            <button
              type="button"
              onClick={() => onJumpToTarget(item.targetId)}
              title={UI_LABELS.ai.suggestions.jumpToTargetTitle(item.targetId)}
              className="shrink-0 rounded border border-border-main bg-surface px-1 py-0.5 font-mono text-[9px] font-semibold text-text-main hover:bg-surface-hover cursor-pointer"
            >
              {item.targetId}
            </button>
          ) : (
            <span className="shrink-0 rounded border border-border-subtle bg-surface-subtle px-1 py-0.5 font-mono text-[9px] text-text-faint">
              {item.targetId}
            </span>
          )}
          {hasDetail ? (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? qsLabels.collapseFindingAria(item.ruleLabel)
                  : qsLabels.expandFindingAria(item.ruleLabel)
              }
              title={item.instructions ?? item.deterministicMessage ?? item.ruleLabel}
              className="flex items-center gap-1 min-w-0 text-left group/finding cursor-pointer"
            >
              <span
                className={`truncate group-hover/finding:underline decoration-border-main underline-offset-2 ${
                  item.status === 'clean' ? 'text-text-muted' : 'font-medium text-text-main'
                }`}
              >
                {item.ruleLabel}
              </span>
              {expanded ? (
                <ChevronDown className="h-2.5 w-2.5 shrink-0 text-text-faint" />
              ) : (
                <ChevronRight className="h-2.5 w-2.5 shrink-0 text-text-faint opacity-55 group-hover/finding:opacity-100" />
              )}
            </button>
          ) : (
            <span
              className={`truncate ${
                item.status === 'clean' ? 'text-text-muted' : 'font-medium text-text-main'
              }`}
              title={item.ruleLabel}
            >
              {item.ruleLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
          {item.source === 'deterministic' ? (
            <span className="rounded border border-border-main bg-surface px-1 py-0.5 text-[9px] text-text-muted">
              {qsLabels.deterministicBadge}
            </span>
          ) : (
            <div
              className="flex items-center gap-1.5"
              title={`P(issue) = ${pct}% · confidence = ${Math.round(item.confidence * 100)}%`}
            >
              <span className="h-1 w-7 overflow-hidden rounded-full bg-border-subtle">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(4, pct)}%`,
                    backgroundColor: dotColor,
                  }}
                />
              </span>
              <span
                style={{color: item.status === 'clean' ? undefined : dotColor}}
                className={`w-7 text-right tabular-nums ${
                  item.status === 'clean' ? 'text-text-faint' : 'font-semibold'
                }`}
              >
                {pct}%
              </span>
            </div>
          )}
        </div>
      </div>

      {expanded && hasDetail && (
        <div className="mt-1 ml-6 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-[10.5px] leading-snug text-text-muted space-y-1">
          {item.deterministicMessage ? (
            <p className="text-text-body">{item.deterministicMessage}</p>
          ) : (
            <>
              {item.instructions && (
                <p>
                  <span className="font-semibold text-text-faint">
                    {qsLabels.questionAskedLabel}{' '}
                  </span>
                  <span className="text-text-body">{item.instructions}</span>
                </p>
              )}
              {item.trueDescription && (
                <p>
                  <span className="font-semibold text-text-faint">
                    {qsLabels.flaggedIfLabel}{' '}
                  </span>
                  <span>{item.trueDescription}</span>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
