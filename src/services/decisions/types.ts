import type {
  AuditLens,
  AuteurEnvelope,
  AuteurLensPresetId,
  LintRuleOverrides,
  LintSeverity,
  SceneTopology,
} from '../../core/index.ts';
import type {
  QuickScanRuleLens,
  QuickScanRulePredicate,
  QuickScanRuleScope,
} from '../../data/knowledge/index.ts';
import type {
  AgentMediaAttachment,
  AgentTraceError,
} from '../geminiInteractions.ts';

export const GEMINI_DECISION_MODEL_ID = 'gemini-decision-1' as const;
export const MAX_DECISIONS_PER_BATCH = 1000;

export type QuickScanSensitivity = 'strict' | 'balanced' | 'lenient';
export type QuickScanStatus = 'flagged' | 'borderline' | 'clean';

export interface QuickScanThresholdBand {
  flagged: number;
  borderline: number;
}

export const QUICK_SCAN_THRESHOLDS: Record<QuickScanSensitivity, QuickScanThresholdBand> = {
  strict: {flagged: 0.35, borderline: 0.2},
  balanced: {flagged: 0.5, borderline: 0.28},
  lenient: {flagged: 0.65, borderline: 0.42},
};

export interface QuickScanRuleOverride {
  enabled?: boolean;
  instructionsOverride?: string;
  trueDescriptionOverride?: string;
  falseDescriptionOverride?: string;
}

export interface CustomQuickScanRule {
  id: string;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  label: string;
  when: QuickScanRulePredicate[];
  instructions: string;
  trueDescription: string;
  falseDescription: string;
  escalationHint?: string;
}

export interface ResolvedQuickScanRule {
  id: string;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  label: string;
  when: QuickScanRulePredicate[];
  instructions: string;
  trueDescription: string;
  falseDescription: string;
  escalationHint?: string;
  builtIn: boolean;
  enabled: boolean;
  isTextOverridden: boolean;
}

export interface NoulDecisionQuestionPayload {
  type: 'noul';
  instructions: string;
  criteria: {
    true_description: string;
    false_description: string;
  };
}

export interface DecisionNoulAnswerLike {
  type: 'noul';
  noul: number;
  confidence: number;
}

export interface DecisionResponseLike {
  answers?: Record<string, DecisionNoulAnswerLike | {type: string; [key: string]: unknown}>;
  usage?: Record<string, unknown>;
}

export interface DecisionsClientLike {
  decisions: {
    create(
      params: {
        model: string;
        input: string | Array<Record<string, unknown>>;
        questions: Record<string, NoulDecisionQuestionPayload>;
      },
      options?: {signal?: AbortSignal}
    ): Promise<DecisionResponseLike>;
  };
}

export interface QuickScanQuestionMeta {
  key: string;
  ruleId: string;
  ruleLabel: string;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  targetId: string;
  beatIndex?: number;
  instructions: string;
  trueDescription: string;
  escalationHint?: string;
}

export interface QuickScanFindingItem {
  key: string;
  ruleId: string;
  ruleLabel: string;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  targetId: string;
  beatIndex?: number;
  status: QuickScanStatus;
  /** Calibrated probability P(violation) in [0, 1]. For deterministic findings, 1.0 (error) or 0.75 (warning). */
  probability: number;
  /** Model confidence max(p, 1 - p) in [0, 1], or 1.0 for deterministic findings. */
  confidence: number;
  source: 'decision_api' | 'deterministic';
  instructions?: string;
  trueDescription?: string;
  deterministicSeverity?: LintSeverity;
  deterministicMessage?: string;
  escalationHint?: string;
}

export interface QuickScanLensSummary {
  lens: QuickScanRuleLens;
  status: QuickScanStatus;
  flaggedCount: number;
  borderlineCount: number;
  cleanCount: number;
  deterministicCount: number;
  totalChecked: number;
  maxProbability: number;
  items: QuickScanFindingItem[];
}

export interface QuickScanSuspectBeat {
  beatIndex: number;
  targetId: string;
  status: 'flagged' | 'borderline';
  maxProbability: number;
  items: QuickScanFindingItem[];
}

export interface QuickScanResult {
  snapshotHash: string;
  rulesVersion: string;
  sceneTopology: SceneTopology;
  sensitivity: QuickScanSensitivity;
  durationMs: number;
  totalQuestions: number;
  batchCount: number;
  flaggedCount: number;
  borderlineCount: number;
  cleanCount: number;
  deterministicCount: number;
  skippedYoutubeHandles: string[];
  lensSummaries: QuickScanLensSummary[];
  suspectBeats: QuickScanSuspectBeat[];
  allItems: QuickScanFindingItem[];
  usage?: Record<string, unknown>;
}

export interface QuickScanTrace {
  kind: 'quick_scan';
  model: typeof GEMINI_DECISION_MODEL_ID;
  apiVersion: 'v1beta';
  sensitivity: QuickScanSensitivity;
  snapshotHash: string;
  sceneTopology: SceneTopology;
  startedAt: string;
  durationMs: number;
  totalQuestions: number;
  batchCount: number;
  skippedYoutubeHandles: string[];
  input: unknown;
  questions: Record<string, NoulDecisionQuestionPayload>;
  answers: Record<string, {noul: number; confidence: number; status: QuickScanStatus}>;
  usage?: Record<string, unknown>;
  error?: AgentTraceError;
}

export interface RunQuickScanOptions {
  apiKey: string;
  rawText: string;
  sensitivity: QuickScanSensitivity;
  lintRuleOverrides?: LintRuleOverrides;
  ruleOverrides?: Record<string, QuickScanRuleOverride>;
  customRules?: readonly CustomQuickScanRule[];
  briefContext?: string;
  attachments?: readonly AgentMediaAttachment[];
  signal?: AbortSignal;
  now?: () => number;
  createClient?: (apiKey: string) => DecisionsClientLike;
}

export interface RunQuickScanOutput {
  result: QuickScanResult;
  trace: QuickScanTrace;
}

export interface BuiltQuickScanPayload {
  envelope: AuteurEnvelope;
  input: string | Array<Record<string, unknown>>;
  questions: Record<string, NoulDecisionQuestionPayload>;
  questionMeta: Record<string, QuickScanQuestionMeta>;
  skippedYoutubeHandles: string[];
  hasBriefText: boolean;
  hasBriefMedia: boolean;
}

export const AUDIT_LENS_PRESET_IDS: readonly AuteurLensPresetId[] = [
  'lens1_spatial_optics',
  'lens2_temporal_pacing_wear',
  'lens3_props_inventory',
  'lens4_acoustics_voice',
  'lens5_blocks_grammar',
] as const;

export function auditLensToPresetId(lens: AuditLens): AuteurLensPresetId {
  switch (lens) {
    case 'Lens 1: Spatial & Optics':
      return 'lens1_spatial_optics';
    case 'Lens 2: Temporal, Pacing & Wear':
      return 'lens2_temporal_pacing_wear';
    case 'Lens 3: Props & Inventory':
      return 'lens3_props_inventory';
    case 'Lens 4: Acoustics & Voice':
      return 'lens4_acoustics_voice';
    case 'Lens 5: Blocks & Grammar':
      return 'lens5_blocks_grammar';
  }
}
