import {
  renderStagingBlockBody,
  renderSubState,
  toAuteurEnvelope,
  type AuteurEnvelope,
  type AuteurLensPresetId,
  type LintRuleOverrides,
} from '../../core/index.ts';
import type {QuickScanRuleLens} from '../../data/knowledge/index.ts';
import type {AgentMediaAttachment} from '../geminiInteractions.ts';
import {
  interpolateTokens,
  matchesAllPredicates,
  parseBeatIndex,
  resolveQuickScanRules,
  type DocumentPredicateContext,
} from './ruleEngine.ts';
import {
  AUDIT_LENS_PRESET_IDS,
  type BuiltQuickScanPayload,
  type CustomQuickScanRule,
  type NoulDecisionQuestionPayload,
  type QuickScanQuestionMeta,
  type QuickScanResult,
  type QuickScanRuleOverride,
} from './types.ts';

const MAX_DECISION_QUESTION_KEY_LEN = 64;

const LENS_PRESET_HUMAN_NAMES: Record<AuteurLensPresetId, string> = {
  lens1_spatial_optics: 'Lens 1: Spatial & Optics',
  lens2_temporal_pacing_wear: 'Lens 2: Temporal, Pacing & Wear',
  lens3_props_inventory: 'Lens 3: Props & Inventory',
  lens4_acoustics_voice: 'Lens 4: Acoustics & Voice',
  lens5_blocks_grammar: 'Lens 5: Blocks & Grammar',
};

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
      for (const sub of ms.subStates) {
        lines.push(`  ${sub.id}: ${renderSubState(sub)}`);
      }
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
 * Formats a Gemini Decisions API question key strictly conforming to `[A-Za-z0-9_-]{1,64}`
 * (replacing `.` in Sub-State IDs like `S6.1` with `_` and deduplicating safely if truncated).
 */
export function buildDecisionQuestionKey(
  prefix: string,
  ruleId: string,
  usedKeys: Set<string>
): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'q';
  const safeRule = ruleId.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'rule';
  const raw = `${safePrefix}__${safeRule}`;
  let candidate = raw.slice(0, MAX_DECISION_QUESTION_KEY_LEN);
  let suffix = 2;
  while (usedKeys.has(candidate)) {
    const tag = `_${suffix}`;
    candidate = `${raw.slice(0, MAX_DECISION_QUESTION_KEY_LEN - tag.length)}${tag}`;
    suffix += 1;
  }
  usedKeys.add(candidate);
  return candidate;
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
  const usedQuestionKeys = new Set<string>();

  for (const rule of resolvedRules) {
    if (rule.scope === 'document') {
      if (!matchesAllPredicates(rule.when, docCtx)) continue;
      const key = buildDecisionQuestionKey('doc', rule.id, usedQuestionKeys);
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
        instructions: rule.instructions,
        trueDescription: rule.trueDescription,
        ...(rule.escalationHint ? {escalationHint: rule.escalationHint} : {}),
      };
    } else if (rule.scope === 'macro_state') {
      for (const ms of macroStates) {
        if (!matchesAllPredicates(rule.when, docCtx, ms)) continue;
        const beatIndex = parseBeatIndex(ms.id);
        const key = buildDecisionQuestionKey(ms.id, rule.id, usedQuestionKeys);
        const interpolatedInstructions = interpolateTokens(rule.instructions, ms.id);
        const interpolatedTrueDesc = interpolateTokens(rule.trueDescription, ms.id);
        questions[key] = {
          type: 'noul',
          instructions: interpolatedInstructions,
          criteria: {
            true_description: interpolatedTrueDesc,
            false_description: interpolateTokens(rule.falseDescription, ms.id),
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
          instructions: interpolatedInstructions,
          trueDescription: interpolatedTrueDesc,
          ...(rule.escalationHint
            ? {escalationHint: interpolateTokens(rule.escalationHint, ms.id)}
            : {}),
        };
      }
    } else {
      // rule.scope === 'sub_state'
      for (const ms of macroStates) {
        const beatIndex = parseBeatIndex(ms.id);
        for (const sub of ms.subStates) {
          if (!matchesAllPredicates(rule.when, docCtx, ms, sub)) continue;
          const key = buildDecisionQuestionKey(sub.id, rule.id, usedQuestionKeys);
          const interpolatedInstructions = interpolateTokens(rule.instructions, ms.id, sub.id);
          const interpolatedTrueDesc = interpolateTokens(rule.trueDescription, ms.id, sub.id);
          questions[key] = {
            type: 'noul',
            instructions: interpolatedInstructions,
            criteria: {
              true_description: interpolatedTrueDesc,
              false_description: interpolateTokens(rule.falseDescription, ms.id, sub.id),
            },
          };
          questionMeta[key] = {
            key,
            ruleId: rule.id,
            ruleLabel: rule.label,
            lens: rule.lens,
            scope: 'sub_state',
            targetId: sub.id,
            ...(beatIndex !== undefined ? {beatIndex} : {}),
            instructions: interpolatedInstructions,
            trueDescription: interpolatedTrueDesc,
            ...(rule.escalationHint
              ? {escalationHint: interpolateTokens(rule.escalationHint, ms.id, sub.id)}
              : {}),
          };
        }
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

export function aggregateBatchUsages(
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

export function chunkQuestionEntries(
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
