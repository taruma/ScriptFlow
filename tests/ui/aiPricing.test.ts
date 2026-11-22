import {describe, expect, it} from 'vitest';
import {
  aggregateSessionCost,
  estimateTraceCost,
  estimateTurnCost,
  formatEstimatedUsd,
  formatUsdBreakdown,
  GEMINI_3_8_FLASH_PROMO_END_MS,
  GEMINI_4_CARBON_PROMO_END_MS,
  getGeminiModelPricing,
  parseInteractionUsage,
} from '../../src/ui/aiPricing.ts';

describe('aiPricing Gemini 4 & 3.x Flash rate table & cost estimation', () => {
  const NOV_21_2026 = Date.UTC(2026, 10, 21, 12, 0, 0);
  const NOV_30_2026_LAST_MS = GEMINI_4_CARBON_PROMO_END_MS - 1;
  const DEC_01_2026_START_MS = GEMINI_4_CARBON_PROMO_END_MS;
  const DEC_31_2026_LAST_MS = GEMINI_3_8_FLASH_PROMO_END_MS - 1;
  const JAN_01_2027_START_MS = GEMINI_3_8_FLASH_PROMO_END_MS;

  it('returns accurate Gemini 3.5 Flash-Lite, 3.8 Flash, and Gemini 4 pricing across promo cutoffs', () => {
    expect(getGeminiModelPricing('gemini-3.5-flash-lite', NOV_21_2026)).toEqual({
      model: 'gemini-3.5-flash-lite',
      inputPer1M: 0.3,
      cachedInputPer1M: 0.03,
      outputPer1M: 2.5,
      isPromoRate: false,
    });

    // 3.8 Flash promotional rate active through Dec 31, 2026 UTC
    expect(getGeminiModelPricing('gemini-3.8-flash', DEC_31_2026_LAST_MS)).toEqual({
      model: 'gemini-3.8-flash',
      inputPer1M: 0.75,
      cachedInputPer1M: 0.075,
      outputPer1M: 3.75,
      isPromoRate: true,
    });

    // 3.8 Flash switches automatically to standard rate starting Jan 1, 2027 00:00:00Z
    expect(getGeminiModelPricing('gemini-3.8-flash', JAN_01_2027_START_MS)).toEqual({
      model: 'gemini-3.8-flash',
      inputPer1M: 1.5,
      cachedInputPer1M: 0.15,
      outputPer1M: 7.5,
      isPromoRate: false,
    });

    expect(getGeminiModelPricing('gemini-4-hydrogen', NOV_21_2026)).toEqual({
      model: 'gemini-4-hydrogen',
      inputPer1M: 1.5,
      cachedInputPer1M: 0.075,
      outputPer1M: 7.5,
      isPromoRate: false,
    });

    expect(getGeminiModelPricing('gemini-4-neon', NOV_21_2026)).toEqual({
      model: 'gemini-4-neon',
      inputPer1M: 3.0,
      cachedInputPer1M: 0.15,
      outputPer1M: 15.0,
      isPromoRate: false,
    });

    // Carbon promotional rate active through Nov 30, 2026 UTC
    expect(getGeminiModelPricing('gemini-4-carbon', NOV_30_2026_LAST_MS)).toEqual({
      model: 'gemini-4-carbon',
      inputPer1M: 2.0,
      cachedInputPer1M: 0.1,
      outputPer1M: 10.0,
      isPromoRate: true,
    });

    // Carbon switches automatically to standard rate starting Dec 1, 2026 00:00:00Z
    expect(getGeminiModelPricing('gemini-4-carbon', DEC_01_2026_START_MS)).toEqual({
      model: 'gemini-4-carbon',
      inputPer1M: 4.0,
      cachedInputPer1M: 0.2,
      outputPer1M: 20.0,
      isPromoRate: false,
    });
  });

  it('parses Interactions API usage payloads and clamps cached tokens safely', () => {
    expect(parseInteractionUsage(undefined)).toBeNull();
    expect(parseInteractionUsage({})).toBeNull();
    expect(parseInteractionUsage({note: 'non-numeric'})).toBeNull();

    expect(
      parseInteractionUsage({
        total_input_tokens: 10_000,
        total_cached_tokens: 4_000,
        total_output_tokens: 1_200,
        total_thought_tokens: 800,
        total_tokens: 12_000,
      })
    ).toEqual({
      inputTokens: 10_000,
      cachedTokens: 4_000,
      nonCachedInputTokens: 6_000,
      toolUseTokens: 0,
      outputTokens: 1_200,
      thoughtTokens: 800,
      billableOutputTokens: 2_000,
      totalTokens: 12_000,
    });

    // Cached tokens exceeding reported input tokens are clamped so non-cached never goes negative
    const clamped = parseInteractionUsage({
      total_input_tokens: 500,
      total_cached_tokens: 800,
      total_output_tokens: 100,
    });
    expect(clamped?.cachedTokens).toBe(500);
    expect(clamped?.nonCachedInputTokens).toBe(0);
    expect(clamped?.totalTokens).toBe(600);
  });

  it('computes exact USD breakdown for non-cached input, cached input, output, and thinking tokens', () => {
    // 1M non-cached input + 1M cached input + 500k output + 500k thought on Hydrogen:
    // $1.50 + $0.075 + $3.75 + $3.75 = $9.075
    const estimate = estimateTurnCost(
      'gemini-4-hydrogen',
      {
        total_input_tokens: 2_000_000,
        total_cached_tokens: 1_000_000,
        total_output_tokens: 500_000,
        total_thought_tokens: 500_000,
        total_tokens: 3_000_000,
      },
      NOV_21_2026
    );

    expect(estimate).not.toBeNull();
    expect(estimate!.inputCostUsd).toBeCloseTo(1.5, 10);
    expect(estimate!.cachedCostUsd).toBeCloseTo(0.075, 10);
    expect(estimate!.outputCostUsd).toBeCloseTo(3.75, 10);
    expect(estimate!.thoughtCostUsd).toBeCloseTo(3.75, 10);
    expect(estimate!.totalCostUsd).toBeCloseTo(9.075, 10);
  });

  it('anchors Carbon trace pricing to trace.startedAt so historical turns retain their effective rate', () => {
    const usage = {
      total_input_tokens: 1_000_000,
      total_output_tokens: 1_000_000,
    };

    const promoTurn = estimateTraceCost(
      {
        model: 'gemini-4-carbon',
        startedAt: '2026-11-25T10:00:00.000Z',
        usage,
      },
      DEC_01_2026_START_MS
    );
    expect(promoTurn?.rates.isPromoRate).toBe(true);
    expect(promoTurn?.totalCostUsd).toBeCloseTo(12.0, 10); // $2 + $10

    const standardTurn = estimateTraceCost(
      {
        model: 'gemini-4-carbon',
        startedAt: '2026-12-05T10:00:00.000Z',
        usage,
      },
      NOV_21_2026
    );
    expect(standardTurn?.rates.isPromoRate).toBe(false);
    expect(standardTurn?.totalCostUsd).toBeCloseTo(24.0, 10); // $4 + $20

    const flashPromoTurn = estimateTraceCost(
      {
        model: 'gemini-3.8-flash',
        startedAt: '2026-12-20T10:00:00.000Z',
        usage,
      },
      JAN_01_2027_START_MS
    );
    expect(flashPromoTurn?.rates.isPromoRate).toBe(true);
    expect(flashPromoTurn?.totalCostUsd).toBeCloseTo(4.5, 10); // $0.75 + $3.75

    const flashStandardTurn = estimateTraceCost(
      {
        model: 'gemini-3.8-flash',
        startedAt: '2027-01-05T10:00:00.000Z',
        usage,
      },
      NOV_21_2026
    );
    expect(flashStandardTurn?.rates.isPromoRate).toBe(false);
    expect(flashStandardTurn?.totalCostUsd).toBeCloseTo(9.0, 10); // $1.50 + $7.50
  });

  it('aggregates cumulative session cost across multi-turn mixed-model threads', () => {
    const empty = aggregateSessionCost([]);
    expect(empty.turnCount).toBe(0);
    expect(empty.totalCostUsd).toBe(0);

    const summary = aggregateSessionCost(
      [
        {role: 'user'},
        {
          role: 'assistant',
          trace: {
            model: 'gemini-4-hydrogen',
            startedAt: '2026-11-21T10:00:00.000Z',
            usage: {
              total_input_tokens: 10_000,
              total_cached_tokens: 2_000,
              total_output_tokens: 1_000,
              total_thought_tokens: 500,
              total_tokens: 11_500,
            },
          },
        },
        {role: 'user'},
        {
          // Still streaming / no usage yet — must be skipped cleanly
          role: 'assistant',
        },
        {
          role: 'assistant',
          trace: {
            model: 'gemini-4-neon',
            startedAt: '2026-11-21T10:05:00.000Z',
            usage: {
              total_input_tokens: 20_000,
              total_cached_tokens: 0,
              total_output_tokens: 2_000,
              total_thought_tokens: 1_000,
              total_tokens: 23_000,
            },
          },
        },
      ],
      NOV_21_2026
    );

    // Turn 1 (Hydrogen): (8k * 1.5 + 2k * 0.075 + 1k * 7.5 + 500 * 7.5) / 1M = 0.0234
    // Turn 2 (Neon): (20k * 3.0 + 2k * 15 + 1k * 15) / 1M = 0.105
    expect(summary.turnCount).toBe(2);
    expect(summary.totalCostUsd).toBeCloseTo(0.1284, 10);
    expect(summary.inputTokens).toBe(30_000);
    expect(summary.cachedTokens).toBe(2_000);
    expect(summary.outputTokens).toBe(3_000);
    expect(summary.thoughtTokens).toBe(1_500);
    expect(summary.totalTokens).toBe(34_500);
  });

  it('formats estimated USD badges and tooltip breakdown components cleanly', () => {
    expect(formatEstimatedUsd(0)).toBe('~$0.00');
    expect(formatEstimatedUsd(-1)).toBe('~$0.00');
    expect(formatEstimatedUsd(0.00004)).toBe('<$0.0001');
    expect(formatEstimatedUsd(0.0042)).toBe('~$0.0042');
    expect(formatEstimatedUsd(0.0184)).toBe('~$0.018');
    expect(formatEstimatedUsd(0.1426)).toBe('~$0.143');
    expect(formatEstimatedUsd(1.246)).toBe('~$1.25');

    expect(formatUsdBreakdown(0)).toBe('$0.0000');
    expect(formatUsdBreakdown(0.00002)).toBe('<$0.0001');
    expect(formatUsdBreakdown(0.0042)).toBe('$0.0042');
    expect(formatUsdBreakdown(0.254)).toBe('$0.254');
    expect(formatUsdBreakdown(2.5)).toBe('$2.50');
  });

  it('prices gemini-decision-1 at $0.10/1M input and $0 output and rolls Quick Scan turns into session totals', () => {
    expect(getGeminiModelPricing('gemini-decision-1', NOV_21_2026)).toEqual({
      model: 'gemini-decision-1',
      inputPer1M: 0.1,
      cachedInputPer1M: 0.1,
      outputPer1M: 0,
      isPromoRate: false,
    });

    const quickScanEstimate = estimateTurnCost(
      'gemini-decision-1',
      {
        total_input_tokens: 3_000,
        total_output_tokens: 0,
        total_tokens: 3_000,
      },
      NOV_21_2026
    );
    expect(quickScanEstimate?.totalCostUsd).toBeCloseTo(0.0003, 10);
    expect(quickScanEstimate?.outputCostUsd).toBe(0);

    const session = aggregateSessionCost(
      [
        {
          role: 'assistant',
          quickScanTrace: {
            model: 'gemini-decision-1',
            startedAt: '2026-11-21T10:00:00.000Z',
            usage: {total_input_tokens: 4_000, total_output_tokens: 0, total_tokens: 4_000},
          },
        },
        {
          role: 'assistant',
          trace: {
            model: 'gemini-4-hydrogen',
            startedAt: '2026-11-21T10:02:00.000Z',
            usage: {total_input_tokens: 10_000, total_output_tokens: 1_000, total_tokens: 11_000},
          },
        },
      ],
      NOV_21_2026
    );

    // Quick Scan: 4k * 0.1 / 1M = 0.0004
    // Hydrogen: (10k * 1.5 + 1k * 7.5) / 1M = 0.0225
    expect(session.turnCount).toBe(2);
    expect(session.totalCostUsd).toBeCloseTo(0.0229, 10);
    expect(session.totalTokens).toBe(15_000);
  });
});
