import {GoogleGenAI} from '@google/genai';
import {
  renderStagingBlockBody,
  renderSubState,
  toAuteurEnvelope,
  type AuditLens,
  type AuteurEnvelope,
  type AuteurLensPresetId,
  type LintRuleOverrides,
  type LintSeverity,
  type MacroStateIR,
  type SceneTopology,
} from '../core/index.ts';
import {
  BUNDLED_QUICK_SCAN_RULES,
  QUICK_SCAN_RULE_LENSES,
  QUICK_SCAN_RULES_VERSION,
  type QuickScanRuleDefinition,
  type QuickScanRuleLens,
  type QuickScanRulePredicate,
  type QuickScanRuleScope,
} from '../data/knowledge/index.ts';
import {
  classifyGeminiError,
  GeminiServiceError,
  sanitizeTraceInput,
  type AgentMediaAttachment,
  type AgentTraceError,
} from './geminiInteractions.ts';

export const GEMINI_DECISION_MODEL_ID = 'gemini-decision-1' as const;
export const MAX_DECISIONS_PER_BATCH = 1000;

export type QuickScanSensitivity = 'strict' | 'balanced' | 'lenient';
export type QuickScanStatus = 'flagged' | 'borderline' | 'clean';

export interface QuickScanThresholdBand {
  flagged: number;
  borderline: number;
}

export const QUICK_SCAN_THRESHOLDS: Record<QuickScanSensitivity, QuickScanThresholdBand> = {
  strict: {flagged: 0.35, borderline: 0.2},
  balanced: {flagged: 0.5, borderline: 0.28},
  lenient: {flagged: 0.65, borderline: 0.42},
};

export interface QuickScanRuleOverride {
  enabled?: boolean;
  instructionsOverride?: string;
  trueDescriptionOverride?: string;
  falseDescriptionOverride?: string;
}

export interface CustomQuickScanRule {
  id: string;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  label: string;
  when: QuickScanRulePredicate[];
  instructions: string;
  trueDescription: string;
  falseDescription: string;
  escalationHint?: string;
}

export interface ResolvedQuickScanRule {
  id: string;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  label: string;
  when: QuickScanRulePredicate[];
  instructions: string;
  trueDescription: string;
  falseDescription: string;
  escalationHint?: string;
  builtIn: boolean;
  enabled: boolean;
  isTextOverridden: boolean;
}

export interface NoulDecisionQuestionPayload {
  type: 'noul';
  instructions: string;
  criteria: {
    true_description: string;
    false_description: string;
  };
}

export interface DecisionNoulAnswerLike {
  type: 'noul';
  noul: number;
  confidence: number;
}

export interface DecisionResponseLike {
  answers?: Record<string, DecisionNoulAnswerLike | {type: string; [key: string]: unknown}>;
  usage?: Record<string, unknown>;
}

export interface DecisionsClientLike {
  decisions: {
    create(
      params: {
        model: string;
        input: string | Array<Record<string, unknown>>;
        questions: Record<string, NoulDecisionQuestionPayload>;
      },
      options?: {signal?: AbortSignal}
    ): Promise<DecisionResponseLike>;
  };
}

export interface QuickScanQuestionMeta {
  key: string;
  ruleId: string;
  ruleLabel: string;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  targetId: string;
  beatIndex?: number;
  escalationHint?: string;
}

export interface QuickScanFindingItem {
  key: string;
  ruleId: string;
  ruleLabel: string;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  targetId: string;
  beatIndex?: number;
  status: QuickScanStatus;
  /** Calibrated probability P(violation) in [0, 1]. For deterministic findings, 1.0 (error) or 0.75 (warning). */
  probability: number;
  /** Model confidence max(p, 1 - p) in [0, 1], or 1.0 for deterministic findings. */
  confidence: number;
  source: 'decision_api' | 'deterministic';
  deterministicSeverity?: LintSeverity;
  deterministicMessage?: string;
  escalationHint?: string;
}

export interface QuickScanLensSummary {
  lens: QuickScanRuleLens;
  status: QuickScanStatus;
  flaggedCount: number;
  borderlineCount: number;
  cleanCount: number;
  deterministicCount: number;
  totalChecked: number;
  maxProbability: number;
  items: QuickScanFindingItem[];
}

export interface QuickScanSuspectBeat {
  beatIndex: number;
  targetId: string;
  status: 'flagged' | 'borderline';
  maxProbability: number;
  items: QuickScanFindingItem[];
}

export interface QuickScanResult {
  snapshotHash: string;
  rulesVersion: string;
  sceneTopology: SceneTopology;
  sensitivity: QuickScanSensitivity;
  durationMs: number;
  totalQuestions: number;
  batchCount: number;
  flaggedCount: number;
  borderlineCount: number;
  cleanCount: number;
  deterministicCount: number;
  skippedYoutubeHandles: string[];
  lensSummaries: QuickScanLensSummary[];
  suspectBeats: QuickScanSuspectBeat[];
  allItems: QuickScanFindingItem[];
  usage?: Record<string, unknown>;
}

export interface QuickScanTrace {
  kind: 'quick_scan';
  model: typeof GEMINI_DECISION_MODEL_ID;
  apiVersion: 'v1beta';
  sensitivity: QuickScanSensitivity;
  snapshotHash: string;
  sceneTopology: SceneTopology;
  startedAt: string;
  durationMs: number;
  totalQuestions: number;
  batchCount: number;
  skippedYoutubeHandles: string[];
  input: unknown;
  questions: Record<string, NoulDecisionQuestionPayload>;
  answers: Record<string, {noul: number; confidence: number; status: QuickScanStatus}>;
  usage?: Record<string, unknown>;
  error?: AgentTraceError;
}

export interface RunQuickScanOptions {
  apiKey: string;
  rawText: string;
  sensitivity: QuickScanSensitivity;
  lintRuleOverrides?: LintRuleOverrides;
  ruleOverrides?: Record<string, QuickScanRuleOverride>;
  customRules?: readonly CustomQuickScanRule[];
  briefContext?: string;
  attachments?: readonly AgentMediaAttachment[];
  signal?: AbortSignal;
  now?: () => number;
  createClient?: (apiKey: string) => DecisionsClientLike;
}

export interface RunQuickScanOutput {
  result: QuickScanResult;
  trace: QuickScanTrace;
}

export interface BuiltQuickScanPayload {
  envelope: AuteurEnvelope;
  input: string | Array<Record<string, unknown>>;
  questions: Record<string, NoulDecisionQuestionPayload>;
  questionMeta: Record<string, QuickScanQuestionMeta>;
  skippedYoutubeHandles: string[];
  hasBriefText: boolean;
  hasBriefMedia: boolean;
}

export const AUDIT_LENS_PRESET_IDS: readonly AuteurLensPresetId[] = [
  'lens1_spatial_optics',
  'lens2_temporal_pacing_wear',
  'lens3_props_inventory',
  'lens4_acoustics_voice',
  'lens5_blocks_grammar',
] as const;

export function auditLensToPresetId(lens: AuditLens): AuteurLensPresetId {
  switch (lens) {
    case 'Lens 1: Spatial & Optics':
      return 'lens1_spatial_optics';
    case 'Lens 2: Temporal, Pacing & Wear':
      return 'lens2_temporal_pacing_wear';
    case 'Lens 3: Props & Inventory':
      return 'lens3_props_inventory';
    case 'Lens 4: Acoustics & Voice':
      return 'lens4_acoustics_voice';
    case 'Lens 5: Blocks & Grammar':
      return 'lens5_blocks_grammar';
  }
}

function defaultCreateDecisionsClient(apiKey: string): DecisionsClientLike {
  return new GoogleGenAI({apiKey, apiVersion: 'v1beta'}) as unknown as DecisionsClientLike;
}

/**
 * Resolves built-in rules + user overrides + custom rules into a flat ordered list.
 */
export function resolveQuickScanRules(
  ruleOverrides?: Record<string, QuickScanRuleOverride>,
  customRules?: readonly CustomQuickScanRule[]
): ResolvedQuickScanRule[] {
  const seen = new Set<string>();
  const resolved: ResolvedQuickScanRule[] = [];

  for (const builtIn of BUNDLED_QUICK_SCAN_RULES) {
    const id = builtIn.id;
    seen.add(id);
    const ov = ruleOverrides?.[id];
    const enabled = ov?.enabled !== undefined ? ov.enabled : (builtIn.defaultEnabled ?? true);
    const instructionsOverride = ov?.instructionsOverride?.trim();
    const trueOverride = ov?.trueDescriptionOverride?.trim();
    const falseOverride = ov?.falseDescriptionOverride?.trim();

    const instructions =
      instructionsOverride && instructionsOverride.length > 0
        ? instructionsOverride
        : builtIn.instructions;
    const trueDescription =
      trueOverride && trueOverride.length > 0 ? trueOverride : builtIn.trueDescription;
    const falseDescription =
      falseOverride && falseOverride.length > 0 ? falseOverride : builtIn.falseDescription;

    const isTextOverridden =
      instructions.trim() !== builtIn.instructions.trim() ||
      trueDescription.trim() !== builtIn.trueDescription.trim() ||
      falseDescription.trim() !== builtIn.falseDescription.trim();

    resolved.push({
      id,
      lens: builtIn.lens,
      scope: builtIn.scope,
      label: builtIn.label,
      when: [...builtIn.when],
      instructions,
      trueDescription,
      falseDescription,
      ...(builtIn.escalationHint ? {escalationHint: builtIn.escalationHint} : {}),
      builtIn: true,
      enabled,
      isTextOverridden,
    });
  }

  for (const custom of customRules ?? []) {
    const id = custom.id.trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const ov = ruleOverrides?.[id];
    const enabled = ov?.enabled !== undefined ? ov.enabled : true;

    resolved.push({
      id,
      lens: custom.lens,
      scope: custom.scope,
      label: custom.label.trim() || id,
      when: custom.when.length > 0 ? [...custom.when] : ['all'],
      instructions: custom.instructions.trim(),
      trueDescription: custom.trueDescription.trim(),
      falseDescription: custom.falseDescription.trim(),
      ...(custom.escalationHint?.trim() ? {escalationHint: custom.escalationHint.trim()} : {}),
      builtIn: false,
      enabled,
      isTextOverridden: false,
    });
  }

  return resolved;
}

function interpolateStateToken(template: string, stateId: string): string {
  return template.replace(/\{\{STATE_ID\}\}/g, stateId);
}

interface DocumentPredicateContext {
  topology: SceneTopology;
  hasOpening: boolean;
  hasIntent: boolean;
  hasAesthetic: boolean;
  hasDialogue: boolean;
  hasBriefText: boolean;
  hasBriefMedia: boolean;
}

function evaluatePredicate(
  predicate: QuickScanRulePredicate,
  docCtx: DocumentPredicateContext,
  macroState?: MacroStateIR
): boolean {
  switch (predicate) {
    case 'all':
      return true;
    case 'continuous':
      return docCtx.topology !== 'discontinuous_montage' && docCtx.topology !== 'empty';
    case 'oner':
      return docCtx.topology === 'continuous_oner';
    case 'montage':
      return docCtx.topology === 'discontinuous_montage';
    case 'has_opening':
      return docCtx.hasOpening;
    case 'has_intent':
      return docCtx.hasIntent;
    case 'has_aesthetic':
      return docCtx.hasAesthetic;
    case 'has_dialogue':
      return docCtx.hasDialogue;
    case 'has_brief_text':
      return docCtx.hasBriefText;
    case 'has_brief_media':
      return docCtx.hasBriefMedia;
    case 'has_foley':
      if (!macroState) return false;
      return macroState.subStates.some((sub) => sub.dimension === 'foley');
    case 'has_action':
      if (!macroState) return false;
      return macroState.subStates.some((sub) => sub.dimension === 'action');
    case 'has_action_or_prop':
      if (!macroState) return false;
      return macroState.subStates.some(
        (sub) =>
          sub.dimension === 'action' ||
          ('subStateTag' in sub && sub.subStateTag.trim().toUpperCase() === 'PROP')
      );
  }
}

function matchesAllPredicates(
  predicates: readonly QuickScanRulePredicate[],
  docCtx: DocumentPredicateContext,
  macroState?: MacroStateIR
): boolean {
  for (const pred of predicates) {
    if (!evaluatePredicate(pred, docCtx, macroState)) {
      return false;
    }
  }
  return true;
}

/**
 * Builds an enriched script text with explicit `S#` labels and deterministically resolved
 * camera framing notes on hold/recall lines so `gemini-decision-1` evaluates framing accurately.
 */
export function buildEnrichedQuickScanText(
  envelope: AuteurEnvelope,
  briefContext?: string
): string {
  const lines: string[] = [
    `[SCRIPT METADATA] Scene Topology: ${envelope.derived.sceneTopology} | Continuation Context: ${
      envelope.derived.hasContinuationContext ? 'yes' : 'no'
    } | Staging Macro-Blocks: ${envelope.document.stagingMacroBlocks.length} | Execution Macro-States: ${
      envelope.document.executionMacroBlock?.macroStates.length ?? 0
    }`,
    '',
  ];

  for (const block of envelope.document.stagingMacroBlocks) {
    lines.push(`[${block.header}]`);
    const body = renderStagingBlockBody(block);
    if (body.trim().length > 0) {
      lines.push(body);
    }
    lines.push('');
  }

  const macroStates = envelope.document.executionMacroBlock?.macroStates ?? [];
  if (macroStates.length > 0) {
    const continuityById = new Map(
      envelope.derived.macroStateContinuity.map((c) => [c.macroStateId, c])
    );

    lines.push('[EXECUTION]');
    for (const ms of macroStates) {
      const cont = continuityById.get(ms.id);
      const rawLine = ms.subStates.map((s) => renderSubState(s)).join(' -> ');
      const needsResolvedCamHint =
        cont &&
        cont.effectiveFraming.trim().length > 0 &&
        (cont.cameraTransition === 'HOLD' ||
          cont.cameraTransition === 'RECALL' ||
          cont.cameraTransition === 'NONE');
      const camSuffix = needsResolvedCamHint
        ? `  /* Resolved active camera: ${cont.activeCameraIdentifier ? `[CAM ${cont.activeCameraIdentifier}] ` : ''}${cont.effectiveFraming} */`
        : '';
      lines.push(`${ms.id}: ${rawLine}${camSuffix}`);
    }
    lines.push('');
  }

  const trimmedBrief = briefContext?.trim() ?? '';
  if (trimmedBrief.length > 0) {
    lines.push('=== ACTIVE SCENE BRIEF & REFERENCES ===');
    lines.push(trimmedBrief);
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Compiles the AST-filtered atomic `noul` question matrix and shared multimodal input payload.
 */
export function buildQuickScanPayload(options: {
  rawText: string;
  lintRuleOverrides?: LintRuleOverrides;
  ruleOverrides?: Record<string, QuickScanRuleOverride>;
  customRules?: readonly CustomQuickScanRule[];
  briefContext?: string;
  attachments?: readonly AgentMediaAttachment[];
}): BuiltQuickScanPayload {
  const envelope = toAuteurEnvelope(options.rawText, options.lintRuleOverrides);
  const resolvedRules = resolveQuickScanRules(options.ruleOverrides, options.customRules).filter(
    (r) => r.enabled
  );

  const macroStates = envelope.document.executionMacroBlock?.macroStates ?? [];
  const hasOpening = envelope.document.stagingMacroBlocks.some((b) => b.kind === 'OPENING');
  const hasIntent = envelope.document.stagingMacroBlocks.some(
    (b) => b.kind === 'INTENT' || b.header.trim().toUpperCase() === 'GOAL'
  );
  const hasAesthetic = envelope.document.stagingMacroBlocks.some((b) => b.kind === 'AESTHETIC');
  const hasDialogue = macroStates.some((ms) =>
    ms.subStates.some((sub) => sub.dimension === 'dialogue')
  );

  // Build shared input blocks (text + supported multimodal Brief attachments; downgrade YouTube gracefully)
  const enrichedScriptText = buildEnrichedQuickScanText(envelope, options.briefContext);
  const mediaBlocks: Array<Record<string, unknown>> = [];
  const skippedYoutubeHandles: string[] = [];
  let hasBriefMedia = false;

  for (const att of options.attachments ?? []) {
    const labelText = [
      att.handle || `@${att.kind}`,
      att.label ? `(${att.label})` : '',
      att.note ? `— ${att.note}` : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (att.source === 'youtube') {
      const handle = att.handle?.trim() || '@video';
      skippedYoutubeHandles.push(handle);
      mediaBlocks.push({
        type: 'text',
        text: `[Reference ${labelText} — YouTube URL omitted from Quick Scan; evaluated via text label only]`,
      });
      continue;
    }

    if (att.source === 'inline' && typeof att.inlineText === 'string') {
      const fileHeader = att.fileName ? ` · ${att.fileName}` : '';
      mediaBlocks.push({
        type: 'text',
        text: `[Reference ${labelText}${fileHeader}]\n${att.inlineText}`,
      });
      hasBriefMedia = true;
      continue;
    }

    if (att.source === 'inline' && att.inlineBase64) {
      mediaBlocks.push({type: 'text', text: `[Reference ${labelText}]`});
      mediaBlocks.push({
        type: att.kind === 'image' ? 'image' : att.kind,
        data: att.inlineBase64,
        mime_type: att.mimeType,
      });
      hasBriefMedia = true;
      continue;
    }

    if (att.source === 'files_api' && att.uri) {
      mediaBlocks.push({type: 'text', text: `[Reference ${labelText}]`});
      mediaBlocks.push({
        type: att.kind === 'image' ? 'image' : att.kind,
        uri: att.uri,
        mime_type: att.mimeType,
      });
      hasBriefMedia = true;
    }
  }

  const hasBriefText = (options.briefContext?.trim().length ?? 0) > 0;
  const input: string | Array<Record<string, unknown>> =
    mediaBlocks.length > 0
      ? [{type: 'text', text: enrichedScriptText}, ...mediaBlocks]
      : enrichedScriptText;

  const docCtx: DocumentPredicateContext = {
    topology: envelope.derived.sceneTopology,
    hasOpening,
    hasIntent,
    hasAesthetic,
    hasDialogue,
    hasBriefText,
    hasBriefMedia,
  };

  const questions: Record<string, NoulDecisionQuestionPayload> = {};
  const questionMeta: Record<string, QuickScanQuestionMeta> = {};

  for (const rule of resolvedRules) {
    if (rule.scope === 'document') {
      if (!matchesAllPredicates(rule.when, docCtx)) continue;
      const key = `doc__${rule.id}`;
      questions[key] = {
        type: 'noul',
        instructions: rule.instructions,
        criteria: {
          true_description: rule.trueDescription,
          false_description: rule.falseDescription,
        },
      };
      questionMeta[key] = {
        key,
        ruleId: rule.id,
        ruleLabel: rule.label,
        lens: rule.lens,
        scope: 'document',
        targetId: 'Document',
        ...(rule.escalationHint ? {escalationHint: rule.escalationHint} : {}),
      };
    } else {
      for (const ms of macroStates) {
        if (!matchesAllPredicates(rule.when, docCtx, ms)) continue;
        const beatIndex = parseBeatIndex(ms.id);
        const key = `${ms.id}__${rule.id}`;
        questions[key] = {
          type: 'noul',
          instructions: interpolateStateToken(rule.instructions, ms.id),
          criteria: {
            true_description: interpolateStateToken(rule.trueDescription, ms.id),
            false_description: interpolateStateToken(rule.falseDescription, ms.id),
          },
        };
        questionMeta[key] = {
          key,
          ruleId: rule.id,
          ruleLabel: rule.label,
          lens: rule.lens,
          scope: 'macro_state',
          targetId: ms.id,
          ...(beatIndex !== undefined ? {beatIndex} : {}),
          ...(rule.escalationHint
            ? {escalationHint: interpolateStateToken(rule.escalationHint, ms.id)}
            : {}),
        };
      }
    }
  }

  return {
    envelope,
    input,
    questions,
    questionMeta,
    skippedYoutubeHandles,
    hasBriefText,
    hasBriefMedia,
  };
}

function parseBeatIndex(targetId: string): number | undefined {
  const match = /^S(\d+)(?:\.\d+)?$/i.exec(targetId.trim());
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function classifyQuickScanProbability(
  probability: number,
  sensitivity: QuickScanSensitivity
): QuickScanStatus {
  const thresholds = QUICK_SCAN_THRESHOLDS[sensitivity];
  if (probability >= thresholds.flagged) return 'flagged';
  if (probability >= thresholds.borderline) return 'borderline';
  return 'clean';
}

function statusSeverityRank(status: QuickScanStatus): number {
  switch (status) {
    case 'flagged':
      return 2;
    case 'borderline':
      return 1;
    case 'clean':
      return 0;
  }
}

function aggregateBatchUsages(
  usages: ReadonlyArray<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined {
  const valid = usages.filter((u): u is Record<string, unknown> =>
    Boolean(u && typeof u === 'object' && !Array.isArray(u))
  );
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return {...valid[0]};

  const combined: Record<string, unknown> = {};
  for (const usage of valid) {
    for (const [key, value] of Object.entries(usage)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        const prev = combined[key];
        combined[key] = typeof prev === 'number' ? prev + value : value;
      } else {
        combined[key] = value;
      }
    }
  }
  return combined;
}

function chunkQuestionEntries(
  questions: Record<string, NoulDecisionQuestionPayload>,
  maxPerBatch: number
): Array<Record<string, NoulDecisionQuestionPayload>> {
  const entries = Object.entries(questions);
  if (entries.length === 0) return [];
  const batches: Array<Record<string, NoulDecisionQuestionPayload>> = [];
  for (let i = 0; i < entries.length; i += maxPerBatch) {
    const slice = entries.slice(i, i + maxPerBatch);
    batches.push(Object.fromEntries(slice));
  }
  return batches;
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

/**
 * Returns the list of lens preset IDs that should be pre-checked for Deep Audit escalation.
 * If only `'brief'` was flagged (with no lens flagged), pre-checks `lens5_blocks_grammar`
 * so the user still has a concrete slice preset ready.
 */
export function getDefaultSelectedAuditLenses(result: QuickScanResult): AuteurLensPresetId[] {
  const selected: AuteurLensPresetId[] = [];
  let briefFlagged = false;

  for (const summary of result.lensSummaries) {
    if (summary.status === 'clean') continue;
    if (summary.lens === 'brief') {
      briefFlagged = true;
    } else {
      selected.push(summary.lens);
    }
  }

  if (selected.length === 0 && briefFlagged) {
    selected.push('lens5_blocks_grammar');
  }

  return selected;
}

const LENS_PRESET_HUMAN_NAMES: Record<AuteurLensPresetId, string> = {
  lens1_spatial_optics: 'Lens 1: Spatial & Optics',
  lens2_temporal_pacing_wear: 'Lens 2: Temporal, Pacing & Wear',
  lens3_props_inventory: 'Lens 3: Props & Inventory',
  lens4_acoustics_voice: 'Lens 4: Acoustics & Voice',
  lens5_blocks_grammar: 'Lens 5: Blocks & Grammar',
};

/**
 * Builds a focused Gemini 4 Deep Audit prompt scoped to selected lens preset(s),
 * forwarding Quick Scan's tripped rules and suspect S# IDs as unverified System-1 leads.
 */
export function buildQuickScanEscalationPrompt(options: {
  result: QuickScanResult;
  selectedLenses: readonly AuteurLensPresetId[];
  targetBeatIndex?: number;
}): {prompt: string; displayText: string} {
  const lenses: AuteurLensPresetId[] =
    options.selectedLenses.length > 0 ? [...options.selectedLenses] : [...AUDIT_LENS_PRESET_IDS];

  const selectedSet = new Set<QuickScanRuleLens>(lenses);
  const briefSummary = options.result.lensSummaries.find((s) => s.lens === 'brief');
  const includeBriefLeads = Boolean(briefSummary && briefSummary.status !== 'clean');

  const leadItems = options.result.allItems.filter((item) => {
    if (item.status === 'clean') return false;
    if (options.targetBeatIndex !== undefined) {
      return item.beatIndex === options.targetBeatIndex;
    }
    return selectedSet.has(item.lens) || (includeBriefLeads && item.lens === 'brief');
  });

  const lensPresetList = lenses.map((id) => `\`${id}\` (${LENS_PRESET_HUMAN_NAMES[id]})`).join(', ');
  const lines: string[] = [];

  if (options.targetBeatIndex !== undefined) {
    lines.push(
      `Run a targeted Script Supervisor audit focused on Execution Macro-State S${options.targetBeatIndex} across: ${lensPresetList}.`
    );
  } else if (lenses.length === AUDIT_LENS_PRESET_IDS.length) {
    lines.push(
      `Run a full Script Supervisor audit across all 5 lenses (${lensPresetList}).`
    );
  } else {
    lines.push(
      `Run a targeted Script Supervisor audit strictly on the selected lens(es): ${lensPresetList}. Only call \`inspect_lens_slice\` for these selected preset(s) — skip unselected lenses.`
    );
  }

  if (leadItems.length > 0) {
    lines.push('');
    lines.push(
      'Quick Scan (System-1 pre-check) flagged the following unverified leads — verify each rigorously against the actual lens slice(s) (ignore false positives and also catch any adjacent issues within the selected lens(es)):'
    );
    for (const item of leadItems.slice(0, 14)) {
      const pct = `${Math.round(item.probability * 100)}%`;
      const sourceTag =
        item.source === 'deterministic' ? 'Deterministic Lint' : `Quick Scan ${pct}`;
      const hintSuffix = item.escalationHint ? ` — ${item.escalationHint}` : '';
      lines.push(
        `- [${sourceTag}] ${item.targetId} · ${item.ruleLabel}${hintSuffix}`
      );
    }
  }

  lines.push('');
  lines.push(
    'Respect the scene topology, inspect the selected lens slice(s) first, and call `report_audit_review` with exact clickable target IDs and lint-clean `suggestedPatch` fixes where helpful.'
  );

  const displayText =
    options.targetBeatIndex !== undefined
      ? `Deep Audit: S${options.targetBeatIndex}`
      : lenses.length === AUDIT_LENS_PRESET_IDS.length
        ? 'Deep Audit: All Lenses (from Quick Scan)'
        : `Deep Audit: ${lenses.map((l) => `L${AUDIT_LENS_PRESET_IDS.indexOf(l) + 1}`).join(', ')} (from Quick Scan)`;

  return {
    prompt: lines.join('\n'),
    displayText,
  };
}
