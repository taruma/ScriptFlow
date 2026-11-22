import {UI_LABELS} from '../labels.ts';
import type {MacroStatePlacement} from './layoutMetrics.ts';
import type {
  CanvasEdgeSpec,
  GraphDimension,
  GraphDirection,
  InferredGraphObject,
} from './types.ts';

/**
 * Emits Tier 1 -> Tier 2 extraction wires connecting each declaring Staging Macro-Block
 * to the Inferred Objects extracted from its plain text.
 * Animates directionally when the target object is actively focused.
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
      isAnimated: isHot,
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
        isAnimated: isHot,
        isDimmed: Boolean(activeObj && !isHot),
        direction,
      });
    }
  }

  // 3. Dimension Isolation Thread connecting surviving matching Macro-States across Milestone Pills
  //    Animates cleanly in timeline direction (L -> R in LR, T -> B in TB) while a tag is isolated.
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
        isAnimated: true,
        direction,
      });
    }
  }

  return edges;
}

interface ResolvedExecStop {
  nodeId: string;
  macroStateId: string;
  isSubState: boolean;
}

/**
 * Emits strict 3-tier cascading state-flow threads (zero direct Tier 1 -> Tier 3 bypasses):
 * - Tier 2 -> Tier 1: downstream Staging references (`obj -> [LOGIC]`, `obj -> [OPENING]`, etc.)
 * - Tier 2 -> Tier 3 (1st appearance): single drop-in wire from the Tier 2 Object to its first
 *   visible Execution appearance (`node-S#` when folded, `subnode-S#.#` when split)
 * - Tier 3 -> Tier 3 (subsequent appearances): chronological cascading chain (`prev -> next`),
 *   hopping Macro-State to Macro-State when folded or weaving Sub-State to Sub-State when split.
 *
 * Animation discipline:
 * - Single-object focus (`activeObj`): animates that object's full lifecycle thread smoothly.
 * - Unfiltered `Show Threads`: renders static parallel-lane curves (zero animation load).
 * - Active tag isolation + `Show Threads`: dims and keeps entity threads static so the isolated
 *   dimension thread stays visually primary.
 */
export function buildDownstreamLabelMatchEdges(
  displayRailObjects: readonly InferredGraphObject[],
  activeObj: InferredGraphObject | null,
  activeObjectId: string | null,
  showAllLinks: boolean,
  expandedIds: ReadonlySet<string>,
  visibleSubNodeIds: ReadonlySet<string>,
  hasIsolation: boolean,
  direction: GraphDirection
): CanvasEdgeSpec[] {
  const edges: CanvasEdgeSpec[] = [];
  const objsToWire: InferredGraphObject[] = activeObj
    ? [activeObj]
    : showAllLinks
      ? [...displayRailObjects]
      : [];

  objsToWire.forEach((obj, laneIndex) => {
    // Camera slot objects highlight their Shot Chambers + RECALL arcs + Macro-States via node trace,
    // and only draw wires if the camera object itself is rendered in the Tier 2 rail
    const isRenderedInRail = displayRailObjects.some((r) => r.id === obj.id);
    if (!isRenderedInRail) return;

    const isHot = activeObjectId === obj.id;
    const isAnimated = isHot;
    const isDimmed = !isHot && hasIsolation;

    // 1. Tier 2 -> Tier 1 downstream Staging references (deduplicated per Staging block)
    const seenStagingTargets = new Set<string>();
    for (const cs of obj.callSites) {
      if (cs.kind !== 'staging') continue;
      if (seenStagingTargets.has(cs.targetNodeId)) continue;
      seenStagingTargets.add(cs.targetNodeId);

      edges.push({
        id: `edge-match-${obj.id}-${cs.targetNodeId}`,
        source: obj.id,
        target: cs.targetNodeId,
        sourceHandle: 'obj-back',
        targetHandle: 'staging-match-in',
        kind: 'labelMatch',
        objectKind: obj.kind,
        isHot,
        isAnimated,
        isDimmed,
        isCascade: false,
        laneIndex,
        direction,
      });
    }

    // 2. Resolve chronological Execution stops (Tier 3)
    const execStops: ResolvedExecStop[] = [];
    const seenExecTargets = new Set<string>();

    for (const cs of obj.callSites) {
      if (cs.kind === 'staging') continue;

      let resolved: ResolvedExecStop | null = null;
      if (cs.kind === 'sub_state') {
        const parentNodeId = cs.parentNodeId;
        const msId = parentNodeId ? parentNodeId.replace(/^node-/, '') : '';
        if (msId && expandedIds.has(msId)) {
          // Macro-State is split: wire to the Sub-State only if it is currently visible
          // (skipping Sub-States hidden by compact isolation mode).
          if (visibleSubNodeIds.has(cs.targetNodeId)) {
            resolved = {
              nodeId: cs.targetNodeId,
              macroStateId: msId,
              isSubState: true,
            };
          }
        } else if (parentNodeId) {
          resolved = {
            nodeId: parentNodeId,
            macroStateId: msId,
            isSubState: false,
          };
        }
      } else if (cs.kind === 'macro_state') {
        resolved = {
          nodeId: cs.targetNodeId,
          macroStateId: cs.targetNodeId.replace(/^node-/, ''),
          isSubState: false,
        };
      }

      if (!resolved || seenExecTargets.has(resolved.nodeId)) continue;
      seenExecTargets.add(resolved.nodeId);
      execStops.push(resolved);
    }

    if (execStops.length === 0) return;

    // 2a. Single Tier 2 -> Tier 3 drop-in wire to the first Execution appearance
    const first = execStops[0];
    edges.push({
      id: `edge-match-${obj.id}-${first.nodeId}`,
      source: obj.id,
      target: first.nodeId,
      sourceHandle: 'obj-out',
      targetHandle: first.isSubState ? 'match-in' : 'thread-entry',
      kind: 'labelMatch',
      objectKind: obj.kind,
      isHot,
      isAnimated,
      isDimmed,
      isCascade: false,
      laneIndex,
      direction,
    });

    // 2b. Chronological Tier 3 -> Tier 3 cascading state-flow chain (prev -> next)
    for (let i = 0; i < execStops.length - 1; i++) {
      const prev = execStops[i];
      const next = execStops[i + 1];
      const isIntraState =
        prev.isSubState && next.isSubState && prev.macroStateId === next.macroStateId;

      edges.push({
        id: `edge-cascade-${obj.id}-${prev.nodeId}-${next.nodeId}`,
        source: prev.nodeId,
        target: next.nodeId,
        sourceHandle: prev.isSubState ? 'match-out' : 'thread-out',
        targetHandle: isIntraState
          ? 'match-same-in'
          : next.isSubState
            ? 'match-in'
            : 'thread-in',
        kind: 'labelMatch',
        objectKind: obj.kind,
        isHot,
        isAnimated,
        isDimmed,
        isCascade: true,
        isIntraState,
        laneIndex,
        direction,
      });
    }
  });

  return edges;
}
