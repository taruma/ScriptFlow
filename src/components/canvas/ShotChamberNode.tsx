import {memo} from 'react';
import type {NodeProps} from '@xyflow/react';
import {UI_LABELS} from '../../ui/labels.ts';
import {useGraphInteraction} from './graphContext.tsx';

export interface ShotChamberNodeData extends Record<string, unknown> {
  chamberId: string;
  slot: string;
  cameraObjectId: string;
  stateCount: number;
  isTraced: boolean;
  isDimmed: boolean;
}

export const ShotChamberNode = memo(function ShotChamberNode({data}: NodeProps) {
  const {slot, cameraObjectId, stateCount, isTraced, isDimmed} = data as ShotChamberNodeData;
  const {onSelectObject, onHoverObject} = useGraphInteraction();

  return (
    <div
      style={{
        backgroundColor: 'var(--graph-chamber-bg)',
        borderColor: isTraced ? 'var(--tok-continuity)' : 'var(--graph-chamber-border)',
      }}
      className={`h-full w-full rounded-2xl border border-dashed transition-[opacity,border-color,box-shadow] duration-150 ${
        isTraced ? 'auteur-graph-traced' : ''
      } ${isDimmed ? 'auteur-graph-dimmed' : ''}`}
    >
      <div className="px-3 pt-2 flex items-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectObject(cameraObjectId);
          }}
          onMouseEnter={() => onHoverObject(cameraObjectId)}
          onMouseLeave={() => onHoverObject(null)}
          style={{color: 'var(--graph-dim-camera)'}}
          className="nodrag nopan inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-bold tracking-wider hover:bg-surface/70 transition-colors cursor-pointer whitespace-nowrap"
        >
          <span>{UI_LABELS.graph.shotChamberMeta(slot, stateCount)}</span>
        </button>
      </div>
    </div>
  );
});
