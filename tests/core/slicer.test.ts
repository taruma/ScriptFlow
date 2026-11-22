import {describe, expect, it} from 'vitest';
import {
  applyAuteurPatch,
  sliceAuteurScript,
  validateAuteurReview,
} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';

const INTERROGATION = SCRIPT_PRESETS[0].content;
const SUBWAY_ONER = SCRIPT_PRESETS[1].content;

describe('Auteur Script Composable Lens Slicer & Review Validator', () => {
  it('isolates [ACT] only alongside deterministically resolved [CAM] framing', () => {
    const slice = sliceAuteurScript(INTERROGATION, {
      macroBlocks: ['LOGIC', 'OPENING'],
      dimensions: ['action'],
      includeResolvedCamera: true,
    });

    expect(slice.stagingMacroBlocks.map((b) => b.header)).toEqual(['LOGIC', 'OPENING']);
    expect(slice.macroStates).toHaveLength(3);

    // Every sliced Macro-State contains ONLY action Sub-States, preserving original S#.# IDs
    for (const ms of slice.macroStates) {
      expect(ms.subStates.length).toBeGreaterThan(0);
      expect(ms.subStates.every((s) => s.dimension === 'action')).toBe(true);
    }

    // S3 is a bare [CAM 01] recall; resolvedCamera must expose inherited effectiveFraming
    expect(slice.macroStates[2].resolvedCamera).toEqual({
      subStateTag: 'CAM',
      identifier: '01',
      transition: 'RECALL',
      currentDescriptor: '',
      effectiveFraming: 'MS, OTS Miller',
    });
    expect(slice.macroStates[2].subStates[0].id).toBe('S3.2');
  });

  it('supports all 5 built-in Script Supervisor Audit Lens presets', () => {
    // Lens 1: Spatial & Optics on Moving Oner
    const lens1 = sliceAuteurScript(SUBWAY_ONER, 'lens1_spatial_optics');
    expect(lens1.preset).toBe('lens1_spatial_optics');
    expect(lens1.sceneTopology).toBe('continuous_oner');
    expect(lens1.stagingMacroBlocks.map((b) => b.header)).toEqual(['LOGIC', 'OPENING']);
    expect(lens1.macroStates[0].subStates.every((s) => ['camera', 'block', 'action'].includes(s.dimension))).toBe(
      true
    );

    // Lens 3: Props & Inventory filters [AESTHETIC] down to Wardrobe & Location only
    const lens3 = sliceAuteurScript(INTERROGATION, 'lens3_props_inventory');
    const aesthetic3 = lens3.stagingMacroBlocks.find((b) => b.header === 'AESTHETIC');
    expect(aesthetic3?.format).toBe('key_value');
    if (aesthetic3?.format === 'key_value') {
      expect(aesthetic3.entries.map((e) => e.key)).toEqual(['Location', 'Wardrobe']);
    }

    // Lens 4: Acoustics & Voice filters [AESTHETIC] to Audio only + acoustic dimensions + trailing resolution
    const lens4 = sliceAuteurScript(INTERROGATION, 'lens4_acoustics_voice');
    expect(lens4.stagingMacroBlocks).toHaveLength(1);
    const aesthetic4 = lens4.stagingMacroBlocks[0];
    if (aesthetic4.format === 'key_value') {
      expect(aesthetic4.entries.map((e) => e.key)).toEqual(['Audio']);
    }
    expect(lens4.macroStates[0].endsOnDialogue).toBe(false);
    expect(lens4.macroStates[1].subStates.map((s) => s.dimension)).toEqual(['dialogue', 'dialogue']);
    expect(lens4.macroStates[2].subStates.map((s) => s.dimension)).toEqual(['foley']);

    // Lens 5: Full IR + diagnostics
    const lens5 = sliceAuteurScript(INTERROGATION, 'lens5_blocks_grammar');
    expect(lens5.stagingMacroBlocks).toHaveLength(4);
    expect(lens5.diagnostics).toEqual([]);
  });

  it('filters tokenMappings by "referenced" vs "all"', () => {
    const scriptWithTokens = `[INTENT]
Create a scene.

[AESTHETIC]
Location: dim interrogation room -> LOC01; unused rooftop -> LOC02

[EXECUTION]
[CAM 01] MS in LOC01 -> [ACT] Miller sits`;

    const refOnly = sliceAuteurScript(scriptWithTokens, {
      dimensions: ['action'],
      includeTokenMappings: 'referenced',
    });
    expect(refOnly.tokenMappings?.map((t) => t.token)).toEqual(['LOC01']);

    const allTokens = sliceAuteurScript(scriptWithTokens, {
      dimensions: ['action'],
      includeTokenMappings: 'all',
    });
    expect(allTokens.tokenMappings?.map((t) => t.token)).toEqual(['LOC01', 'LOC02']);
  });

  it('validates a structured Script Supervisor AuteurReview and applies its embedded suggestedPatch', () => {
    const slice = sliceAuteurScript(INTERROGATION, 'lens1_spatial_optics');

    const validation = validateAuteurReview({
      overallSummary: 'One visibility refinement recommended.',
      issues: [
        {
          lens: 'Lens 1: Spatial & Optics',
          severity: 'warning',
          targetLevel: 'sub_state',
          targetId: 'S3.2',
          message: 'Clarify Miller hand placement to match LOGIC folder anchor.',
          rationale: 'CAM 01 is OTS Miller; emphasizing palm contact reinforces continuity.',
          repairHint: 'Specify both palms flat on the manila folder.',
          suggestedPatch: {
            expectedSnapshotHash: slice.snapshotHash,
            ops: [
              {
                op: 'replace_sub_state',
                subStateId: 'S3.2',
                subState: {
                  dimension: 'action',
                  subStateTag: 'ACT',
                  content: 'Miller leans forward and presses both palms firmly onto the manila folder',
                },
              },
            ],
          },
        },
      ],
    });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const patch = validation.review.issues[0].suggestedPatch!;
    const applied = applyAuteurPatch(INTERROGATION, patch);
    expect(applied.ok).toBe(true);
    expect(applied.nextRawText).toContain('presses both palms firmly onto the manila folder');
  });

  it('threads optional ruleOverrides through sliceAuteurScript diagnostics', () => {
    const scriptEndingOnDialogue = `[INTENT]
Create a quiet scene.

[LOGIC]
Maintain 180-degree axis. No subtitles appear on screen.

[OPENING]
MS on Miller frame-left facing screen-right.

[EXECUTION]
[CAM 01] MS on Miller -> Miller says (quiet) {Listen closely.}`;

    const defaultLens4 = sliceAuteurScript(scriptEndingOnDialogue, 'lens4_acoustics_voice');
    expect(defaultLens4.diagnostics).toHaveLength(1);
    expect(defaultLens4.diagnostics?.[0]).toMatchObject({
      ruleId: 'macro-state-resolution',
      severity: 'warning',
    });

    const strictLens4 = sliceAuteurScript(scriptEndingOnDialogue, 'lens4_acoustics_voice', {
      'macro-state-resolution': 'error',
    });
    expect(strictLens4.diagnostics).toHaveLength(1);
    expect(strictLens4.diagnostics?.[0]).toMatchObject({
      ruleId: 'macro-state-resolution',
      severity: 'error',
    });

    const mutedLens5 = sliceAuteurScript(scriptEndingOnDialogue, 'lens5_blocks_grammar', {
      'macro-state-resolution': 'off',
    });
    expect(mutedLens5.diagnostics).toEqual([]);
  });

  it('supports surgical macroStateIds filtering while preserving inherited resolvedCamera state and includeStaging: false', () => {
    // S3 in INTERROGATION is a bare [CAM 01] recall that inherits framing from S1
    const surgical = sliceAuteurScript(INTERROGATION, {
      preset: 'lens1_spatial_optics',
      macroStateIds: ['s2', 'S3'],
    });

    expect(surgical.macroStates.map((ms) => ms.id)).toEqual(['S2', 'S3']);
    expect(surgical.stagingMacroBlocks.map((b) => b.header)).toEqual(['LOGIC', 'OPENING']);
    expect(surgical.macroStates[1].resolvedCamera).toEqual({
      subStateTag: 'CAM',
      identifier: '01',
      transition: 'RECALL',
      currentDescriptor: '',
      effectiveFraming: 'MS, OTS Miller',
    });

    // includeStaging: false omits stagingMacroBlocks while keeping requested macroStates intact
    const executionOnly = sliceAuteurScript(INTERROGATION, {
      includeStaging: false,
      macroStateIds: ['S3'],
      includeAllSubStates: true,
      includeResolvedCamera: true,
    });
    expect(executionOnly.stagingMacroBlocks).toEqual([]);
    expect(executionOnly.macroStates.map((ms) => ms.id)).toEqual(['S3']);
    expect(executionOnly.macroStates[0].resolvedCamera?.effectiveFraming).toBe('MS, OTS Miller');
  });
});

