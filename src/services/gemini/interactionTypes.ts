import type {LintRuleOverrides} from '../../core/index.ts';
import type {GeminiModelId, ReasoningLevel} from '../../ui/aiSettings.ts';
import type {
  AskQuestionMode,
  AssistantFocus,
  CustomAuteurSkill,
  ScriptToolName,
  ScriptToolOverride,
  SkillOverride,
} from '../auteurKnowledge.ts';
import type {AssistantMode, StagedSuggestion} from '../scriptTools.ts';

export const MAX_AGENT_TOOL_ROUNDS = 8;

export type GeminiErrorCode =
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'quota_exceeded'
  | 'model_not_found'
  | 'file_unavailable'
  | 'interaction_expired'
  | 'network_error'
  | 'aborted'
  | 'api_error';

export interface AgentTraceError {
  code: GeminiErrorCode;
  status?: number;
  message: string;
}

export interface AgentToolCallTrace {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  result: Record<string, unknown>;
  stagedSuggestionId?: string;
}

export interface AgentRoundRequestTrace {
  model: GeminiModelId;
  previous_interaction_id: string | null;
  generation_config: {
    thinking_level: ReasoningLevel;
    thinking_summaries: 'auto';
  };
  toolNames: string[];
  systemInstruction: string;
  input: unknown;
}

export interface InteractionFaultLike {
  code?: string;
  message?: string;
}

export interface AgentRoundTrace {
  /** 1-based round number within this turn. */
  roundIndex: number;
  durationMs: number;
  interactionId: string | null;
  status: string | null;
  faults?: InteractionFaultLike[];
  usage?: Record<string, unknown>;
  request: AgentRoundRequestTrace;
  toolCalls: AgentToolCallTrace[];
}

export interface AgentTurnTrace {
  model: GeminiModelId;
  reasoningLevel: ReasoningLevel;
  mode: AssistantMode;
  focus: AssistantFocus;
  activeSkillIds: string[];
  loadedSkillIds: string[];
  startedAt: string;
  durationMs: number;
  initialPreviousInteractionId: string | null;
  finalInteractionId: string | null;
  toolRounds: number;
  hitToolRoundLimit: boolean;
  usage?: Record<string, unknown>;
  error?: AgentTraceError;
  rounds: AgentRoundTrace[];
}

export interface AgentStreamCallbacks {
  onInteractionId?: (interactionId: string) => void;
  onThoughtSummaryDelta?: (deltaText: string) => void;
  onTextDelta?: (deltaText: string) => void;
  onToolCallStart?: (call: {callId: string; name: string; arguments: Record<string, unknown>}) => void;
  onToolCallResult?: (trace: AgentToolCallTrace) => void;
  onSuggestionStaged?: (suggestion: StagedSuggestion) => void;
  onSkillLoaded?: (event: {id: string; name: string; source: 'passive' | 'pinned' | 'tool'}) => void;
}

export interface InteractionsClientLike {
  interactions: {
    create(
      params: Record<string, unknown>,
      options?: {signal?: AbortSignal}
    ): Promise<AsyncIterable<InteractionStreamEventLike>>;
  };
}

/**
 * Minimal structural projection of @google/genai InteractionSSEEvent
 * to support strict typing and clean unit-test mocking.
 */
export interface InteractionStreamEventLike {
  event_type: string;
  index?: number;
  status?: string;
  interaction?: {
    id?: string;
    status?: string;
    steps?: Array<Record<string, unknown>>;
    usage?: Record<string, unknown>;
    faults?: InteractionFaultLike[];
  };
  step?: Record<string, unknown>;
  delta?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface AgentMediaAttachment {
  /** Whether this attachment originates from persistent Scene Brief (`'brief'`, default) or a per-turn composer message (`'message'`). */
  origin?: 'brief' | 'message';
  handle: string;
  label: string;
  note?: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  source: 'inline' | 'files_api' | 'youtube';
  mimeType: string;
  fileName?: string;
  inlineBase64?: string;
  inlineText?: string;
  uri?: string;
  processingMode?: 'static' | 'agentic';
  fingerprint: string;
}

export interface RunAgentTurnOptions {
  apiKey: string;
  model: GeminiModelId;
  reasoningLevel: ReasoningLevel;
  mode: AssistantMode;
  focus?: AssistantFocus;
  prompt: string;
  rawText: string;
  sceneTitle?: string;
  ruleOverrides?: LintRuleOverrides;
  previousInteractionId?: string;
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
  attachments?: readonly AgentMediaAttachment[];
  /** Optional `function_result` steps to resume a paused interaction turn directly via `previousInteractionId`. */
  resumeFunctionResults?: readonly PendingToolResultStep[];
  /** Optional local `<prior_session_recap>` preamble when bridging an expired chain or cross-script resume. */
  priorSessionRecap?: string;
  signal?: AbortSignal;
  maxToolRounds?: number;
  callbacks?: AgentStreamCallbacks;
  createSuggestionId?: () => string;
  /** Optional clock DI hook for deterministic trace timing in tests; defaults to `Date.now`. */
  now?: () => number;
  /** Optional DI hook for tests; defaults to `new GoogleGenAI({ apiKey })`. */
  createClient?: (apiKey: string) => InteractionsClientLike;
}

export interface PendingToolResultStep {
  type: 'function_result';
  name: string;
  call_id: string;
  result: Record<string, unknown>;
  is_error?: boolean;
}

export interface PendingQuestionPause {
  callId: string;
  suggestionId: string;
  interactionId: string;
  /** Sibling tool results from the same round that must still be submitted alongside the user's answer. */
  siblingFunctionResults: PendingToolResultStep[];
}

export interface RunAgentTurnResult {
  interactionId: string | null;
  text: string;
  thoughtSummary: string;
  toolRounds: number;
  hitToolRoundLimit: boolean;
  toolTraces: AgentToolCallTrace[];
  stagedSuggestions: StagedSuggestion[];
  /** Non-null when `ask_question` succeeded and paused the turn awaiting user input. */
  pendingQuestion?: PendingQuestionPause;
  trace: AgentTurnTrace;
}

export interface PendingFunctionCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface TrackedStreamingFunctionCall {
  id: string;
  name: string;
  initialArguments?: Record<string, unknown>;
  argumentsBuffer: string;
}

export interface RoundStreamOutcome {
  interactionId: string | null;
  status: string | null;
  faults?: InteractionFaultLike[];
  usage?: Record<string, unknown>;
  text: string;
  thoughtSummary: string;
  functionCalls: PendingFunctionCall[];
}
