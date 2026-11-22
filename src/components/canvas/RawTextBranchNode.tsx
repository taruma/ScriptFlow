import {memo} from 'react';
import {Handle, Position, type NodeProps} from '@xyflow/react';
import {Code2} from 'lucide-react';
import type {GraphDirection} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {useGraphInteraction} from './graphContext.tsx';

export interface RawTextBranchNodeData extends Record<string, unknown> {
  macroStateId: string;
  /** Optional override heading label (e.g. `[AESTHETIC]`); defaults to `macroStateId` */
  displayLabel?: string;
  raw: string;
  direction: GraphDirection;
  isDimmed: boolean;
}

export const RawTextBranchNode = memo(function RawTextBranchNode({data}: NodeProps) {
  const {macroStateId, displayLabel, raw, direction, isDimmed} = data as RawTextBranchNodeData;
  const {onToggleRaw} = useGraphInteraction();
  const isLR = direction === 'LR';
  const headingId = displayLabel ?? macroStateId;

  return (
    <div
      className={`auteur-graph-raw-card relative rounded-xl p-3 shadow-2xs transition-opacity duration-150 ${
        isDimmed ? 'auteur-graph-dimmed' : ''
      }`}
    >
      <Handle type="source" id="raw-out" position={isLR ? Position.Bottom : Position.Right} />

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          <Code2 className="h-3 w-3" aria-hidden="true" />
          <span>{UI_LABELS.graph.rawBranchHeading(headingId)}</span>
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleRaw(macroStateId);
          }}
          className="auteur-graph-touch-card-btn rounded px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
        >
          {UI_LABELS.graph.rawHide}
        </button>
      </div>

      <pre className="nopan select-text m-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-text-body">
        {raw}
      </pre>
    </div>
  );
});
