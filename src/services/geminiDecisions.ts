import {GoogleGenAI} from '@google/genai';
import {
  QUICK_SCAN_RULE_LENSES,
  QUICK_SCAN_RULES_VERSION,
  type QuickScanRuleLens,
} from '../data/knowledge/index.ts';
import {
  aggregateBatchUsages,
  buildQuickScanPayload,
  chunkQuestionEntries,
} from './decisions/payloadBuilder.ts';
import {
  classifyQuickScanProbability,
  parseBeatIndex,
  statusSeverityRank,
} from './decisions/ruleEngine.ts';
import {
  auditLensToPresetId,
  GEMINI_DECISION_MODEL_ID,
  MAX_DECISIONS_PER_BATCH,
  type DecisionNoulAnswerLike,
  type DecisionsClientLike,
  type QuickScanFindingItem,
  type QuickScanLensSummary,
  type QuickScanResult,
  type QuickScanStatus,
  type QuickScanSuspectBeat,
  type QuickScanTrace,
  type RunQuickScanOptions,
  type RunQuickScanOutput,
} from './decisions/types.ts';
import {
  classifyGeminiError,
  GeminiServiceError,
  sanitizeTraceInput,
  type AgentTraceError,
} from './geminiInteractions.ts';

export {
  AUDIT_LENS_PRESET_IDS,
  auditLensToPresetId,
  GEMINI_DECISION_MODEL_ID,
  MAX_DECISIONS_PER_BATCH,
  QUICK_SCAN_THRESHOLDS,
  type BuiltQuickScanPayload,
  type CustomQuickScanRule,
  type DecisionNoulAnswerLike,
  type DecisionResponseLike,
  type DecisionsClientLike,
  type NoulDecisionQuestionPayload,
  type QuickScanFindingItem,
  type QuickScanLensSummary,
  type QuickScanQuestionMeta,
  type QuickScanResult,
  type QuickScanRuleOverride,
  type QuickScanSensitivity,
  type QuickScanStatus,
  type QuickScanSuspectBeat,
  type QuickScanThresholdBand,
  type QuickScanTrace,
  type ResolvedQuickScanRule,
  type RunQuickScanOptions,
  type RunQuickScanOutput,
} from './decisions/types.ts';
export {
  classifyQuickScanProbability,
  resolveQuickScanRules,
} from './decisions/ruleEngine.ts';
export {
  buildDecisionQuestionKey,
  buildEnrichedQuickScanText,
  buildQuickScanEscalationPrompt,
  buildQuickScanPayload,
  getDefaultSelectedAuditLenses,
} from './decisions/payloadBuilder.ts';

function defaultCreateDecisionsClient(apiKey: string): DecisionsClientLike {
  return new GoogleGenAI({apiKey, apiVersion: 'v1beta'}) as unknown as DecisionsClientLike;
}

/**
 * Executes a single-pass (or auto-chunked >1000) Gemini Decisions API Quick Scan,
 * classifies calibrated probabilities with the chosen sensitivity preset, merges
 * Layer 2 deterministic lint diagnostics, and returns structured results + trace.
 */
export async function runQuickScan(options: RunQuickScanOptions): Promise<RunQuickScanOutput> {
  const getNow = options.now ?? Date.now;
  const startedMs = getNow();
  const startedAt = new Date(startedMs).toISOString();
  const apiKey = options.apiKey.trim();

  const payload = buildQuickScanPayload({
    rawText: options.rawText,
    lintRuleOverrides: options.lintRuleOverrides,
    ruleOverrides: options.ruleOverrides,
    customRules: options.customRules,
    briefContext: options.briefContext,
    attachments: options.attachments,
  });

  const questionKeys = Object.keys(payload.questions);
  const batches = chunkQuestionEntries(payload.questions, MAX_DECISIONS_PER_BATCH);

  const buildTrace = (
    answersMap: Record<string, {noul: number; confidence: number; status: QuickScanStatus}>,
    usage: Record<string, unknown> | undefined,
    error?: AgentTraceError
  ): QuickScanTrace => ({
    kind: 'quick_scan',
    model: GEMINI_DECISION_MODEL_ID,
    apiVersion: 'v1beta',
    sensitivity: options.sensitivity,
    snapshotHash: payload.envelope.snapshotHash,
    sceneTopology: payload.envelope.derived.sceneTopology,
    startedAt,
    durationMs: Math.max(0, getNow() - startedMs),
    totalQuestions: questionKeys.length,
    batchCount: batches.length,
    skippedYoutubeHandles: [...payload.skippedYoutubeHandles],
    input: sanitizeTraceInput(payload.input),
    questions: payload.questions,
    answers: answersMap,
    ...(usage ? {usage} : {}),
    ...(error ? {error} : {}),
  });

  if (apiKey.length === 0) {
    const message = 'Add your Gemini API key in AI Settings to run Quick Scan.';
    throw new GeminiServiceError('missing_api_key', message, {
      status: undefined,
    });
  }

  if (options.signal?.aborted) {
    throw new GeminiServiceError('aborted', 'Quick Scan cancelled.');
  }

  const rawAnswers: Record<string, DecisionNoulAnswerLike> = {};
  const batchUsages: Array<Record<string, unknown> | undefined> = [];

  if (batches.length > 0) {
    const clientFactory = options.createClient ?? defaultCreateDecisionsClient;
    const client = clientFactory(apiKey);

    try {
      for (const batchQuestions of batches) {
        if (options.signal?.aborted) {
          throw new GeminiServiceError('aborted', 'Quick Scan cancelled.');
        }

        const response = await client.decisions.create(
          {
            model: GEMINI_DECISION_MODEL_ID,
            input: payload.input,
            questions: batchQuestions,
          },
          options.signal ? {signal: options.signal} : undefined
        );

        if (response.usage) {
          batchUsages.push(response.usage);
        }

        const responseAnswers = response.answers ?? {};
        for (const [key, ans] of Object.entries(responseAnswers)) {
          if (
            ans &&
            typeof ans === 'object' &&
            ans.type === 'noul' &&
            typeof (ans as DecisionNoulAnswerLike).noul === 'number' &&
            Number.isFinite((ans as DecisionNoulAnswerLike).noul)
          ) {
            const typed = ans as DecisionNoulAnswerLike;
            const noul = Math.max(0, Math.min(1, typed.noul));
            const confidence =
              typeof typed.confidence === 'number' && Number.isFinite(typed.confidence)
                ? Math.max(0, Math.min(1, typed.confidence))
                : Math.max(noul, 1 - noul);
            rawAnswers[key] = {type: 'noul', noul, confidence};
          }
        }
      }
    } catch (error) {
      const classified = classifyGeminiError(error, options.signal);
      throw new GeminiServiceError(classified.code, classified.message, {
        status: classified.status,
        cause: classified.causeError ?? error,
      });
    }
  }

  const traceAnswers: Record<string, {noul: number; confidence: number; status: QuickScanStatus}> =
    {};
  const allItems: QuickScanFindingItem[] = [];

  // 1. Convert Decisions API answers into findings
  for (const key of questionKeys) {
    const meta = payload.questionMeta[key];
    const ans = rawAnswers[key];
    if (!meta || !ans) continue;

    const status = classifyQuickScanProbability(ans.noul, options.sensitivity);
    traceAnswers[key] = {noul: ans.noul, confidence: ans.confidence, status};
    allItems.push({
      key: meta.key,
      ruleId: meta.ruleId,
      ruleLabel: meta.ruleLabel,
      lens: meta.lens,
      scope: meta.scope,
      targetId: meta.targetId,
      ...(meta.beatIndex !== undefined ? {beatIndex: meta.beatIndex} : {}),
      status,
      probability: ans.noul,
      confidence: ans.confidence,
      source: 'decision_api',
      instructions: meta.instructions,
      trueDescription: meta.trueDescription,
      ...(meta.escalationHint ? {escalationHint: meta.escalationHint} : {}),
    });
  }

  // 2. Merge zero-cost Layer 2 deterministic lint diagnostics
  let deterministicCount = 0;
  for (const diag of payload.envelope.derived.diagnostics) {
    deterministicCount += 1;
    const lensPreset = auditLensToPresetId(diag.lens);
    const beatIndex = parseBeatIndex(diag.targetId);
    const status: QuickScanStatus = diag.severity === 'error' ? 'flagged' : 'borderline';
    const probability = diag.severity === 'error' ? 1 : 0.75;

    allItems.push({
      key: `det__${diag.id}`,
      ruleId: diag.ruleId,
      ruleLabel: diag.ruleName,
      lens: lensPreset,
      scope: beatIndex !== undefined ? 'macro_state' : 'document',
      targetId: diag.targetId,
      ...(beatIndex !== undefined ? {beatIndex} : {}),
      status,
      probability,
      confidence: 1,
      source: 'deterministic',
      deterministicSeverity: diag.severity,
      deterministicMessage: diag.message,
      escalationHint: diag.repairHint,
    });
  }

  // Sort items highest risk first, deterministic before probabilistic on tie
  const sortFindings = (a: QuickScanFindingItem, b: QuickScanFindingItem): number => {
    const statusDiff = statusSeverityRank(b.status) - statusSeverityRank(a.status);
    if (statusDiff !== 0) return statusDiff;
    if (a.source !== b.source) return a.source === 'deterministic' ? -1 : 1;
    if (b.probability !== a.probability) return b.probability - a.probability;
    return a.key.localeCompare(b.key);
  };

  // 3. Build lens rollups (always include all 5 lenses; include 'brief' if any brief rules ran)
  const itemsByLens = new Map<QuickScanRuleLens, QuickScanFindingItem[]>();
  for (const lens of QUICK_SCAN_RULE_LENSES) {
    itemsByLens.set(lens, []);
  }
  for (const item of allItems) {
    const list = itemsByLens.get(item.lens) ?? [];
    list.push(item);
    itemsByLens.set(item.lens, list);
  }

  const lensSummaries: QuickScanLensSummary[] = [];
  for (const lens of QUICK_SCAN_RULE_LENSES) {
    const items = (itemsByLens.get(lens) ?? []).sort(sortFindings);
    if (lens === 'brief' && items.length === 0) continue;

    let flagged = 0;
    let borderline = 0;
    let clean = 0;
    let det = 0;
    let maxProb = 0;
    let worstStatus: QuickScanStatus = 'clean';

    for (const item of items) {
      if (item.source === 'deterministic') det += 1;
      if (item.status === 'flagged') flagged += 1;
      else if (item.status === 'borderline') borderline += 1;
      else clean += 1;
      if (item.probability > maxProb) maxProb = item.probability;
      if (statusSeverityRank(item.status) > statusSeverityRank(worstStatus)) {
        worstStatus = item.status;
      }
    }

    lensSummaries.push({
      lens,
      status: worstStatus,
      flaggedCount: flagged,
      borderlineCount: borderline,
      cleanCount: clean,
      deterministicCount: det,
      totalChecked: items.length,
      maxProbability: maxProb,
      items,
    });
  }

  // 4. Build suspect Macro-States list (flagged or borderline items tied to a specific S#)
  const suspectItemsByBeat = new Map<number, QuickScanFindingItem[]>();
  for (const item of allItems) {
    if (item.beatIndex === undefined || item.status === 'clean') continue;
    const list = suspectItemsByBeat.get(item.beatIndex) ?? [];
    list.push(item);
    suspectItemsByBeat.set(item.beatIndex, list);
  }

  const suspectBeats: QuickScanSuspectBeat[] = [...suspectItemsByBeat.entries()]
    .sort(([a], [b]) => a - b)
    .map(([beatIndex, items]) => {
      const sorted = [...items].sort(sortFindings);
      const hasFlagged = sorted.some((it) => it.status === 'flagged');
      const maxProbability = sorted.reduce((acc, it) => Math.max(acc, it.probability), 0);
      return {
        beatIndex,
        targetId: `S${beatIndex}`,
        status: hasFlagged ? 'flagged' : 'borderline',
        maxProbability,
        items: sorted,
      };
    });

  let flaggedCount = 0;
  let borderlineCount = 0;
  let cleanCount = 0;
  for (const item of allItems) {
    if (item.status === 'flagged') flaggedCount += 1;
    else if (item.status === 'borderline') borderlineCount += 1;
    else cleanCount += 1;
  }

  const usage = aggregateBatchUsages(batchUsages);
  const durationMs = Math.max(0, getNow() - startedMs);

  const result: QuickScanResult = {
    snapshotHash: payload.envelope.snapshotHash,
    rulesVersion: QUICK_SCAN_RULES_VERSION,
    sceneTopology: payload.envelope.derived.sceneTopology,
    sensitivity: options.sensitivity,
    durationMs,
    totalQuestions: questionKeys.length,
    batchCount: batches.length,
    flaggedCount,
    borderlineCount,
    cleanCount,
    deterministicCount,
    skippedYoutubeHandles: [...payload.skippedYoutubeHandles],
    lensSummaries,
    suspectBeats,
    allItems: [...allItems].sort(sortFindings),
    ...(usage ? {usage} : {}),
  };

  const trace = buildTrace(traceAnswers, usage);
  return {result, trace};
}
