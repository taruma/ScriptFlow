import {GoogleGenAI} from '@google/genai';
import {
  assistantModeToFocus,
  composeAgentContext,
  type AssistantFocus,
} from './auteurKnowledge.ts';
import {classifyGeminiError, GeminiServiceError} from './gemini/errors.ts';
import {
  MAX_AGENT_TOOL_ROUNDS,
  type AgentRoundRequestTrace,
  type AgentRoundTrace,
  type AgentStreamCallbacks,
  type AgentToolCallTrace,
  type AgentTraceError,
  type AgentTurnTrace,
  type InteractionsClientLike,
  type InteractionStreamEventLike,
  type PendingFunctionCall,
  type RoundStreamOutcome,
  type RunAgentTurnOptions,
  type RunAgentTurnResult,
  type TrackedStreamingFunctionCall,
} from './gemini/interactionTypes.ts';
import {
  aggregateRoundUsage,
  buildInitialInteractionInput,
  extractFunctionCallsFromSteps,
  extractModelOutputTextFromSteps,
  extractThoughtSummaryText,
  parseJsonObjectSafe,
  redactSecret,
  sanitizeTraceInput,
} from './gemini/traceUtils.ts';
import {
  buildToolDeclarationsForContext,
  executeScriptToolCall,
  upsertStagedSuggestion,
  type GeminiFunctionToolDeclaration,
  type ScriptToolExecutionResult,
  type StagedSuggestion,
} from './scriptTools.ts';

export {
  MAX_AGENT_TOOL_ROUNDS,
  type AgentMediaAttachment,
  type AgentRoundRequestTrace,
  type AgentRoundTrace,
  type AgentStreamCallbacks,
  type AgentToolCallTrace,
  type AgentTraceError,
  type AgentTurnTrace,
  type InteractionsClientLike,
  type InteractionStreamEventLike,
  type RunAgentTurnOptions,
  type RunAgentTurnResult,
} from './gemini/interactionTypes.ts';
export {
  classifyGeminiError,
  GeminiServiceError,
  type GeminiErrorCode,
} from './gemini/errors.ts';
export {
  buildInitialInteractionInput,
  sanitizeTraceInput,
} from './gemini/traceUtils.ts';

function defaultCreateClient(apiKey: string): InteractionsClientLike {
  return new GoogleGenAI({apiKey}) as unknown as InteractionsClientLike;
}

async function consumeInteractionStream(
  stream: AsyncIterable<InteractionStreamEventLike>,
  callbacks: AgentStreamCallbacks | undefined,
  signal: AbortSignal | undefined
): Promise<RoundStreamOutcome> {
  let interactionId: string | null = null;
  let status: string | null = null;
  let usage: Record<string, unknown> | undefined;
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
        if (typeof event.interaction?.status === 'string' && event.interaction.status.length > 0) {
          status = event.interaction.status;
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
        if (typeof event.interaction?.status === 'string' && event.interaction.status.length > 0) {
          status = event.interaction.status;
        }
        if (
          event.interaction?.usage &&
          typeof event.interaction.usage === 'object' &&
          !Array.isArray(event.interaction.usage)
        ) {
          usage = {...event.interaction.usage};
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
    status,
    ...(usage ? {usage} : {}),
    text: streamedText,
    thoughtSummary: streamedThought,
    functionCalls: collectedCalls,
  };
}

/**
 * Streams a multi-turn Gemini Interactions API agent turn with intent-aware local script tools.
 * Composes Live Editor State, active/available skills, and dynamic tool schemas via
 * `composeAgentContext`, re-specifies `tools`, `system_instruction`, and `generation_config`
 * on every call per the Interactions API contract, chains `previous_interaction_id`, executes
 * `function_call` steps locally, and loops `function_result` payloads back up to `maxToolRounds` (default 8).
 */
export async function runGeminiAgentTurn(options: RunAgentTurnOptions): Promise<RunAgentTurnResult> {
  const getNow = options.now ?? Date.now;
  const turnStartMs = getNow();
  const startedAt = new Date(turnStartMs).toISOString();
  const initialPreviousInteractionId = options.previousInteractionId ?? null;
  const apiKey = options.apiKey.trim();
  const focus: AssistantFocus = options.focus ?? assistantModeToFocus(options.mode);

  let currentInteractionId: string | undefined = options.previousInteractionId;
  let toolRounds = 0;
  let hitToolRoundLimit = false;
  let activeSkillIds: string[] = [];
  const loadedSkillIds: string[] = [];
  const rounds: AgentRoundTrace[] = [];

  const buildTurnTrace = (error?: AgentTraceError): AgentTurnTrace => {
    const usage = aggregateRoundUsage(rounds);
    return {
      model: options.model,
      reasoningLevel: options.reasoningLevel,
      mode: options.mode,
      focus,
      activeSkillIds: [...activeSkillIds],
      loadedSkillIds: [...loadedSkillIds],
      startedAt,
      durationMs: Math.max(0, getNow() - turnStartMs),
      initialPreviousInteractionId,
      finalInteractionId: currentInteractionId ?? null,
      toolRounds,
      hitToolRoundLimit,
      ...(usage ? {usage} : {}),
      ...(error ? {error} : {}),
      rounds,
    };
  };

  if (apiKey.length === 0) {
    const message = 'Add your Gemini API key in AI Settings to run the script assistant.';
    throw new GeminiServiceError('missing_api_key', message, {
      trace: buildTurnTrace({code: 'missing_api_key', message}),
    });
  }

  if (options.signal?.aborted) {
    const message = 'Request cancelled.';
    throw new GeminiServiceError('aborted', message, {
      trace: buildTurnTrace({code: 'aborted', message}),
    });
  }

  const maxToolRounds = Math.max(
    1,
    Math.min(options.maxToolRounds ?? MAX_AGENT_TOOL_ROUNDS, MAX_AGENT_TOOL_ROUNDS)
  );
  const clientFactory = options.createClient ?? defaultCreateClient;
  const client = clientFactory(apiKey);
  const composedContext = composeAgentContext({
    focus,
    rawText: options.rawText,
    sceneTitle: options.sceneTitle,
    ruleOverrides: options.ruleOverrides,
    previousSnapshotHash: options.previousSnapshotHash,
    previousRawText: options.previousRawText,
    foundationalCraftOverride: options.foundationalCraftOverride,
    skillOverrides: options.skillOverrides,
    customSkills: options.customSkills,
    referenceHandles: options.referenceHandles,
    briefContext: options.briefContext,
    askQuestionMode: options.askQuestionMode,
  });

  activeSkillIds = composedContext.activeSkills.map((skill) => skill.id);
  for (const skill of composedContext.activeSkills) {
    options.callbacks?.onSkillLoaded?.({
      id: skill.id,
      name: skill.name,
      source: skill.reason === 'pinned' ? 'pinned' : 'passive',
    });
  }

  const tools: GeminiFunctionToolDeclaration[] = buildToolDeclarationsForContext(composedContext);
  const toolNames = tools.map((tool) => tool.name);
  const systemInstruction = composedContext.systemInstruction;

  let nextInput: unknown = buildInitialInteractionInput(options.prompt, options.attachments);
  let accumulatedText = '';
  let accumulatedThought = '';
  const toolTraces: AgentToolCallTrace[] = [];
  let stagedSuggestions: StagedSuggestion[] = [];
  let activeRound: AgentRoundTrace | null = null;
  let activeRoundStartMs = 0;

  try {
    while (true) {
      if (options.signal?.aborted) {
        throw new GeminiServiceError('aborted', 'Request cancelled.');
      }

      const generationConfig = {
        thinking_level: options.reasoningLevel,
        thinking_summaries: 'auto' as const,
      };

      const roundRequest: AgentRoundRequestTrace = {
        model: options.model,
        previous_interaction_id: currentInteractionId ?? null,
        generation_config: generationConfig,
        toolNames: [...toolNames],
        systemInstruction,
        input: sanitizeTraceInput(nextInput),
      };

      activeRoundStartMs = getNow();
      activeRound = {
        roundIndex: rounds.length + 1,
        durationMs: 0,
        interactionId: null,
        status: 'in_progress',
        request: roundRequest,
        toolCalls: [],
      };
      rounds.push(activeRound);

      const requestParams: Record<string, unknown> = {
        model: options.model,
        input: nextInput,
        system_instruction: systemInstruction,
        tools,
        generation_config: generationConfig,
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

      const roundCallbacks: AgentStreamCallbacks = {
        ...options.callbacks,
        onInteractionId: (interactionId: string) => {
          currentInteractionId = interactionId;
          if (activeRound) {
            activeRound.interactionId = interactionId;
          }
          options.callbacks?.onInteractionId?.(interactionId);
        },
        onTextDelta: options.callbacks?.onTextDelta
          ? (deltaText: string) => {
              if (hasPriorText && !insertedTextBoundary) {
                insertedTextBoundary = true;
                options.callbacks?.onTextDelta?.(`\n\n${deltaText}`);
              } else {
                options.callbacks?.onTextDelta?.(deltaText);
              }
            }
          : undefined,
        onThoughtSummaryDelta: options.callbacks?.onThoughtSummaryDelta
          ? (deltaText: string) => {
              if (hasPriorThought && !insertedThoughtBoundary) {
                insertedThoughtBoundary = true;
                options.callbacks?.onThoughtSummaryDelta?.(`\n\n${deltaText}`);
              } else {
                options.callbacks?.onThoughtSummaryDelta?.(deltaText);
              }
            }
          : undefined,
      };

      const outcome = await consumeInteractionStream(stream, roundCallbacks, options.signal);

      if (outcome.interactionId) {
        currentInteractionId = outcome.interactionId;
        activeRound.interactionId = outcome.interactionId;
      }
      activeRound.status = outcome.status ?? 'completed';
      if (outcome.usage) {
        activeRound.usage = outcome.usage;
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
        activeRound.durationMs = Math.max(0, getNow() - activeRoundStartMs);
        activeRound = null;
        break;
      }

      if (toolRounds >= maxToolRounds) {
        hitToolRoundLimit = true;
        activeRound.durationMs = Math.max(0, getNow() - activeRoundStartMs);
        activeRound = null;
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
            sceneTitle: options.sceneTitle,
            ruleOverrides: options.ruleOverrides,
            composedContext,
            createSuggestionId: options.createSuggestionId,
            onStageSuggestion: (suggestion) => {
              stagedSuggestions = upsertStagedSuggestion(stagedSuggestions, suggestion);
              options.callbacks?.onSuggestionStaged?.(suggestion);
            },
            onSkillLoaded: (event) => {
              if (!loadedSkillIds.includes(event.id)) {
                loadedSkillIds.push(event.id);
              }
              options.callbacks?.onSkillLoaded?.(event);
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
        activeRound.toolCalls.push(trace);
        options.callbacks?.onToolCallResult?.(trace);

        functionResultSteps.push({
          type: 'function_result',
          name: call.name,
          call_id: call.id,
          result: execResult.result,
          ...(execResult.ok ? {} : {is_error: true}),
        });
      }

      activeRound.durationMs = Math.max(0, getNow() - activeRoundStartMs);
      activeRound = null;
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
      trace: buildTurnTrace(),
    };
  } catch (err) {
    const classified = classifyGeminiError(err, options.signal);
    if (activeRound) {
      activeRound.durationMs = Math.max(0, getNow() - activeRoundStartMs);
      activeRound.status = classified.code === 'aborted' ? 'aborted' : 'error';
      activeRound = null;
    }
    const safeMessage = redactSecret(classified.message, apiKey);
    const traceError: AgentTraceError = {
      code: classified.code,
      ...(classified.status !== undefined ? {status: classified.status} : {}),
      message: safeMessage,
    };
    throw new GeminiServiceError(classified.code, safeMessage, {
      status: classified.status,
      cause: classified.causeError,
      trace: buildTurnTrace(traceError),
    });
  }
}
