import type {AgentTurnTrace} from '../services/geminiInteractions.ts';
import type {GeminiModelId} from './aiSettings.ts';

/**
 * Timestamp (UTC) when `gemini-4-carbon` introductory promotional pricing ends
 * and standard pricing takes effect (2026-12-01T00:00:00.000Z).
 */
export const GEMINI_4_CARBON_PROMO_END_MS = Date.UTC(2026, 11, 1, 0, 0, 0, 0);

const TOKENS_PER_MILLION = 1_000_000;

export interface GeminiModelPricing {
  model: GeminiModelId;
  /** Non-cached input token price in USD per 1,000,000 tokens. */
  inputPer1M: number;
  /** Context-cached input token price in USD per 1,000,000 tokens. */
  cachedInputPer1M: number;
  /** Output and thinking token price in USD per 1,000,000 tokens. */
  outputPer1M: number;
  /** True when a time-bounded promotional rate is currently active. */
  isPromoRate: boolean;
}

export interface ParsedTokenUsage {
  /** Total prompt/input tokens reported by the API (including cached tokens). */
  inputTokens: number;
  /** Prompt tokens served from context cache. */
  cachedTokens: number;
  /** Non-cached prompt tokens (`max(0, inputTokens - cachedTokens)`). */
  nonCachedInputTokens: number;
  /** Server-side tool-use prompt tokens when reported separately. */
  toolUseTokens: number;
  /** Generated response tokens (excluding thinking tokens). */
  outputTokens: number;
  /** Reasoning / thought tokens (billed at output rate). */
  thoughtTokens: number;
  /** Total output-rate billable tokens (`outputTokens + thoughtTokens`). */
  billableOutputTokens: number;
  /** Total tokens across the interaction. */
  totalTokens: number;
}

export interface TurnCostEstimate {
  model: GeminiModelId;
  rates: GeminiModelPricing;
  usage: ParsedTokenUsage;
  inputCostUsd: number;
  cachedCostUsd: number;
  outputCostUsd: number;
  thoughtCostUsd: number;
  totalCostUsd: number;
}

export interface SessionCostSummary {
  turnCount: number;
  totalCostUsd: number;
  inputCostUsd: number;
  cachedCostUsd: number;
  outputCostUsd: number;
  thoughtCostUsd: number;
  inputTokens: number;
  cachedTokens: number;
  nonCachedInputTokens: number;
  toolUseTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
}

/**
 * Returns the USD-per-1M-tokens pricing schedule for a supported Gemini model.
 * Accepts an injectable `nowMs` timestamp for deterministic evaluation and tests.
 */
export function getGeminiModelPricing(
  model: GeminiModelId,
  nowMs: number = Date.now()
): GeminiModelPricing {
  switch (model) {
    case 'gemini-3.5-flash-lite':
      return {
        model,
        inputPer1M: 0.3,
        cachedInputPer1M: 0.03,
        outputPer1M: 2.5,
        isPromoRate: false,
      };
    case 'gemini-4-hydrogen':
      return {
        model,
        inputPer1M: 1.5,
        cachedInputPer1M: 0.075,
        outputPer1M: 7.5,
        isPromoRate: false,
      };
    case 'gemini-4-neon':
      return {
        model,
        inputPer1M: 3.0,
        cachedInputPer1M: 0.15,
        outputPer1M: 15.0,
        isPromoRate: false,
      };
    case 'gemini-4-carbon': {
      const isPromo = nowMs < GEMINI_4_CARBON_PROMO_END_MS;
      return isPromo
        ? {
            model,
            inputPer1M: 2.0,
            cachedInputPer1M: 0.1,
            outputPer1M: 10.0,
            isPromoRate: true,
          }
        : {
            model,
            inputPer1M: 4.0,
            cachedInputPer1M: 0.2,
            outputPer1M: 20.0,
            isPromoRate: false,
          };
    }
  }
}

function readNonNegativeTokenField(
  usage: Record<string, unknown>,
  keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const raw = usage[key];
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      return raw;
    }
  }
  return undefined;
}

/**
 * Normalizes Gemini Interactions API `usage` telemetry into clean token buckets.
 * Returns `null` when no recognized numeric token fields are present.
 */
export function parseInteractionUsage(
  usage: Record<string, unknown> | undefined
): ParsedTokenUsage | null {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return null;
  }

  const rawInput = readNonNegativeTokenField(usage, ['total_input_tokens', 'input_tokens']);
  const rawCached = readNonNegativeTokenField(usage, ['total_cached_tokens', 'cached_tokens']);
  const rawToolUse = readNonNegativeTokenField(usage, ['total_tool_use_tokens', 'tool_use_tokens']);
  const rawOutput = readNonNegativeTokenField(usage, ['total_output_tokens', 'output_tokens']);
  const rawThought = readNonNegativeTokenField(usage, ['total_thought_tokens', 'thought_tokens']);
  const rawTotal = readNonNegativeTokenField(usage, ['total_tokens']);

  const hasAnyTokenField =
    rawInput !== undefined ||
    rawCached !== undefined ||
    rawToolUse !== undefined ||
    rawOutput !== undefined ||
    rawThought !== undefined ||
    rawTotal !== undefined;

  if (!hasAnyTokenField) {
    return null;
  }

  const inputTokens = rawInput ?? 0;
  const cachedTokens =
    rawCached !== undefined ? Math.min(rawCached, inputTokens > 0 ? inputTokens : rawCached) : 0;
  const nonCachedInputTokens = Math.max(0, inputTokens - cachedTokens);
  const toolUseTokens = rawToolUse ?? 0;
  const outputTokens = rawOutput ?? 0;
  const thoughtTokens = rawThought ?? 0;
  const billableOutputTokens = outputTokens + thoughtTokens;
  const computedTotal = inputTokens + toolUseTokens + outputTokens + thoughtTokens;
  const totalTokens = rawTotal !== undefined && rawTotal > 0 ? rawTotal : computedTotal;

  return {
    inputTokens,
    cachedTokens,
    nonCachedInputTokens,
    toolUseTokens,
    outputTokens,
    thoughtTokens,
    billableOutputTokens,
    totalTokens,
  };
}

/**
 * Estimates the USD cost of a single Gemini Interactions API turn from its
 * aggregated usage metadata and model rate card.
 */
export function estimateTurnCost(
  model: GeminiModelId,
  usage: Record<string, unknown> | undefined,
  nowMs: number = Date.now()
): TurnCostEstimate | null {
  const parsed = parseInteractionUsage(usage);
  if (!parsed) return null;

  const rates = getGeminiModelPricing(model, nowMs);
  const inputCostUsd =
    ((parsed.nonCachedInputTokens + parsed.toolUseTokens) * rates.inputPer1M) / TOKENS_PER_MILLION;
  const cachedCostUsd = (parsed.cachedTokens * rates.cachedInputPer1M) / TOKENS_PER_MILLION;
  const outputCostUsd = (parsed.outputTokens * rates.outputPer1M) / TOKENS_PER_MILLION;
  const thoughtCostUsd = (parsed.thoughtTokens * rates.outputPer1M) / TOKENS_PER_MILLION;
  const totalCostUsd = inputCostUsd + cachedCostUsd + outputCostUsd + thoughtCostUsd;

  return {
    model,
    rates,
    usage: parsed,
    inputCostUsd,
    cachedCostUsd,
    outputCostUsd,
    thoughtCostUsd,
    totalCostUsd,
  };
}

/**
 * Estimates the USD cost of a recorded `AgentTurnTrace`, anchoring date-sensitive
 * promotional pricing to `trace.startedAt` when valid.
 */
export function estimateTraceCost(
  trace: Pick<AgentTurnTrace, 'model' | 'usage' | 'startedAt'> | undefined,
  fallbackNowMs: number = Date.now()
): TurnCostEstimate | null {
  if (!trace || !trace.usage) return null;
  const parsedStartedAt = trace.startedAt ? Date.parse(trace.startedAt) : Number.NaN;
  const effectiveNowMs = Number.isFinite(parsedStartedAt) ? parsedStartedAt : fallbackNowMs;
  return estimateTurnCost(trace.model, trace.usage, effectiveNowMs);
}

/**
 * Aggregates cumulative estimated USD cost and token totals across all assistant
 * turns with usage telemetry in the active chat thread.
 */
export function aggregateSessionCost(
  messages: ReadonlyArray<{
    role: string;
    trace?: Pick<AgentTurnTrace, 'model' | 'usage' | 'startedAt'>;
  }>,
  fallbackNowMs: number = Date.now()
): SessionCostSummary {
  let turnCount = 0;
  let totalCostUsd = 0;
  let inputCostUsd = 0;
  let cachedCostUsd = 0;
  let outputCostUsd = 0;
  let thoughtCostUsd = 0;
  let inputTokens = 0;
  let cachedTokens = 0;
  let nonCachedInputTokens = 0;
  let toolUseTokens = 0;
  let outputTokens = 0;
  let thoughtTokens = 0;
  let totalTokens = 0;

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.trace) continue;
    const estimate = estimateTraceCost(msg.trace, fallbackNowMs);
    if (!estimate) continue;
    turnCount += 1;
    totalCostUsd += estimate.totalCostUsd;
    inputCostUsd += estimate.inputCostUsd;
    cachedCostUsd += estimate.cachedCostUsd;
    outputCostUsd += estimate.outputCostUsd;
    thoughtCostUsd += estimate.thoughtCostUsd;
    inputTokens += estimate.usage.inputTokens;
    cachedTokens += estimate.usage.cachedTokens;
    nonCachedInputTokens += estimate.usage.nonCachedInputTokens;
    toolUseTokens += estimate.usage.toolUseTokens;
    outputTokens += estimate.usage.outputTokens;
    thoughtTokens += estimate.usage.thoughtTokens;
    totalTokens += estimate.usage.totalTokens;
  }

  return {
    turnCount,
    totalCostUsd,
    inputCostUsd,
    cachedCostUsd,
    outputCostUsd,
    thoughtCostUsd,
    inputTokens,
    cachedTokens,
    nonCachedInputTokens,
    toolUseTokens,
    outputTokens,
    thoughtTokens,
    totalTokens,
  };
}

/**
 * Formats an estimated USD figure for compact badge display (always signaling
 * approximation with `~` or `<`).
 */
export function formatEstimatedUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) {
    return '~$0.00';
  }
  if (usd < 0.0001) {
    return '<$0.0001';
  }
  if (usd < 0.01) {
    return `~$${usd.toFixed(4)}`;
  }
  if (usd < 1) {
    return `~$${usd.toFixed(3)}`;
  }
  return `~$${usd.toFixed(2)}`;
}

/**
 * Formats an individual USD breakdown component inside tooltips and Trace Inspector.
 */
export function formatUsdBreakdown(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) {
    return '$0.0000';
  }
  if (usd < 0.0001) {
    return '<$0.0001';
  }
  if (usd < 0.1) {
    return `$${usd.toFixed(4)}`;
  }
  if (usd < 1) {
    return `$${usd.toFixed(3)}`;
  }
  return `$${usd.toFixed(2)}`;
}
