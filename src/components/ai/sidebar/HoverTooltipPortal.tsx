import {createPortal} from 'react-dom';
import {
  formatCacheHitPercent,
  formatUsdBreakdown,
  type SessionCostSummary,
} from '../../../ui/aiPricing.ts';
import {UI_LABELS} from '../../../ui/labels.ts';

export interface HoverTooltipRow {
  label: string;
  secondary?: string;
  value: string;
  tone?: 'positive' | 'muted';
}

export interface ActivityHoverTooltip {
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

export function buildTooltipPosition(
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

export function buildSessionCostTooltip(
  sessionCost: SessionCostSummary,
  formattedSessionCost: string,
  rect: DOMRect
): ActivityHoverTooltip {
  const costLabels = UI_LABELS.ai.cost;
  const hasCacheStats = sessionCost.cacheHitRate !== null;
  const rows: HoverTooltipRow[] = [];

  if (hasCacheStats && sessionCost.cacheHitRate !== null) {
    const hitPct = formatCacheHitPercent(sessionCost.cacheHitRate);
    const missPct = formatCacheHitPercent(1 - sessionCost.cacheHitRate);
    if (sessionCost.cachedTokens > 0) {
      rows.push({
        label: costLabels.rowCache,
        secondary: costLabels.cacheHitMissPair(hitPct, missPct),
        value:
          sessionCost.cacheSavingsUsd > 0
            ? costLabels.cacheSavedCompact(formatUsdBreakdown(sessionCost.cacheSavingsUsd))
            : hitPct,
        tone: sessionCost.cacheSavingsUsd > 0 ? 'positive' : undefined,
      });
    } else {
      rows.push({
        label: costLabels.rowCache,
        secondary: costLabels.cacheColdMiss,
        value: formatUsdBreakdown(0),
        tone: 'muted',
      });
    }
  }

  rows.push({
    label: hasCacheStats ? costLabels.rowInputMiss : costLabels.rowInput,
    secondary: costLabels.formatTokens(
      sessionCost.nonCachedInputTokens + sessionCost.toolUseTokens
    ),
    value: formatUsdBreakdown(sessionCost.inputCostUsd),
  });
  if (sessionCost.cachedTokens > 0) {
    rows.push({
      label: costLabels.rowCachedHit,
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
  const pos = buildTooltipPosition(rect, {forceAbove: true});
  return {
    title: costLabels.sessionTooltipTitle,
    subtitle: costLabels.sessionTooltipSubtitle(sessionCost.turnCount),
    badge: formattedSessionCost,
    rows,
    footer: costLabels.disclaimer,
    ...pos,
  };
}

export function HoverTooltipPortal({tooltip}: {tooltip: ActivityHoverTooltip | null}) {
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
                <span
                  className={
                    row.tone === 'positive'
                      ? 'font-semibold text-[var(--phase-aesthetic-text)]'
                      : row.tone === 'muted'
                        ? 'text-text-faint'
                        : 'text-text-main font-medium'
                  }
                >
                  {row.value}
                </span>
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
