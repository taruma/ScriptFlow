import {z} from 'zod';

export const AUTEUR_IR_SCHEMA_VERSION = '0.4.0' as const;

export const MacroBlockKindSchema = z.enum([
  'INTENT',
  'LOGIC',
  'AESTHETIC',
  'OPENING',
  'CONTINUITY PROTOCOL',
  'CHARACTERS',
  'REFERENCES',
  'STAGE',
  'EXECUTION',
  'CUSTOM',
]);

export const StagingMacroBlockKindSchema = z.enum([
  'INTENT',
  'LOGIC',
  'AESTHETIC',
  'OPENING',
  'CONTINUITY PROTOCOL',
  'CHARACTERS',
  'REFERENCES',
  'STAGE',
  'CUSTOM',
]);

export const AuditLensSchema = z.enum([
  'Lens 1: Spatial & Optics',
  'Lens 2: Temporal, Pacing & Wear',
  'Lens 3: Props & Inventory',
  'Lens 4: Acoustics & Voice',
  'Lens 5: Blocks & Grammar',
]);

export const LintSeveritySchema = z.enum(['error', 'warning']);

export const CameraTransitionKindSchema = z.enum([
  'ESTABLISH',
  'HOLD',
  'CUT',
  'RECALL',
  'MONTAGE',
  'NONE',
]);

export const SceneTopologySchema = z.enum([
  'continuous_oner',
  'multi_camera_coverage',
  'discontinuous_montage',
  'mixed',
  'empty',
]);

export const SubStateDimensionSchema = z.enum([
  'camera',
  'action',
  'block',
  'light',
  'state_boundary',
  'tier2',
  'dialogue',
  'foley',
  'score',
  'onscreen_text',
  'plain',
]);

const UPPERCASE_TAG_REGEX = /^[A-Z0-9 _-]+$/;
const CAMERA_IDENTIFIER_REGEX = /^\d+[A-Z]?$/i;
const TOKEN_NAME_REGEX = /^[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// Staging Macro-Block Schemas (Phase 1: STAGING)
// ---------------------------------------------------------------------------

export const AestheticEntryDraftSchema = z.object({
  id: z.string().min(1).optional(),
  key: z.string().trim().min(1).nullable(),
  value: z.string(),
});

export const AestheticEntryIRSchema = AestheticEntryDraftSchema.extend({
  id: z.string().min(1),
});

export const ProseStagingMacroBlockDraftSchema = z.object({
  id: z.string().min(1).optional(),
  header: z.string().trim().min(1).regex(UPPERCASE_TAG_REGEX, 'Macro-Block header must be uppercase alphanumeric'),
  kind: StagingMacroBlockKindSchema.optional(),
  format: z.literal('prose'),
  body: z.string(),
});

export const ProseStagingMacroBlockIRSchema = ProseStagingMacroBlockDraftSchema.extend({
  id: z.string().min(1),
  kind: StagingMacroBlockKindSchema,
});

export const KeyValueStagingMacroBlockDraftSchema = z.object({
  id: z.string().min(1).optional(),
  header: z.string().trim().min(1).regex(UPPERCASE_TAG_REGEX, 'Macro-Block header must be uppercase alphanumeric'),
  kind: z.literal('AESTHETIC').optional(),
  format: z.literal('key_value'),
  entries: z.array(AestheticEntryDraftSchema),
});

export const KeyValueStagingMacroBlockIRSchema = z.object({
  id: z.string().min(1),
  header: z.string().trim().min(1).regex(UPPERCASE_TAG_REGEX),
  kind: z.literal('AESTHETIC'),
  format: z.literal('key_value'),
  entries: z.array(AestheticEntryIRSchema),
});

export const StagingMacroBlockDraftSchema = z.discriminatedUnion('format', [
  ProseStagingMacroBlockDraftSchema,
  KeyValueStagingMacroBlockDraftSchema,
]);

export const StagingMacroBlockIRSchema = z.discriminatedUnion('format', [
  ProseStagingMacroBlockIRSchema,
  KeyValueStagingMacroBlockIRSchema,
]);

// ---------------------------------------------------------------------------
// Execution Sub-State Schemas (Phase 2: EXECUTION — v0.4.0 Inline Dimensions)
// ---------------------------------------------------------------------------

export const CameraSubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('camera'),
  subStateTag: z.literal('CAM'),
  identifier: z
    .string()
    .trim()
    .regex(CAMERA_IDENTIFIER_REGEX, 'Camera identifier must be numeric with optional letter suffix (e.g. "01", "02A")')
    .nullable(),
  content: z.string(),
});

export const CameraSubStateIRSchema = CameraSubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const ActionSubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('action'),
  subStateTag: z.literal('ACT'),
  content: z.string().trim().min(1),
});

export const ActionSubStateIRSchema = ActionSubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const BlockSubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('block'),
  subStateTag: z.literal('BLOCK'),
  content: z.string().trim().min(1),
});

export const BlockSubStateIRSchema = BlockSubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const LightSubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('light'),
  subStateTag: z.literal('LIGHT'),
  content: z.string().trim().min(1),
});

export const LightSubStateIRSchema = LightSubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const StateBoundarySubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('state_boundary'),
  subStateTag: z.enum(['STATE IN', 'STATE OUT']),
  content: z.string().trim().min(1),
});

export const StateBoundarySubStateIRSchema = StateBoundarySubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const Tier2SubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('tier2'),
  subStateTag: z
    .string()
    .trim()
    .min(1)
    .regex(UPPERCASE_TAG_REGEX, 'Sub-State Tag must be uppercase (e.g. "PROP", "FOCUS", "SPEED", "VFX")'),
  content: z.string(),
});

export const Tier2SubStateIRSchema = Tier2SubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const DialogueSubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('dialogue'),
  speaker: z.string().trim().min(1),
  language: z.string().trim().min(1).optional(),
  modifiers: z.string().trim().min(1).optional(),
  line: z.string().min(1),
});

export const DialogueSubStateIRSchema = DialogueSubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const FoleySubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('foley'),
  sound: z.string().trim().min(1),
});

export const FoleySubStateIRSchema = FoleySubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const ScoreSubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('score'),
  cue: z.string().trim().min(1),
});

export const ScoreSubStateIRSchema = ScoreSubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const OnScreenTextSubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('onscreen_text'),
  text: z.string().min(1),
});

export const OnScreenTextSubStateIRSchema = OnScreenTextSubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const PlainSubStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  dimension: z.literal('plain'),
  content: z.string().trim().min(1),
});

export const PlainSubStateIRSchema = PlainSubStateDraftSchema.extend({
  id: z.string().min(1),
});

export const SubStateDraftSchema = z.discriminatedUnion('dimension', [
  CameraSubStateDraftSchema,
  ActionSubStateDraftSchema,
  BlockSubStateDraftSchema,
  LightSubStateDraftSchema,
  StateBoundarySubStateDraftSchema,
  Tier2SubStateDraftSchema,
  DialogueSubStateDraftSchema,
  FoleySubStateDraftSchema,
  ScoreSubStateDraftSchema,
  OnScreenTextSubStateDraftSchema,
  PlainSubStateDraftSchema,
]);

export const SubStateIRSchema = z.discriminatedUnion('dimension', [
  CameraSubStateIRSchema,
  ActionSubStateIRSchema,
  BlockSubStateIRSchema,
  LightSubStateIRSchema,
  StateBoundarySubStateIRSchema,
  Tier2SubStateIRSchema,
  DialogueSubStateIRSchema,
  FoleySubStateIRSchema,
  ScoreSubStateIRSchema,
  OnScreenTextSubStateIRSchema,
  PlainSubStateIRSchema,
]);

// ---------------------------------------------------------------------------
// Execution Macro-State & Document IR Schemas
// ---------------------------------------------------------------------------

export const MacroStateDraftSchema = z.object({
  id: z.string().min(1).optional(),
  subStates: z.array(SubStateDraftSchema).min(1),
});

export const MacroStateIRSchema = z.object({
  id: z.string().min(1),
  subStates: z.array(SubStateIRSchema).min(1),
});

export const ExecutionHeaderSchema = z
  .string()
  .trim()
  .min(1)
  .regex(UPPERCASE_TAG_REGEX, 'Execution header must be uppercase (e.g. "EXECUTION", "TIMELINE", "BEATS", "SHOTLIST")');

export const ExecutionMacroBlockDraftSchema = z.object({
  header: ExecutionHeaderSchema.default('EXECUTION'),
  macroStates: z.array(MacroStateDraftSchema),
});

export const ExecutionMacroBlockIRSchema = z.object({
  header: ExecutionHeaderSchema,
  macroStates: z.array(MacroStateIRSchema),
});

export const AuteurScriptDraftSchema = z.object({
  schemaVersion: z.literal(AUTEUR_IR_SCHEMA_VERSION).default(AUTEUR_IR_SCHEMA_VERSION),
  preamble: z.array(z.string()).default([]),
  stagingMacroBlocks: z.array(StagingMacroBlockDraftSchema),
  executionMacroBlock: ExecutionMacroBlockDraftSchema.nullable(),
});

export const AuteurScriptIRSchema = z.object({
  schemaVersion: z.literal(AUTEUR_IR_SCHEMA_VERSION),
  preamble: z.array(z.string()),
  stagingMacroBlocks: z.array(StagingMacroBlockIRSchema),
  executionMacroBlock: ExecutionMacroBlockIRSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Derived Read-Only Context & Envelope Schemas
// ---------------------------------------------------------------------------

export const ReferenceBindingIRSchema = z.object({
  ref: z.string().min(1),
  name: z.string().min(1),
  voiceRef: z.string().min(1).optional(),
  sourceMacroBlockId: z.string().min(1),
  sourceMacroBlock: z.string().min(1),
});

export const TokenMappingIRSchema = z.object({
  token: z.string().min(1),
  description: z.string(),
  category: z.string().optional(),
  entryId: z.string().min(1).optional(),
});

export const CameraSlotIRSchema = z.object({
  subStateTag: z.literal('CAM'),
  identifier: z.string().min(1),
  establishedAt: z.string().min(1),
  initialFraming: z.string(),
});

export const MacroStateContinuityIRSchema = z.object({
  macroStateId: z.string().min(1),
  activeCameraIdentifier: z.string().nullable(),
  cameraTransition: CameraTransitionKindSchema,
  currentDescriptor: z.string(),
  effectiveFraming: z.string(),
  referencedTokens: z.array(z.string()),
});

export const DerivedDiagnosticIRSchema = z.object({
  id: z.string().min(1),
  ruleId: z.string().min(1),
  ruleName: z.string().min(1),
  lens: AuditLensSchema,
  severity: LintSeveritySchema,
  targetPhase: z.enum(['staging', 'execution']),
  targetId: z.string().min(1),
  message: z.string().min(1),
  repairHint: z.string().min(1),
  excerpt: z.string().optional(),
});

export const AuteurDerivedContextSchema = z.object({
  referenceBindings: z.array(ReferenceBindingIRSchema),
  tokenMappings: z.array(TokenMappingIRSchema),
  hasContinuationContext: z.boolean(),
  sceneTopology: SceneTopologySchema,
  cameraSlots: z.record(z.string(), CameraSlotIRSchema),
  macroStateContinuity: z.array(MacroStateContinuityIRSchema),
  diagnostics: z.array(DerivedDiagnosticIRSchema),
});

export const AuteurEnvelopeSchema = z.object({
  snapshotHash: z.string().min(1),
  document: AuteurScriptIRSchema,
  derived: AuteurDerivedContextSchema,
});

// ---------------------------------------------------------------------------
// Transactional Semantic Patch Schemas (Edit)
// ---------------------------------------------------------------------------

export const SetMacroBlockOpSchema = z
  .object({
    op: z.literal('set_macro_block'),
    macroBlockId: z.string().min(1).optional(),
    header: z.string().trim().min(1).optional(),
    body: z.string().optional(),
    entries: z.array(AestheticEntryDraftSchema).optional(),
  })
  .refine((val) => Boolean(val.macroBlockId || val.header), {
    message: 'set_macro_block requires either macroBlockId or header',
  })
  .refine((val) => val.body !== undefined || val.entries !== undefined, {
    message: 'set_macro_block requires either body (prose) or entries (key_value)',
  });

export const InsertMacroBlockOpSchema = z.object({
  op: z.literal('insert_macro_block'),
  afterMacroBlockId: z.string().min(1).nullable(),
  macroBlock: StagingMacroBlockDraftSchema,
});

export const DeleteMacroBlockOpSchema = z
  .object({
    op: z.literal('delete_macro_block'),
    macroBlockId: z.string().min(1).optional(),
    header: z.string().trim().min(1).optional(),
  })
  .refine((val) => Boolean(val.macroBlockId || val.header), {
    message: 'delete_macro_block requires either macroBlockId or header',
  });

export const SetAestheticEntryOpSchema = z
  .object({
    op: z.literal('set_aesthetic_entry'),
    entryId: z.string().min(1).optional(),
    key: z.string().trim().min(1).optional(),
    value: z.string(),
  })
  .refine((val) => Boolean(val.entryId || val.key), {
    message: 'set_aesthetic_entry requires either entryId or key',
  });

export const DeleteAestheticEntryOpSchema = z
  .object({
    op: z.literal('delete_aesthetic_entry'),
    entryId: z.string().min(1).optional(),
    key: z.string().trim().min(1).optional(),
  })
  .refine((val) => Boolean(val.entryId || val.key), {
    message: 'delete_aesthetic_entry requires either entryId or key',
  });

export const UpsertTokenMappingOpSchema = z.object({
  op: z.literal('upsert_token_mapping'),
  category: z.string().trim().min(1),
  description: z.string().trim().min(1),
  token: z.string().trim().regex(TOKEN_NAME_REGEX, 'Token must be alphanumeric/underscore/hyphen (e.g. "LOC01")'),
});

export const DeleteTokenMappingOpSchema = z.object({
  op: z.literal('delete_token_mapping'),
  token: z.string().trim().regex(TOKEN_NAME_REGEX),
});

export const ReplaceMacroStateOpSchema = z.object({
  op: z.literal('replace_macro_state'),
  macroStateId: z.string().min(1),
  subStates: z.array(SubStateDraftSchema).min(1),
});

export const InsertMacroStateOpSchema = z.object({
  op: z.literal('insert_macro_state'),
  afterMacroStateId: z.string().min(1).nullable(),
  subStates: z.array(SubStateDraftSchema).min(1),
});

export const DeleteMacroStateOpSchema = z.object({
  op: z.literal('delete_macro_state'),
  macroStateId: z.string().min(1),
});

export const ReorderMacroStatesOpSchema = z.object({
  op: z.literal('reorder_macro_states'),
  macroStateId: z.string().min(1),
  afterMacroStateId: z.string().min(1).nullable(),
});

export const ReplaceSubStateOpSchema = z.object({
  op: z.literal('replace_sub_state'),
  subStateId: z.string().min(1),
  subState: SubStateDraftSchema,
});

export const InsertSubStateOpSchema = z.object({
  op: z.literal('insert_sub_state'),
  macroStateId: z.string().min(1),
  afterSubStateId: z.string().min(1).nullable(),
  subState: SubStateDraftSchema,
});

export const DeleteSubStateOpSchema = z.object({
  op: z.literal('delete_sub_state'),
  subStateId: z.string().min(1),
});

export const AuteurPatchOpSchema = z.discriminatedUnion('op', [
  SetMacroBlockOpSchema,
  InsertMacroBlockOpSchema,
  DeleteMacroBlockOpSchema,
  SetAestheticEntryOpSchema,
  DeleteAestheticEntryOpSchema,
  UpsertTokenMappingOpSchema,
  DeleteTokenMappingOpSchema,
  ReplaceMacroStateOpSchema,
  InsertMacroStateOpSchema,
  DeleteMacroStateOpSchema,
  ReorderMacroStatesOpSchema,
  ReplaceSubStateOpSchema,
  InsertSubStateOpSchema,
  DeleteSubStateOpSchema,
]);

export const AuteurPatchSchema = z.object({
  expectedSnapshotHash: z.string().min(1).optional(),
  summary: z.string().optional(),
  ops: z.array(AuteurPatchOpSchema).min(1),
});

// ---------------------------------------------------------------------------
// Evaluator / Script Supervisor Review & Lens Slicer Schemas (Evaluate)
// ---------------------------------------------------------------------------

export const AuteurReviewIssueSchema = z.object({
  id: z.string().min(1).optional(),
  lens: AuditLensSchema,
  severity: LintSeveritySchema,
  targetLevel: z.enum(['document', 'macro_block', 'aesthetic_entry', 'macro_state', 'sub_state']),
  targetId: z.string().min(1),
  message: z.string().min(1),
  rationale: z.string().min(1),
  repairHint: z.string().min(1),
  suggestedPatch: AuteurPatchSchema.optional(),
});

export const AuteurReviewSchema = z.object({
  overallSummary: z.string().optional(),
  issues: z.array(AuteurReviewIssueSchema),
});

export const AuteurLensPresetIdSchema = z.enum([
  'lens1_spatial_optics',
  'lens2_temporal_pacing_wear',
  'lens3_props_inventory',
  'lens4_acoustics_voice',
  'lens5_blocks_grammar',
]);

export const LensSliceSpecSchema = z.object({
  preset: AuteurLensPresetIdSchema.optional(),
  macroBlocks: z.array(z.string().min(1)).optional(),
  aestheticKeys: z.array(z.string().min(1)).optional(),
  dimensions: z.array(SubStateDimensionSchema).optional(),
  subStateTags: z.array(z.string().min(1)).optional(),
  includeAllSubStates: z.boolean().optional(),
  includeResolvedCamera: z.boolean().optional(),
  includeTokenMappings: z.union([z.boolean(), z.enum(['all', 'referenced'])]).optional(),
  includeReferenceBindings: z.boolean().optional(),
  includeSceneTopology: z.boolean().optional(),
  includeTrailingResolution: z.boolean().optional(),
  diagnosticLenses: z.array(AuditLensSchema).optional(),
  includeAllDiagnostics: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript Types
// ---------------------------------------------------------------------------

export type SubStateDimension = z.infer<typeof SubStateDimensionSchema>;
export type SceneTopology = z.infer<typeof SceneTopologySchema>;

export type AestheticEntryDraft = z.infer<typeof AestheticEntryDraftSchema>;
export type AestheticEntryIR = z.infer<typeof AestheticEntryIRSchema>;
export type ProseStagingMacroBlockDraft = z.infer<typeof ProseStagingMacroBlockDraftSchema>;
export type ProseStagingMacroBlockIR = z.infer<typeof ProseStagingMacroBlockIRSchema>;
export type KeyValueStagingMacroBlockDraft = z.infer<typeof KeyValueStagingMacroBlockDraftSchema>;
export type KeyValueStagingMacroBlockIR = z.infer<typeof KeyValueStagingMacroBlockIRSchema>;
export type StagingMacroBlockDraft = z.infer<typeof StagingMacroBlockDraftSchema>;
export type StagingMacroBlockIR = z.infer<typeof StagingMacroBlockIRSchema>;

export type CameraSubStateIR = z.infer<typeof CameraSubStateIRSchema>;
export type SubStateDraft = z.infer<typeof SubStateDraftSchema>;
export type SubStateIR = z.infer<typeof SubStateIRSchema>;

export type MacroStateDraft = z.infer<typeof MacroStateDraftSchema>;
export type MacroStateIR = z.infer<typeof MacroStateIRSchema>;
export type ExecutionMacroBlockDraft = z.infer<typeof ExecutionMacroBlockDraftSchema>;
export type ExecutionMacroBlockIR = z.infer<typeof ExecutionMacroBlockIRSchema>;

export type AuteurScriptDraft = z.infer<typeof AuteurScriptDraftSchema>;
export type AuteurScriptIR = z.infer<typeof AuteurScriptIRSchema>;

export type ReferenceBindingIR = z.infer<typeof ReferenceBindingIRSchema>;
export type TokenMappingIR = z.infer<typeof TokenMappingIRSchema>;
export type CameraSlotIR = z.infer<typeof CameraSlotIRSchema>;
export type MacroStateContinuityIR = z.infer<typeof MacroStateContinuityIRSchema>;
export type DerivedDiagnosticIR = z.infer<typeof DerivedDiagnosticIRSchema>;
export type AuteurDerivedContext = z.infer<typeof AuteurDerivedContextSchema>;
export type AuteurEnvelope = z.infer<typeof AuteurEnvelopeSchema>;

export type AuteurPatchOp = z.infer<typeof AuteurPatchOpSchema>;
export type AuteurPatch = z.infer<typeof AuteurPatchSchema>;
export type AuteurReviewIssue = z.infer<typeof AuteurReviewIssueSchema>;
export type AuteurReview = z.infer<typeof AuteurReviewSchema>;
export type AuteurLensPresetId = z.infer<typeof AuteurLensPresetIdSchema>;
export type LensSliceSpec = z.infer<typeof LensSliceSpecSchema>;

// ---------------------------------------------------------------------------
// Standard JSON Schema Export Registry (LLM Structured Outputs & Tool Calls)
// ---------------------------------------------------------------------------

export interface AuteurJsonSchemaRegistry {
  draft: Record<string, unknown>;
  ir: Record<string, unknown>;
  envelope: Record<string, unknown>;
  patch: Record<string, unknown>;
  review: Record<string, unknown>;
}

export function getAuteurJsonSchemas(): AuteurJsonSchemaRegistry {
  return {
    draft: z.toJSONSchema(AuteurScriptDraftSchema) as Record<string, unknown>,
    ir: z.toJSONSchema(AuteurScriptIRSchema) as Record<string, unknown>,
    envelope: z.toJSONSchema(AuteurEnvelopeSchema) as Record<string, unknown>,
    patch: z.toJSONSchema(AuteurPatchSchema) as Record<string, unknown>,
    review: z.toJSONSchema(AuteurReviewSchema) as Record<string, unknown>,
  };
}
