import {memo} from 'react';
import {Handle, Position, type NodeProps} from '@xyflow/react';
import {Code2} from 'lucide-react';
import type {GraphDirection, GraphSubStateItem} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {getDimensionColorVar, useGraphInteraction} from './graphContext.tsx';
import {SculptedSubStateBody} from './SculptedSubStateBody.tsx';

export interface SubStateNodeData extends Record<string, unknown> {
  subState: GraphSubStateItem;
  direction: GraphDirection;
  isGhost: boolean;
  isRawOpen: boolean;
  isTraced: boolean;
  isDimmed: boolean;
}

export const SubStateNode = memo(function SubStateNode({data}: NodeProps) {
  const {subState, direction, isGhost, isRawOpen, isTraced, isDimmed} =
    data as SubStateNodeData;
  const {onToggleRaw} = useGraphInteraction();

  const isLR = direction === 'LR';
  const dimColor = getDimensionColorVar(subState.dimension);
  const dimLabel = UI_LABELS.graph.isolatorDimensions[subState.dimension];

  return (
    <div
      style={{
        borderColor: isTraced
          ? 'var(--tok-continuity)'
          : subState.dimension === 'dialogue'
            ? 'color-mix(in srgb, var(--graph-dim-dialogue) 36%, var(--border-main))'
            : undefined,
      }}
      className={`relative rounded-xl border border-border-main bg-surface p-2.5 shadow-2xs transition-[opacity,box-shadow,border-color] duration-150 ${
        isGhost ? 'auteur-graph-ghost' : ''
      } ${isTraced ? 'auteur-graph-traced' : ''} ${isDimmed ? 'auteur-graph-dimmed' : ''}`}
    >
      <Handle type="target" id="chain-in" position={isLR ? Position.Top : Position.Left} />
      <Handle type="source" id="chain-out" position={isLR ? Position.Bottom : Position.Right} />
      <Handle type="target" id="match-in" position={isLR ? Position.Left : Position.Top} />

      <div className="flex items-stretch gap-2.5">
        <div
          className="w-1 rounded-full shrink-0"
          style={{backgroundColor: dimColor}}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span
              className="font-mono text-[10px] font-bold uppercase tracking-wider"
              style={{color: dimColor}}
            >
              {dimLabel}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-[10px] tabular-nums text-text-faint">
                {subState.id}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRaw(subState.id);
                }}
                title={UI_LABELS.graph.rawToggleTitle(subState.id)}
                aria-label={UI_LABELS.graph.rawToggleTitle(subState.id)}
                aria-pressed={isRawOpen}
                style={
                  isRawOpen
                    ? {
                        borderColor: 'var(--tok-continuity)',
                        color: 'var(--tok-continuity)',
                        backgroundColor:
                          'color-mix(in srgb, var(--tok-continuity) 12%, transparent)',
                      }
                    : undefined
                }
                className={`nodrag nopan inline-flex items-center justify-center rounded border px-1 py-0.5 transition-colors cursor-pointer ${
                  isRawOpen
                    ? ''
                    : 'border-transparent text-text-faint hover:border-border-main hover:text-text-main'
                }`}
              >
                <Code2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </div>

          <SculptedSubStateBody subState={subState} />

          {isRawOpen && (
            <div className="nodrag nopan select-text mt-2 pt-2 border-t border-dashed border-border-main font-mono text-[10.5px] leading-relaxed text-text-muted break-words">
              {subState.raw}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
