import {describe, expect, it} from 'vitest';
import {
  lintCameraRedefinition,
  lintDocument,
  lintFrozenFirstFrame,
  lintMacroStateResolution,
  lintMultimodalReferenceIsolation,
  lintViewportCoordinates,
  parseAuteurScript,
} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';

describe('Script Supervisor Deterministic Linter (5 V1 Rules)', () => {
  it('passes all 4 canonical v0.4.0 presets with zero diagnostics', () => {
    for (const preset of SCRIPT_PRESETS) {
      const doc = parseAuteurScript(preset.content);
      const diagnostics = lintDocument(doc);
      expect(diagnostics, `Unexpected lint errors on preset "${preset.title}"`).toEqual([]);
    }
  });

  describe('Rule 1 — Viewport Coordinate Purity (Lens 1)', () => {
    it('flags stage-left and stage-right in [LOGIC], [OPENING], and [EXECUTION]', () => {
      const raw = `[LOGIC]
Keep Miller stage-left facing Ray.

[OPENING]
MS with Ray seated stage-right beside the lamp.

[EXECUTION]
[CAM 01] MS -> [ACT] Miller steps toward Stage-Right -> <boot scuff>`;

      const diags = lintViewportCoordinates(parseAuteurScript(raw));
      expect(diags).toHaveLength(3);
      expect(diags.every((d) => d.lens === 'Lens 1: Spatial & Optics')).toBe(true);
      expect(diags.every((d) => d.severity === 'error')).toBe(true);
    });

    it('allows camera-viewport frame-left / frame-right / screen-left / screen-right', () => {
      const raw = `[LOGIC]
Keep Miller frame-left facing screen-right and Ray frame-right facing screen-left.

[OPENING]
MS, Miller sits frame-left facing screen-right.

[EXECUTION]
[CAM 01] MS -> [ACT] Miller leans frame-right -> <chair scrape>`;

      expect(lintViewportCoordinates(parseAuteurScript(raw))).toEqual([]);
    });
  });

  describe('Rule 2 — Macro-State Resolution Discipline (Lens 4)', () => {
    it('flags any [EXECUTION] beat whose final Sub-State is spoken dialogue', () => {
      const raw = `[EXECUTION]
[CAM 01] MS -> [ACT] Miller taps the folder -> Miller says {Look at the dates.}
[CAM 02] CU -> [ACT] Ray narrows his eyes -> Ray says (flat) {Nothing there.} -> [ACT] Ray taps ash`;

      const diags = lintMacroStateResolution(parseAuteurScript(raw));
      expect(diags).toHaveLength(1);
      expect(diags[0].lens).toBe('Lens 4: Acoustics & Voice');
      expect(diags[0].target).toMatchObject({phase: 'execution', beatIndex: 1});
    });

    it('passes when dialogue is followed by [ACT] or <foley>', () => {
      const raw = `[EXECUTION]
[CAM 01] MS -> Miller says {Look at the dates.} -> <folder slap>
[CAM 02] CU -> Ray says (quietly) {Fine.} -> [ACT] Ray exhales slowly`;

      expect(lintMacroStateResolution(parseAuteurScript(raw))).toEqual([]);
    });
  });

  describe('Rule 3 — Multimodal Reference Isolation (Lens 5)', () => {
    it('flags @ref tokens appearing in [LOGIC], [AESTHETIC], [OPENING], or [EXECUTION]', () => {
      const raw = `[INTENT]
Create a scene featuring @image1 as Mark and @actor2 as Robert.

[LOGIC]
Keep @image1 frame-left.

[AESTHETIC]
Wardrobe: @actor2 in a charcoal coat

[OPENING]
MS on @image1 standing by the door.

[EXECUTION]
[CAM 01] MS -> [ACT] @image1 turns toward the hallway -> <hinge creak>`;

      const diags = lintMultimodalReferenceIsolation(parseAuteurScript(raw));
      expect(diags).toHaveLength(4);
      expect(diags.every((d) => d.lens === 'Lens 5: Blocks & Grammar')).toBe(true);
    });

    it('permits @ref tokens inside [INTENT], [CHARACTERS], [REFERENCES], and [CONTINUITY PROTOCOL]', () => {
      const raw = `[INTENT]
Create a continuation of @video1 featuring @image1 as Mark (voice: @audio1).

[CHARACTERS]
@actor2 as Robert: tall courier.

[REFERENCES]
@prop1 as brass compass.

[CONTINUITY PROTOCOL]
Inherit lighting and hand grips directly from @video1.

[OPENING]
MS on Mark holding the brass compass in his right hand.

[EXECUTION]
[CAM 01] MS -> [ACT] Mark opens the compass -> <brass latch click>`;

      expect(lintMultimodalReferenceIsolation(parseAuteurScript(raw))).toEqual([]);
    });
  });

  describe('Rule 4 — Frozen First-Frame Purity (Lens 5)', () => {
    it('flags square-bracketed [TAG] tokens inside [OPENING]', () => {
      const raw = `[OPENING]
[CAM 01] MS at eye level. [ACT] Miller sits frame-left facing screen-right.`;

      const diags = lintFrozenFirstFrame(parseAuteurScript(raw));
      expect(diags).toHaveLength(1);
      expect(diags[0].lens).toBe('Lens 5: Blocks & Grammar');
      expect(diags[0].excerpt).toContain('[CAM 01]');
    });

    it('passes plain still-frame prose inside [OPENING]', () => {
      const raw = `[OPENING]
MS at eye level. Frame-left, Miller sits facing screen-right with his left palm flat on a manila folder.`;

      expect(lintFrozenFirstFrame(parseAuteurScript(raw))).toEqual([]);
    });
  });

  describe('Rule 5 — Camera Re-Definition & Oner Jump-Cut Guard (Lens 1)', () => {
    it('flags static shot-scale re-declaration on an already-established numbered camera slot', () => {
      const raw = `[EXECUTION]
[CAM 01] MS, OTS Miller -> [ACT] Miller slides the folder -> <paper scrape>
[CAM 01] Low-angle FS on Miller -> [ACT] Miller stands up -> <chair scrape>`;

      const diags = lintCameraRedefinition(parseAuteurScript(raw));
      expect(diags).toHaveLength(1);
      expect(diags[0].lens).toBe('Lens 1: Spatial & Optics');
      expect(diags[0].target).toMatchObject({phase: 'execution', beatIndex: 2});
    });

    it('allows bare holds/recalls ([CAM 01] ->) and operator motion transitions', () => {
      const raw = `[EXECUTION]
[CAM 01] POV handheld MS, eye-level -> [ACT] Arthur sweeps the flashlight beam -> <mud squelch>
[CAM 01] POV PAN LEFT to Rosa -> [ACT] Rosa steps back -> <twig snap>
[CAM 01] CRANING DOWN to a low-angle two-shot -> [ACT] Both freeze -> <wind gust>
[CAM 01] -> [ACT] Arthur raises his left palm -> <shallow breath>`;

      expect(lintCameraRedefinition(parseAuteurScript(raw))).toEqual([]);
    });

    it('honors the [CONTINUITY PROTOCOL] / @video1 first-appearance exception while still flagging duplicate re-definitions later in the same clip', () => {
      const raw = `[INTENT]
Create a seamless continuation of @video1 featuring Mark and Robert.

[CONTINUITY PROTOCOL]
Inherit lighting and established camera setups from @video1.

[EXECUTION]
[CAM 01] MS, OTS Mark -> [ACT] Mark shifts his grip -> <fabric rustle>
[CAM 02] CU on Robert -> [ACT] Robert narrows his eyes -> <steady exhale>
[CAM 01] -> [ACT] Mark steps left -> <boot scuff>
[CAM 02] ECU on Robert -> [ACT] Robert clenches his jaw -> <teeth click>`;

      const diags = lintCameraRedefinition(parseAuteurScript(raw));
      // First appearances of CAM 01 (S1) and CAM 02 (S2) are allowed; bare recall CAM 01 (S3) is allowed;
      // Only S4 (second static re-definition of CAM 02) should be flagged!
      expect(diags).toHaveLength(1);
      expect(diags[0].target).toMatchObject({phase: 'execution', beatIndex: 4});
    });
  });
});
