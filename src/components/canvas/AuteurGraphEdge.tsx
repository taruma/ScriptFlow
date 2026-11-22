import {memo} from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
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
  isSecondary?: boolean;
  isAnimated?: boolean;
  isCascade?: boolean;
  isIntraState?: boolean;
  isMacroEntryHandoff?: boolean;
  laneIndex?: number;
  label?: string;
  direction: GraphDirection;
}

interface Point2D {
  x: number;
  y: number;
}

/**
 * Converts an orthogonal polyline into a crisp SVG path with rounded quadratic corners,
 * automatically collapsing duplicate points and clamping corner radii to short segments.
 */
function buildRoundedOrthogonalPath(rawPoints: readonly Point2D[], cornerRadius = 12): string {
  const pts: Point2D[] = [];
  for (const pt of rawPoints) {
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) >= 0.5) {
      pts.push(pt);
    }
  }
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 0.5 || len2 < 0.5) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const r = Math.min(cornerRadius, len1 * 0.45, len2 * 0.45);
    const startX = curr.x - (v1x / len1) * r;
    const startY = curr.y - (v1y / len1) * r;
    const endX = curr.x + (v2x / len2) * r;
    const endY = curr.y + (v2y / len2) * r;

    d += ` L ${startX} ${startY} Q ${curr.x} ${curr.y} ${endX} ${endY}`;
  }

  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function PulseDot({path, color}: {path: string; color: string}) {
  return (
    <g className="auteur-graph-pulse-dot pointer-events-none">
      <circle r={6.5} fill={color} opacity={0.24}>
        <animateMotion dur="1.75s" repeatCount="indefinite" path={path} />
      </circle>
      <circle r={3.2} fill={color}>
        <animateMotion dur="1.75s" repeatCount="indefinite" path={path} />
      </circle>
    </g>
  );
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
  const {
    kind,
    dimension,
    objectKind,
    isHot,
    isDimmed,
    isSecondary,
    isAnimated,
    isCascade,
    isIntraState,
    isMacroEntryHandoff,
    laneIndex,
    label,
    direction,
  } = edgeData;
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
        {isAnimated && <PulseDot path={path} color={stroke} />}
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

  let edgePath: string;
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;
  const lane = laneIndex ?? 0;

  if (kind === 'labelMatch' && isMacroEntryHandoff) {
    // First-active Macro-State -> first matched split Sub-State routed along the clean outer margin
    if (isLR) {
      const leftX = Math.min(sourceX, targetX) - 18 - (lane % 4) * 7;
      edgePath = buildRoundedOrthogonalPath(
        [
          {x: sourceX, y: sourceY},
          {x: leftX, y: sourceY},
          {x: leftX, y: targetY},
          {x: targetX, y: targetY},
        ],
        10
      );
    } else {
      const topY = Math.min(sourceY, targetY) - 18 - (lane % 4) * 7;
      edgePath = buildRoundedOrthogonalPath(
        [
          {x: sourceX, y: sourceY},
          {x: sourceX, y: topY},
          {x: targetX, y: topY},
          {x: targetX, y: targetY},
        ],
        10
      );
    }
  } else if (kind === 'labelMatch' && isCascade && isIntraState) {
    // Crisp orthogonal U-bracket linking consecutive split Sub-States inside the same Macro-State
    const bow = 20 + (lane % 4) * 9;
    if (isLR) {
      const bowX = Math.max(sourceX, targetX) + bow;
      edgePath = buildRoundedOrthogonalPath(
        [
          {x: sourceX, y: sourceY},
          {x: bowX, y: sourceY},
          {x: bowX, y: targetY},
          {x: targetX, y: targetY},
        ],
        10
      );
    } else {
      const bowY = Math.max(sourceY, targetY) + bow;
      edgePath = buildRoundedOrthogonalPath(
        [
          {x: sourceX, y: sourceY},
          {x: sourceX, y: bowY},
          {x: targetX, y: bowY},
          {x: targetX, y: targetY},
        ],
        10
      );
    }
  } else if (kind === 'labelMatch' && isCascade) {
    // Rounded orthogonal corridor routing through the empty aisle between Macro-State columns/rows
    if (isLR && targetX > sourceX + 14) {
      const isFlatSkip = Math.abs(targetY - sourceY) < 6 && targetX - sourceX > 140;
      if (isFlatSkip) {
        const busY = sourceY + 22 + (lane % 4) * 10;
        const stepX = 16;
        edgePath = buildRoundedOrthogonalPath(
          [
            {x: sourceX, y: sourceY},
            {x: sourceX + stepX, y: sourceY},
            {x: sourceX + stepX, y: busY},
            {x: targetX - stepX, y: busY},
            {x: targetX - stepX, y: targetY},
            {x: targetX, y: targetY},
          ],
          11
        );
      } else {
        const rawMidX = sourceX + Math.min(28, (targetX - sourceX) * 0.5) + ((lane % 4) - 1.5) * 6;
        const midX = Math.max(sourceX + 10, Math.min(targetX - 10, rawMidX));
        edgePath = buildRoundedOrthogonalPath(
          [
            {x: sourceX, y: sourceY},
            {x: midX, y: sourceY},
            {x: midX, y: targetY},
            {x: targetX, y: targetY},
          ],
          12
        );
      }
    } else if (!isLR && targetY > sourceY + 14) {
      const isFlatSkip = Math.abs(targetX - sourceX) < 6 && targetY - sourceY > 140;
      if (isFlatSkip) {
        const busX = sourceX + 22 + (lane % 4) * 10;
        const stepY = 16;
        edgePath = buildRoundedOrthogonalPath(
          [
            {x: sourceX, y: sourceY},
            {x: sourceX, y: sourceY + stepY},
            {x: busX, y: sourceY + stepY},
            {x: busX, y: targetY - stepY},
            {x: targetX, y: targetY - stepY},
            {x: targetX, y: targetY},
          ],
          11
        );
      } else {
        const rawMidY = sourceY + Math.min(28, (targetY - sourceY) * 0.5) + ((lane % 4) - 1.5) * 6;
        const midY = Math.max(sourceY + 10, Math.min(targetY - 10, rawMidY));
        edgePath = buildRoundedOrthogonalPath(
          [
            {x: sourceX, y: sourceY},
            {x: sourceX, y: midY},
            {x: targetX, y: midY},
            {x: targetX, y: targetY},
          ],
          12
        );
      }
    } else {
      [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: 12,
        offset: 18 + (lane % 4) * 7,
      });
    }
  } else {
    const stepOffset =
      kind === 'extraction' || kind === 'labelMatch'
        ? 18 + (lane % 5) * 7
        : kind === 'aestheticBranch'
          ? 12
          : 20;
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: kind === 'aestheticBranch' ? 8 : 12,
      offset: stepOffset,
    });
  }

  let stroke = 'var(--border-main)';
  let strokeWidth = 1.4;
  let strokeDasharray: string | undefined;
  let opacity = 0.75;

  switch (kind) {
    case 'aestheticBranch':
      stroke = 'var(--phase-aesthetic-text)';
      strokeWidth = 1.3;
      strokeDasharray = '3 3';
      opacity = isDimmed ? 0.14 : 0.45;
      break;
    case 'extraction':
      stroke = objectKind ? getObjectColorVar(objectKind) : 'var(--tok-continuity)';
      strokeWidth = isHot ? 2.15 : 1.15;
      strokeDasharray = isHot ? '6 4' : undefined;
      opacity = isHot ? 0.92 : isDimmed ? 0.08 : 0.28;
      break;
    case 'labelMatch':
      stroke = objectKind ? getObjectColorVar(objectKind) : 'var(--tok-continuity)';
      strokeWidth = isHot ? 2.15 : 1.3;
      strokeDasharray = isHot ? '6 4' : '5 4';
      opacity = isHot ? 0.92 : isDimmed ? 0.1 : 0.36;
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
      opacity = isDimmed ? 0.18 : isSecondary ? 0.46 : 0.72;
      break;
    case 'rawBranch':
      stroke = 'var(--text-muted)';
      strokeWidth = 1.35;
      strokeDasharray = '3 3';
      opacity = isDimmed ? 0.16 : 0.7;
      break;
    case 'isolationThread':
      stroke = dimension ? getDimensionColorVar(dimension) : 'var(--tok-continuity)';
      strokeWidth = 2.35;
      strokeDasharray = '6 4';
      opacity = 0.92;
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

      {isAnimated && <PulseDot path={edgePath} color={stroke} />}

      {((kind === 'labelMatch' && isHot) || kind === 'isolationThread') && (
        <circle cx={targetX} cy={targetY} r={3.2} fill={stroke} />
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
