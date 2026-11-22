import {memo} from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import type {
  CanvasEdgeKind,
  GraphDimension,
  GraphDirection,
  InferredObjectKind,
} from '../../ui/canvas/index.ts';
import {getDimensionColorVar, getObjectColorVar} from './graphContext.tsx';

export interface AuteurGraphEdgeData extends Record<string, unknown> {
  kind: CanvasEdgeKind;
  dimension?: GraphDimension;
  objectKind?: InferredObjectKind;
  isHot?: boolean;
  isDimmed?: boolean;
  label?: string;
  direction: GraphDirection;
}

export const AuteurGraphEdge = memo(function AuteurGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as AuteurGraphEdgeData;
  const {kind, dimension, objectKind, isHot, isDimmed, label, direction} = edgeData;
  const isLR = direction !== 'TB';

  // Curved RECALL arc sweeping gracefully above (LR) or left (TB) of the Execution spine
  if (kind === 'recall') {
    const span = isLR ? Math.abs(targetX - sourceX) : Math.abs(targetY - sourceY);
    const arcLift = Math.min(130, Math.max(58, span * 0.16));

    const path = isLR
      ? `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY - arcLift}, ${targetX} ${targetY - arcLift}, ${targetX} ${targetY}`
      : `M ${sourceX} ${sourceY} C ${sourceX - arcLift} ${sourceY}, ${targetX - arcLift} ${targetY}, ${targetX} ${targetY}`;

    const labelX = isLR ? (sourceX + targetX) / 2 : Math.min(sourceX, targetX) - arcLift * 0.74;
    const labelY = isLR ? Math.min(sourceY, targetY) - arcLift * 0.74 : (sourceY + targetY) / 2;
    const stroke = 'var(--graph-dim-camera)';

    return (
      <>
        <BaseEdge
          id={id}
          path={path}
          style={{
            stroke,
            strokeWidth: isHot ? 2.4 : 1.75,
            strokeDasharray: '6 3',
            opacity: isHot ? 0.96 : isDimmed ? 0.16 : 0.78,
          }}
        />
        {label && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: 'none',
                zIndex: 4,
                color: stroke,
                opacity: isDimmed ? 0.2 : 1,
              }}
              className="rounded-md border border-border-main bg-surface/95 px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-wider shadow-2xs whitespace-nowrap"
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: kind === 'isolationThread' ? 0.35 : 0.28,
  });

  let stroke = 'var(--border-main)';
  let strokeWidth = 1.4;
  let strokeDasharray: string | undefined;
  let opacity = 0.75;

  switch (kind) {
    case 'extraction':
      stroke = objectKind ? getObjectColorVar(objectKind) : 'var(--tok-continuity)';
      strokeWidth = isHot ? 2.25 : 1.15;
      opacity = isHot ? 0.95 : isDimmed ? 0.08 : 0.28;
      break;
    case 'labelMatch':
      stroke = objectKind ? getObjectColorVar(objectKind) : 'var(--tok-continuity)';
      strokeWidth = isHot ? 2.2 : 1.15;
      opacity = isHot ? 0.92 : 0.24;
      break;
    case 'spineHold':
      stroke = 'var(--graph-dim-camera)';
      strokeWidth = 2.25;
      opacity = isDimmed ? 0.18 : 0.75;
      break;
    case 'spineCut':
      stroke = 'var(--text-faint)';
      strokeWidth = 1.5;
      strokeDasharray = '5 4';
      opacity = isDimmed ? 0.15 : 0.75;
      break;
    case 'spineMontage':
      stroke = 'var(--border-main)';
      strokeWidth = 1.5;
      strokeDasharray = '4 4';
      opacity = isDimmed ? 0.15 : 0.9;
      break;
    case 'subStateChain':
      stroke = dimension ? getDimensionColorVar(dimension) : 'var(--border-main)';
      strokeWidth = 1.6;
      opacity = isDimmed ? 0.2 : 0.72;
      break;
    case 'rawBranch':
      stroke = 'var(--text-muted)';
      strokeWidth = 1.35;
      strokeDasharray = '3 3';
      opacity = isDimmed ? 0.16 : 0.7;
      break;
    case 'isolationThread':
      stroke = dimension ? getDimensionColorVar(dimension) : 'var(--tok-continuity)';
      strokeWidth = 2.4;
      opacity = 0.88;
      break;
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth,
          strokeDasharray,
          opacity,
        }}
      />

      {kind === 'labelMatch' && isHot && (
        <circle cx={targetX} cy={targetY} r={3.5} fill={stroke} />
      )}

      {kind === 'spineCut' && label && !isDimmed && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              zIndex: 4,
            }}
            className="rounded bg-surface/95 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-text-faint border border-border-subtle whitespace-nowrap"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
