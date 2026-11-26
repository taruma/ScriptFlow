import type {AuteurLensPresetId} from '../../core/index.ts';
import type {AssistantFocus} from '../../services/auteurKnowledge.ts';
import type {QuickScanResult, QuickScanTrace} from '../../services/geminiDecisions.ts';
import type {AgentTurnTrace, GeminiErrorCode} from '../../services/geminiInteractions.ts';
import type {AssistantMode, StagedSuggestion} from '../../services/scriptTools.ts';

export type AiTargetScope =
  | {kind: 'whole'; key: 'whole'; label: string}
  | {kind: 'macro_block'; key: string; id: string; blockIndex: number; header: string; label: string}
  | {kind: 'macro_state'; key: string; id: string; beatIndex: number; preview: string; label: string};

export type AuditQuickCheckId = 'all' | AuteurLensPresetId;

export interface AuditQuickCheckOption {
  id: AuditQuickCheckId;
  preset?: AuteurLensPresetId;
}

export const AUDIT_QUICK_CHECKS: readonly AuditQuickCheckOption[] = [
  {id: 'all'},
  {id: 'lens1_spatial_optics', preset: 'lens1_spatial_optics'},
  {id: 'lens2_temporal_pacing_wear', preset: 'lens2_temporal_pacing_wear'},
  {id: 'lens3_props_inventory', preset: 'lens3_props_inventory'},
  {id: 'lens4_acoustics_voice', preset: 'lens4_acoustics_voice'},
  {id: 'lens5_blocks_grammar', preset: 'lens5_blocks_grammar'},
] as const;

export interface AiToolCallItem {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'running' | 'ok' | 'error' | 'stopped';
  stagedSuggestionId?: string;
}

export interface AiLoadedSkillItem {
  id: string;
  name: string;
  source: 'passive' | 'pinned' | 'tool';
}

export type ReferenceKind = 'text' | 'image' | 'video' | 'audio' | 'document';
export type ReferenceSourceKind = 'inline' | 'files_api' | 'youtube';
export type VideoProcessingMode = 'static' | 'agentic';

export interface ReferenceAttachment {
  source: ReferenceSourceKind;
  mimeType: string;
  fileName?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  inlineBase64?: string;
  previewUrl?: string;
  /** Optional session-local object URL for instant preview/playback of Files API uploads. */
  localMediaUrl?: string;
  inlineText?: string;
  uri?: string;
  filesApiName?: string;
  expirationTime?: string;
  processingMode?: VideoProcessingMode;
  fingerprint: string;
}

export interface ReferenceEntry {
  id: string;
  handle: string;
  kind: ReferenceKind;
  label: string;
  note?: string;
  attachment?: ReferenceAttachment;
  /** Lightweight text-only descriptor preserved when media attachments are stripped for history storage. */
  omittedAttachmentTag?: string;
}

export interface DraftBriefState {
  /** Whether populated Brief fields are actively injected into AI context across all modes. */
  enabled: boolean;
  references: ReferenceEntry[];
  specs: string;
  subtext: string;
}

export const EMPTY_DRAFT_BRIEF: DraftBriefState = {
  enabled: true,
  references: [],
  specs: '',
  subtext: '',
};

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  mode: AssistantMode;
  focus: AssistantFocus;
  text: string;
  scopeLabel?: string;
  briefSummary?: string;
  askFirst?: boolean;
  thoughtSummary?: string;
  toolCalls?: AiToolCallItem[];
  loadedSkills?: AiLoadedSkillItem[];
  suggestions?: StagedSuggestion[];
  dismissedSuggestionIds?: string[];
  appliedSuggestionIds?: string[];
  questionResponses?: Record<string, QuestionResponseRecord>;
  error?: {
    code: GeminiErrorCode;
    message: string;
  };
  trace?: AgentTurnTrace;
  quickScan?: QuickScanResult;
  quickScanTrace?: QuickScanTrace;
  quickScanDismissed?: boolean;
  quickScanErrorFallback?: boolean;
  isStreaming?: boolean;
  hitToolRoundLimit?: boolean;
  /** Non-null when this turn recovered via local recap after an expired chain or cross-script resume. */
  bridgedFromHistory?: 'expired_chain' | 'cross_script';
}

export type EditorJumpTarget =
  | {phase: 'staging'; blockIndex: number; domId: string}
  | {
      phase: 'execution';
      beatIndex: number;
      subStateIndex?: number;
      domId: string;
      fallbackDomId?: string;
    };

export const MIN_COMPOSER_HEIGHT = 56;
export const AUTO_GROW_MAX_COMPOSER_HEIGHT = 180;
export const MAX_COMPOSER_HEIGHT = 360;
export const STREAM_STICKY_BOTTOM_THRESHOLD_PX = 48;

export interface ToolCallTooltipInfo {
  title: string;
  toolName: string;
  statusLabel: string;
  detail?: string;
}

export interface QuestionAnswerDraft {
  selectedOptions: string[];
  comment: string;
}

export interface QuestionResponseRecord {
  status: 'answered' | 'skipped' | 'dismissed';
  answers: Record<string, QuestionAnswerDraft>;
}

export interface FormattedQuestionAnswers {
  promptText: string;
  displayText: string;
  answeredCount: number;
  totalCount: number;
}
