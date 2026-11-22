import {UI_LABELS} from '../labels.ts';
import type {MacroStatePlacement} from './layoutMetrics.ts';
import type {
  CanvasEdgeSpec,
  GraphDimension,
  GraphDirection,
  InferredGraphObject,
} from './types.ts';

/**
 * Emits Layer 1 -> Layer 2 extraction wires connecting each declaring Staging Macro-Block
 * to the Inferred Objects extracted from its plain text.
 */
export function buildExtractionEdges(
  displayRailObjects: readonly InferredGraphObject[],
  activeObj: InferredGraphObject | null,
  activeObjectId: string | null,
  direction: GraphDirection
): CanvasEdgeSpec[] {
  const edges: CanvasEdgeSpec[] = [];

  for (const obj of displayRailObjects) {
    if (obj.kind === 'camera_slot') continue;
    const sourceId = `node-${obj.sourceBlockId}`;
    const isHot = activeObjectId === obj.id;
    edges.push({
      id: `edge-extract-${obj.sourceBlockId}-${obj.id}`,
      source: sourceId,
      target: obj.id,
      sourceHandle: 'staging-out',
      targetHandle: 'obj-in',
      kind: 'extraction',
      objectKind: obj.kind,
      isHot,
      isDimmed: Boolean(activeObj && !isHot),
      direction,
    });
  }

  return edges;
}

/**
 * Emits Phase 2 Execution timeline edges:
 * - Sequential spine links (`HOLD` solid rail, `CUT`/`RECALL` dashed break, `MONTAGE` cut)
 * - Overhead curved `RECALL` arcs linking recalled setups back to their establishing Macro-State
 * - Active Dimension Isolation Threads connecting surviving matching Macro-States across gaps
 */
export function buildExecutionContinuityEdges(
  placements: readonly MacroStatePlacement[],
  activeObj: InferredGraphObject | null,
  activeObjectId: string | null,
  isolatedDims: ReadonlySet<GraphDimension>,
  direction: GraphDirection
): CanvasEdgeSpec[] {
  const edges: CanvasEdgeSpec[] = [];
  const hasIsolation = isolatedDims.size > 0;

  // 1. Continuity Spine (S1 -> S2 -> ... -> SN)
  for (let i = 0; i < placements.length - 1; i++) {
    const curr = placements[i];
    const next = placements[i + 1];

    const isHold =
      next.ms.cameraTransition === 'HOLD' ||
      (next.ms.cameraTransition === 'NONE' && curr.ms.cameraSlot !== null);
    const isMontage = next.ms.cameraTransition === 'MONTAGE';

    edges.push({
      id: `edge-spine-${curr.ms.id}-${next.ms.id}`,
      source: curr.nodeId,
      target: next.nodeId,
      sourceHandle: 'spine-out',
      targetHandle: 'spine-in',
      kind: isHold ? 'spineHold' : isMontage ? 'spineMontage' : 'spineCut',
      label:
        !isHold && !isMontage
          ? next.ms.cameraTransition === 'RECALL'
            ? UI_LABELS.graph.edgeRecallLabel
            : UI_LABELS.graph.edgeCutLabel
          : undefined,
      isDimmed: Boolean(activeObj),
      direction,
    });
  }

  // 2. Curved RECALL arcs linking recalled Macro-States back to their establishing camera setup
  for (const p of placements) {
    if (p.ms.cameraTransition === 'RECALL' && p.ms.recallSourceMacroStateId) {
      const originNodeId = `node-${p.ms.recallSourceMacroStateId}`;
      const camObjId = p.ms.cameraSlot
        ? `obj-cam-${p.ms.cameraSlot.replace(/\s+/g, '-')}`
        : null;
      const isHot = Boolean(camObjId && activeObjectId === camObjId);

      edges.push({
        id: `edge-recall-${p.ms.recallSourceMacroStateId}-${p.ms.id}`,
        source: originNodeId,
        target: p.nodeId,
        sourceHandle: 'recall-out',
        targetHandle: 'recall-in',
        kind: 'recall',
        label: p.ms.cameraSlot
          ? UI_LABELS.graph.edgeRecallSlotLabel(p.ms.cameraSlot)
          : UI_LABELS.graph.edgeRecallLabel,
        isHot,
        isDimmed: Boolean(activeObj && !isHot),
        direction,
      });
    }
  }

  // 3. Dimension Isolation Thread connecting surviving matching Macro-States across Milestone Pills
  if (hasIsolation && !activeObj) {
    const firstDim = [...isolatedDims][0];
    const matchingPlacements = placements.filter((p) => !p.isPill);
    for (let i = 0; i < matchingPlacements.length - 1; i++) {
      const a = matchingPlacements[i];
      const b = matchingPlacements[i + 1];
      edges.push({
        id: `edge-iso-${a.ms.id}-${b.ms.id}`,
        source: a.nodeId,
        target: b.nodeId,
        sourceHandle: 'spine-out',
        targetHandle: 'spine-in',
        kind: 'isolationThread',
        dimension: firstDim,
        isHot: true,
        direction,
      });
    }
  }

  return edges;
}

/**
 * Emits Layer 2 -> Staging/Execution downstream label-match wires.
 * When a Macro-State is decoupled, wires route directly to the matched `subnode-S#.#` card;
 * when coupled, wires fall back cleanly to the parent `node-S#` card (deduplicated per target).
 */
export function buildDownstreamLabelMatchEdges(
  displayRailObjects: readonly InferredGraphObject[],
  activeObj: InferredGraphObject | null,
  activeObjectId: string | null,
  showAllLinks: boolean,
  visibleSubNodeIds: ReadonlySet<string>,
  direction: GraphDirection
): CanvasEdgeSpec[] {
  const edges: CanvasEdgeSpec[] = [];
  const objsToWire: InferredGraphObject[] = activeObj
    ? [activeObj]
    : showAllLinks
      ? [...displayRailObjects]
      : [];

  for (const obj of objsToWire) {
    // Camera slot objects highlight their Shot Chambers + RECALL arcs + Macro-States via node trace,
    // and only draw wires if the camera object itself is rendered in the Layer 2 rail
    const isRenderedInRail = displayRailObjects.some((r) => r.id === obj.id);
    if (!isRenderedInRail) continue;

    const seenTargets = new Set<string>();
    for (const cs of obj.callSites) {
      let resolvedTarget = cs.targetNodeId;
      let targetHandle = 'spine-in';

      if (cs.kind === 'sub_state') {
        if (visibleSubNodeIds.has(cs.targetNodeId)) {
          resolvedTarget = cs.targetNodeId;
          targetHandle = 'match-in';
        } else if (cs.parentNodeId) {
          resolvedTarget = cs.parentNodeId;
          targetHandle = 'spine-in';
        } else {
          continue;
        }
      } else if (cs.kind === 'staging') {
        targetHandle = 'staging-match-in';
      }

      if (seenTargets.has(resolvedTarget)) continue;
      seenTargets.add(resolvedTarget);

      const isHot = activeObjectId === obj.id;
      edges.push({
        id: `edge-match-${obj.id}-${resolvedTarget}`,
        source: obj.id,
        target: resolvedTarget,
        sourceHandle: cs.kind === 'staging' ? 'obj-back' : 'obj-out',
        targetHandle,
        kind: 'labelMatch',
        objectKind: obj.kind,
        isHot,
        direction,
      });
    }
  }

  return edges;
}
