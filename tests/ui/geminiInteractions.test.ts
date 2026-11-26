import {describe, expect, it} from 'vitest';
import {toAuteurEnvelope} from '../../src/core/index.ts';
import {
  classifyGeminiError,
  GeminiServiceError,
  MAX_AGENT_TOOL_ROUNDS,
  runGeminiAgentTurn,
  type InteractionStreamEventLike,
  type InteractionsClientLike,
} from '../../src/services/geminiInteractions.ts';
import {
  BUILTIN_SCRIPT_TOOLS,
} from '../../src/services/auteurKnowledge.ts';
import {
  MODE_TOOL_NAMES,
  type PatchSuggestion,
  type StagedSuggestion,
} from '../../src/services/scriptTools.ts';
import {asAsyncStream, SAMPLE_SCRIPT} from './aiTestFixtures.ts';
describe('geminiInteractions streaming agent client', () => {
  it('fails fast with missing_api_key when no BYOK key is configured', async () => {
    await expect(
      runGeminiAgentTurn({
        apiKey: '   ',
        model: 'gemini-4-hydrogen',
        reasoningLevel: 'medium',
        mode: 'refine',
        prompt: 'Tighten beat 1.',
        rawText: SAMPLE_SCRIPT,
      })
    ).rejects.toMatchObject({
      name: 'GeminiServiceError',
      code: 'missing_api_key',
    });
  });

  it('streams thought_summary and text, re-specifies tools/config per call, chains previous_interaction_id, and supports self-repair loops', async () => {
    const rawScript = [
      '[INTENT]',
      'Create a corridor beat with @image1 as Nadia.',
      '',
      '[OPENING]',
      'MS eye level. Frame-left, Nadia stands facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> [ACT] Nadia opens the door -> <latch click>',
    ].join('\n');
    const snapshotHash = toAuteurEnvelope(rawScript).snapshotHash;

    const capturedRequests: Array<Record<string, unknown>> = [];
    const roundStreams: InteractionStreamEventLike[][] = [
      // Round 1: model emits a thought summary and calls propose_script_patch with banned 'stage-left'
      [
        {event_type: 'interaction.created', interaction: {id: 'int-round-1', status: 'in_progress'}},
        {
          event_type: 'step.delta',
          index: 0,
          delta: {type: 'thought_summary', content: {type: 'text', text: 'Checking beat 1 blocking.'}},
        },
        {
          event_type: 'step.start',
          index: 1,
          step: {
            type: 'function_call',
            id: 'call-1',
            name: 'propose_script_patch',
            arguments: {
              expectedSnapshotHash: snapshotHash,
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.2',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Nadia steps stage-left through the door',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 1},
        {event_type: 'interaction.completed', interaction: {id: 'int-round-1', status: 'requires_action'}},
      ],
      // Round 2: model receives lint rejection + repairHint, self-repairs to frame-right
      [
        {event_type: 'interaction.created', interaction: {id: 'int-round-2', status: 'in_progress'}},
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-2',
            name: 'propose_script_patch',
            arguments: {},
          },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: {
            type: 'arguments_delta',
            arguments: JSON.stringify({
              expectedSnapshotHash: snapshotHash,
              summary: 'Move Nadia frame-right through the door',
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.2',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Nadia steps frame-right through the door',
                  },
                },
              ],
            }),
          },
        },
        {event_type: 'step.stop', index: 0},
        {event_type: 'interaction.completed', interaction: {id: 'int-round-2', status: 'requires_action'}},
      ],
      // Round 3: final assistant text
      [
        {event_type: 'interaction.created', interaction: {id: 'int-round-3', status: 'in_progress'}},
        {event_type: 'step.delta', index: 0, delta: {type: 'text', text: 'Staged a clean patch '}},
        {event_type: 'step.delta', index: 0, delta: {type: 'text', text: 'for Beat 1.'}},
        {event_type: 'interaction.completed', interaction: {id: 'int-round-3', status: 'completed'}},
      ],
    ];

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async (params) => {
          capturedRequests.push(params);
          const next = roundStreams.shift() ?? [];
          return asAsyncStream(next);
        },
      },
    };

    const thoughts: string[] = [];
    const texts: string[] = [];
    const staged: StagedSuggestion[] = [];

    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-carbon',
      reasoningLevel: 'high',
      mode: 'refine',
      prompt: 'Have Nadia step through the door.',
      rawText: rawScript,
      previousInteractionId: 'int-prior-turn',
      createClient: () => fakeClient,
      callbacks: {
        onThoughtSummaryDelta: (chunk) => thoughts.push(chunk),
        onTextDelta: (chunk) => texts.push(chunk),
        onSuggestionStaged: (s) => staged.push(s),
      },
    });

    expect(capturedRequests).toHaveLength(3);
    // Every call re-specifies tools, system_instruction, generation_config, and chains previous_interaction_id
    expect(capturedRequests[0].previous_interaction_id).toBe('int-prior-turn');
    expect(capturedRequests[1].previous_interaction_id).toBe('int-round-1');
    expect(capturedRequests[2].previous_interaction_id).toBe('int-round-2');

    for (const req of capturedRequests) {
      expect(req.model).toBe('gemini-4-carbon');
      expect(req.stream).toBe(true);
      expect(req.generation_config).toEqual({
        thinking_level: 'high',
        thinking_summaries: 'auto',
      });
      expect(typeof req.system_instruction).toBe('string');
      expect(Array.isArray(req.tools)).toBe(true);
    }

    // Round 2 input should contain function_result with is_error=true from round 1 lint rejection
    const round2Input = capturedRequests[1].input as Array<Record<string, unknown>>;
    expect(round2Input).toHaveLength(1);
    expect(round2Input[0].type).toBe('function_result');
    expect(round2Input[0].call_id).toBe('call-1');
    expect(round2Input[0].is_error).toBe(true);

    // Round 3 input should contain function_result with staged=true from round 2 repair
    const round3Input = capturedRequests[2].input as Array<Record<string, unknown>>;
    expect(round3Input[0].call_id).toBe('call-2');
    expect(round3Input[0].is_error).toBeUndefined();

    expect(thoughts.join('')).toBe('Checking beat 1 blocking.');
    expect(texts.join('')).toBe('Staged a clean patch for Beat 1.');
    expect(result.interactionId).toBe('int-round-3');
    expect(result.toolRounds).toBe(2);
    expect(result.hitToolRoundLimit).toBe(false);
    expect(result.toolTraces).toHaveLength(2);
    expect(result.toolTraces[0].ok).toBe(false);
    expect(result.toolTraces[1].ok).toBe(true);
    expect(staged).toHaveLength(1);
    expect((staged[0] as PatchSuggestion).candidateRawText).toContain('frame-right');
  });

  it('caps tool execution loops at MAX_AGENT_TOOL_ROUNDS (8) and honors maxToolRounds clamping', async () => {
    let counter = 0;
    const makeFakeClient = (): InteractionsClientLike => ({
      interactions: {
        create: async () => {
          counter += 1;
          return asAsyncStream([
            {event_type: 'interaction.created', interaction: {id: `int-${counter}`, status: 'in_progress'}},
            {
              event_type: 'step.start',
              index: 0,
              step: {
                type: 'function_call',
                id: `call-${counter}`,
                name: 'get_script_overview',
                arguments: {},
              },
            },
            {event_type: 'step.stop', index: 0},
            {event_type: 'interaction.completed', interaction: {id: `int-${counter}`, status: 'requires_action'}},
          ]);
        },
      },
    });

    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      mode: 'refine',
      prompt: 'Loop forever.',
      rawText: SAMPLE_SCRIPT,
      createClient: makeFakeClient,
    });

    expect(MAX_AGENT_TOOL_ROUNDS).toBe(8);
    expect(result.toolRounds).toBe(8);
    expect(result.hitToolRoundLimit).toBe(true);
    expect(counter).toBe(9); // Initial call + 8 function_result rounds

    // Explicit maxToolRounds override below cap clamps cleanly
    counter = 0;
    const clampedLow = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      mode: 'refine',
      prompt: 'Loop with cap 2.',
      rawText: SAMPLE_SCRIPT,
      maxToolRounds: 2,
      createClient: makeFakeClient,
    });
    expect(clampedLow.toolRounds).toBe(2);
    expect(clampedLow.hitToolRoundLimit).toBe(true);
    expect(counter).toBe(3);

    // Explicit maxToolRounds above MAX_AGENT_TOOL_ROUNDS clamps to MAX_AGENT_TOOL_ROUNDS (8)
    counter = 0;
    const clampedHigh = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      mode: 'refine',
      prompt: 'Loop with cap 99.',
      rawText: SAMPLE_SCRIPT,
      maxToolRounds: 99,
      createClient: makeFakeClient,
    });
    expect(clampedHigh.toolRounds).toBe(8);
    expect(clampedHigh.hitToolRoundLimit).toBe(true);
    expect(counter).toBe(9);
  });

  it('supports AbortSignal cancellation and classifies common API errors cleanly', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runGeminiAgentTurn({
        apiKey: 'AIza-valid-test',
        model: 'gemini-4-hydrogen',
        reasoningLevel: 'medium',
        mode: 'check',
        prompt: 'Audit this.',
        rawText: SAMPLE_SCRIPT,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({code: 'aborted'});

    expect(classifyGeminiError({status: 401, message: 'API_KEY_INVALID'}).code).toBe(
      'invalid_api_key'
    );
    expect(classifyGeminiError({status: 429, message: 'RESOURCE_EXHAUSTED'}).code).toBe(
      'quota_exceeded'
    );
    expect(classifyGeminiError({status: 404, message: 'NOT_FOUND'}).code).toBe('model_not_found');
    expect(classifyGeminiError(new TypeError('Failed to fetch')).code).toBe('network_error');
    const existing = new GeminiServiceError('missing_api_key', 'Missing key');
    expect(classifyGeminiError(existing)).toBe(existing);
  });

  it('inserts \\n\\n boundaries between multi-round thought summaries and assistant text in both callbacks and output', async () => {
    const roundStreams: InteractionStreamEventLike[][] = [
      // Round 1: emits thought + text + tool call
      [
        {event_type: 'interaction.created', interaction: {id: 'int-r1', status: 'in_progress'}},
        {
          event_type: 'step.delta',
          index: 0,
          delta: {type: 'thought_summary', content: {type: 'text', text: 'Inspecting overview.'}},
        },
        {
          event_type: 'step.delta',
          index: 1,
          delta: {type: 'text', text: 'Checking your script.'},
        },
        {
          event_type: 'step.start',
          index: 2,
          step: {
            type: 'function_call',
            id: 'call-overview',
            name: 'get_script_overview',
            arguments: {},
          },
        },
        {event_type: 'step.stop', index: 2},
        {event_type: 'interaction.completed', interaction: {id: 'int-r1', status: 'requires_action'}},
      ],
      // Round 2: emits another thought + multi-chunk final text
      [
        {event_type: 'interaction.created', interaction: {id: 'int-r2', status: 'in_progress'}},
        {
          event_type: 'step.delta',
          index: 0,
          delta: {type: 'thought_summary', content: {type: 'text', text: 'Overview looks clean.'}},
        },
        {
          event_type: 'step.delta',
          index: 1,
          delta: {type: 'text', text: 'Everything '},
        },
        {
          event_type: 'step.delta',
          index: 1,
          delta: {type: 'text', text: 'is ready.'},
        },
        {event_type: 'interaction.completed', interaction: {id: 'int-r2', status: 'completed'}},
      ],
    ];

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async () => asAsyncStream(roundStreams.shift() ?? []),
      },
    };

    const streamedThoughts: string[] = [];
    const streamedTexts: string[] = [];

    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-valid-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      mode: 'refine',
      prompt: 'Review overview.',
      rawText: SAMPLE_SCRIPT,
      createClient: () => fakeClient,
      callbacks: {
        onThoughtSummaryDelta: (delta) => streamedThoughts.push(delta),
        onTextDelta: (delta) => streamedTexts.push(delta),
      },
    });

    expect(result.thoughtSummary).toBe('Inspecting overview.\n\nOverview looks clean.');
    expect(streamedThoughts.join('')).toBe('Inspecting overview.\n\nOverview looks clean.');
    expect(result.text).toBe('Checking your script.\n\nEverything is ready.');
    expect(streamedTexts.join('')).toBe('Checking your script.\n\nEverything is ready.');
  });

  it('captures a sanitized multi-round AgentTurnTrace with usage, requests, tool loops, and never leaks apiKey', async () => {
    const secretKey = 'AIza-super-secret-trace-key-999';
    const rawScript = [
      '[INTENT]',
      'Create a corridor beat with @image1 as Nadia.',
      '',
      '[OPENING]',
      'MS eye level. Frame-left, Nadia stands facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> [ACT] Nadia opens the door -> <latch click>',
    ].join('\n');
    const snapshotHash = toAuteurEnvelope(rawScript).snapshotHash;

    let clockMs = Date.parse('2026-11-20T10:00:00.000Z');
    const tickNow = () => {
      clockMs += 25;
      return clockMs;
    };

    const roundStreams: InteractionStreamEventLike[][] = [
      [
        {event_type: 'interaction.created', interaction: {id: 'int-t1', status: 'in_progress'}},
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-bad',
            name: 'propose_script_patch',
            arguments: {
              expectedSnapshotHash: snapshotHash,
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.2',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Nadia crosses stage-left quickly',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 0},
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'int-t1',
            status: 'requires_action',
            usage: {total_input_tokens: 120, total_output_tokens: 45, total_tokens: 165},
          },
        },
      ],
      [
        {event_type: 'interaction.created', interaction: {id: 'int-t2', status: 'in_progress'}},
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-fixed',
            name: 'propose_script_patch',
            arguments: {
              expectedSnapshotHash: snapshotHash,
              summary: 'Shift Nadia frame-right',
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.2',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Nadia crosses frame-right quickly',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 0},
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'int-t2',
            status: 'requires_action',
            usage: {total_input_tokens: 210, total_output_tokens: 60, total_tokens: 270},
          },
        },
      ],
      [
        {event_type: 'interaction.created', interaction: {id: 'int-t3', status: 'in_progress'}},
        {event_type: 'step.delta', index: 0, delta: {type: 'text', text: 'Repaired and staged.'}},
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'int-t3',
            status: 'completed',
            usage: {total_input_tokens: 250, total_output_tokens: 20, total_tokens: 270},
          },
        },
      ],
    ];

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async () => asAsyncStream(roundStreams.shift() ?? []),
      },
    };

    const result = await runGeminiAgentTurn({
      apiKey: secretKey,
      model: 'gemini-4-neon',
      reasoningLevel: 'high',
      mode: 'refine',
      prompt: 'Have Nadia cross the room.',
      rawText: rawScript,
      previousInteractionId: 'int-prev-0',
      createSuggestionId: () => 'sugg-trace-1',
      now: tickNow,
      createClient: () => fakeClient,
    });

    const {trace} = result;
    expect(trace.model).toBe('gemini-4-neon');
    expect(trace.reasoningLevel).toBe('high');
    expect(trace.mode).toBe('refine');
    expect(trace.focus).toBe('refine');
    expect(trace.activeSkillIds).toEqual([]);
    expect(trace.loadedSkillIds).toEqual([]);
    expect(trace.startedAt).toBe('2026-11-20T10:00:00.025Z');
    expect(trace.durationMs).toBeGreaterThan(0);
    expect(trace.initialPreviousInteractionId).toBe('int-prev-0');
    expect(trace.finalInteractionId).toBe('int-t3');
    expect(trace.toolRounds).toBe(2);
    expect(trace.hitToolRoundLimit).toBe(false);
    expect(trace.error).toBeUndefined();
    expect(trace.usage).toEqual({
      total_input_tokens: 580,
      total_output_tokens: 125,
      total_tokens: 705,
    });

    expect(trace.rounds).toHaveLength(3);
    expect(trace.rounds[0].roundIndex).toBe(1);
    expect(trace.rounds[0].interactionId).toBe('int-t1');
    expect(trace.rounds[0].status).toBe('requires_action');
    expect(trace.rounds[0].request.previous_interaction_id).toBe('int-prev-0');
    expect(trace.rounds[0].request.toolNames).toEqual([
      ...MODE_TOOL_NAMES.refine,
      'ask_question',
      'load_auteur_skill',
    ]);
    expect(String(trace.rounds[0].request.input)).toContain('<live_editor_state>');
    expect(String(trace.rounds[0].request.input)).toContain('Have Nadia cross the room.');
    expect(trace.rounds[0].toolCalls).toHaveLength(1);
    expect(trace.rounds[0].toolCalls[0].ok).toBe(false);
    expect(typeof trace.rounds[0].toolCalls[0].result.repairHint).toBe('string');

    expect(trace.rounds[1].roundIndex).toBe(2);
    expect(trace.rounds[1].request.previous_interaction_id).toBe('int-t1');
    expect(trace.rounds[1].toolCalls).toHaveLength(1);
    expect(trace.rounds[1].toolCalls[0].ok).toBe(true);
    expect(trace.rounds[1].toolCalls[0].stagedSuggestionId).toBe('sugg-trace-1');

    expect(trace.rounds[2].roundIndex).toBe(3);
    expect(trace.rounds[2].request.previous_interaction_id).toBe('int-t2');
    expect(trace.rounds[2].status).toBe('completed');
    expect(trace.rounds[2].toolCalls).toHaveLength(0);

    const serialized = JSON.stringify(trace);
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain('apiKey');
  });

  it('attaches partial sanitized trace to GeminiServiceError on mid-turn failures and redacts apiKey', async () => {
    const secretKey = 'AIza-secret-error-key-42';
    let callCount = 0;

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async () => {
          callCount += 1;
          if (callCount === 1) {
            return asAsyncStream([
              {event_type: 'interaction.created', interaction: {id: 'int-ok-1', status: 'in_progress'}},
              {
                event_type: 'step.start',
                index: 0,
                step: {
                  type: 'function_call',
                  id: 'call-overview',
                  name: 'get_script_overview',
                  arguments: {},
                },
              },
              {event_type: 'step.stop', index: 0},
              {
                event_type: 'interaction.completed',
                interaction: {
                  id: 'int-ok-1',
                  status: 'requires_action',
                  usage: {total_input_tokens: 90, total_output_tokens: 15, total_tokens: 105},
                },
              },
            ]);
          }
          const upstreamErr = Object.assign(
            new Error(`Upstream gateway failed for key ${secretKey}`),
            {status: 503}
          );
          throw upstreamErr;
        },
      },
    };

    let caught: unknown;
    try {
      await runGeminiAgentTurn({
        apiKey: secretKey,
        model: 'gemini-4-carbon',
        reasoningLevel: 'medium',
        mode: 'check',
        prompt: 'Audit this scene.',
        rawText: SAMPLE_SCRIPT,
        createClient: () => fakeClient,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(GeminiServiceError);
    const serviceErr = caught as GeminiServiceError;
    expect(serviceErr.code).toBe('api_error');
    expect(serviceErr.status).toBe(503);
    expect(serviceErr.trace).toBeDefined();

    const trace = serviceErr.trace!;
    expect(trace.model).toBe('gemini-4-carbon');
    expect(trace.mode).toBe('check');
    expect(trace.toolRounds).toBe(1);
    expect(trace.finalInteractionId).toBe('int-ok-1');
    expect(trace.usage).toEqual({total_input_tokens: 90, total_output_tokens: 15, total_tokens: 105});
    expect(trace.error).toEqual({
      code: 'api_error',
      status: 503,
      message: 'Upstream gateway failed for key [REDACTED]',
    });
    expect(trace.rounds).toHaveLength(2);
    expect(trace.rounds[0].status).toBe('requires_action');
    expect(trace.rounds[0].toolCalls).toHaveLength(1);
    expect(trace.rounds[0].toolCalls[0].ok).toBe(true);
    expect(trace.rounds[1].status).toBe('error');
    expect(trace.rounds[1].request.previous_interaction_id).toBe('int-ok-1');

    const serialized = JSON.stringify(trace);
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain('apiKey');
  });

  it('omits tools from API request params when all function tools are disabled (pure conversation mode)', async () => {
    const capturedRequests: Array<Record<string, unknown>> = [];
    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async (params) => {
          capturedRequests.push(params);
          return asAsyncStream([
            {event_type: 'interaction.created', interaction: {id: 'int-chat-1', status: 'in_progress'}},
            {
              event_type: 'step.delta',
              index: 0,
              delta: {type: 'text', text: 'Pure prose brainstorming reply.'},
            },
            {event_type: 'interaction.completed', interaction: {id: 'int-chat-1', status: 'completed'}},
          ]);
        },
      },
    };

    const allDisabled = Object.fromEntries(
      BUILTIN_SCRIPT_TOOLS.map((tool) => [tool.name, {activationMode: 'disabled' as const}])
    );

    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-pure-chat-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      mode: 'refine',
      focus: 'auto',
      prompt: 'Let us brainstorm lighting moods only.',
      rawText: SAMPLE_SCRIPT,
      toolOverrides: allDisabled,
      createClient: () => fakeClient,
    });

    expect(result.text).toBe('Pure prose brainstorming reply.');
    expect(capturedRequests).toHaveLength(1);
    expect('tools' in capturedRequests[0]).toBe(false);
    expect(String(capturedRequests[0].system_instruction)).toContain('pure conversation mode');
    expect(result.trace.rounds[0].request.toolNames).toEqual([]);
  });

  it('keeps system_instruction and tools byte-for-byte identical between Turn 1 and Turn 2 across script edits, Brief changes, and Ask First toggles', async () => {
    const capturedRequests: Array<Record<string, unknown>> = [];
    let turnCounter = 0;
    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async (params) => {
          capturedRequests.push(params);
          turnCounter += 1;
          return asAsyncStream([
            {
              event_type: 'interaction.created',
              interaction: {id: `int-cache-${turnCounter}`, status: 'in_progress'},
            },
            {
              event_type: 'step.delta',
              index: 0,
              delta: {type: 'text', text: `Reply ${turnCounter}.`},
            },
            {
              event_type: 'interaction.completed',
              interaction: {id: `int-cache-${turnCounter}`, status: 'completed'},
            },
          ]);
        },
      },
    };

    const turn1 = await runGeminiAgentTurn({
      apiKey: 'AIza-cache-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      mode: 'draft',
      focus: 'auto',
      prompt: 'Ask clarifying questions before drafting.',
      rawText: '',
      briefContext: '### Format & Specs\nSingle take.',
      askQuestionMode: 'ask_first',
      createClient: () => fakeClient,
    });

    const editedScript = SAMPLE_SCRIPT.replace('WAIT', 'PAUSE');
    await runGeminiAgentTurn({
      apiKey: 'AIza-cache-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      mode: 'refine',
      focus: 'auto',
      prompt: 'Now apply the pacing edit.',
      rawText: editedScript,
      sceneTitle: 'Updated Scene',
      previousInteractionId: turn1.interactionId ?? undefined,
      previousSnapshotHash: toAuteurEnvelope('').snapshotHash,
      previousRawText: '',
      previousSceneTitle: '',
      previousBriefContext: '### Format & Specs\nSingle take.',
      briefContext: '### Format & Specs\nHandheld 35mm take.',
      askQuestionMode: 'off',
      createClient: () => fakeClient,
    });

    expect(capturedRequests).toHaveLength(2);
    expect(capturedRequests[1].system_instruction).toBe(capturedRequests[0].system_instruction);
    expect(JSON.stringify(capturedRequests[1].tools)).toBe(
      JSON.stringify(capturedRequests[0].tools)
    );
    expect(String(capturedRequests[0].input)).toContain('[Ask First: ON]');
    expect(String(capturedRequests[0].input)).toContain('<scene_brief>');
    expect(String(capturedRequests[1].input)).toContain('<live_editor_state>');
    expect(String(capturedRequests[1].input)).toContain('<scene_brief status="updated">');
    expect(String(capturedRequests[1].input)).not.toContain('[Ask First: ON]');
  });

  it('pauses immediately when ask_question succeeds (preserving sibling tool calls) and resumes directly via function_result', async () => {
    const capturedRequests: Array<Record<string, unknown>> = [];
    let callIndex = 0;

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async (params) => {
          capturedRequests.push(params);
          callIndex += 1;

          if (callIndex === 1) {
            return asAsyncStream([
              {
                event_type: 'interaction.created',
                interaction: {id: 'int-pause-1', status: 'in_progress'},
              },
              {
                event_type: 'step.start',
                index: 0,
                step: {
                  type: 'function_call',
                  id: 'call-skill-1',
                  name: 'load_auteur_skill',
                  arguments: {skillId: 'draft_interview'},
                },
              },
              {
                event_type: 'step.start',
                index: 1,
                step: {
                  type: 'function_call',
                  id: 'call-ask-1',
                  name: 'ask_question',
                  arguments: {
                    questions: [
                      {
                        question: 'Which camera style should anchor this scene?',
                        options: ['Single continuous take', 'Controlled shot-reverse-shot'],
                      },
                    ],
                  },
                },
              },
              {
                event_type: 'interaction.completed',
                interaction: {id: 'int-pause-1', status: 'completed'},
              },
            ]);
          }

          return asAsyncStream([
            {
              event_type: 'interaction.created',
              interaction: {id: 'int-resume-2', status: 'in_progress'},
            },
            {
              event_type: 'step.delta',
              index: 0,
              delta: {type: 'text', text: 'Proceeding with single continuous take.'},
            },
            {
              event_type: 'interaction.completed',
              interaction: {id: 'int-resume-2', status: 'completed'},
            },
          ]);
        },
      },
    };

    const pausedTurn = await runGeminiAgentTurn({
      apiKey: 'AIza-pause-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      mode: 'draft',
      focus: 'auto',
      prompt: 'Draft a tense train station farewell.',
      rawText: '',
      askQuestionMode: 'ask_first',
      createClient: () => fakeClient,
    });

    // Stopped immediately after Round 1 without issuing a Round 2 request
    expect(capturedRequests).toHaveLength(1);
    expect(pausedTurn.pendingQuestion).toBeDefined();
    expect(pausedTurn.pendingQuestion?.callId).toBe('call-ask-1');
    expect(pausedTurn.pendingQuestion?.interactionId).toBe('int-pause-1');
    expect(pausedTurn.pendingQuestion?.siblingFunctionResults).toHaveLength(1);
    expect(pausedTurn.pendingQuestion?.siblingFunctionResults[0].call_id).toBe('call-skill-1');
    expect(pausedTurn.stagedSuggestions).toHaveLength(1);

    const resumedTurn = await runGeminiAgentTurn({
      apiKey: 'AIza-pause-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      mode: 'draft',
      focus: 'auto',
      prompt: '',
      rawText: '',
      askQuestionMode: 'followup',
      previousInteractionId: pausedTurn.pendingQuestion!.interactionId,
      resumeFunctionResults: [
        ...pausedTurn.pendingQuestion!.siblingFunctionResults,
        {
          type: 'function_result',
          name: 'ask_question',
          call_id: pausedTurn.pendingQuestion!.callId,
          result: {ok: true, status: 'answered', answers: []},
        },
      ],
      createClient: () => fakeClient,
    });

    expect(capturedRequests).toHaveLength(2);
    expect(capturedRequests[1].previous_interaction_id).toBe('int-pause-1');
    const resumeInput = capturedRequests[1].input as Array<Record<string, unknown>>;
    expect(resumeInput).toHaveLength(2);
    expect(resumeInput[0].call_id).toBe('call-skill-1');
    expect(resumeInput[1].call_id).toBe('call-ask-1');
    expect(String((resumeInput[1].result as Record<string, unknown>).followUpContext)).toContain(
      '[Clarifying follow-up]'
    );
    expect(resumedTurn.text).toBe('Proceeding with single continuous take.');
  });

  it('classifies expired previous_interaction_id errors as interaction_expired without affecting model_not_found', () => {
    const expiredErr = classifyGeminiError(
      Object.assign(new Error('Interaction int-old-123 not found'), {status: 404}),
      undefined,
      {hadPreviousInteraction: true}
    );
    expect(expiredErr.code).toBe('interaction_expired');

    const modelErr = classifyGeminiError(
      Object.assign(new Error('Model gemini-4-carbon not found'), {status: 404}),
      undefined,
      {hadPreviousInteraction: true}
    );
    expect(modelErr.code).toBe('model_not_found');

    const plain404WithoutPrev = classifyGeminiError(
      Object.assign(new Error('Resource not found'), {status: 404}),
      undefined,
      {hadPreviousInteraction: false}
    );
    expect(plain404WithoutPrev.code).toBe('model_not_found');
  });

  it('prepends priorSessionRecap into Round 1 input while keeping Zone 1 system_instruction frozen', async () => {
    const capturedRequests: Array<Record<string, unknown>> = [];
    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async (params) => {
          capturedRequests.push(params);
          return asAsyncStream([
            {event_type: 'interaction.created', interaction: {id: 'int-recap-1', status: 'in_progress'}},
            {event_type: 'step.delta', index: 0, delta: {type: 'text', text: 'Bridged cleanly.'}},
            {event_type: 'interaction.completed', interaction: {id: 'int-recap-1', status: 'completed'}},
          ]);
        },
      },
    };

    const baseline = await runGeminiAgentTurn({
      apiKey: 'AIza-recap-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      mode: 'refine',
      focus: 'auto',
      prompt: 'Add rain',
      rawText: SAMPLE_SCRIPT,
      createClient: () => fakeClient,
    });

    const bridged = await runGeminiAgentTurn({
      apiKey: 'AIza-recap-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'low',
      mode: 'refine',
      focus: 'auto',
      prompt: 'Continue rain idea',
      rawText: SAMPLE_SCRIPT,
      priorSessionRecap: '<prior_session_recap>\nEarlier chat note.\n</prior_session_recap>',
      createClient: () => fakeClient,
    });

    expect(bridged.text).toBe('Bridged cleanly.');
    expect(baseline.trace.rounds[0].request.systemInstruction).toBe(
      bridged.trace.rounds[0].request.systemInstruction
    );
    expect(String(capturedRequests[1].input)).toContain('<prior_session_recap>');
    expect(String(capturedRequests[1].input)).toContain('Continue rain idea');
  });

  it('enforces read-before-write at round boundaries after manual edits even when the model knows the new snapshotHash', async () => {
    const priorScript = [
      '[INTENT]',
      'Create a corridor beat with @image1 as Nadia.',
      '',
      '[OPENING]',
      'MS eye level. Frame-left, Nadia stands facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> [ACT] Nadia opens the old wooden door -> <latch click>',
    ].join('\n');

    const manuallyEditedScript = [
      '[INTENT]',
      'Create a corridor beat with @image1 as Nadia.',
      '',
      '[OPENING]',
      'MS eye level. Frame-left, Nadia stands facing screen-right.',
      '',
      '[EXECUTION]',
      '[CAM 01] MS eye level -> [ACT] Nadia unlocks the steel hatch carefully -> <deadbolt slide>',
    ].join('\n');

    const priorHash = toAuteurEnvelope(priorScript).snapshotHash;
    const editedHash = toAuteurEnvelope(manuallyEditedScript).snapshotHash;
    const capturedRequests: Array<Record<string, unknown>> = [];

    const roundStreams: InteractionStreamEventLike[][] = [
      // Round 1: model calls get_script_overview + propose_script_patch directly with the new hash
      [
        {event_type: 'interaction.created', interaction: {id: 'int-rbw-1', status: 'in_progress'}},
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-overview-1',
            name: 'get_script_overview',
            arguments: {},
          },
        },
        {event_type: 'step.stop', index: 0},
        {
          event_type: 'step.start',
          index: 1,
          step: {
            type: 'function_call',
            id: 'call-patch-premature-1',
            name: 'propose_script_patch',
            arguments: {
              expectedSnapshotHash: editedHash,
              summary: 'Stale memory rewrite',
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.2',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Nadia opens the old wooden door quietly',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 1},
        {event_type: 'interaction.completed', interaction: {id: 'int-rbw-1', status: 'requires_action'}},
      ],
      // Round 2: model calls get_script_source AND tries to patch in the same parallel round
      [
        {event_type: 'interaction.created', interaction: {id: 'int-rbw-2', status: 'in_progress'}},
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-source-2',
            name: 'get_script_source',
            arguments: {targetIds: ['S1']},
          },
        },
        {event_type: 'step.stop', index: 0},
        {
          event_type: 'step.start',
          index: 1,
          step: {
            type: 'function_call',
            id: 'call-patch-parallel-2',
            name: 'propose_script_patch',
            arguments: {
              expectedSnapshotHash: editedHash,
              summary: 'Same-round parallel patch',
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.2',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Nadia opens the old wooden door quietly',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 1},
        {event_type: 'interaction.completed', interaction: {id: 'int-rbw-2', status: 'requires_action'}},
      ],
      // Round 3: after seeing fresh source, model patches while preserving the user's steel hatch edit
      [
        {event_type: 'interaction.created', interaction: {id: 'int-rbw-3', status: 'in_progress'}},
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-patch-clean-3',
            name: 'propose_script_patch',
            arguments: {
              expectedSnapshotHash: editedHash,
              summary: 'Tighten steel hatch action',
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.2',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Nadia unlocks the heavy steel hatch',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 0},
        {event_type: 'interaction.completed', interaction: {id: 'int-rbw-3', status: 'requires_action'}},
      ],
      // Round 4: final summary
      [
        {event_type: 'interaction.created', interaction: {id: 'int-rbw-4', status: 'in_progress'}},
        {
          event_type: 'step.delta',
          index: 0,
          delta: {type: 'text', text: 'Updated S1 after reading your latest edits.'},
        },
        {event_type: 'interaction.completed', interaction: {id: 'int-rbw-4', status: 'completed'}},
      ],
    ];

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async (params) => {
          capturedRequests.push(params);
          return asAsyncStream(roundStreams.shift() ?? []);
        },
      },
    };

    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-rbw-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      mode: 'refine',
      focus: 'auto',
      prompt: 'Tighten the action slightly.',
      rawText: manuallyEditedScript,
      previousInteractionId: 'int-before-edit',
      previousSnapshotHash: priorHash,
      previousRawText: priorScript,
      createClient: () => fakeClient,
    });

    expect(capturedRequests).toHaveLength(4);
    expect(result.toolTraces).toHaveLength(5);
    // Round 1: overview succeeds, premature patch fails with STALE_CONTEXT_READ_REQUIRED
    expect(result.toolTraces[0].name).toBe('get_script_overview');
    expect(result.toolTraces[0].ok).toBe(true);
    expect(result.toolTraces[1].name).toBe('propose_script_patch');
    expect(result.toolTraces[1].ok).toBe(false);
    expect((result.toolTraces[1].result.errors as Array<{code: string}>)[0]?.code).toBe(
      'STALE_CONTEXT_READ_REQUIRED'
    );
    // Round 2: get_script_source returns manual edit, same-round parallel patch still blocked
    expect(result.toolTraces[2].name).toBe('get_script_source');
    expect(result.toolTraces[2].ok).toBe(true);
    expect(String(result.toolTraces[2].result.sourceText)).toContain('steel hatch');
    expect(result.toolTraces[3].name).toBe('propose_script_patch');
    expect(result.toolTraces[3].ok).toBe(false);
    expect((result.toolTraces[3].result.errors as Array<{code: string}>)[0]?.code).toBe(
      'STALE_CONTEXT_READ_REQUIRED'
    );
    // Round 3: patch succeeds and preserves user's manual edits (<deadbolt slide>)
    expect(result.toolTraces[4].name).toBe('propose_script_patch');
    expect(result.toolTraces[4].ok).toBe(true);
    expect(result.stagedSuggestions).toHaveLength(1);
    const stagedPatch = result.stagedSuggestions[0] as PatchSuggestion;
    expect(stagedPatch.candidateRawText).toContain('heavy steel hatch');
    expect(stagedPatch.candidateRawText).toContain('<deadbolt slide>');
  });

  it('requires a fresh read before patching when a turn is seeded by priorSessionRecap on a non-empty script', async () => {
    const scriptHash = toAuteurEnvelope(SAMPLE_SCRIPT).snapshotHash;
    const roundStreams: InteractionStreamEventLike[][] = [
      // Round 1: premature patch without reading
      [
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-recap-patch-1',
            name: 'propose_script_patch',
            arguments: {
              expectedSnapshotHash: scriptHash,
              summary: 'Premature recap patch',
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.2',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Miller leans forward across the metal desk',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 0},
        {event_type: 'interaction.completed', interaction: {id: 'int-recap-r1', status: 'requires_action'}},
      ],
      // Round 2: read full script source
      [
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-recap-source-2',
            name: 'get_script_source',
            arguments: {},
          },
        },
        {event_type: 'step.stop', index: 0},
        {event_type: 'interaction.completed', interaction: {id: 'int-recap-r2', status: 'requires_action'}},
      ],
      // Round 3: patch succeeds
      [
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call-recap-patch-3',
            name: 'propose_script_patch',
            arguments: {
              expectedSnapshotHash: scriptHash,
              summary: 'Adjust S1 action after read',
              ops: [
                {
                  op: 'replace_sub_state',
                  subStateId: 'S1.2',
                  subState: {
                    dimension: 'action',
                    subStateTag: 'ACT',
                    content: 'Miller leans forward across the metal desk',
                  },
                },
              ],
            },
          },
        },
        {event_type: 'step.stop', index: 0},
        {event_type: 'interaction.completed', interaction: {id: 'int-recap-r3', status: 'requires_action'}},
      ],
      // Round 4: final text
      [
        {event_type: 'step.delta', index: 0, delta: {type: 'text', text: 'Done.'}},
        {event_type: 'interaction.completed', interaction: {id: 'int-recap-r4', status: 'completed'}},
      ],
    ];

    const fakeClient: InteractionsClientLike = {
      interactions: {
        create: async () => asAsyncStream(roundStreams.shift() ?? []),
      },
    };

    const result = await runGeminiAgentTurn({
      apiKey: 'AIza-recap-rbw-test',
      model: 'gemini-4-hydrogen',
      reasoningLevel: 'medium',
      mode: 'refine',
      focus: 'auto',
      prompt: 'Adjust Miller action.',
      rawText: SAMPLE_SCRIPT,
      priorSessionRecap: '<prior_session_recap>\nEarlier session summary.\n</prior_session_recap>',
      createClient: () => fakeClient,
    });

    expect(result.toolTraces[0].ok).toBe(false);
    expect((result.toolTraces[0].result.errors as Array<{code: string}>)[0]?.code).toBe(
      'STALE_CONTEXT_READ_REQUIRED'
    );
    expect(result.toolTraces[1].name).toBe('get_script_source');
    expect(result.toolTraces[1].ok).toBe(true);
    expect(result.toolTraces[2].name).toBe('propose_script_patch');
    expect(result.toolTraces[2].ok).toBe(true);
    expect(result.stagedSuggestions).toHaveLength(1);
  });
});
