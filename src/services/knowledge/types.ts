import type {
  AuditLens,
  AuteurLensPresetId,
  LintRuleOverrides,
  LintSeverity,
  SceneTopology,
} from '../../core/index.ts';

/**
 * Monotonic version tag for built-in Auteur craft defaults and skill bodies.
 * Future UI override persistence uses this to detect upstream knowledge updates.
 */
export const AUTEUR_KNOWLEDGE_VERSION = '0.4.0-k5';

export type AssistantMode = 'refine' | 'check' | 'draft';
export type AssistantFocus = 'auto' | 'draft' | 'refine' | 'audit';
export type AskQuestionMode = 'off' | 'ask_first' | 'followup';

export const SCRIPT_TOOL_NAMES = [
  'get_script_overview',
  'get_script_source',
  'inspect_lens_slice',
  'propose_script_patch',
  'propose_text_replace',
  'propose_script_draft',
  'propose_script_title',
  'report_audit_review',
  'ask_question',
  'load_auteur_skill',
] as const;

export type ScriptToolName = (typeof SCRIPT_TOOL_NAMES)[number];

export type ScriptToolCategory = 'inspect' | 'mutation' | 'audit' | 'workflow';
export type ToolActivationMode = 'auto' | 'enabled' | 'disabled';
export type ToolResolutionStatus = 'active' | 'inactive' | 'disabled';

export type ToolActivationReason =
  | 'auto_focus'
  | 'auto_ask_first'
  | 'auto_available_skills'
  | 'forced_on'
  | 'inactive_focus'
  | 'inactive_no_available_skills'
  | 'disabled_by_user';

export interface ScriptToolDefinition {
  name: ScriptToolName;
  label: string;
  category: ScriptToolCategory;
  defaultDescription: string;
  defaultProtocolGuidance: string;
}

export interface ScriptToolOverride {
  activationMode?: ToolActivationMode;
  descriptionOverride?: string;
  protocolGuidanceOverride?: string;
}

export interface ResolvedScriptTool {
  name: ScriptToolName;
  label: string;
  category: ScriptToolCategory;
  activationMode: ToolActivationMode;
  status: ToolResolutionStatus;
  reason: ToolActivationReason;
  description: string;
  defaultDescription: string;
  isDescriptionOverridden: boolean;
  protocolGuidance: string;
  defaultProtocolGuidance: string;
  isProtocolGuidanceOverridden: boolean;
}

export type AuteurSkillCategory = 'workflow' | 'module';
export type SkillPinMode = 'auto' | 'pinned' | 'muted';
export type SkillResolutionStatus = 'active' | 'available' | 'muted';

export type SkillActivationReason = 'pinned' | 'muted' | 'on_demand';

export interface AuteurSkillDefinition {
  id: string;
  name: string;
  category: AuteurSkillCategory;
  triggerHint: string;
  body: string;
  builtIn: true;
}

export interface CustomAuteurSkill {
  id: string;
  name: string;
  triggerHint: string;
  body: string;
}

export interface SkillOverride {
  pinMode?: SkillPinMode;
  bodyOverride?: string;
}

export interface ResolvedAuteurSkill {
  id: string;
  name: string;
  category: AuteurSkillCategory | 'custom';
  triggerHint: string;
  body: string;
  builtIn: boolean;
  pinMode: SkillPinMode;
  status: SkillResolutionStatus;
  reason: SkillActivationReason;
  isBodyOverridden: boolean;
}

export interface LensAuditChecklist {
  preset: AuteurLensPresetId;
  lens: AuditLens;
  topology: SceneTopology;
  topologyNote: string;
  suppressedChecks: string[];
  checks: string[];
}

export interface LiveEditorDiagnosticItem {
  id: string;
  ruleId: string;
  lens: AuditLens;
  severity: LintSeverity;
  targetId: string;
  message: string;
  repairHint: string;
}

export interface LiveEditorStateSummary {
  isEmpty: boolean;
  sceneTitle?: string;
  snapshotHash: string;
  changedSinceLastTurn: boolean;
  changedTargetIds?: string[];
  recentEditSummary?: string;
  sceneTopology: SceneTopology;
  hasContinuationContext: boolean;
  stagingBlockCount: number;
  beatCount: number;
  referenceBindingCount: number;
  tokenMappingCount: number;
  diagnosticsFingerprint: string;
  diagnosticsSummary: {
    total: number;
    errors: number;
    warnings: number;
  };
  diagnostics: LiveEditorDiagnosticItem[];
}

export type BriefContextDelivery = 'full' | 'updated' | 'cleared' | 'unchanged' | 'none';

export interface ComposedTurnContext {
  liveEditorStateMode: 'full' | 'unchanged';
  liveEditorStateText: string;
  briefDelivery: BriefContextDelivery;
  sceneBriefText: string;
  askDirectiveText: string;
  text: string;
}

export interface ComposedSystemSections {
  foundationalCraft: {
    text: string;
    isOverridden: boolean;
    editable: true;
  };
  liveEditorState: {
    text: string;
    mode: 'full' | 'unchanged';
    editable: false;
  };
  sceneBrief: {
    text: string;
    isActive: boolean;
    delivery: BriefContextDelivery;
    editable: false;
  };
  activeSkills: {
    text: string;
    skillIds: string[];
    editable: false;
  };
  skillDirectory: {
    text: string;
    skillIds: string[];
    editable: false;
  };
  toolProtocol: {
    text: string;
    isOverridden: boolean;
    editable: true;
  };
}

export interface ComposeAgentContextOptions {
  focus: AssistantFocus;
  rawText: string;
  sceneTitle?: string;
  ruleOverrides?: LintRuleOverrides;
  hasPreviousInteraction?: boolean;
  previousSnapshotHash?: string;
  previousRawText?: string;
  previousSceneTitle?: string;
  previousDiagnosticsFingerprint?: string;
  previousBriefContext?: string;
  foundationalCraftOverride?: string;
  skillOverrides?: Record<string, SkillOverride>;
  customSkills?: readonly CustomAuteurSkill[];
  toolProtocolOverride?: string;
  enforceToolLinterGate?: boolean;
  toolOverrides?: Partial<Record<ScriptToolName, ScriptToolOverride>>;
  referenceHandles?: readonly string[];
  briefContext?: string;
  askQuestionMode?: AskQuestionMode;
}

export interface ComposedAgentContext {
  knowledgeVersion: string;
  focus: AssistantFocus;
  editorState: LiveEditorStateSummary;
  resolvedSkills: ResolvedAuteurSkill[];
  activeSkills: ResolvedAuteurSkill[];
  availableSkills: ResolvedAuteurSkill[];
  mutedSkills: ResolvedAuteurSkill[];
  resolvedTools: ResolvedScriptTool[];
  allowedToolNames: ScriptToolName[];
  enforceToolLinterGate: boolean;
  sections: ComposedSystemSections;
  turnContext: ComposedTurnContext;
  systemInstruction: string;
}

/**
 * Maps legacy 3-tab AssistantMode values onto the unified AssistantFocus enum.
 */
export function assistantModeToFocus(mode: AssistantMode): AssistantFocus {
  switch (mode) {
    case 'check':
      return 'audit';
    case 'refine':
      return 'refine';
    case 'draft':
      return 'draft';
  }
}
