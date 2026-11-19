import {describe, expect, it} from 'vitest';
import {
  compileAuteurDraft,
  exportPlainText,
  fromAuteurIR,
  getAuteurJsonSchemas,
  toAuteurEnvelope,
  toAuteurIR,
} from '../../src/core/index.ts';
import {BLANK_SCRIPT_TEMPLATE, SCRIPT_PRESETS} from '../../src/data/presets.ts';

describe('Auteur Script JSON IR Codec & Draft Compiler', () => {
  it('round-trips all 4 canonical presets and blank template losslessly', () => {
    const scripts = [...SCRIPT_PRESETS.map((p) => p.content), BLANK_SCRIPT_TEMPLATE];
    for (const raw of scripts) {
      const ir = toAuteurIR(raw);
      const recompiled = fromAuteurIR(ir);
      expect(recompiled).toBe(exportPlainText(raw));
    }
  });

  it('models CAM with explicit subStateTag and identifier (numbered, alphanumeric, bare hold, and unnumbered montage)', () => {
    const script = `[INTENT]
Create a test scene.

[EXECUTION]
[CAM 01] MS, OTS Miller -> [ACT] Miller nods
[CAM 02A] CU on Ray -> [ACT] Ray exhales
[CAM 01] -> [ACT] Miller leans in
[CAM] WS rooftop -> [ACT] Lookout pans binoculars`;

    const ir = toAuteurIR(script);
    const states = ir.executionMacroBlock!.macroStates;

    expect(states[0].subStates[0]).toEqual({
      id: 'S1.0',
      dimension: 'camera',
      subStateTag: 'CAM',
      identifier: '01',
      content: 'MS, OTS Miller',
    });
    expect(states[1].subStates[0]).toEqual({
      id: 'S2.0',
      dimension: 'camera',
      subStateTag: 'CAM',
      identifier: '02A',
      content: 'CU on Ray',
    });
    expect(states[2].subStates[0]).toEqual({
      id: 'S3.0',
      dimension: 'camera',
      subStateTag: 'CAM',
      identifier: '01',
      content: '',
    });
    expect(states[3].subStates[0]).toEqual({
      id: 'S4.0',
      dimension: 'camera',
      subStateTag: 'CAM',
      identifier: null,
      content: 'WS rooftop',
    });

    expect(fromAuteurIR(ir)).toBe(exportPlainText(script));
  });

  it('keeps INTENT/LOGIC/OPENING/CUSTOM as prose and parses AESTHETIC as key: value entries with token mappings and unlabelled fallback', () => {
    const script = `[INTENT]
Create a scene featuring @image1 as Mark (voice: @audio1) and @image2 as Elena.

[LOGIC]
Preserve 180-degree axis.

[AESTHETIC]
Medium: 35mm anamorphic
Location: dim interrogation room -> LOC01; rain-slicked alley -> LOC02
Audio: distant hum
Unlabelled custom director note

[OPENING]
Static MS down the hallway.

[CONTINUITY PROTOCOL]
Continue seamlessly from @video1.

[EXECUTION]
[CAM 01] MS in LOC01 -> [STATE IN] Mark stands -> [PROP] steel key -> [FOCUS] rack to door -> Mark says in Spanish (O.S., urgent) {Abre la puerta.} -> <heavy bolt sliding> -> (low cello drone) -> 【CHAPTER ONE】 -> [STATE OUT] Door swings open`;

    const envelope = toAuteurEnvelope(script);
    const {document: ir, derived} = envelope;

    expect(ir.stagingMacroBlocks[0].format).toBe('prose');
    expect(ir.stagingMacroBlocks[1].format).toBe('prose');
    expect(ir.stagingMacroBlocks[2].format).toBe('key_value');
    expect(ir.stagingMacroBlocks[3].format).toBe('prose');
    expect(ir.stagingMacroBlocks[4]).toMatchObject({
      id: 'MB4',
      header: 'CONTINUITY PROTOCOL',
      kind: 'CONTINUITY PROTOCOL',
      format: 'prose',
    });

    if (ir.stagingMacroBlocks[2].format !== 'key_value') {
      throw new Error('Expected AESTHETIC to be key_value');
    }
    expect(ir.stagingMacroBlocks[2].entries).toEqual([
      {id: 'MB2.0', key: 'Medium', value: '35mm anamorphic'},
      {
        id: 'MB2.1',
        key: 'Location',
        value: 'dim interrogation room -> LOC01; rain-slicked alley -> LOC02',
      },
      {id: 'MB2.2', key: 'Audio', value: 'distant hum'},
      {id: 'MB2.3', key: null, value: 'Unlabelled custom director note'},
    ]);

    // Derived referenceBindings and tokenMappings
    expect(derived.referenceBindings).toEqual([
      {
        ref: '@image1',
        name: 'Mark',
        voiceRef: '@audio1',
        sourceMacroBlockId: 'MB0',
        sourceMacroBlock: 'INTENT',
      },
      {
        ref: '@image2',
        name: 'Elena',
        sourceMacroBlockId: 'MB0',
        sourceMacroBlock: 'INTENT',
      },
    ]);
    expect(derived.tokenMappings).toEqual([
      {token: 'LOC01', description: 'dim interrogation room', category: 'Location', entryId: 'MB2.1'},
      {token: 'LOC02', description: 'rain-slicked alley', category: 'Location', entryId: 'MB2.1'},
    ]);
    expect(derived.hasContinuationContext).toBe(true);
    expect(derived.macroStateContinuity[0].referencedTokens).toEqual(['LOC01']);

    // All inline Sub-State dimensions parsed and round-tripped
    const subStates = ir.executionMacroBlock!.macroStates[0].subStates;
    expect(subStates.map((s) => s.dimension)).toEqual([
      'camera',
      'state_boundary',
      'tier2',
      'tier2',
      'dialogue',
      'foley',
      'score',
      'onscreen_text',
      'state_boundary',
    ]);
    expect(fromAuteurIR(ir)).toBe(exportPlainText(script));
  });

  it('resolves inherited effectiveFraming across bare holds, recalls, and moving oner transitions', () => {
    const coverageEnv = toAuteurEnvelope(SCRIPT_PRESETS[0].content);
    expect(coverageEnv.derived.sceneTopology).toBe('multi_camera_coverage');
    expect(coverageEnv.derived.cameraSlots['01']).toEqual({
      subStateTag: 'CAM',
      identifier: '01',
      establishedAt: 'S1',
      initialFraming: 'MS, OTS Miller',
    });
    // S3 is a bare [CAM 01] recall — effectiveFraming must inherit S1's framing!
    expect(coverageEnv.derived.macroStateContinuity[2]).toMatchObject({
      macroStateId: 'S3',
      activeCameraIdentifier: '01',
      cameraTransition: 'RECALL',
      currentDescriptor: '',
      effectiveFraming: 'MS, OTS Miller',
    });

    const onerEnv = toAuteurEnvelope(SCRIPT_PRESETS[1].content);
    expect(onerEnv.derived.sceneTopology).toBe('continuous_oner');
    expect(onerEnv.derived.macroStateContinuity[1].effectiveFraming).toContain(
      'Waist-level MS, tracking backward down the aisle'
    );
    expect(onerEnv.derived.macroStateContinuity[1].effectiveFraming).toContain(
      'TRACKING BACKWARD IN RHYTHMIC SWAY'
    );

    const montageEnv = toAuteurEnvelope(SCRIPT_PRESETS[3].content);
    expect(montageEnv.derived.sceneTopology).toBe('discontinuous_montage');
    expect(montageEnv.derived.macroStateContinuity[1].activeCameraIdentifier).toBeNull();
  });

  it('validates and compiles a full JSON draft without IDs via compileAuteurDraft', () => {
    const result = compileAuteurDraft({
      stagingMacroBlocks: [
        {
          header: 'INTENT',
          format: 'prose',
          body: 'Create a quiet detective study featuring @image1 as Ada (voice: @audio1).',
        },
        {
          header: 'LOGIC',
          format: 'prose',
          body: 'Keep Ada frame-left facing screen-right. No subtitles appear on screen.',
        },
        {
          header: 'AESTHETIC',
          format: 'key_value',
          entries: [
            {key: 'Medium', value: '35mm film'},
            {key: 'Location', value: 'rainy archive room -> LOC01'},
          ],
        },
        {
          header: 'OPENING',
          format: 'prose',
          body: 'MS at eye level. Frame-left, Ada sits facing screen-right with a fountain pen in her right hand.',
        },
      ],
      executionMacroBlock: {
        header: 'EXECUTION',
        macroStates: [
          {
            subStates: [
              {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: 'MS on Ada'},
              {
                dimension: 'action',
                subStateTag: 'ACT',
                content: 'Ada uncorks the ink bottle with her left hand',
              },
              {dimension: 'dialogue', speaker: 'Ada', modifiers: '(low)', line: 'Found it.'},
              {dimension: 'foley', sound: 'glass stopper click'},
            ],
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.diagnostics).toHaveLength(0);
    expect(result.rawText).toContain('Ada says (low) {Found it.} -> <glass stopper click>');
    expect(result.rawText).toContain('[CAM 01] MS on Ada');
    expect(result.envelope.derived.tokenMappings[0].token).toBe('LOC01');
  });

  it('rejects malformed draft payloads with structured Zod validation paths', () => {
    const invalid = compileAuteurDraft({
      stagingMacroBlocks: [],
      executionMacroBlock: {
        header: 'EXECUTION',
        macroStates: [
          {
            subStates: [
              {dimension: 'camera', subStateTag: 'CAM', identifier: 'bad id!', content: 'WS'},
              {dimension: 'dialogue', speaker: '', line: 'Hello'},
            ],
          },
        ],
      },
    });

    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.errors.length).toBeGreaterThanOrEqual(2);
    expect(invalid.errors.some((e) => e.path.includes('identifier'))).toBe(true);
    expect(invalid.errors.some((e) => e.path.includes('speaker'))).toBe(true);
  });

  it('exports valid standard JSON Schema objects for all AI contracts', () => {
    const schemas = getAuteurJsonSchemas();
    for (const key of ['draft', 'ir', 'envelope', 'patch', 'review'] as const) {
      expect(schemas[key]).toBeTruthy();
      expect(typeof schemas[key]).toBe('object');
      expect(schemas[key]).toHaveProperty('type', 'object');
    }
  });
});
