import {memo} from 'react';
import {Handle, Position, type NodeProps} from '@xyflow/react';
import type {GraphDirection, InferredGraphObject} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {getObjectColorVar, useGraphInteraction} from './graphContext.tsx';

export interface InferredObjectNodeData extends Record<string, unknown> {
  object: InferredGraphObject;
  direction: GraphDirection;
  showGroupLabel: boolean;
  isTraced: boolean;
  isDimmed: boolean;
}

export const InferredObjectNode = memo(function InferredObjectNode({data}: NodeProps) {
  const {object, direction, showGroupLabel, isTraced, isDimmed} =
    data as InferredObjectNodeData;
  const {onSelectObject, onHoverObject} = useGraphInteraction();

  const isLR = direction === 'LR';
  const colorVar = getObjectColorVar(object.kind);
  const groupTitle = UI_LABELS.graph.objectGroups[object.kind];
  const inHandleStyle = isLR ? {left: '44%'} : {top: '44%'};
  const backHandleStyle = isLR ? {left: '56%'} : {top: '56%'};

  return (
    <div className="relative">
      {showGroupLabel && (
        <div
          className={`pointer-events-none select-none font-mono text-[10px] font-semibold uppercase tracking-wider text-text-faint whitespace-nowrap ${
            isLR ? 'absolute -top-5 left-0' : 'pb-1.5 truncate'
          }`}
        >
          {groupTitle}
        </div>
      )}

      <div className="relative">
        <Handle
          type="target"
          id="obj-in"
          position={isLR ? Position.Top : Position.Left}
          style={inHandleStyle}
        />
        <Handle
          type="source"
          id="obj-back"
          position={isLR ? Position.Top : Position.Left}
          style={backHandleStyle}
        />
        <Handle type="source" id="obj-out" position={isLR ? Position.Bottom : Position.Right} />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectObject(object.id);
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') onHoverObject(object.id);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') onHoverObject(null);
          }}
          className={`w-full text-left rounded-xl border bg-surface px-3 py-2 shadow-2xs flex items-center justify-between gap-2 cursor-pointer transition-[transform,opacity,box-shadow,border-color] duration-150 hover:-translate-y-px ${
            isTraced
              ? 'auteur-graph-traced border-[var(--tok-continuity)]'
              : object.isStagingOnly
                ? 'border-dashed border-border-main'
                : 'border-border-main hover:border-text-faint'
          } ${isDimmed ? 'auteur-graph-dimmed' : ''}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{backgroundColor: colorVar}}
              aria-hidden="true"
            />
            <span className="font-mono text-xs font-bold text-text-main truncate">
              {object.label}
            </span>
            {object.ref && !object.isStagingOnly && (
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium shrink-0"
                style={{
                  color: 'var(--graph-obj-staging_ref)',
                  backgroundColor:
                    'color-mix(in srgb, var(--graph-obj-staging_ref) 12%, transparent)',
                }}
              >
                {object.ref}
              </span>
            )}
          </div>

          {object.isStagingOnly ? (
            <span className="font-mono text-[10px] text-text-faint shrink-0">
              {UI_LABELS.graph.stagingOnlyBadge}
            </span>
          ) : (
            <span className="font-mono text-[10.5px] tabular-nums text-text-muted shrink-0">
              {object.callSites.length}×
            </span>
          )}
        </button>
      </div>
    </div>
  );
});
