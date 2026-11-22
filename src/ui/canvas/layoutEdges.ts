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
 * (or its expanded `[AESTHETIC]` Key-Value Lookbook card) to the Inferred Objects extracted
 * from its plain text. Animates with a gliding pulse dot when the target object is focused.
 */
export function buildExtractionEdges(
  displayRailObjects: readonly InferredGraphObject[],
  visibleAestheticItemIds: ReadonlySet<string>,
  activeObj: InferredGraphObject | null,
  activeObjectId: string | null,
  direction: GraphDirection
): CanvasEdgeSpec[] {
  const edges: CanvasEdgeSpec[] = [];

  displayRailObjects.forEach((obj, laneIndex) => {
    if (obj.kind === 'camera_slot') return;
    const fromAestheticItem = Boolean(
      obj.sourceAestheticItemId && visibleAestheticItemIds.has(obj.sourceAestheticItemId)
    );
    const sourceId = fromAestheticItem
      ? obj.sourceAestheticItemId!
      : `node-${obj.sourceBlockId}`;
    const isHot = activeObjectId === obj.id;
    edges.push({
      id: `edge-extract-${sourceId}-${obj.id}`,
      source: sourceId,
      target: obj.id,
      sourceHandle: fromAestheticItem ? 'aes-out' : 'staging-out',
      targetHandle: 'obj-in',
      kind: 'extraction',
      objectKind: obj.kind,
      isHot,
      isAnimated: isHot,
      isDimmed: Boolean(activeObj && !isHot),
      laneIndex,
      direction,
    });
  });

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
 * - Tier 2 -> Tier 1: downstream Staging references (`obj -> [LOGIC]`, `obj -> [OPENING]`, or
 *   the exact expanded `[AESTHETIC]` Lookbook Key card when open)
 * - Tier 2 -> Tier 3 (first active Macro-State): always enters through the first active
 *   Macro-State (`obj -> node-S#`), and when that Macro-State is split into Sub-States,
 *   hands off cleanly from `node-S#` into the first matched Sub-State (`node-S# -> subnode-S#.#`)
 * - Tier 3 -> Tier 3 (subsequent appearances): chronological cascading chain (`prev -> next`),
 *   hopping Macro-State to Macro-State when folded or weaving Sub-State to Sub-State directly
 *   once inside the split timeline.
 *
 * Animation discipline:
 * - Single-object focus (`activeObj`): animates that object's full lifecycle thread with a gliding dot.
 * - Unfiltered `Show Threads`: renders static dashed orthogonal lane pipes (zero animation load).
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
  visibleAestheticItemIds: ReadonlySet<string>,
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

    // 1. Tier 2 -> Tier 1 downstream Staging references (routing to expanded [AESTHETIC] key card when visible)
    const seenStagingTargets = new Set<string>();
    for (const cs of obj.callSites) {
      if (cs.kind !== 'staging') continue;
      let resolvedTarget = cs.targetNodeId;
      let targetHandle = 'staging-match-in';

      if (cs.targetNodeId.startsWith('aes-')) {
        if (visibleAestheticItemIds.has(cs.targetNodeId)) {
          resolvedTarget = cs.targetNodeId;
          targetHandle = 'aes-match-in';
        } else if (cs.parentNodeId) {
          resolvedTarget = cs.parentNodeId;
          targetHandle = 'staging-match-in';
        } else {
          continue;
        }
      }

      if (seenStagingTargets.has(resolvedTarget)) continue;
      seenStagingTargets.add(resolvedTarget);

      edges.push({
        id: `edge-match-${obj.id}-${resolvedTarget}`,
        source: obj.id,
        target: resolvedTarget,
        sourceHandle: 'obj-back',
        targetHandle,
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

    // 2a. Tier 2 -> Tier 3 Entry: always anchor on the first active Macro-State (`node-S#`).
    // If that first active Macro-State is split, hand off cleanly (`node-S# -> subnode-S#.#`)
    // before continuing the direct Sub-State-to-Sub-State cascade.
    const first = execStops[0];
    const firstMacroNodeId = `node-${first.macroStateId}`;

    edges.push({
      id: `edge-match-${obj.id}-${firstMacroNodeId}`,
      source: obj.id,
      target: firstMacroNodeId,
      sourceHandle: 'obj-out',
      targetHandle: 'thread-entry',
      kind: 'labelMatch',
      objectKind: obj.kind,
      isHot,
      isAnimated,
      isDimmed,
      isCascade: false,
      laneIndex,
      direction,
    });

    if (first.isSubState) {
      edges.push({
        id: `edge-cascade-entry-${obj.id}-${firstMacroNodeId}-${first.nodeId}`,
        source: firstMacroNodeId,
        target: first.nodeId,
        sourceHandle: 'sub-thread-out',
        targetHandle: 'match-in',
        kind: 'labelMatch',
        objectKind: obj.kind,
        isHot,
        isAnimated,
        isDimmed,
        isCascade: true,
        isMacroEntryHandoff: true,
        laneIndex,
        direction,
      });
    }

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
