import type {
  CameraTransitionKind,
  MacroBlockKind,
  SceneTopology,
  SubStateKind,
} from '../../core/index.ts';

export type GraphDirection = 'LR' | 'TB';
export type GraphIsolationMode = 'ghost' | 'compact';

export type GraphDimension =
  | 'camera'
  | 'block'
  | 'action'
  | 'dialogue'
  | 'foley'
  | 'score'
  | 'light_vfx'
  | 'onscreen_text'
  | 'other';

export const GRAPH_DIMENSIONS: readonly GraphDimension[] = [
  'camera',
  'block',
  'action',
  'dialogue',
  'foley',
  'score',
  'light_vfx',
  'onscreen_text',
  'other',
] as const;

export type InferredObjectKind =
  | 'character'
  | 'location'
  | 'wardrobe'
  | 'prop'
  | 'staging_ref'
  | 'camera_slot';

export interface ObjectCallSite {
  /** Primary target node id (e.g. `subnode-S1.2`, `node-MB3`, `node-S2`) */
  targetNodeId: string;
  /** Parent Macro-State node id when targetNodeId is a Sub-State (used when coupled) */
  parentNodeId?: string;
  /** Human-readable display chip (e.g. `[OPENING]`, `S1.2`, `S3`) */
  display: string;
  kind: 'staging' | 'sub_state' | 'macro_state';
  transition?: CameraTransitionKind;
}

export interface InferredGraphObject {
  id: string;
  matchToken: string;
  label: string;
  kind: InferredObjectKind;
  category: string;
  ref?: string;
  voiceRef?: string;
  detail: string;
  sourceBlockId: string;
  sourceBlockName: string;
  /** Exact [AESTHETIC] Key-Value mini-card node id (e.g. `aes-MB2-1`) when declared inside [AESTHETIC] */
  sourceAestheticItemId?: string;
  isStagingOnly: boolean;
  callSites: ObjectCallSite[];
}

export interface InlineEntityMatchRule {
  matchText: string;
  objectId: string;
  kind: InferredObjectKind;
  isRefToken: boolean;
}

export type AestheticItemAccentKind =
  | 'location'
  | 'wardrobe'
  | 'prop'
  | 'staging_ref'
  | 'general';

export interface GraphAestheticItem {
  /** Stable React Flow node id (e.g. `aes-MB2-0`) */
  id: string;
  /** Parent Staging Macro-Block id (e.g. `MB2`) */
  parentMbId: string;
  index: number;
  /** Display key (e.g. `Location Mapping`, `Wardrobe`, or `Note` for freeform lines) */
  key: string;
  /** Value text after `Key:` (or raw text for freeform lines) */
  value: string;
  /** Original raw line text */
  raw: string;
  accentKind: AestheticItemAccentKind;
  /** Tier 2 Inferred Object IDs declared on this exact line */
  extractedObjectIds: string[];
  /** Tier 2 Inferred Object IDs referenced (not declared) on this line */
  matchedObjectIds: string[];
}

export interface GraphStagingBlockItem {
  id: string;
  mbId: string;
  name: string;
  kind: MacroBlockKind;
  rawBody: string;
  lines: string[];
  /** Parsed Key-Value lookbook swatch items when this block is `[AESTHETIC]` */
  aestheticItems: GraphAestheticItem[];
  extractedObjectIds: string[];
  matchedObjectIds: string[];
}

export interface SculptedDialogueData {
  speaker: string;
  language?: string;
  extensions: string[];
  delivery: string[];
  line: string;
}

export interface GraphSubStateItem {
  id: string;
  macroStateId: string;
  index: number;
  kind: SubStateKind;
  dimension: GraphDimension;
  tag: string;
  raw: string;
  cleanBody: string;
  cameraSlot: string | null;
  dialogue?: SculptedDialogueData;
  matchedObjectIds: string[];
}

export interface GraphMacroStateItem {
  id: string;
  index: number;
  raw: string;
  subStates: GraphSubStateItem[];
  matchedObjectIds: string[];
  cameraSlot: string | null;
  cameraTransition: CameraTransitionKind;
  recallSourceMacroStateId: string | null;
  shotChamberId: string | null;
}

export interface ShotChamber {
  id: string;
  slot: string;
  macroStateIds: string[];
}

export interface GraphSceneStats {
  stagingCount: number;
  inferredObjectCount: number;
  macroStateCount: number;
  subStateCount: number;
  dimensionCounts: Record<GraphDimension, number>;
}

export interface GraphSceneModel {
  stagingBlocks: GraphStagingBlockItem[];
  /** Staging-derived objects shown in Layer 2 rail (characters, tokens, staging refs) */
  railObjects: InferredGraphObject[];
  /** Camera slot objects (CAM 01, CAM 02...) inspectable via click or fallback rail */
  cameraSlotObjects: InferredGraphObject[];
  /** Unified lookup for every inspectable object (rail + camera slots) */
  objectById: Record<string, InferredGraphObject>;
  /** Longest-first token rules for inline entity highlighting inside text */
  inlineEntities: InlineEntityMatchRule[];
  macroStates: GraphMacroStateItem[];
  shotChambers: ShotChamber[];
  topology: SceneTopology;
  stats: GraphSceneStats;
}

export interface NodeOffset {
  dx: number;
  dy: number;
}

export interface GraphLayoutOptions {
  direction: GraphDirection;
  expandedIds: ReadonlySet<string>;
  /** Staging Macro-Block MB# IDs whose Key-Value lookbook cards are expanded (e.g. `[AESTHETIC]`) */
  expandedStagingIds?: ReadonlySet<string>;
  rawOpenIds: ReadonlySet<string>;
  isolatedDims: ReadonlySet<GraphDimension>;
  isolationMode: GraphIsolationMode;
  activeObjectId: string | null;
  showAllLinks: boolean;
  nodeOffsets: Readonly<Record<string, NodeOffset>>;
  /** Optional React Flow DOM-measured node heights (px) keyed by node ID */
  measuredHeights?: Readonly<Record<string, number>>;
}

export type CanvasNodeType =
  | 'zoneHeader'
  | 'stagingBlock'
  | 'aestheticItem'
  | 'inferredObject'
  | 'shotChamber'
  | 'macroState'
  | 'subState'
  | 'rawBranch';

export type CanvasEdgeKind =
  | 'aestheticBranch'
  | 'extraction'
  | 'labelMatch'
  | 'spineHold'
  | 'spineCut'
  | 'spineMontage'
  | 'recall'
  | 'subStateChain'
  | 'rawBranch'
  | 'isolationThread';

export interface CanvasNodeSpec<TData = Record<string, unknown>> {
  id: string;
  type: CanvasNodeType;
  position: {x: number; y: number};
  width?: number;
  height?: number;
  parentId?: string;
  draggable?: boolean;
  selectable?: boolean;
  zIndex?: number;
  data: TData;
}

export interface CanvasEdgeSpec {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  kind: CanvasEdgeKind;
  dimension?: GraphDimension;
  objectKind?: InferredObjectKind;
  isHot?: boolean;
  isDimmed?: boolean;
  /** True when a structural chain edge connects a slightly dimmed parent header to an active child */
  isSecondary?: boolean;
  /** True when the edge renders subtle directional flow animation (source -> target pulse dot) */
  isAnimated?: boolean;
  /** True when a labelMatch edge cascades chronologically between consecutive Execution appearances */
  isCascade?: boolean;
  /** True when a cascading labelMatch connects two split Sub-States inside the same Macro-State */
  isIntraState?: boolean;
  /** True when a labelMatch hands off from the first active Macro-State header into its first split Sub-State */
  isMacroEntryHandoff?: boolean;
  /** Per-object lane index used to separate parallel cascading threads cleanly */
  laneIndex?: number;
  label?: string;
  direction: GraphDirection;
}

export interface CanvasLayoutResult {
  nodes: CanvasNodeSpec[];
  edges: CanvasEdgeSpec[];
}
