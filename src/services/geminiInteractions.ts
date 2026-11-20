import {GoogleGenAI} from '@google/genai';
import type {LintRuleOverrides} from '../core/index.ts';
import type {GeminiModelId, ReasoningLevel} from '../ui/aiSettings.ts';
import {
  executeScriptToolCall,
  getSystemInstructionForMode,
  getToolDeclarationsForMode,
  type AssistantMode,
  type GeminiFunctionToolDeclaration,
  type ScriptToolExecutionResult,
  type StagedSuggestion,
} from './scriptTools.ts';

export const MAX_AGENT_TOOL_ROUNDS = 5;

export type GeminiErrorCode =
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'quota_exceeded'
  | 'model_not_found'
  | 'network_error'
  | 'aborted'
  | 'api_error';

export class GeminiServiceError extends Error {
  readonly code: GeminiErrorCode;
  readonly status?: number;
  readonly causeError?: unknown;

  constructor(code: GeminiErrorCode, message: string, options?: {status?: number; cause?: unknown}) {
    super(message);
    this.name = 'GeminiServiceError';
    this.code = code;
    this.status = options?.status;
    this.causeError = options?.cause;
  }
}

export interface AgentToolCallTrace {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  result: Record<string, unknown>;
  stagedSuggestionId?: string;
}

export interface AgentStreamCallbacks {
  onInteractionId?: (interactionId: string) => void;
  onThoughtSummaryDelta?: (deltaText: string) => void;
  onTextDelta?: (deltaText: string) => void;
  onToolCallStart?: (call: {callId: string; name: string; arguments: Record<string, unknown>}) => void;
  onToolCallResult?: (trace: AgentToolCallTrace) => void;
  onSuggestionStaged?: (suggestion: StagedSuggestion) => void;
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
  interaction?: {
    id?: string;
    status?: string;
    steps?: Array<Record<string, unknown>>;
    usage?: Record<string, unknown>;
  };
  step?: Record<string, unknown>;
  delta?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface RunAgentTurnOptions {
  apiKey: string;
  model: GeminiModelId;
  reasoningLevel: ReasoningLevel;
  mode: AssistantMode;
  prompt: string;
  rawText: string;
  ruleOverrides?: LintRuleOverrides;
  previousInteractionId?: string;
  signal?: AbortSignal;
  maxToolRounds?: number;
  callbacks?: AgentStreamCallbacks;
  createSuggestionId?: () => string;
  /** Optional DI hook for tests; defaults to `new GoogleGenAI({ apiKey })`. */
  createClient?: (apiKey: string) => InteractionsClientLike;
}

export interface RunAgentTurnResult {
  interactionId: string | null;
  text: string;
  thoughtSummary: string;
  toolRounds: number;
  hitToolRoundLimit: boolean;
  toolTraces: AgentToolCallTrace[];
  stagedSuggestions: StagedSuggestion[];
}

interface PendingFunctionCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface TrackedStreamingFunctionCall {
  id: string;
  name: string;
  initialArguments?: Record<string, unknown>;
  argumentsBuffer: string;
}

function defaultCreateClient(apiKey: string): InteractionsClientLike {
  return new GoogleGenAI({apiKey}) as unknown as InteractionsClientLike;
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!error || typeof error !== 'object') return false;
  const err = error as {name?: unknown; code?: unknown; message?: unknown};
  if (err.name === 'AbortError' || err.code === 'ABORT_ERR') return true;
  if (typeof err.message === 'string' && /aborted|abort/i.test(err.message)) return true;
  return false;
}

function extractHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as {status?: unknown; statusCode?: unknown; response?: {status?: unknown}};
  if (typeof err.status === 'number') return err.status;
  if (typeof err.statusCode === 'number') return err.statusCode;
  if (typeof err.response?.status === 'number') return err.response.status;
  return undefined;
}

function extractRawErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as {message?: unknown}).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Unknown Gemini API error.';
}

/**
 * Normalizes SDK, HTTP, SSE, network, and abort errors into clean user-facing GeminiServiceError instances.
 */
export function classifyGeminiError(error: unknown, signal?: AbortSignal): GeminiServiceError {
  if (error instanceof GeminiServiceError) {
    return error;
  }

  if (isAbortError(error, signal)) {
    return new GeminiServiceError('aborted', 'Request cancelled.', {cause: error});
  }

  const status = extractHttpStatus(error);
  const rawMessage = extractRawErrorMessage(error);
  const lower = rawMessage.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated')
  ) {
    return new GeminiServiceError(
      'invalid_api_key',
      'Your Gemini API key was rejected. Check or replace your key in AI Settings.',
      {status, cause: error}
    );
  }

  if (
    status === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    return new GeminiServiceError(
      'quota_exceeded',
      'Gemini API rate limit or quota exceeded. Wait a moment, switch to Gemini 4 Hydrogen, or check your billing tier.',
      {status, cause: error}
    );
  }

  if (status === 404 || lower.includes('not_found') || lower.includes('model not found')) {
    return new GeminiServiceError(
      'model_not_found',
      'The selected Gemini 4 model is unavailable for this API key. Try switching models in AI Settings.',
      {status, cause: error}
    );
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('err_network') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('load failed') ||
    (error instanceof TypeError && lower.includes('fetch'))
  ) {
    return new GeminiServiceError(
      'network_error',
      'Could not reach the Gemini API. Check your internet connection and try again.',
      {status, cause: error}
    );
  }

  return new GeminiServiceError(
    'api_error',
    rawMessage.trim().length > 0 ? rawMessage : 'Gemini Interactions request failed.',
    {status, cause: error}
  );
}

function parseJsonObjectSafe(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fallback to empty arguments; tool validator will return a structured self-repair error
  }
  return {};
}

function extractThoughtSummaryText(delta: Record<string, unknown>): string {
  const content = delta.content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const rec = content as Record<string, unknown>;
    if (rec.type === 'text' && typeof rec.text === 'string') {
      return rec.text;
    }
  }
  if (typeof delta.text === 'string') {
    return delta.text;
  }
  return '';
}

function extractFunctionCallsFromSteps(steps: Array<Record<string, unknown>> | undefined): PendingFunctionCall[] {
  if (!Array.isArray(steps)) return [];
  const calls: PendingFunctionCall[] = [];
  for (const step of steps) {
    if (step?.type === 'function_call' && typeof step.id === 'string' && typeof step.name === 'string') {
      const args =
        step.arguments && typeof step.arguments === 'object' && !Array.isArray(step.arguments)
          ? (step.arguments as Record<string, unknown>)
          : {};
      calls.push({
        id: step.id,
        name: step.name,
        arguments: args,
      });
    }
  }
  return calls;
}

function extractModelOutputTextFromSteps(steps: Array<Record<string, unknown>> | undefined): string {
  if (!Array.isArray(steps)) return '';
  let combined = '';
  for (const step of steps) {
    if (step?.type === 'model_output' && Array.isArray(step.content)) {
      for (const part of step.content as Array<Record<string, unknown>>) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          combined += part.text;
        }
      }
    }
  }
  return combined;
}

interface RoundStreamOutcome {
  interactionId: string | null;
  text: string;
  thoughtSummary: string;
  functionCalls: PendingFunctionCall[];
}

async function consumeInteractionStream(
  stream: AsyncIterable<InteractionStreamEventLike>,
  callbacks: AgentStreamCallbacks | undefined,
  signal: AbortSignal | undefined
): Promise<RoundStreamOutcome> {
  let interactionId: string | null = null;
  let streamedText = '';
  let streamedThought = '';
  const activeCallsByIndex = new Map<number, TrackedStreamingFunctionCall>();
  const collectedCalls: PendingFunctionCall[] = [];
  const seenCallIds = new Set<string>();
  let completedSteps: Array<Record<string, unknown>> | undefined;

  const registerCall = (call: PendingFunctionCall) => {
    if (!call.id || seenCallIds.has(call.id)) return;
    seenCallIds.add(call.id);
    collectedCalls.push(call);
  };

  for await (const event of stream) {
    if (signal?.aborted) {
      throw new GeminiServiceError('aborted', 'Request cancelled.');
    }

    switch (event.event_type) {
      case 'interaction.created': {
        if (typeof event.interaction?.id === 'string' && event.interaction.id.length > 0) {
          interactionId = event.interaction.id;
          callbacks?.onInteractionId?.(interactionId);
        }
        break;
      }

      case 'step.start': {
        const step = event.step;
        if (
          step?.type === 'function_call' &&
          typeof event.index === 'number' &&
          typeof step.id === 'string' &&
          typeof step.name === 'string'
        ) {
          const initialArgs =
            step.arguments && typeof step.arguments === 'object' && !Array.isArray(step.arguments)
              ? (step.arguments as Record<string, unknown>)
              : undefined;
          activeCallsByIndex.set(event.index, {
            id: step.id,
            name: step.name,
            initialArguments: initialArgs,
            argumentsBuffer: '',
          });
        }
        break;
      }

      case 'step.delta': {
        const delta = event.delta;
        if (!delta) break;

        if (delta.type === 'text' && typeof delta.text === 'string' && delta.text.length > 0) {
          streamedText += delta.text;
          callbacks?.onTextDelta?.(delta.text);
        } else if (delta.type === 'thought_summary') {
          const thoughtChunk = extractThoughtSummaryText(delta);
          if (thoughtChunk.length > 0) {
            streamedThought += thoughtChunk;
            callbacks?.onThoughtSummaryDelta?.(thoughtChunk);
          }
        } else if (
          delta.type === 'arguments_delta' &&
          typeof event.index === 'number' &&
          typeof delta.arguments === 'string'
        ) {
          const tracked = activeCallsByIndex.get(event.index);
          if (tracked) {
            tracked.argumentsBuffer += delta.arguments;
          }
        }
        break;
      }

      case 'step.stop': {
        if (typeof event.index === 'number') {
          const tracked = activeCallsByIndex.get(event.index);
          if (tracked) {
            const parsedArgs =
              tracked.argumentsBuffer.trim().length > 0
                ? parseJsonObjectSafe(tracked.argumentsBuffer)
                : tracked.initialArguments ?? {};
            registerCall({
              id: tracked.id,
              name: tracked.name,
              arguments: parsedArgs,
            });
            activeCallsByIndex.delete(event.index);
          }
        }
        break;
      }

      case 'interaction.completed': {
        if (typeof event.interaction?.id === 'string' && event.interaction.id.length > 0) {
          interactionId = event.interaction.id;
          callbacks?.onInteractionId?.(interactionId);
        }
        completedSteps = event.interaction?.steps;
        break;
      }

      case 'error': {
        const message = event.error?.message || 'Gemini interaction stream error.';
        const codeText = event.error?.code ? `${event.error.code}: ${message}` : message;
        throw classifyGeminiError(new Error(codeText), signal);
      }
    }
  }

  // Flush any function calls that started without an explicit step.stop
  for (const tracked of activeCallsByIndex.values()) {
    const parsedArgs =
      tracked.argumentsBuffer.trim().length > 0
        ? parseJsonObjectSafe(tracked.argumentsBuffer)
        : tracked.initialArguments ?? {};
    registerCall({
      id: tracked.id,
      name: tracked.name,
      arguments: parsedArgs,
    });
  }

  // Reconcile any function_call steps delivered on interaction.completed
  for (const stepCall of extractFunctionCallsFromSteps(completedSteps)) {
    registerCall(stepCall);
  }

  // If the interaction returned final text only in interaction.completed.steps, emit it once
  if (streamedText.length === 0 && completedSteps) {
    const fallbackText = extractModelOutputTextFromSteps(completedSteps);
    if (fallbackText.length > 0) {
      streamedText = fallbackText;
      callbacks?.onTextDelta?.(fallbackText);
    }
  }

  return {
    interactionId,
    text: streamedText,
    thoughtSummary: streamedThought,
    functionCalls: collectedCalls,
  };
}

/**
 * Streams a multi-turn Gemini Interactions API agent turn with mode-scoped local script tools.
 * Re-specifies `tools`, `system_instruction`, and `generation_config` on every call per the
 * Interactions API contract, chains `previous_interaction_id`, executes `function_call` steps
 * locally, and loops `function_result` payloads back up to `maxToolRounds` (default 5).
 */
export async function runGeminiAgentTurn(options: RunAgentTurnOptions): Promise<RunAgentTurnResult> {
  const apiKey = options.apiKey.trim();
  if (apiKey.length === 0) {
    throw new GeminiServiceError(
      'missing_api_key',
      'Add your Gemini API key in AI Settings to run the script assistant.'
    );
  }

  if (options.signal?.aborted) {
    throw new GeminiServiceError('aborted', 'Request cancelled.');
  }

  const maxToolRounds = Math.max(
    1,
    Math.min(options.maxToolRounds ?? MAX_AGENT_TOOL_ROUNDS, MAX_AGENT_TOOL_ROUNDS)
  );
  const clientFactory = options.createClient ?? defaultCreateClient;
  const client = clientFactory(apiKey);
  const tools: GeminiFunctionToolDeclaration[] = getToolDeclarationsForMode(options.mode);
  const systemInstruction = getSystemInstructionForMode(options.mode);

  let currentInteractionId: string | undefined = options.previousInteractionId;
  let nextInput: unknown = options.prompt;
  let accumulatedText = '';
  let accumulatedThought = '';
  let toolRounds = 0;
  let hitToolRoundLimit = false;
  const toolTraces: AgentToolCallTrace[] = [];
  const stagedSuggestions: StagedSuggestion[] = [];

  try {
    while (true) {
      if (options.signal?.aborted) {
        throw new GeminiServiceError('aborted', 'Request cancelled.');
      }

      const requestParams: Record<string, unknown> = {
        model: options.model,
        input: nextInput,
        system_instruction: systemInstruction,
        tools,
        generation_config: {
          thinking_level: options.reasoningLevel,
          thinking_summaries: 'auto',
        },
        stream: true,
      };

      if (currentInteractionId) {
        requestParams.previous_interaction_id = currentInteractionId;
      }

      const stream = await client.interactions.create(
        requestParams,
        options.signal ? {signal: options.signal} : undefined
      );

      const hasPriorText = accumulatedText.length > 0;
      const hasPriorThought = accumulatedThought.length > 0;
      let insertedTextBoundary = false;
      let insertedThoughtBoundary = false;

      const roundCallbacks: AgentStreamCallbacks | undefined = options.callbacks
        ? {
            ...options.callbacks,
            onTextDelta: options.callbacks.onTextDelta
              ? (deltaText: string) => {
                  if (hasPriorText && !insertedTextBoundary) {
                    insertedTextBoundary = true;
                    options.callbacks?.onTextDelta?.(`\n\n${deltaText}`);
                  } else {
                    options.callbacks?.onTextDelta?.(deltaText);
                  }
                }
              : undefined,
            onThoughtSummaryDelta: options.callbacks.onThoughtSummaryDelta
              ? (deltaText: string) => {
                  if (hasPriorThought && !insertedThoughtBoundary) {
                    insertedThoughtBoundary = true;
                    options.callbacks?.onThoughtSummaryDelta?.(`\n\n${deltaText}`);
                  } else {
                    options.callbacks?.onThoughtSummaryDelta?.(deltaText);
                  }
                }
              : undefined,
          }
        : undefined;

      const outcome = await consumeInteractionStream(stream, roundCallbacks, options.signal);

      if (outcome.interactionId) {
        currentInteractionId = outcome.interactionId;
      }
      if (outcome.text.length > 0) {
        accumulatedText = hasPriorText ? `${accumulatedText}\n\n${outcome.text}` : outcome.text;
      }
      if (outcome.thoughtSummary.length > 0) {
        accumulatedThought = hasPriorThought
          ? `${accumulatedThought}\n\n${outcome.thoughtSummary}`
          : outcome.thoughtSummary;
      }

      if (outcome.functionCalls.length === 0) {
        break;
      }

      if (toolRounds >= maxToolRounds) {
        hitToolRoundLimit = true;
        break;
      }

      toolRounds += 1;

      const functionResultSteps: Array<{
        type: 'function_result';
        name: string;
        call_id: string;
        result: Record<string, unknown>;
        is_error?: boolean;
      }> = [];

      for (const call of outcome.functionCalls) {
        if (options.signal?.aborted) {
          throw new GeminiServiceError('aborted', 'Request cancelled.');
        }

        options.callbacks?.onToolCallStart?.({
          callId: call.id,
          name: call.name,
          arguments: call.arguments,
        });

        const execResult: ScriptToolExecutionResult = executeScriptToolCall(
          {
            name: call.name,
            arguments: call.arguments,
          },
          {
            mode: options.mode,
            rawText: options.rawText,
            ruleOverrides: options.ruleOverrides,
            createSuggestionId: options.createSuggestionId,
            onStageSuggestion: (suggestion) => {
              stagedSuggestions.push(suggestion);
              options.callbacks?.onSuggestionStaged?.(suggestion);
            },
          }
        );

        const trace: AgentToolCallTrace = {
          callId: call.id,
          name: call.name,
          arguments: call.arguments,
          ok: execResult.ok,
          result: execResult.result,
          ...(execResult.stagedSuggestion ? {stagedSuggestionId: execResult.stagedSuggestion.id} : {}),
        };
        toolTraces.push(trace);
        options.callbacks?.onToolCallResult?.(trace);

        functionResultSteps.push({
          type: 'function_result',
          name: call.name,
          call_id: call.id,
          result: execResult.result,
          ...(execResult.ok ? {} : {is_error: true}),
        });
      }

      nextInput = functionResultSteps;
    }

    return {
      interactionId: currentInteractionId ?? null,
      text: accumulatedText,
      thoughtSummary: accumulatedThought,
      toolRounds,
      hitToolRoundLimit,
      toolTraces,
      stagedSuggestions,
    };
  } catch (err) {
    throw classifyGeminiError(err, options.signal);
  }
}
