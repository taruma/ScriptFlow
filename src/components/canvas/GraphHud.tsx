import {memo} from 'react';
import {RotateCcw} from 'lucide-react';
import type {SceneTopology} from '../../core/index.ts';
import type {GraphDirection, GraphSceneStats} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';

interface GraphHudProps {
  topology: SceneTopology;
  stats: GraphSceneStats;
  direction: GraphDirection;
  allExpanded: boolean;
  allRawOpen: boolean;
  showAllLinks: boolean;
  hasCustomOffsets: boolean;
  hasExecution: boolean;
  onDirectionChange: (next: GraphDirection) => void;
  onToggleExpandAll: () => void;
  onToggleRawAll: () => void;
  onToggleAllLinks: () => void;
  onResetLayout: () => void;
}

export const GraphHud = memo(function GraphHud({
  topology,
  stats,
  direction,
  allExpanded,
  allRawOpen,
  showAllLinks,
  hasCustomOffsets,
  hasExecution,
  onDirectionChange,
  onToggleExpandAll,
  onToggleRawAll,
  onToggleAllLinks,
  onResetLayout,
}: GraphHudProps) {
  const topologyLabel = UI_LABELS.graph.topologyLabels[topology];

  return (
    <div className="pointer-events-none absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2">
      {/* Left: Scene Topology & Quiet Tabular Stats */}
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border-main bg-surface/95 backdrop-blur px-3 py-1.5 shadow-xs">
        <span
          className="text-xs font-semibold whitespace-nowrap shrink-0"
          style={{color: 'var(--graph-dim-camera)'}}
        >
          {topologyLabel}
        </span>
        <span aria-hidden="true" className="h-3.5 w-px bg-border-main shrink-0" />
        <span className="hidden md:inline font-mono text-[11px] tabular-nums text-text-muted whitespace-nowrap">
          {UI_LABELS.graph.statsSummary(
            stats.stagingCount,
            stats.inferredObjectCount,
            stats.macroStateCount,
            stats.subStateCount
          )}
        </span>
      </div>

      {/* Right: Layout & View Controls */}
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-border-main bg-surface/95 backdrop-blur px-2 py-1 shadow-xs text-xs">
        <div
          role="group"
          aria-label={UI_LABELS.graph.directionGroupAria}
          className="flex items-center rounded-lg bg-surface-muted p-0.5 border border-border-subtle"
        >
          <button
            type="button"
            onClick={() => onDirectionChange('LR')}
            title={UI_LABELS.graph.directionLRTitle}
            aria-pressed={direction === 'LR'}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              direction === 'LR'
                ? 'bg-btn-primary-bg text-btn-primary-text shadow-2xs'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {UI_LABELS.graph.directionLR}
          </button>
          <button
            type="button"
            onClick={() => onDirectionChange('TB')}
            title={UI_LABELS.graph.directionTBTitle}
            aria-pressed={direction === 'TB'}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              direction === 'TB'
                ? 'bg-btn-primary-bg text-btn-primary-text shadow-2xs'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {UI_LABELS.graph.directionTB}
          </button>
        </div>

        {hasExecution && (
          <>
            <button
              type="button"
              onClick={onToggleExpandAll}
              title={
                allExpanded ? UI_LABELS.graph.coupleAllTitle : UI_LABELS.graph.decoupleAllTitle
              }
              aria-pressed={allExpanded}
              className="rounded-lg border border-border-main bg-surface px-2.5 py-1 text-xs font-medium text-text-body hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {allExpanded ? UI_LABELS.graph.coupleAll : UI_LABELS.graph.decoupleAll}
            </button>

            <button
              type="button"
              onClick={onToggleRawAll}
              title={UI_LABELS.graph.rawAllTitle}
              aria-pressed={allRawOpen}
              style={
                allRawOpen
                  ? {
                      borderColor: 'var(--tok-continuity)',
                      color: 'var(--tok-continuity)',
                      backgroundColor:
                        'color-mix(in srgb, var(--tok-continuity) 12%, transparent)',
                    }
                  : undefined
              }
              className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                allRawOpen
                  ? ''
                  : 'border-border-main bg-surface text-text-body hover:bg-surface-hover hover:text-text-main'
              }`}
            >
              {allRawOpen ? UI_LABELS.graph.hideRawAll : UI_LABELS.graph.rawAll}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onToggleAllLinks}
          title={UI_LABELS.graph.allLinksTitle}
          aria-pressed={showAllLinks}
          style={
            showAllLinks
              ? {
                  borderColor: 'var(--tok-continuity)',
                  color: 'var(--tok-continuity)',
                  backgroundColor: 'color-mix(in srgb, var(--tok-continuity) 12%, transparent)',
                }
              : undefined
          }
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            showAllLinks
              ? ''
              : 'border-border-main bg-surface text-text-body hover:bg-surface-hover hover:text-text-main'
          }`}
        >
          {UI_LABELS.graph.allLinks}
        </button>

        <button
          type="button"
          onClick={onResetLayout}
          title={UI_LABELS.graph.resetLayoutTitle}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            hasCustomOffsets
              ? 'border-border-main bg-surface-muted text-text-main hover:bg-surface-hover'
              : 'border-border-main bg-surface text-text-muted hover:bg-surface-hover hover:text-text-main'
          }`}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          <span>{UI_LABELS.graph.resetLayout}</span>
        </button>
      </div>
    </div>
  );
});
