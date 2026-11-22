import {memo} from 'react';
import {
  GRAPH_DIMENSIONS,
  type GraphDimension,
  type GraphIsolationMode,
} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {getDimensionColorVar} from './graphContext.tsx';

interface SubStateIsolatorDockProps {
  isolatedDims: ReadonlySet<GraphDimension>;
  isolationMode: GraphIsolationMode;
  dimensionCounts: Readonly<Record<GraphDimension, number>>;
  onClearIsolation: () => void;
  onToggleDimension: (dim: GraphDimension) => void;
  onIsolationModeChange: (mode: GraphIsolationMode) => void;
}

export const SubStateIsolatorDock = memo(function SubStateIsolatorDock({
  isolatedDims,
  isolationMode,
  dimensionCounts,
  onClearIsolation,
  onToggleDimension,
  onIsolationModeChange,
}: SubStateIsolatorDockProps) {
  const visibleDimensions = GRAPH_DIMENSIONS.filter((dim) => (dimensionCounts[dim] ?? 0) > 0);
  if (visibleDimensions.length === 0) return null;

  const isAllActive = isolatedDims.size === 0;

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-24px)]">
      <div
        role="toolbar"
        aria-label={UI_LABELS.graph.isolatorGroupAria}
        className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border-main bg-surface/95 backdrop-blur px-2.5 py-1.5 shadow-md text-xs"
      >
        <span className="px-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-text-faint whitespace-nowrap shrink-0">
          {UI_LABELS.graph.isolatorLabel}
        </span>

        <button
          type="button"
          onClick={onClearIsolation}
          aria-pressed={isAllActive}
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            isAllActive
              ? 'border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text'
              : 'border-border-main bg-surface text-text-muted hover:text-text-main hover:bg-surface-hover'
          }`}
        >
          {UI_LABELS.graph.isolatorAll}
        </button>

        {visibleDimensions.map((dim) => {
          const isActive = isolatedDims.has(dim);
          const colorVar = getDimensionColorVar(dim);

          return (
            <button
              key={dim}
              type="button"
              onClick={() => onToggleDimension(dim)}
              aria-pressed={isActive}
              style={
                isActive
                  ? {
                      backgroundColor: colorVar,
                      borderColor: colorVar,
                      color: 'var(--surface)',
                    }
                  : {
                      color: colorVar,
                      backgroundColor: `color-mix(in srgb, ${colorVar} 11%, transparent)`,
                      borderColor: `color-mix(in srgb, ${colorVar} 30%, transparent)`,
                    }
              }
              className="rounded-lg border px-2 py-1 font-mono text-[11px] font-medium transition-opacity cursor-pointer whitespace-nowrap shrink-0"
            >
              {UI_LABELS.graph.isolatorDimensions[dim]}
            </button>
          );
        })}

        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border-main shrink-0" />

        <div
          role="group"
          aria-label={UI_LABELS.graph.isolationModeGroupAria}
          className="flex items-center rounded-lg bg-surface-muted p-0.5 border border-border-subtle shrink-0"
        >
          <button
            type="button"
            onClick={() => onIsolationModeChange('ghost')}
            title={UI_LABELS.graph.isolationGhostTitle}
            aria-pressed={isolationMode === 'ghost'}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isolationMode === 'ghost'
                ? 'bg-surface text-text-main shadow-2xs'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {UI_LABELS.graph.isolationGhost}
          </button>
          <button
            type="button"
            onClick={() => onIsolationModeChange('compact')}
            title={UI_LABELS.graph.isolationCompactTitle}
            aria-pressed={isolationMode === 'compact'}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isolationMode === 'compact'
                ? 'bg-surface text-text-main shadow-2xs'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {UI_LABELS.graph.isolationCompact}
          </button>
        </div>
      </div>
    </div>
  );
});
