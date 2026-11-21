import {describe, expect, it} from 'vitest';
import {computeSnapshotHash} from '../../src/core/index.ts';
import {BUNDLED_EXAMPLES} from '../../src/data/examples/index.ts';
import {
  BUNDLED_QUICK_SCAN_RULES,
  resolveQuickScanRuleCatalog,
} from '../../src/data/knowledge/index.ts';
import {
  buildQuickScanEscalationPrompt,
  buildQuickScanPayload,
  classifyQuickScanProbability,
  GEMINI_DECISION_MODEL_ID,
  getDefaultSelectedAuditLenses,
  MAX_DECISIONS_PER_BATCH,
  runQuickScan,
  type DecisionsClientLike,
} from '../../src/services/geminiDecisions.ts';
import {getLatestActiveQuickScan, type AiChatMessage} from '../../src/ui/aiAssistant.ts';
import {buildLiveQuickScanIndicators} from '../../src/ui/quickScanIndicators.ts';
import {stabilizeBeatQuickScanMap} from '../../src/ui/referenceStability.ts';

const INTERROGATION_SCRIPT =
  BUNDLED_EXAMPLES.find((ex) => ex.id === 'interrogation-coverage')?.content ?? '';
const MONTAGE_SCRIPT =
  BUNDLED_EXAMPLES.find((ex) => ex.id === 'heist-montage')?.content ?? '';

describe('Quick Scan declarative rule catalog & AST matrix builder', () => {
  it('loads and validates the bundled Quick Scan rules cleanly', () => {
    expect(BUNDLED_QUICK_SCAN_RULES.length).toBeGreaterThanOrEqual(14);
    expect(resolveQuickScanRuleCatalog(BUNDLED_QUICK_SCAN_RULES)).toHaveLength(
      BUNDLED_QUICK_SCAN_RULES.length
    );

    const ids = new Set(BUNDLED_QUICK_SCAN_RULES.map((r) => r.id));
    expect(ids.size).toBe(BUNDLED_QUICK_SCAN_RULES.length);
  });

  it('filters questions accurately by AST topology, foley presence, dialogue, and active Brief', () => {
    const continuousPayload = buildQuickScanPayload({
      rawText: INTERROGATION_SCRIPT,
    });

    // Continuous coverage should include eyeline/s0_s1/wear/subtitle_guard, exclude montage_anchor and brief rules
    expect(continuousPayload.questions['doc__doc_eyeline_parity']).toBeDefined();
    expect(continuousPayload.questions['doc__doc_s0_s1_handoff']).toBeDefined();
    expect(continuousPayload.questions['doc__doc_subtitle_guard']).toBeDefined();
    expect(continuousPayload.questions['doc__doc_brief_specs']).toBeUndefined();
    expect(continuousPayload.questions['doc__doc_brief_media']).toBeUndefined();
    expect(continuousPayload.questions['S1__state_montage_anchor']).toBeUndefined();

    // AST foley filtering: only S3 has <foley> in interrogation-coverage
    expect(continuousPayload.questions['S1__state_ambient_foley']).toBeUndefined();
    expect(continuousPayload.questions['S2__state_ambient_foley']).toBeUndefined();
    expect(continuousPayload.questions['S3__state_ambient_foley']).toBeDefined();

    // Resolved active camera hint should be annotated on S3's bare `[CAM 01] ->` recall line
    expect(typeof continuousPayload.input).toBe('string');
    expect(continuousPayload.input as string).toContain('S3: [CAM 01] ->');
    expect(continuousPayload.input as string).toContain('Resolved active camera:');

    // Montage topology should suppress continuous rules and activate montage_anchor per S#
    const montagePayload = buildQuickScanPayload({
      rawText: MONTAGE_SCRIPT,
    });
    expect(montagePayload.questions['doc__doc_eyeline_parity']).toBeUndefined();
    expect(montagePayload.questions['doc__doc_wear_persistence']).toBeUndefined();
    expect(montagePayload.questions['S1__state_montage_anchor']).toBeDefined();
  });

  it('builds multimodal input blocks for inline/Files API attachments and downgrades YouTube gracefully', () => {
    const payload = buildQuickScanPayload({
      rawText: INTERROGATION_SCRIPT,
      briefContext: '### Format & Specs\nKeep Ray to 1 spoken line.',
      attachments: [
        {
          handle: '@image1',
          label: 'Ray',
          kind: 'image',
          source: 'inline',
          mimeType: 'image/jpeg',
          inlineBase64: 'A'.repeat(200),
          fingerprint: 'img-1',
        },
        {
          handle: '@video1',
          label: 'Mood ref',
          kind: 'video',
          source: 'youtube',
          mimeType: 'video/mp4',
          uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          fingerprint: 'yt-1',
        },
        {
          handle: '@video2',
          label: 'Prior clip',
          kind: 'video',
          source: 'files_api',
          mimeType: 'video/mp4',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
          fingerprint: 'f-1',
        },
      ],
    });

    expect(payload.skippedYoutubeHandles).toEqual(['@video1']);
    expect(payload.questions['doc__doc_brief_specs']).toBeDefined();
    expect(payload.questions['doc__doc_brief_media']).toBeDefined();
    expect(Array.isArray(payload.input)).toBe(true);

    const blocks = payload.input as Array<Record<string, unknown>>;
    expect(blocks.some((b) => b.type === 'image' && b.data === 'A'.repeat(200))).toBe(true);
    expect(
      blocks.some(
        (b) =>
          b.type === 'video' &&
          b.uri === 'https://generativelanguage.googleapis.com/v1beta/files/abc123'
      )
    ).toBe(true);
    // YouTube URI must NOT be sent as a video block to Decisions API
    expect(
      blocks.some((b) => b.type === 'video' && String(b.uri ?? '').includes('youtube.com'))
    ).toBe(false);
  });

  it('classifies probabilities consistently across strict, balanced, and lenient sensitivities', () => {
    expect(classifyQuickScanProbability(0.36, 'strict')).toBe('flagged');
    expect(classifyQuickScanProbability(0.22, 'strict')).toBe('borderline');
    expect(classifyQuickScanProbability(0.15, 'strict')).toBe('clean');

    expect(classifyQuickScanProbability(0.55, 'balanced')).toBe('flagged');
    expect(classifyQuickScanProbability(0.35, 'balanced')).toBe('borderline');
    expect(classifyQuickScanProbability(0.2, 'balanced')).toBe('clean');

    expect(classifyQuickScanProbability(0.7, 'lenient')).toBe('flagged');
    expect(classifyQuickScanProbability(0.45, 'lenient')).toBe('borderline');
    expect(classifyQuickScanProbability(0.35, 'lenient')).toBe('clean');
  });
});

describe('runQuickScan execution, Layer 2 merge, escalation prompt & Live Mode indicators', () => {
  it('executes mocked decisions.create, merges Layer 2 lint diagnostics, redacts base64 in trace, and builds targeted escalation prompts', async () => {
    // Inject a deterministic Layer 2 warning/error (`stage-left` in S1) so we verify Layer 2 merge
    const scriptWithLint = INTERROGATION_SCRIPT.replace(
      'Miller frame-left FG',
      'Miller stage-left FG'
    );

    const calls: Array<{model: string; questionCount: number}> = [];
    const mockClient: DecisionsClientLike = {
      decisions: {
        async create(params) {
          const keys = Object.keys(params.questions);
          calls.push({model: params.model, questionCount: keys.length});
          const answers: Record<string, {type: 'noul'; noul: number; confidence: number}> = {};
          for (const key of keys) {
            if (key === 'S2__state_cam_visibility') {
              answers[key] = {type: 'noul', noul: 0.91, confidence: 0.91};
            } else if (key === 'S3__state_hand_allocation') {
              answers[key] = {type: 'noul', noul: 0.36, confidence: 0.64};
            } else {
              answers[key] = {type: 'noul', noul: 0.05, confidence: 0.95};
            }
          }
          return {
            answers,
            usage: {
              total_input_tokens: 2_800,
              total_output_tokens: 0,
              total_tokens: 2_800,
            },
          };
        },
      },
    };

    const {result, trace} = await runQuickScan({
      apiKey: 'AIza-secret-test',
      rawText: scriptWithLint,
      sensitivity: 'balanced',
      attachments: [
        {
          handle: '@image1',
          label: 'Miller',
          kind: 'image',
          source: 'inline',
          mimeType: 'image/jpeg',
          inlineBase64: 'B'.repeat(300),
          fingerprint: 'img-secret',
        },
      ],
      createClient: () => mockClient,
      now: (() => {
        let tick = 1_700_000_000_000;
        return () => {
          tick += 250;
          return tick;
        };
      })(),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(GEMINI_DECISION_MODEL_ID);
    expect(result.deterministicCount).toBe(1);
    expect(result.flaggedCount).toBe(2); // S1 deterministic error + S2 cam_visibility (91%)
    expect(result.borderlineCount).toBe(1); // S3 hand_allocation (36%)
    expect(result.suspectBeats.map((b) => b.targetId)).toEqual(['S1', 'S2', 'S3']);

    // Base64 payload must be stripped in trace
    const serializedTrace = JSON.stringify(trace);
    expect(serializedTrace).not.toContain('B'.repeat(300));
    expect(serializedTrace).not.toContain('AIza-secret-test');
    expect(trace.kind).toBe('quick_scan');
    expect(trace.apiVersion).toBe('v1beta');

    // Default pre-checked lenses: Lens 1 (S1 lint + S2 visibility) & Lens 3 (S3 hand allocation)
    const selectedLenses = getDefaultSelectedAuditLenses(result);
    expect(selectedLenses).toEqual(['lens1_spatial_optics', 'lens3_props_inventory']);

    // Multi-lens escalation prompt scopes only to selected lenses & includes leads
    const multiEscalation = buildQuickScanEscalationPrompt({
      result,
      selectedLenses,
    });
    expect(multiEscalation.prompt).toContain('lens1_spatial_optics');
    expect(multiEscalation.prompt).toContain('lens3_props_inventory');
    expect(multiEscalation.prompt).not.toContain('lens4_acoustics_voice');
    expect(multiEscalation.prompt).toContain('S2 · Action Visibility vs. Active Camera');
    expect(multiEscalation.displayText).toContain('L1, L3');

    // Single-state Live Mode escalation (`Audit S2`)
    const beatEscalation = buildQuickScanEscalationPrompt({
      result,
      selectedLenses: ['lens1_spatial_optics'],
      targetBeatIndex: 2,
    });
    expect(beatEscalation.displayText).toBe('Deep Audit: S2');
    expect(beatEscalation.prompt).toContain('S2');

    // Live Mode indicator projection & reference stability
    const currentHash = computeSnapshotHash(scriptWithLint);
    const liveMap1 = buildLiveQuickScanIndicators(result, currentHash);
    expect(liveMap1.size).toBe(3);
    expect(liveMap1.get(2)?.[0].ruleId).toBe('state_cam_visibility');
    expect(liveMap1.get(2)?.[0].instructions).toContain('S2');
    expect(liveMap1.get(2)?.[0].trueDescription).toContain('S2');

    const liveMap2 = buildLiveQuickScanIndicators(result, currentHash);
    const stabilized = stabilizeBeatQuickScanMap(liveMap1, liveMap2);
    expect(stabilized).toBe(liveMap1);

    // Stale snapshot immediately clears Live Mode indicators
    const staleMap = buildLiveQuickScanIndicators(result, 'different-hash');
    expect(staleMap.size).toBe(0);

    // getLatestActiveQuickScan clears once dismissed or superseded by an Audit review
    const messagesWithScan: AiChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        mode: 'check',
        focus: 'audit',
        text: '',
        quickScan: result,
      },
    ];
    expect(getLatestActiveQuickScan(messagesWithScan, currentHash)).toBe(result);
    expect(getLatestActiveQuickScan(messagesWithScan, 'stale-hash')).toBeNull();
    expect(
      getLatestActiveQuickScan([{...messagesWithScan[0], quickScanDismissed: true}], currentHash)
    ).toBeNull();
    expect(
      getLatestActiveQuickScan(
        [
          messagesWithScan[0],
          {
            id: 'a2',
            role: 'assistant',
            mode: 'check',
            focus: 'audit',
            text: 'Audit complete',
            suggestions: [
              {
                id: 'rev-1',
                kind: 'audit_review',
                baseSnapshotHash: currentHash,
                overallSummary: 'Done',
                issues: [],
                errorCount: 0,
                warningCount: 0,
              },
            ],
          },
        ],
        currentHash
      )
    ).toBeNull();
  });

  it('auto-chunks questions cleanly when a script exceeds MAX_DECISIONS_PER_BATCH', async () => {
    // 250 beats × 4 state rules + document rules > 1,000 questions -> 2 batches
    const manyBeats = Array.from(
      {length: 250},
      (_, i) => `[CAM 01] -> [ACT] Beat ${i + 1} action with left hand`
    ).join('\n');
    const hugeScript = `[AESTHETIC]\nWardrobe: dark coat\n\n[EXECUTION]\n${manyBeats}`;

    const batchSizes: number[] = [];
    const mockClient: DecisionsClientLike = {
      decisions: {
        async create(params) {
          const keys = Object.keys(params.questions);
          batchSizes.push(keys.length);
          const answers: Record<string, {type: 'noul'; noul: number; confidence: number}> = {};
          for (const key of keys) {
            answers[key] = {type: 'noul', noul: 0.02, confidence: 0.98};
          }
          return {
            answers,
            usage: {total_input_tokens: 5_000, total_output_tokens: 0, total_tokens: 5_000},
          };
        },
      },
    };

    const {result} = await runQuickScan({
      apiKey: 'AIza-batch-test',
      rawText: hugeScript,
      sensitivity: 'balanced',
      createClient: () => mockClient,
    });

    expect(batchSizes.length).toBeGreaterThanOrEqual(2);
    expect(batchSizes[0]).toBe(MAX_DECISIONS_PER_BATCH);
    expect(result.batchCount).toBe(batchSizes.length);
    expect(result.usage?.total_input_tokens).toBe(5_000 * batchSizes.length);
  });

  it('rejects cleanly when API key is missing or AbortSignal is already aborted', async () => {
    await expect(
      runQuickScan({
        apiKey: '   ',
        rawText: INTERROGATION_SCRIPT,
        sensitivity: 'balanced',
      })
    ).rejects.toMatchObject({code: 'missing_api_key'});

    const controller = new AbortController();
    controller.abort();
    await expect(
      runQuickScan({
        apiKey: 'AIza-valid',
        rawText: INTERROGATION_SCRIPT,
        sensitivity: 'balanced',
        signal: controller.signal,
      })
    ).rejects.toMatchObject({code: 'aborted'});
  });
});
