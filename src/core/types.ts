export type MacroBlockKind =
  | 'INTENT'
  | 'LOGIC'
  | 'AESTHETIC'
  | 'OPENING'
  | 'CONTINUITY PROTOCOL'
  | 'CHARACTERS'
  | 'REFERENCES'
  | 'STAGE'
  | 'EXECUTION'
  | 'CUSTOM';

export interface StagingBlock {
  /** Stable index-based identifier for rendering and mutations */
  id: string;
  /** Exact uppercase header name without brackets, e.g. "INTENT" */
  name: string;
  /** Canonical semantic classification for UI phase styling */
  kind: MacroBlockKind;
  /** 0-indexed line number of the [HEADER] line in the raw script */
  headerLineIndex: number;
  /** 0-indexed start line of the block body (inclusive) */
  contentStartLine: number;
  /** 0-indexed end line of the block body (inclusive); < contentStartLine when empty */
  contentEndLine: number;
  /** Raw body text with trailing inter-block blank lines removed */
  rawBody: string;
  /** Individual lines within rawBody */
  lines: string[];
}

export type SubStateKind =
  | 'camera'
  | 'action'
  | 'block'
  | 'light'
  | 'state_boundary'
  | 'tier2'
  | 'dialogue'
  | 'foley'
  | 'score'
  | 'onscreen_text'
  | 'plain';

export interface CameraMeta {
  /** Numbered camera slot (e.g. "CAM 01"), or null for unnumbered montage [CAM] */
  slot: string | null;
  /** True when numbered ([CAM 01]), false for plain [CAM] */
  isNumbered: boolean;
  /** Text following the camera tag; empty string denotes bare hold/recall */
  descriptor: string;
}

export interface DialogueParts {
  speaker: string;
  language?: string;
  modifiers?: string;
  line: string;
}

export interface SubStateNode {
  index: number;
  raw: string;
  kind: SubStateKind;
  tag?: string;
  body: string;
  camera?: CameraMeta;
  dialogue?: DialogueParts;
}

export interface ExecutionBeat {
  id: string;
  /** 1-based Macro-State index (S1, S2, ...) */
  index: number;
  /** 0-indexed line number in the raw document */
  lineIndex: number;
  /** Trimmed raw line text */
  raw: string;
  /** Parsed atomic Sub-States split by -> or → */
  subStates: SubStateNode[];
}

export interface ExecutionSection {
  headerName: string;
  headerLineIndex: number;
  beats: ExecutionBeat[];
}

export interface AuteurDocument {
  /** Canonical normalized raw text (\n line endings) */
  raw: string;
  /** Raw document split by \n */
  lines: string[];
  /** Any non-block preamble lines before the first Macro-Block header */
  preambleLines: string[];
  /** Phase 1: Staging Macro-Blocks */
  stagingBlocks: StagingBlock[];
  /** Phase 2: Execution Timeline (null if no execution header exists) */
  execution: ExecutionSection | null;
}

export interface CharacterBinding {
  ref: string;
  name: string;
  voiceRef?: string;
  sourceBlock: string;
  lineIndex: number;
}

export interface AestheticToken {
  token: string;
  description: string;
  category?: string;
  lineIndex: number;
}

export type CameraTransitionKind =
  | 'ESTABLISH'
  | 'HOLD'
  | 'CUT'
  | 'RECALL'
  | 'MONTAGE'
  | 'NONE';

export interface BeatCameraLink {
  beatIndex: number;
  slot: string | null;
  descriptor: string;
  transition: CameraTransitionKind;
  /** True when consecutive beats share the exact same numbered camera slot */
  connectsFromPrevious: boolean;
  /** True when camera slot changes or plain unnumbered [CAM] montage cut occurs */
  isCutFromPrevious: boolean;
}

export interface CameraSlotDefinition {
  slot: string;
  firstBeatIndex: number;
  firstDescriptor: string;
  lineIndex: number;
}

export interface ExtractedMetadata {
  characters: CharacterBinding[];
  aestheticTokens: AestheticToken[];
  cameraSlots: Record<string, CameraSlotDefinition>;
  beatLinks: BeatCameraLink[];
  hasContinuationContext: boolean;
}

export type AuditLens =
  | 'Lens 1: Spatial & Optics'
  | 'Lens 2: Temporal, Pacing & Wear'
  | 'Lens 3: Props & Inventory'
  | 'Lens 4: Acoustics & Voice'
  | 'Lens 5: Blocks & Grammar';

export type LintSeverity = 'error' | 'warning';

export type LintTarget =
  | {
      phase: 'staging';
      blockIndex: number;
      blockName: string;
      lineIndex: number;
    }
  | {
      phase: 'execution';
      beatIndex: number;
      lineIndex: number;
    };

export interface LintDiagnostic {
  id: string;
  ruleId: string;
  ruleName: string;
  lens: AuditLens;
  severity: LintSeverity;
  message: string;
  repairHint: string;
  target: LintTarget;
  excerpt?: string;
}
