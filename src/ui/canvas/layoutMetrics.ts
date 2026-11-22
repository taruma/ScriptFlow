import type {
  GraphLayoutOptions,
  GraphMacroStateItem,
  GraphStagingBlockItem,
  GraphSubStateItem,
} from './types.ts';

// Deterministic geometry constants (px) tuned to match the approved blueprint density
export const ZONE_HEADER_H = 34;
export const LAYER_GAP_LR = 96;
export const LAYER_GAP_TB = 88;

export const STAGING_W_LR = 368;
export const STAGING_W_TB = 400;
export const STAGING_GAP = 18;

export const OBJ_RAIL_W_LR = 252;
export const OBJ_CHIP_W_TB = 228;
export const OBJ_CHIP_H = 44;
export const OBJ_GAP = 10;
export const OBJ_GROUP_GAP = 22;

export const MS_W_LR = 312;
export const MS_W_TB = 368;
export const MS_PILL_W = 84;
export const MS_PILL_H = 38;
export const MS_GAP_LR = 52;
export const MS_GAP_TB = 48;

export const SUB_W_LR = 296;
export const SUB_W_TB = 264;
export const SUB_GAP_LR = 14;
export const SUB_GAP_TB = 16;

export const RAW_W_LR = 308;
export const RAW_W_TB = 286;
export const RAW_GAP = 26;

export const CHAMBER_PAD_X = 20;
export const CHAMBER_PAD_TOP = 38;
export const CHAMBER_PAD_BOTTOM = 20;

// Explicit stacking hierarchy (paired with React Flow `zIndexMode="manual"`):
// ShotChamber backdrop (0) < Graph Edges (1..3) < Edge Labels (4) < All Cards & Headers (10)
export const GRAPH_Z_CHAMBER = 0;
export const GRAPH_Z_CARD = 10;

export interface MacroStatePlacement {
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

export function estimateWrappedLines(text: string, charsPerLine: number): number {
  if (!text) return 1;
  return text.split('\n').reduce((sum, line) => {
    const trimmed = line.trim();
    if (!trimmed) return sum + 1;
    return sum + Math.max(1, Math.ceil(trimmed.length / charsPerLine));
  }, 0);
}

export function estimateStagingHeight(sb: GraphStagingBlockItem, width: number): number {
  const charsPerLine = Math.max(26, Math.floor((width - 36) / 6.7));
  const totalLines = sb.lines.reduce(
    (sum, line) => sum + estimateWrappedLines(line, charsPerLine),
    0
  );
  return Math.max(88, 54 + totalLines * 19 + Math.max(0, sb.lines.length - 1) * 5);
}

export function estimateSubStateRowHeight(ss: GraphSubStateItem, width: number): number {
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

export function estimateDecoupledSubNodeHeight(
  ss: GraphSubStateItem,
  width: number,
  isRawOpen: boolean
): number {
  const base = 36 + estimateSubStateRowHeight(ss, width);
  if (!isRawOpen) return base;
  const rawLines = estimateWrappedLines(ss.raw, Math.max(22, Math.floor((width - 38) / 6.4)));
  return base + 24 + rawLines * 16;
}

export function estimateRawBranchHeight(raw: string, width: number): number {
  const charsPerLine = Math.max(24, Math.floor((width - 28) / 6.6));
  const lines = estimateWrappedLines(raw, charsPerLine);
  return Math.max(76, 42 + lines * 16.5);
}

export function estimateMacroStateHeight(
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

export function applyOffset(
  id: string,
  pos: {x: number; y: number},
  offsets: GraphLayoutOptions['nodeOffsets']
): {x: number; y: number} {
  const delta = offsets[id];
  if (!delta) return pos;
  return {x: pos.x + delta.dx, y: pos.y + delta.dy};
}
