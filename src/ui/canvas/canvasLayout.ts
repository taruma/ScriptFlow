import {UI_LABELS} from '../labels.ts';
import {
  buildDownstreamLabelMatchEdges,
  buildExecutionContinuityEdges,
  buildExtractionEdges,
} from './layoutEdges.ts';
import {
  applyOffset,
  CHAMBER_PAD_BOTTOM,
  CHAMBER_PAD_TOP,
  CHAMBER_PAD_X,
  estimateDecoupledSubNodeHeight,
  estimateMacroStateHeight,
  estimateRawBranchHeight,
  estimateStagingHeight,
  GRAPH_Z_CARD,
  GRAPH_Z_CHAMBER,
  LAYER_GAP_LR,
  LAYER_GAP_TB,
  MS_GAP_LR,
  MS_GAP_TB,
  MS_PILL_H,
  MS_PILL_W,
  MS_W_LR,
  MS_W_TB,
  OBJ_CHIP_H,
  OBJ_CHIP_W_TB,
  OBJ_GAP,
  OBJ_GROUP_GAP,
  OBJ_RAIL_W_LR,
  RAW_GAP,
  RAW_W_LR,
  RAW_W_TB,
  resolveMeasuredHeight,
  STAGING_GAP,
  STAGING_W_LR,
  STAGING_W_TB,
  SUB_GAP_LR,
  SUB_GAP_TB,
  SUB_W_LR,
  SUB_W_TB,
  ZONE_HEADER_H,
  type MacroStatePlacement,
} from './layoutMetrics.ts';
import type {
  CanvasEdgeSpec,
  CanvasLayoutResult,
  CanvasNodeSpec,
  GraphLayoutOptions,
  GraphSceneModel,
  InferredGraphObject,
} from './types.ts';

export {GRAPH_Z_CARD, GRAPH_Z_CHAMBER};

/**
 * Pure deterministic 3-layer layout & React Flow node/edge generator for both `LR` and `TB`
 * orientations. Overlays ephemeral `(dx, dy)` drag offsets without mutating the source model.
 */
export function buildCanvasLayout(
  model: GraphSceneModel,
  options: GraphLayoutOptions
): CanvasLayoutResult {
  const {
    direction,
    expandedIds,
    rawOpenIds,
    isolatedDims,
    isolationMode,
    activeObjectId,
    showAllLinks,
    nodeOffsets,
    measuredHeights,
  } = options;

  const isLR = direction === 'LR';
  const hasIsolation = isolatedDims.size > 0;
  const activeObj = activeObjectId ? model.objectById[activeObjectId] ?? null : null;

  const nodes: CanvasNodeSpec[] = [];
  const edges: CanvasEdgeSpec[] = [];

  // Layer 2 rail objects: Staging-derived objects primarily; fall back to Camera Setups when none exist
  const displayRailObjects: InferredGraphObject[] =
    model.railObjects.length > 0 ? model.railObjects : model.cameraSlotObjects;
  const hasRail = displayRailObjects.length > 0;

  // Reserve perpendicular headroom for opposite-side </> Raw Input branches
  let maxRawHeightAboveLR = 0;
  if (isLR) {
    for (const ms of model.macroStates) {
      if (rawOpenIds.has(ms.id)) {
        const h = resolveMeasuredHeight(
          `raw-${ms.id}`,
          estimateRawBranchHeight(ms.raw, RAW_W_LR),
          measuredHeights
        );
        if (h > maxRawHeightAboveLR) maxRawHeightAboveLR = h;
      }
    }
  }
  const execBaseY_LR =
    ZONE_HEADER_H + 18 + (maxRawHeightAboveLR > 0 ? maxRawHeightAboveLR + RAW_GAP + 18 : 38);

  let maxRawWidthLeftTB = 0;
  if (!isLR) {
    for (const ms of model.macroStates) {
      if (rawOpenIds.has(ms.id)) {
        maxRawWidthLeftTB = RAW_W_TB + RAW_GAP + (ms.shotChamberId ? CHAMBER_PAD_X : 0);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // LAYER 1: PHASE 1 STAGING MACRO-BLOCKS
  // ---------------------------------------------------------------------------
  let stagingRightEdge = 0;
  let stagingBottomEdge = 0;

  if (model.stagingBlocks.length > 0) {
    nodes.push({
      id: 'zone-staging',
      type: 'zoneHeader',
      position: {x: 0, y: 0},
      draggable: false,
      selectable: false,
      zIndex: GRAPH_Z_CARD,
      data: {
        zone: 'staging',
        badge: UI_LABELS.graph.zoneStagingBadge,
        subtitle: UI_LABELS.graph.zoneStagingSubtitle,
      },
    });

    if (isLR) {
      let curY = ZONE_HEADER_H + 16;
      for (const sb of model.stagingBlocks) {
        const h = resolveMeasuredHeight(
          sb.id,
          estimateStagingHeight(sb, STAGING_W_LR),
          measuredHeights
        );
        const isHit = activeObj
          ? activeObj.sourceBlockId === sb.mbId || sb.matchedObjectIds.includes(activeObj.id)
          : false;

        nodes.push({
          id: sb.id,
          type: 'stagingBlock',
          position: applyOffset(sb.id, {x: 0, y: curY}, nodeOffsets),
          width: STAGING_W_LR,
          zIndex: GRAPH_Z_CARD,
          data: {
            block: sb,
            direction,
            isTraced: isHit,
            isDimmed: Boolean(activeObj && !isHit),
          },
        });
        curY += h + STAGING_GAP;
      }
      stagingRightEdge = STAGING_W_LR;
      stagingBottomEdge = curY;
    } else {
      // 2-column grid in TB mode
      const colHeights = [ZONE_HEADER_H + 16, ZONE_HEADER_H + 16];
      model.stagingBlocks.forEach((sb, idx) => {
        const col = idx % 2;
        const x = col * (STAGING_W_TB + STAGING_GAP);
        const y = colHeights[col];
        const h = resolveMeasuredHeight(
          sb.id,
          estimateStagingHeight(sb, STAGING_W_TB),
          measuredHeights
        );
        const isHit = activeObj
          ? activeObj.sourceBlockId === sb.mbId || sb.matchedObjectIds.includes(activeObj.id)
          : false;

        nodes.push({
          id: sb.id,
          type: 'stagingBlock',
          position: applyOffset(sb.id, {x, y}, nodeOffsets),
          width: STAGING_W_TB,
          zIndex: GRAPH_Z_CARD,
          data: {
            block: sb,
            direction,
            isTraced: isHit,
            isDimmed: Boolean(activeObj && !isHit),
          },
        });
        colHeights[col] += h + STAGING_GAP;
      });
      stagingRightEdge = STAGING_W_TB * 2 + STAGING_GAP;
      stagingBottomEdge = Math.max(colHeights[0], colHeights[1]);
    }
  }

  // ---------------------------------------------------------------------------
  // LAYER 2: INFERRED OBJECTS RAIL
  // ---------------------------------------------------------------------------
  let railRightEdge = stagingRightEdge;
  let railBottomEdge = stagingBottomEdge;

  if (hasRail) {
    const railStartX = isLR
      ? model.stagingBlocks.length > 0
        ? stagingRightEdge + LAYER_GAP_LR
        : 0
      : 0;
    const railStartY = isLR
      ? 0
      : model.stagingBlocks.length > 0
        ? stagingBottomEdge + LAYER_GAP_TB
        : 0;

    const railLabel =
      model.railObjects.length > 0
        ? UI_LABELS.graph.zoneObjectsBadge
        : UI_LABELS.graph.zoneCamerasBadge;
    const railSubtitle =
      model.railObjects.length > 0
        ? UI_LABELS.graph.zoneObjectsSubtitle
        : UI_LABELS.graph.zoneCamerasSubtitle;

    nodes.push({
      id: 'zone-objects',
      type: 'zoneHeader',
      position: {x: railStartX, y: railStartY},
      draggable: false,
      selectable: false,
      zIndex: GRAPH_Z_CARD,
      data: {
        zone: 'objects',
        badge: railLabel,
        subtitle: railSubtitle,
      },
    });

    const kindOrder: InferredGraphObject['kind'][] = [
      'character',
      'location',
      'wardrobe',
      'prop',
      'staging_ref',
      'camera_slot',
    ];
    const groups = kindOrder
      .map((kind) => ({
        kind,
        items: displayRailObjects.filter((o) => o.kind === kind),
      }))
      .filter((g) => g.items.length > 0);

    if (isLR) {
      let curY = railStartY + ZONE_HEADER_H + 16;
      for (const grp of groups) {
        grp.items.forEach((obj, idx) => {
          const isSelected = activeObjectId === obj.id;
          nodes.push({
            id: obj.id,
            type: 'inferredObject',
            position: applyOffset(obj.id, {x: railStartX, y: curY}, nodeOffsets),
            width: OBJ_RAIL_W_LR,
            zIndex: GRAPH_Z_CARD,
            data: {
              object: obj,
              direction,
              showGroupLabel: idx === 0,
              isTraced: isSelected,
              isDimmed: Boolean(activeObj && !isSelected),
            },
          });
          curY += OBJ_CHIP_H + (idx === 0 ? 18 : 0) + OBJ_GAP;
        });
        curY += OBJ_GROUP_GAP - OBJ_GAP;
      }
      railRightEdge = railStartX + OBJ_RAIL_W_LR;
      railBottomEdge = curY;
    } else {
      const maxRowWidth = Math.max(820, stagingRightEdge);
      let curX = railStartX;
      let curY = railStartY + ZONE_HEADER_H + 16;

      for (const grp of groups) {
        grp.items.forEach((obj, idx) => {
          if (curX + OBJ_CHIP_W_TB > railStartX + maxRowWidth && curX > railStartX) {
            curX = railStartX;
            curY += OBJ_CHIP_H + 22;
          }
          const isSelected = activeObjectId === obj.id;
          nodes.push({
            id: obj.id,
            type: 'inferredObject',
            position: applyOffset(obj.id, {x: curX, y: curY}, nodeOffsets),
            width: OBJ_CHIP_W_TB,
            zIndex: GRAPH_Z_CARD,
            data: {
              object: obj,
              direction,
              showGroupLabel: idx === 0,
              isTraced: isSelected,
              isDimmed: Boolean(activeObj && !isSelected),
            },
          });
          curX += OBJ_CHIP_W_TB + 14;
        });
        curX = railStartX;
        curY += OBJ_CHIP_H + 28;
      }
      railRightEdge = railStartX + maxRowWidth;
      railBottomEdge = curY;
    }

    edges.push(...buildExtractionEdges(displayRailObjects, activeObj, activeObjectId, direction));
  }

  // ---------------------------------------------------------------------------
  // LAYER 3: PHASE 2 EXECUTION (MACRO-STATES, SHOT CHAMBERS, SUB-STATES, RAW)
  // ---------------------------------------------------------------------------
  if (model.macroStates.length > 0) {
    const execStartX = isLR
      ? hasRail || model.stagingBlocks.length > 0
        ? railRightEdge + LAYER_GAP_LR
        : 0
      : maxRawWidthLeftTB;
    const execStartY = isLR
      ? 0
      : hasRail || model.stagingBlocks.length > 0
        ? railBottomEdge + LAYER_GAP_TB
        : 0;

    nodes.push({
      id: 'zone-execution',
      type: 'zoneHeader',
      position: {x: isLR ? execStartX : 0, y: execStartY},
      draggable: false,
      selectable: false,
      zIndex: GRAPH_Z_CARD,
      data: {
        zone: 'execution',
        badge: UI_LABELS.graph.zoneExecutionBadge(model.macroStates.length),
        subtitle: UI_LABELS.graph.zoneExecutionSubtitle,
      },
    });

    // Pass 1: Compute absolute world placements for all Macro-States
    const placements: MacroStatePlacement[] = [];
    const placementById = new Map<string, MacroStatePlacement>();

    let cursorPrimary = isLR ? execStartX : execStartY + ZONE_HEADER_H + 30;
    const chamberById = new Map(model.shotChambers.map((c) => [c.id, c]));

    for (let i = 0; i < model.macroStates.length; i++) {
      const ms = model.macroStates[i];
      const prevMs = i > 0 ? model.macroStates[i - 1] : null;
      const matchingSubs = hasIsolation
        ? ms.subStates.filter((ss) => isolatedDims.has(ss.dimension))
        : ms.subStates;
      const isPill = hasIsolation && matchingSubs.length === 0;
      const isExpanded = !isPill && expandedIds.has(ms.id);
      const isRawOpen = !isPill && rawOpenIds.has(ms.id);

      const nodeId = `node-${ms.id}`;
      const width = isPill ? MS_PILL_W : isLR ? MS_W_LR : MS_W_TB;
      const estimatedMsHeight = isPill
        ? MS_PILL_H
        : estimateMacroStateHeight(
            ms,
            width,
            isExpanded,
            hasIsolation,
            isolatedDims,
            isolationMode
          );
      const height = isPill
        ? MS_PILL_H
        : resolveMeasuredHeight(nodeId, estimatedMsHeight, measuredHeights);

      if (i > 0) {
        const enteringChamber = ms.shotChamberId && ms.shotChamberId !== prevMs?.shotChamberId;
        const leavingChamber = prevMs?.shotChamberId && prevMs.shotChamberId !== ms.shotChamberId;
        if (enteringChamber || leavingChamber) {
          cursorPrimary += CHAMBER_PAD_X + 12;
        }
      }

      const baseX = isLR ? cursorPrimary : execStartX + (isPill ? 40 : 0);
      const baseY = isLR ? execBaseY_LR + (isPill ? 24 : 0) : cursorPrimary;

      const isTraced = activeObj ? ms.matchedObjectIds.includes(activeObj.id) : false;
      const isDimmed = Boolean(activeObj && !isTraced);

      const placement: MacroStatePlacement = {
        ms,
        nodeId: `node-${ms.id}`,
        x: baseX,
        y: baseY,
        width,
        height,
        isPill,
        isExpanded,
        isRawOpen,
        isTraced,
        isDimmed,
      };
      placements.push(placement);
      placementById.set(ms.id, placement);

      if (isLR) {
        cursorPrimary += width + MS_GAP_LR;
      } else {
        const rawH = isRawOpen
          ? resolveMeasuredHeight(
              `raw-${ms.id}`,
              estimateRawBranchHeight(ms.raw, RAW_W_TB),
              measuredHeights
            )
          : 0;
        const subHeightTB = isExpanded
          ? Math.max(
              ...ms.subStates.map((ss) =>
                resolveMeasuredHeight(
                  `subnode-${ss.id}`,
                  estimateDecoupledSubNodeHeight(ss, SUB_W_TB, rawOpenIds.has(ss.id)),
                  measuredHeights
                )
              ),
              height
            )
          : height;
        cursorPrimary += Math.max(height, rawH, subHeightTB) + MS_GAP_TB;
      }
    }

    // Pass 2: Emit Shot Chamber parent containers for consecutive HOLD sequences (length >= 2)
    const chamberOriginById = new Map<string, {x: number; y: number}>();

    for (const chamber of model.shotChambers) {
      const members = chamber.macroStateIds
        .map((id) => placementById.get(id))
        .filter((p): p is MacroStatePlacement => Boolean(p));
      if (members.length < 2) continue;

      const minX = Math.min(...members.map((m) => m.x));
      const minY = Math.min(...members.map((m) => m.y));
      const maxX = Math.max(...members.map((m) => m.x + m.width));
      const maxY = Math.max(...members.map((m) => m.y + m.height));

      const cx = minX - CHAMBER_PAD_X;
      const cy = minY - CHAMBER_PAD_TOP;
      const cw = maxX - minX + CHAMBER_PAD_X * 2;
      const ch = maxY - minY + CHAMBER_PAD_TOP + CHAMBER_PAD_BOTTOM;

      chamberOriginById.set(chamber.id, {x: cx, y: cy});

      const camObjId = `obj-cam-${chamber.slot.replace(/\s+/g, '-')}`;
      const isHot = activeObjectId === camObjId;

      nodes.push({
        id: chamber.id,
        type: 'shotChamber',
        position: applyOffset(chamber.id, {x: cx, y: cy}, nodeOffsets),
        width: cw,
        height: ch,
        zIndex: GRAPH_Z_CHAMBER,
        data: {
          chamberId: chamber.id,
          slot: chamber.slot,
          cameraObjectId: camObjId,
          stateCount: members.length,
          isTraced: isHot,
          isDimmed: Boolean(activeObj && !isHot && !members.some((m) => m.isTraced)),
        },
      });
    }

    // Pass 3: Emit Macro-States, opposite-side Raw Input branches, and perpendicular Sub-States
    const visibleSubNodeIds = new Set<string>();

    for (const p of placements) {
      const chamberOrigin = p.ms.shotChamberId ? chamberOriginById.get(p.ms.shotChamberId) : null;
      const parentChamber = p.ms.shotChamberId ? chamberById.get(p.ms.shotChamberId) : null;

      const nodePos = chamberOrigin
        ? applyOffset(
            p.nodeId,
            {x: p.x - chamberOrigin.x, y: p.y - chamberOrigin.y},
            nodeOffsets
          )
        : applyOffset(p.nodeId, {x: p.x, y: p.y}, nodeOffsets);

      const chamberDrag = p.ms.shotChamberId ? nodeOffsets[p.ms.shotChamberId] : undefined;
      const nodeDrag = nodeOffsets[p.nodeId];
      const worldX = p.x + (chamberDrag?.dx ?? 0) + (nodeDrag?.dx ?? 0);
      const worldY = p.y + (chamberDrag?.dy ?? 0) + (nodeDrag?.dy ?? 0);

      nodes.push({
        id: p.nodeId,
        type: 'macroState',
        position: nodePos,
        width: p.width,
        ...(chamberOrigin && parentChamber ? {parentId: parentChamber.id} : {}),
        zIndex: GRAPH_Z_CARD,
        data: {
          macroState: p.ms,
          direction,
          isPill: p.isPill,
          isExpanded: p.isExpanded,
          isRawOpen: p.isRawOpen,
          hasIsolation,
          isolatedDims: [...isolatedDims],
          isolationMode,
          isTraced: p.isTraced,
          isDimmed: p.isDimmed,
        },
      });

      if (p.isRawOpen) {
        const rawId = `raw-${p.ms.id}`;
        const rawW = isLR ? RAW_W_LR : RAW_W_TB;
        const rawH = resolveMeasuredHeight(
          rawId,
          estimateRawBranchHeight(p.ms.raw, rawW),
          measuredHeights
        );
        const rawBasePos = isLR
          ? {x: worldX + (p.width - rawW) / 2, y: worldY - rawH - RAW_GAP - (chamberOrigin ? 18 : 0)}
          : {x: worldX - rawW - RAW_GAP - (chamberOrigin ? 16 : 0), y: worldY};

        nodes.push({
          id: rawId,
          type: 'rawBranch',
          position: applyOffset(rawId, rawBasePos, nodeOffsets),
          width: rawW,
          zIndex: GRAPH_Z_CARD,
          data: {
            macroStateId: p.ms.id,
            raw: p.ms.raw,
            direction,
            isDimmed: p.isDimmed,
          },
        });

        edges.push({
          id: `edge-raw-${p.ms.id}`,
          source: rawId,
          target: p.nodeId,
          sourceHandle: 'raw-out',
          targetHandle: 'raw-in',
          kind: 'rawBranch',
          isDimmed: p.isDimmed,
          direction,
        });
      }

      if (p.isExpanded) {
        const chamberBottomClearance = chamberOrigin ? CHAMBER_PAD_BOTTOM + 16 : 0;
        let subCursor = isLR
          ? worldY + p.height + 28 + chamberBottomClearance
          : worldX + p.width + 32 + (chamberOrigin ? CHAMBER_PAD_X : 0);

        let prevSubNodeId = p.nodeId;
        let prevSourceHandle = 'sub-out';

        for (const ss of p.ms.subStates) {
          const matchesIso = !hasIsolation || isolatedDims.has(ss.dimension);
          if (!matchesIso && isolationMode === 'compact') {
            continue;
          }

          const subNodeId = `subnode-${ss.id}`;
          visibleSubNodeIds.add(subNodeId);

          const subW = isLR ? SUB_W_LR : SUB_W_TB;
          const isSubRawOpen = rawOpenIds.has(ss.id);
          const subH = resolveMeasuredHeight(
            subNodeId,
            estimateDecoupledSubNodeHeight(ss, subW, isSubRawOpen),
            measuredHeights
          );
          const subBasePos = isLR
            ? {x: worldX + (p.width - subW) / 2, y: subCursor}
            : {x: subCursor, y: worldY};

          const isSubTraced = activeObj ? ss.matchedObjectIds.includes(activeObj.id) : false;
          const isSubDimmed = Boolean(activeObj && !isSubTraced);

          nodes.push({
            id: subNodeId,
            type: 'subState',
            position: applyOffset(subNodeId, subBasePos, nodeOffsets),
            width: subW,
            zIndex: GRAPH_Z_CARD,
            data: {
              subState: ss,
              direction,
              isGhost: !matchesIso,
              isRawOpen: isSubRawOpen,
              isTraced: isSubTraced,
              isDimmed: isSubDimmed,
            },
          });

          edges.push({
            id: `edge-sub-${prevSubNodeId}-${subNodeId}`,
            source: prevSubNodeId,
            target: subNodeId,
            sourceHandle: prevSourceHandle,
            targetHandle: 'chain-in',
            kind: 'subStateChain',
            dimension: ss.dimension,
            isDimmed: Boolean(activeObj && !isSubTraced),
            direction,
          });

          prevSubNodeId = subNodeId;
          prevSourceHandle = 'chain-out';
          subCursor += isLR ? subH + SUB_GAP_LR : subW + SUB_GAP_TB;
        }
      }
    }

    // Pass 4: Execution continuity spine, RECALL arcs, isolation threads & downstream label matches
    edges.push(
      ...buildExecutionContinuityEdges(
        placements,
        activeObj,
        activeObjectId,
        isolatedDims,
        direction
      )
    );
    edges.push(
      ...buildDownstreamLabelMatchEdges(
        displayRailObjects,
        activeObj,
        activeObjectId,
        showAllLinks,
        visibleSubNodeIds,
        direction
      )
    );
  }

  return {nodes, edges};
}
