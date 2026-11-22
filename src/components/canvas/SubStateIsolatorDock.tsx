import {memo} from 'react';
import {Code2, Layers, Minimize2, RotateCcw, Spline} from 'lucide-react';
import {
  GRAPH_DIMENSIONS,
  type GraphDimension,
  type GraphDirection,
  type GraphIsolationMode,
} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {getDimensionColorVar} from './graphContext.tsx';

interface SubStateIsolatorDockProps {
  direction: GraphDirection;
  allExpanded: boolean;
  allRawOpen: boolean;
  showAllLinks: boolean;
  isModified: boolean;
  hasExecution: boolean;
  isolatedDims: ReadonlySet<GraphDimension>;
  isolationMode: GraphIsolationMode;
  dimensionCounts: Readonly<Record<GraphDimension, number>>;
  onDirectionChange: (next: GraphDirection) => void;
  onToggleExpandAll: () => void;
  onToggleRawAll: () => void;
  onToggleAllLinks: () => void;
  onResetLayout: () => void;
  onClearIsolation: () => void;
  onToggleDimension: (dim: GraphDimension) => void;
  onIsolationModeChange: (mode: GraphIsolationMode) => void;
}

export const SubStateIsolatorDock = memo(function SubStateIsolatorDock({
  direction,
  allExpanded,
  allRawOpen,
  showAllLinks,
  isModified,
  hasExecution,
  isolatedDims,
  isolationMode,
  dimensionCounts,
  onDirectionChange,
  onToggleExpandAll,
  onToggleRawAll,
  onToggleAllLinks,
  onResetLayout,
  onClearIsolation,
  onToggleDimension,
  onIsolationModeChange,
}: SubStateIsolatorDockProps) {
  const visibleDimensions = GRAPH_DIMENSIONS.filter((dim) => (dimensionCounts[dim] ?? 0) > 0);
  const isAllActive = isolatedDims.size === 0;
  const showIsolatorSection = hasExecution && visibleDimensions.length > 0;

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 max-w-[calc(100%-24px)]">
      {/* Upper Floating Pill: Sub-State Dimension Isolator (Only when Execution Sub-States exist) */}
      {showIsolatorSection && (
        <div
          role="group"
          aria-label={UI_LABELS.graph.isolatorGroupAria}
          className="pointer-events-auto flex flex-wrap items-center justify-center gap-0.5 rounded-xl border border-border-main bg-surface/95 backdrop-blur px-1.5 py-1 shadow-sm text-xs"
        >
          <button
            type="button"
            onClick={onClearIsolation}
            aria-pressed={isAllActive}
            className={`rounded-lg border px-2.5 py-1 text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isAllActive
                ? 'border-border-main bg-surface-muted font-semibold text-text-main shadow-2xs'
                : 'border-transparent bg-transparent font-medium text-text-muted hover:bg-surface-hover hover:text-text-main'
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
                    : undefined
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'shadow-2xs'
                    : 'border-transparent bg-transparent text-text-body hover:bg-surface-hover hover:text-text-main'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: isActive ? 'var(--surface)' : colorVar,
                  }}
                />
                <span>{UI_LABELS.graph.isolatorDimensions[dim]}</span>
              </button>
            );
          })}

          {/* Progressive Disclosure: Ghost | Compact appears only when isolating >= 1 dimension */}
          {!isAllActive && (
            <>
              <span aria-hidden="true" className="mx-1 h-3.5 w-px bg-border-main shrink-0" />

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
                  className={`rounded-md px-2 py-0.5 text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isolationMode === 'ghost'
                      ? 'bg-surface font-semibold text-text-main shadow-2xs'
                      : 'font-medium text-text-muted hover:text-text-main'
                  }`}
                >
                  {UI_LABELS.graph.isolationGhost}
                </button>
                <button
                  type="button"
                  onClick={() => onIsolationModeChange('compact')}
                  title={UI_LABELS.graph.isolationCompactTitle}
                  aria-pressed={isolationMode === 'compact'}
                  className={`rounded-md px-2 py-0.5 text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isolationMode === 'compact'
                      ? 'bg-surface font-semibold text-text-main shadow-2xs'
                      : 'font-medium text-text-muted hover:text-text-main'
                  }`}
                >
                  {UI_LABELS.graph.isolationCompact}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Lower Floating Pill: Slim Icon-Only Canvas View & Layout Bar */}
      <div
        role="toolbar"
        aria-label={UI_LABELS.graph.studioDockAria}
        className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border-main bg-surface/95 backdrop-blur px-1.5 py-1 shadow-md text-xs"
      >
        <div
          role="group"
          aria-label={UI_LABELS.graph.directionGroupAria}
          className="flex items-center rounded-lg bg-surface-muted p-0.5 border border-border-subtle shrink-0"
        >
          <button
            type="button"
            onClick={() => onDirectionChange('LR')}
            title={UI_LABELS.graph.directionLRTitle}
            aria-label={UI_LABELS.graph.directionLRTitle}
            aria-pressed={direction === 'LR'}
            className={`px-2 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              direction === 'LR'
                ? 'bg-surface font-semibold text-text-main shadow-2xs'
                : 'font-medium text-text-muted hover:text-text-main'
            }`}
          >
            {UI_LABELS.graph.directionLR}
          </button>
          <button
            type="button"
            onClick={() => onDirectionChange('TB')}
            title={UI_LABELS.graph.directionTBTitle}
            aria-label={UI_LABELS.graph.directionTBTitle}
            aria-pressed={direction === 'TB'}
            className={`px-2 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              direction === 'TB'
                ? 'bg-surface font-semibold text-text-main shadow-2xs'
                : 'font-medium text-text-muted hover:text-text-main'
            }`}
          >
            {UI_LABELS.graph.directionTB}
          </button>
        </div>

        <span aria-hidden="true" className="mx-1 h-3.5 w-px bg-border-main shrink-0" />

        {hasExecution && (
          <>
            <button
              type="button"
              onClick={onToggleExpandAll}
              title={
                allExpanded ? UI_LABELS.graph.coupleAllTitle : UI_LABELS.graph.decoupleAllTitle
              }
              aria-label={
                allExpanded ? UI_LABELS.graph.coupleAllTitle : UI_LABELS.graph.decoupleAllTitle
              }
              aria-pressed={allExpanded}
              style={
                allExpanded
                  ? {
                      color: 'var(--tok-continuity)',
                      backgroundColor:
                        'color-mix(in srgb, var(--tok-continuity) 14%, transparent)',
                    }
                  : undefined
              }
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                allExpanded
                  ? ''
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-main'
              }`}
            >
              {allExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleRawAll}
              title={UI_LABELS.graph.rawAllTitle}
              aria-label={UI_LABELS.graph.rawAllTitle}
              aria-pressed={allRawOpen}
              style={
                allRawOpen
                  ? {
                      color: 'var(--tok-continuity)',
                      backgroundColor:
                        'color-mix(in srgb, var(--tok-continuity) 14%, transparent)',
                    }
                  : undefined
              }
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                allRawOpen
                  ? ''
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-main'
              }`}
            >
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onToggleAllLinks}
          title={UI_LABELS.graph.allLinksTitle}
          aria-label={UI_LABELS.graph.allLinksTitle}
          aria-pressed={showAllLinks}
          style={
            showAllLinks
              ? {
                  color: 'var(--tok-continuity)',
                  backgroundColor: 'color-mix(in srgb, var(--tok-continuity) 14%, transparent)',
                }
              : undefined
          }
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
            showAllLinks
              ? ''
              : 'text-text-muted hover:bg-surface-hover hover:text-text-main'
          }`}
        >
          <Spline className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        {/* Progressive Disclosure: Icon-only Reset appears only when view state is modified from default */}
        {isModified && (
          <>
            <span aria-hidden="true" className="mx-1 h-3.5 w-px bg-border-main shrink-0" />

            <button
              type="button"
              onClick={onResetLayout}
              title={UI_LABELS.graph.resetLayoutTitle}
              aria-label={UI_LABELS.graph.resetLayoutTitle}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  );
});
