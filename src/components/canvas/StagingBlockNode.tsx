import {memo} from 'react';
import {Handle, Position, type NodeProps} from '@xyflow/react';
import type {MacroBlockKind} from '../../core/types.ts';
import type {GraphDirection, GraphStagingBlockItem} from '../../ui/canvas/index.ts';
import {AnnotatedProse} from './AnnotatedProse.tsx';

export interface StagingBlockNodeData extends Record<string, unknown> {
  block: GraphStagingBlockItem;
  direction: GraphDirection;
  isTraced: boolean;
  isDimmed: boolean;
}

function getHeaderAccentColor(kind: MacroBlockKind): string {
  switch (kind) {
    case 'INTENT':
      return 'var(--phase-intent-text)';
    case 'LOGIC':
      return 'var(--phase-logic-text)';
    case 'AESTHETIC':
      return 'var(--phase-aesthetic-text)';
    case 'OPENING':
      return 'var(--phase-opening-text)';
    case 'CONTINUITY PROTOCOL':
      return 'var(--phase-continuity-text)';
    default:
      return 'var(--phase-slate-text)';
  }
}

export const StagingBlockNode = memo(function StagingBlockNode({data}: NodeProps) {
  const {block, direction, isTraced, isDimmed} = data as StagingBlockNodeData;
  const isLR = direction === 'LR';
  const portPosition = isLR ? Position.Bottom : Position.Right;
  const outHandleStyle = isLR ? {left: '42%'} : {top: '42%'};
  const matchHandleStyle = isLR ? {left: '58%'} : {top: '58%'};
  const headerColor = getHeaderAccentColor(block.kind);

  return (
    <div
      className={`rounded-xl border bg-surface p-3.5 shadow-2xs transition-[opacity,box-shadow,border-color] duration-150 ${
        isTraced
          ? 'auteur-graph-traced border-[var(--tok-continuity)]'
          : 'border-border-main'
      } ${isDimmed ? 'auteur-graph-dimmed' : ''}`}
    >
      <Handle type="source" id="staging-out" position={portPosition} style={outHandleStyle} />
      <Handle type="target" id="staging-match-in" position={portPosition} style={matchHandleStyle} />

      <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-border-subtle">
        <span
          className="font-mono text-[11px] font-bold tracking-wide"
          style={{color: headerColor}}
        >
          [{block.name}]
        </span>
        <span className="font-mono text-[10px] tabular-nums text-text-faint">
          {block.mbId}
        </span>
      </div>

      {block.lines.length > 0 ? (
        <div className="space-y-1.5">
          {block.lines.map((line, idx) => (
            <p key={idx} className="text-xs leading-relaxed text-text-body break-words">
              <AnnotatedProse text={line} />
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs italic text-text-faint">—</p>
      )}
    </div>
  );
});
