import type {CanvasNodeSpec, NodeOffset} from './types.ts';

/**
 * Minimal React Flow-compatible node shape (kept 100% pure / zero-React in src/ui/canvas/).
 */
export interface FlowNodeLike {
  id: string;
  type?: string;
  position: {x: number; y: number};
  parentId?: string;
  draggable?: boolean;
  selectable?: boolean;
  zIndex?: number;
  style?: {width?: number | string; height?: number | string};
  data: Record<string, unknown>;
  measured?: {width?: number; height?: number};
  selected?: boolean;
  dragging?: boolean;
}

export interface MergeFlowNodesResult<TNode extends FlowNodeLike> {
  nodes: TNode[];
  basePositions: Map<string, {x: number; y: number}>;
}

function isSameStyleSize(
  prevStyle: FlowNodeLike['style'],
  width: number | undefined,
  height: number | undefined
): boolean {
  if (!prevStyle) {
    return width === undefined && height === undefined;
  }
  return prevStyle.width === width && prevStyle.height === height;
}

/**
 * Reconciles pure layout specs into controlled React Flow node state while preserving
 * React Flow's internal `measured` dimensions, `selected` flags, `dragging` state, and
 * `style` object references whenever dimensions have not changed.
 *
 * Preserving `measured` across layout/hover/selection updates prevents React Flow's internal
 * ResizeObserver from treating existing nodes as unmeasured and triggering synchronous
 * re-measurement loops.
 */
export function mergeLayoutIntoFlowNodes<TNode extends FlowNodeLike>(
  prevNodes: readonly TNode[],
  specs: readonly CanvasNodeSpec[],
  nodeOffsets: Readonly<Record<string, NodeOffset>>
): MergeFlowNodesResult<TNode> {
  const prevById = new Map<string, TNode>();
  for (const node of prevNodes) {
    prevById.set(node.id, node);
  }

  const basePositions = new Map<string, {x: number; y: number}>();
  const nextNodes: TNode[] = specs.map((spec) => {
    const offset = nodeOffsets[spec.id];
    const baseX = spec.position.x - (offset?.dx ?? 0);
    const baseY = spec.position.y - (offset?.dy ?? 0);
    basePositions.set(spec.id, {x: baseX, y: baseY});

    const existing = prevById.get(spec.id);
    const hasDimensions = spec.width !== undefined || spec.height !== undefined;
    const style = existing && isSameStyleSize(existing.style, spec.width, spec.height)
      ? existing.style
      : hasDimensions
        ? {
            ...(spec.width !== undefined ? {width: spec.width} : {}),
            ...(spec.height !== undefined ? {height: spec.height} : {}),
          }
        : undefined;

    const position = existing?.dragging
      ? existing.position
      : existing &&
          existing.position.x === spec.position.x &&
          existing.position.y === spec.position.y
        ? existing.position
        : spec.position;

    const merged: FlowNodeLike = {
      ...(existing ?? {}),
      id: spec.id,
      type: spec.type,
      position,
      draggable: spec.draggable ?? false,
      selectable: spec.selectable ?? false,
      data: spec.data,
      ...(spec.parentId !== undefined ? {parentId: spec.parentId} : {parentId: undefined}),
      ...(spec.zIndex !== undefined ? {zIndex: spec.zIndex} : {zIndex: undefined}),
      ...(style !== undefined ? {style} : {style: undefined}),
    };

    if (merged.parentId === undefined) delete merged.parentId;
    if (merged.zIndex === undefined) delete merged.zIndex;
    if (merged.style === undefined) delete merged.style;

    return merged as TNode;
  });

  return {nodes: nextNodes, basePositions};
}
