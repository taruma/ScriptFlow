import type {
  GraphAestheticItem,
  GraphLayoutOptions,
  GraphMacroStateItem,
  GraphStagingBlockItem,
  GraphSubStateItem,
} from './types.ts';

// Deterministic geometry constants (px) tuned for the 3-Tier Stratified Layout
// LR: Tier 1 Staging (L->R) / Tier 2 Inferred Objects (L->R) / Tier 3 Execution (L->R)
// TB: 90° transpose into 3 parallel vertical columns (Staging | Objects | Execution)
export const ZONE_HEADER_H = 34;
export const LAYER_GAP_LR = 92;
export const LAYER_GAP_TB = 96;

export const STAGING_W_LR = 344;
export const STAGING_W_TB = 368;
export const STAGING_GAP = 22;

export const AES_CARD_W_LR = 232;
export const AES_GAP_LR = 12;
export const AES_INDENT_TB = 26;
export const AES_GAP_TB = 10;
export const AES_BRANCH_GAP_LR = 26;
export const AES_BRANCH_GAP_TB = 12;

export const OBJ_CHIP_W_LR = 224;
export const OBJ_RAIL_W_TB = 248;
export const OBJ_CHIP_H = 44;
export const OBJ_GROUP_LABEL_H = 22;
export const OBJ_GAP = 12;
export const OBJ_GROUP_GAP = 28;

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
  const maxCols = Math.max(8, charsPerLine);

  return text.split('\n').reduce((sum, rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return sum + 1;

    // Simulate word-boundary wrapping (whitespace-pre-wrap + break-words) so long
    // unbreakable tokens or space-wrapped prose don't underestimate line counts.
    let lines = 1;
    let col = 0;
    const tokens = trimmed.split(/(\s+)/);

    for (const token of tokens) {
      if (!token) continue;
      const isSpace = /^\s+$/.test(token);
      if (isSpace) {
        if (col > 0 && col + token.length <= maxCols) {
          col += token.length;
        }
        continue;
      }

      if (token.length > maxCols) {
        if (col > 0) {
          lines += 1;
          col = 0;
        }
        const extraLines = Math.floor((token.length - 1) / maxCols);
        lines += extraLines;
        col = token.length - extraLines * maxCols;
        continue;
      }

      if (col > 0 && col + token.length > maxCols) {
        lines += 1;
        col = token.length;
      } else {
        col += token.length;
      }
    }

    return sum + lines;
  }, 0);
}

export function estimateStagingHeight(
  sb: GraphStagingBlockItem,
  width: number,
  isExpandedAesthetic = false
): number {
  if (isExpandedAesthetic) {
    return 82;
  }
  const charsPerLine = Math.max(26, Math.floor((width - 36) / 6.7));
  const totalLines = sb.lines.reduce(
    (sum, line) => sum + estimateWrappedLines(line, charsPerLine),
    0
  );
  return Math.max(88, 56 + totalLines * 19 + Math.max(0, sb.lines.length - 1) * 6);
}

export function estimateAestheticItemHeight(item: GraphAestheticItem, width: number): number {
  const charsPerLine = Math.max(20, Math.floor((width - 28) / 6.6));
  const segments = item.value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const effectiveSegments = segments.length > 0 ? segments : [item.value || '—'];
  const totalLines = effectiveSegments.reduce(
    (sum, seg) => sum + estimateWrappedLines(seg, charsPerLine),
    0
  );
  return Math.max(68, 44 + totalLines * 17.5 + Math.max(0, effectiveSegments.length - 1) * 6);
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
  const rawLines = estimateWrappedLines(ss.raw, Math.max(20, Math.floor((width - 42) / 6.5)));
  return base + 24 + rawLines * 17.5;
}

export function estimateRawBranchHeight(raw: string, width: number): number {
  const charsPerLine = Math.max(22, Math.floor((width - 28) / 6.7));
  const lines = estimateWrappedLines(raw, charsPerLine);
  // 26px vertical padding+border + ~22px header + 11px*1.625 (~18px) per wrapped monospace line
  return Math.max(78, 50 + lines * 18);
}

export function resolveMeasuredHeight(
  nodeId: string,
  estimatedHeight: number,
  measuredHeights?: Readonly<Record<string, number>>
): number {
  const measured = measuredHeights?.[nodeId];
  return typeof measured === 'number' && Number.isFinite(measured) && measured > 0
    ? measured
    : estimatedHeight;
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
