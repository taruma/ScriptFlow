import type {
  CanvasEdgeSpec,
  CanvasLayoutResult,
  CanvasNodeSpec,
  GraphLayoutOptions,
  GraphMacroStateItem,
  GraphSceneModel,
  GraphStagingBlockItem,
  GraphSubStateItem,
  InferredGraphObject,
} from './types.ts';

// Deterministic geometry constants (px) tuned to match the approved mockup density
const ZONE_HEADER_H = 34;
const LAYER_GAP_LR = 96;
const LAYER_GAP_TB = 88;

const STAGING_W_LR = 368;
const STAGING_W_TB = 400;
const STAGING_GAP = 18;

const OBJ_RAIL_W_LR = 252;
const OBJ_CHIP_H = 44;
const OBJ_GAP = 10;
const OBJ_GROUP_GAP = 22;

const MS_W_LR = 312;
const MS_W_TB = 368;
const MS_PILL_W = 84;
const MS_PILL_H = 38;
const MS_GAP_LR = 52;
const MS_GAP_TB = 48;

const SUB_W_LR = 296;
const SUB_W_TB = 264;
const SUB_GAP_LR = 14;
const SUB_GAP_TB = 16;

const RAW_W_LR = 308;
const RAW_W_TB = 286;
const RAW_GAP = 26;

const CHAMBER_PAD_X = 20;
const CHAMBER_PAD_TOP = 38;
const CHAMBER_PAD_BOTTOM = 20;

// Explicit stacking hierarchy (paired with React Flow `zIndexMode="manual"`):
// ShotChamber backdrop (0) < Graph Edges (1..3) < Edge Labels (4) < All Cards & Headers (10)
export const GRAPH_Z_CHAMBER = 0;
export const GRAPH_Z_CARD = 10;

function estimateWrappedLines(text: string, charsPerLine: number): number {
  if (!text) return 1;
  return text.split('\n').reduce((sum, line) => {
    const trimmed = line.trim();
    if (!trimmed) return sum + 1;
    return sum + Math.max(1, Math.ceil(trimmed.length / charsPerLine));
  }, 0);
}

function estimateStagingHeight(sb: GraphStagingBlockItem, width: number): number {
  const charsPerLine = Math.max(26, Math.floor((width - 36) / 6.7));
  const totalLines = sb.lines.reduce(
    (sum, line) => sum + estimateWrappedLines(line, charsPerLine),
    0
  );
  return Math.max(88, 54 + totalLines * 19 + Math.max(0, sb.lines.length - 1) * 5);
}

function estimateSubStateRowHeight(ss: GraphSubStateItem, width: number): number {
  const charsPerLine = Math.max(22, Math.floor((width - 48) / 6.6));
  if (ss.dimension === 'dialogue' && ss.dialogue) {
    const lineCount = estimateWrappedLines(ss.dialogue.line, charsPerLine);
    const hasDelivery = ss.dialogue.delivery.length > 0;
    return 44 + (hasDelivery ? 18 : 0) + lineCount * 19;
  }
  if (ss.dimension === 'onscreen_text') {
    return 64;
  }
  if (ss.dimension === 'foley' || ss.dimension === 'score') {
    const lineCount = estimateWrappedLines(ss.cleanBody, charsPerLine);
    return Math.max(38, 18 + lineCount * 18);
  }
  const lineCount = estimateWrappedLines(ss.cleanBody, charsPerLine);
  return Math.max(38, 16 + lineCount * 18);
}

function estimateDecoupledSubNodeHeight(
  ss: GraphSubStateItem,
  width: number,
  isRawOpen: boolean
): number {
  const base = 36 + estimateSubStateRowHeight(ss, width);
  if (!isRawOpen) return base;
  const rawLines = estimateWrappedLines(ss.raw, Math.max(22, Math.floor((width - 38) / 6.4)));
  return base + 24 + rawLines * 16;
}

function estimateRawBranchHeight(raw: string, width: number): number {
  const charsPerLine = Math.max(24, Math.floor((width - 28) / 6.6));
  const lines = estimateWrappedLines(raw, charsPerLine);
  return Math.max(76, 42 + lines * 16.5);
}

function estimateMacroStateHeight(
  ms: GraphMacroStateItem,
  width: number,
  isExpanded: boolean,
  hasIsolation: boolean,
  isolatedDims: ReadonlySet<string>,
  isolationMode: 'ghost' | 'compact'
): number {
  const footerH = ms.matchedObjectIds.length > 0 ? 34 : 0;
  if (isExpanded) {
    return 86 + footerH;
  }
  const visibleSubs =
    hasIsolation && isolationMode === 'compact'
      ? ms.subStates.filter((ss) => isolatedDims.has(ss.dimension))
      : ms.subStates;
  const rowsHeight = visibleSubs.reduce(
    (sum, ss) => sum + estimateSubStateRowHeight(ss, width) + 8,
    0
  );
  return Math.max(106, 54 + rowsHeight + 16 + footerH);
}

function applyOffset(
  id: string,
  pos: {x: number; y: number},
  offsets: GraphLayoutOptions['nodeOffsets']
): {x: number; y: number} {
  const delta = offsets[id];
  if (!delta) return pos;
  return {x: pos.x + delta.dx, y: pos.y + delta.dy};
}

/**
 * Pure deterministic layout & React Flow node/edge generator for both `LR` and `TB` orientations.
 * Overlays ephemeral `(dx, dy)` drag offsets without mutating the source model.
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
  } = options;

  const isLR = direction === 'LR';
  const hasIsolation = isolatedDims.size > 0;
  const activeObj = activeObjectId ? model.objectById[activeObjectId] ?? null : null;

  const nodes: CanvasNodeSpec[] = [];
  const edges: CanvasEdgeSpec[] = [];

  // Choose Layer 2 rail objects: Staging-derived objects primarily; fall back to Camera Slots when none exist
  const displayRailObjects: InferredGraphObject[] =
    model.railObjects.length > 0 ? model.railObjects : model.cameraSlotObjects;
  const hasRail = displayRailObjects.length > 0;

  // Compute top margin for Raw Input branches above the Execution spine in LR mode
  let maxRawHeightAboveLR = 0;
  if (isLR) {
    for (const ms of model.macroStates) {
      if (rawOpenIds.has(ms.id)) {
        const h = estimateRawBranchHeight(ms.raw, RAW_W_LR);
        if (h > maxRawHeightAboveLR) maxRawHeightAboveLR = h;
      }
    }
  }
  const execBaseY_LR =
    ZONE_HEADER_H + 18 + (maxRawHeightAboveLR > 0 ? maxRawHeightAboveLR + RAW_GAP + 14 : 38);

  // Compute left margin for Raw Input branches left of the Execution spine in TB mode
  let maxRawWidthLeftTB = 0;
  if (!isLR) {
    for (const ms of model.macroStates) {
      if (rawOpenIds.has(ms.id)) {
        maxRawWidthLeftTB = RAW_W_TB + RAW_GAP;
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
        badge: 'PHASE 1 · STAGING',
        subtitle: 'Exact written text',
      },
    });

    if (isLR) {
      let curY = ZONE_HEADER_H + 16;
      for (const sb of model.stagingBlocks) {
        const h = estimateStagingHeight(sb, STAGING_W_LR);
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
        const h = estimateStagingHeight(sb, STAGING_W_TB);
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
    const railStartX = isLR ? (model.stagingBlocks.length > 0 ? stagingRightEdge + LAYER_GAP_LR : 0) : 0;
    const railStartY = isLR ? 0 : (model.stagingBlocks.length > 0 ? stagingBottomEdge + LAYER_GAP_TB : 0);

    const railLabel =
      model.railObjects.length > 0 ? 'INFERRED OBJECTS' : 'CAMERA SETUPS';
    const railSubtitle =
      model.railObjects.length > 0 ? 'Extracted from plain text' : 'Numbered optical slots';

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

    // Group objects cleanly by kind in canonical presentation order
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
      // Horizontal wrapped row layout in TB mode
      const maxRowWidth = Math.max(820, stagingRightEdge);
      let curX = railStartX;
      let curY = railStartY + ZONE_HEADER_H + 16;
      const chipW = 228;

      for (const grp of groups) {
        grp.items.forEach((obj, idx) => {
          if (curX + chipW > railStartX + maxRowWidth && curX > railStartX) {
            curX = railStartX;
            curY += OBJ_CHIP_H + 22;
          }
          const isSelected = activeObjectId === obj.id;
          nodes.push({
            id: obj.id,
            type: 'inferredObject',
            position: applyOffset(obj.id, {x: curX, y: curY}, nodeOffsets),
            width: chipW,
            zIndex: GRAPH_Z_CARD,
            data: {
              object: obj,
              direction,
              showGroupLabel: idx === 0,
              isTraced: isSelected,
              isDimmed: Boolean(activeObj && !isSelected),
            },
          });
          curX += chipW + 14;
        });
        // Start next category on a fresh line for crisp readability
        curX = railStartX;
        curY += OBJ_CHIP_H + 28;
      }
      railRightEdge = railStartX + maxRowWidth;
      railBottomEdge = curY;
    }

    // Extraction wires: Staging Macro-Block -> Inferred Object
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
  }

  // ---------------------------------------------------------------------------
  // LAYER 3: PHASE 2 EXECUTION (MACRO-STATES, SHOT CHAMBERS, SUB-STATES, RAW)
  // ---------------------------------------------------------------------------
  if (model.macroStates.length > 0) {
    const execStartX = isLR
      ? (hasRail || model.stagingBlocks.length > 0 ? railRightEdge + LAYER_GAP_LR : 0)
      : maxRawWidthLeftTB;
    const execStartY = isLR
      ? 0
      : (hasRail || model.stagingBlocks.length > 0 ? railBottomEdge + LAYER_GAP_TB : 0);

    nodes.push({
      id: 'zone-execution',
      type: 'zoneHeader',
      position: {x: isLR ? execStartX : 0, y: execStartY},
      draggable: false,
      selectable: false,
      zIndex: GRAPH_Z_CARD,
      data: {
        zone: 'execution',
        badge: `PHASE 2 · EXECUTION (S1 → S${model.macroStates.length})`,
        subtitle: 'Sculpted Sub-States · Click </> to branch exact plain text',
      },
    });

    // First pass: calculate absolute world positions & dimensions for every Macro-State
    interface MsPlacement {
      ms: GraphMacroStateItem;
      nodeId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      isPill: boolean;
      isExpanded: boolean;
      isRawOpen: boolean;
      isTraced: boolean;
      isDimmed: boolean;
    }

    const placements: MsPlacement[] = [];
    const placementById = new Map<string, MsPlacement>();

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

      const width = isPill ? MS_PILL_W : isLR ? MS_W_LR : MS_W_TB;
      const height = isPill
        ? MS_PILL_H
        : estimateMacroStateHeight(
            ms,
            width,
            isExpanded,
            hasIsolation,
            isolatedDims,
            isolationMode
          );

      // Extra breathing room when entering or leaving a Shot Chamber boundary
      if (i > 0) {
        const enteringChamber = ms.shotChamberId && ms.shotChamberId !== prevMs?.shotChamberId;
        const leavingChamber = prevMs?.shotChamberId && prevMs.shotChamberId !== ms.shotChamberId;
        if (enteringChamber || leavingChamber) {
          cursorPrimary += CHAMBER_PAD_X + 12;
        }
      }

      const baseX = isLR ? cursorPrimary : execStartX + (isPill ? 40 : 0);
      const baseY = isLR
        ? execBaseY_LR + (isPill ? 24 : 0)
        : cursorPrimary;

      const isTraced = activeObj ? ms.matchedObjectIds.includes(activeObj.id) : false;
      const isDimmed = Boolean(activeObj && !isTraced);

      const placement: MsPlacement = {
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
        // Account for raw card height if taller than Macro-State card in TB mode
        const rawH = isRawOpen ? estimateRawBranchHeight(ms.raw, RAW_W_TB) : 0;
        const subHeightTB = isExpanded
          ? Math.max(
              ...ms.subStates.map((ss) =>
                estimateDecoupledSubNodeHeight(ss, SUB_W_TB, rawOpenIds.has(ss.id))
              ),
              height
            )
          : height;
        cursorPrimary += Math.max(height, rawH, subHeightTB) + MS_GAP_TB;
      }
    }

    // Second pass: emit Shot Chamber parent group nodes (for consecutive HOLD sequences)
    const chamberOriginById = new Map<string, {x: number; y: number}>();

    for (const chamber of model.shotChambers) {
      const members = chamber.macroStateIds
        .map((id) => placementById.get(id))
        .filter((p): p is MsPlacement => Boolean(p));
      if (members.length < 2) continue;

      const minX = Math.min(...members.map((m) => m.x));
      const minY = Math.min(...members.map((m) => m.y));
      const maxX = Math.max(...members.map((m) => m.x + m.width));
      const maxY = Math.max(...members.map((m) => m.y + m.height));

      const cx = minX - CHAMBER_PAD_X;
      const cy = minY - CHAMBER_PAD_TOP;
      const cw = maxX - minX + CHAMBER_PAD_X * 2;
      const ch = maxY - minY + CHAMBER_PAD_TOP + CHAMBER_PAD_BOTTOM;

      const chamberPos = applyOffset(chamber.id, {x: cx, y: cy}, nodeOffsets);
      chamberOriginById.set(chamber.id, {x: cx, y: cy});

      const camObjId = `obj-cam-${chamber.slot.replace(/\s+/g, '-')}`;
      const isHot = activeObjectId === camObjId;

      nodes.push({
        id: chamber.id,
        type: 'shotChamber',
        position: chamberPos,
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

    // Third pass: emit Macro-State nodes, Raw Input branch nodes, and Decoupled Sub-State nodes
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

      // World position including chamber drag offset so attached raw/sub-state nodes follow cleanly
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

      // Raw Input Branch Node (opposite perpendicular side: ABOVE in LR, LEFT in TB)
      if (p.isRawOpen) {
        const rawId = `raw-${p.ms.id}`;
        const rawW = isLR ? RAW_W_LR : RAW_W_TB;
        const rawH = estimateRawBranchHeight(p.ms.raw, rawW);
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

      // Decoupled Sub-State Nodes (perpendicular fan-out: BELOW in LR, RIGHT in TB)
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
          const subH = estimateDecoupledSubNodeHeight(ss, subW, isSubRawOpen);
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

    // Fourth pass: Execution Continuity Spine Edges (HOLD / CUT / MONTAGE) & Curved RECALL Arcs
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
        label: !isHold && !isMontage ? (next.ms.cameraTransition === 'RECALL' ? 'RECALL' : 'CUT') : undefined,
        isDimmed: Boolean(activeObj),
        direction,
      });
    }

    // Curved RECALL arcs linking recalled Macro-States back to their establishing camera setup
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
          label: p.ms.cameraSlot ? `RECALL ${p.ms.cameraSlot}` : 'RECALL',
          isHot,
          isDimmed: Boolean(activeObj && !isHot),
          direction,
        });
      }
    }

    // Fifth pass: Dimension Isolation Thread connecting surviving matching Macro-States across gaps
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

    // Sixth pass: Downstream Label-Match Wires (Object -> [OPENING] / Macro-State / Decoupled Sub-State)
    const objsToWire: InferredGraphObject[] = activeObj
      ? [activeObj]
      : showAllLinks
        ? displayRailObjects
        : [];

    for (const obj of objsToWire) {
      // Camera slot objects highlight their Shot Chambers + RECALL arcs + Macro-States directly via node trace,
      // and only draw wires if the camera object itself is rendered in Layer 2 rail
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
          isDimmed: false,
          direction,
        });
      }
    }
  }

  return {nodes, edges};
}
