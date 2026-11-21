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
export const AUTEUR_KNOWLEDGE_VERSION = '0.4.0-k2';

export type AssistantMode = 'refine' | 'check' | 'draft';
export type AssistantFocus = 'auto' | 'draft' | 'refine' | 'audit';
export type AskQuestionMode = 'off' | 'ask_first' | 'followup';

export type ScriptToolName =
  | 'get_script_overview'
  | 'inspect_lens_slice'
  | 'propose_script_patch'
  | 'propose_script_draft'
  | 'report_audit_review'
  | 'load_auteur_skill'
  | 'ask_question';

export type AuteurSkillCategory = 'workflow' | 'module';
export type SkillPinMode = 'auto' | 'pinned' | 'muted';
export type SkillResolutionStatus = 'active' | 'available' | 'muted';

export type SkillActivationReason =
  | 'pinned'
  | 'muted'
  | 'passive_empty_or_draft'
  | 'passive_continuation'
  | 'passive_token_mapping'
  | 'passive_character_reference'
  | 'on_demand';

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
  snapshotHash: string;
  changedSinceLastTurn: boolean;
  sceneTopology: SceneTopology;
  hasContinuationContext: boolean;
  stagingBlockCount: number;
  beatCount: number;
  referenceBindingCount: number;
  tokenMappingCount: number;
  diagnosticsSummary: {
    total: number;
    errors: number;
    warnings: number;
  };
  diagnostics: LiveEditorDiagnosticItem[];
}

export interface ComposedSystemSections {
  foundationalCraft: {
    text: string;
    isOverridden: boolean;
    editable: true;
  };
  liveEditorState: {
    text: string;
    editable: false;
  };
  sceneBrief: {
    text: string;
    isActive: boolean;
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
    editable: false;
  };
}

export interface ComposeAgentContextOptions {
  focus: AssistantFocus;
  rawText: string;
  ruleOverrides?: LintRuleOverrides;
  previousSnapshotHash?: string;
  foundationalCraftOverride?: string;
  skillOverrides?: Record<string, SkillOverride>;
  customSkills?: readonly CustomAuteurSkill[];
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
  allowedToolNames: ScriptToolName[];
  sections: ComposedSystemSections;
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
