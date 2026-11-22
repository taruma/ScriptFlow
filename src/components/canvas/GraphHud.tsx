import {memo} from 'react';
import type {SceneTopology} from '../../core/index.ts';
import type {GraphSceneStats} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';

interface GraphHudProps {
  topology: SceneTopology;
  stats: GraphSceneStats;
}

export const GraphHud = memo(function GraphHud({topology, stats}: GraphHudProps) {
  const topologyLabel = UI_LABELS.graph.topologyLabels[topology];

  return (
    <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border-main bg-surface/95 backdrop-blur px-3 py-1.5 shadow-xs">
        <span
          className="text-xs font-semibold whitespace-nowrap shrink-0"
          style={{color: 'var(--graph-dim-camera)'}}
        >
          {topologyLabel}
        </span>
        <span aria-hidden="true" className="h-3.5 w-px bg-border-main shrink-0" />
        <span className="hidden sm:inline font-mono text-[11px] tabular-nums text-text-muted whitespace-nowrap">
          {UI_LABELS.graph.statsSummary(
            stats.stagingCount,
            stats.inferredObjectCount,
            stats.macroStateCount,
            stats.subStateCount
          )}
        </span>
      </div>
    </div>
  );
});
