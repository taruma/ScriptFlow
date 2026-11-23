import {describe, expect, it} from 'vitest';
import {
  extractMetadata,
  inferSceneTopologyFromDocument,
  parseAuteurScript,
} from '../../src/core/index.ts';
import {TEST_CRAFT_EXEMPLARS} from '../fixtures/craftExemplars.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';

describe('Auteur Script Metadata & Continuity Extractor', () => {
  it('extracts @ref character bindings including optional (voice: @audio) tags', () => {
    const raw = `[INTENT]
Create a scene featuring @image1 as Mark (voice: @audio1) and @image2 as Robert, plus @OSCAR as OSCAR (Voice: @voice_oscar).

[CHARACTERS]
@image3 as THE BEAST: Colossal skeletal stag.`;

    const meta = extractMetadata(parseAuteurScript(raw));
    expect(meta.characters).toHaveLength(4);
    expect(meta.characters[0]).toMatchObject({
      ref: '@image1',
      name: 'Mark',
      voiceRef: '@audio1',
    });
    expect(meta.characters[1]).toMatchObject({
      ref: '@image2',
      name: 'Robert',
    });
    expect(meta.characters[2]).toMatchObject({
      ref: '@OSCAR',
      name: 'OSCAR',
      voiceRef: '@voice_oscar',
    });
    expect(meta.characters[3]).toMatchObject({
      ref: '@image3',
      name: 'THE BEAST',
    });
  });

  it('extracts [AESTHETIC] Description -> TOKEN mappings preserving both description and token', () => {
    const raw = `[AESTHETIC]
Location Mapping: Vintage retro bowling alley with neon lanes -> LOC01; Symmetrical library with mahogany shelves -> LOC02
Wardrobe Mapping: Evan in mustard yellow track jacket → EV01`;

    const meta = extractMetadata(parseAuteurScript(raw));
    expect(meta.aestheticTokens).toHaveLength(3);
    expect(meta.aestheticTokens[0]).toMatchObject({
      token: 'LOC01',
      description: 'Vintage retro bowling alley with neon lanes',
      category: 'Location Mapping',
    });
    expect(meta.aestheticTokens[1]).toMatchObject({
      token: 'LOC02',
      description: 'Symmetrical library with mahogany shelves',
    });
    expect(meta.aestheticTokens[2]).toMatchObject({
      token: 'EV01',
      description: 'Evan in mustard yellow track jacket',
    });
  });

  it('tracks camera HOLD, CUT, RECALL, and MONTAGE transitions across beats', () => {
    // Interrogation Coverage: CAM 01 -> CAM 02 (CUT) -> CAM 01 (RECALL)
    const coverageMeta = extractMetadata(
      parseAuteurScript(TEST_CRAFT_EXEMPLARS['interrogation-coverage'].content)
    );
    expect(coverageMeta.beatLinks.map((l) => l.transition)).toEqual([
      'ESTABLISH',
      'CUT',
      'RECALL',
    ]);
    expect(coverageMeta.beatLinks[1].isCutFromPrevious).toBe(true);
    expect(coverageMeta.beatLinks[2].isCutFromPrevious).toBe(true);

    // Simit and River Pebbles (Steadicam Oner): CAM 01 held across all 5 beats
    const onerMeta = extractMetadata(parseAuteurScript(SCRIPT_PRESETS[1].content));
    expect(onerMeta.beatLinks.map((l) => l.transition)).toEqual([
      'ESTABLISH',
      'HOLD',
      'HOLD',
      'HOLD',
      'HOLD',
    ]);
    expect(onerMeta.beatLinks.slice(1).every((l) => l.connectsFromPrevious)).toBe(true);
    expect(onerMeta.beatLinks.every((l) => !l.isCutFromPrevious)).toBe(true);

    // The Grand Continental (Montage): plain [CAM] severs inheritance with CUT hairlines between lines
    const montageMeta = extractMetadata(parseAuteurScript(SCRIPT_PRESETS[0].content));
    expect(montageMeta.beatLinks).toHaveLength(9);
    expect(montageMeta.beatLinks.every((l) => l.transition === 'MONTAGE')).toBe(true);
    expect(montageMeta.beatLinks[0].isCutFromPrevious).toBe(false);
    expect(montageMeta.beatLinks.slice(1).every((l) => l.isCutFromPrevious)).toBe(true);
    expect(montageMeta.aestheticTokens.map((t) => t.token)).toEqual([
      'LOC01',
      'LOC02',
      'LOC03',
      'RS01',
      'RS02',
      'EV01',
      'EV02',
      'FN01',
      'FN02',
    ]);
  });

  it('detects continuation context from [CONTINUITY PROTOCOL] or @video1', () => {
    const withProtocol = parseAuteurScript(
      `[CONTINUITY PROTOCOL]\nPreserve framing from previous clip.\n\n[EXECUTION]\n[CAM 01] MS -> [ACT] Hold`
    );
    expect(extractMetadata(withProtocol).hasContinuationContext).toBe(true);

    const withVideoRef = parseAuteurScript(
      `[INTENT]\nCreate a seamless continuation of @video1 featuring Mark.\n\n[EXECUTION]\n[CAM 01] MS -> [ACT] Hold`
    );
    expect(extractMetadata(withVideoRef).hasContinuationContext).toBe(true);

    const standard = parseAuteurScript(SCRIPT_PRESETS[0].content);
    expect(extractMetadata(standard).hasContinuationContext).toBe(false);
  });

  it('retains optional @ref on [AESTHETIC] tokens and extracts standalone Staging visual references', () => {
    const raw = `[INTENT]
Create a scene featuring @img1 as Evan.

[AESTHETIC]
Location: Warm suburban house interior (reference: @house)
Location Mapping: Dim neon alley -> LOC01; Rainy dock -> LOC03 (reference: @location)
Props: Brass compass (ref: @compass)

[EXECUTION]
[CAM 01] WS in LOC03 -> [ACT] Evan checks the compass`;

    const meta = extractMetadata(parseAuteurScript(raw));
    expect(meta.aestheticTokens).toHaveLength(2);
    expect(meta.aestheticTokens[0].reference).toBeUndefined();
    expect(meta.aestheticTokens[1]).toMatchObject({
      token: 'LOC03',
      description: 'Rainy dock',
      reference: '@location',
    });

    expect(meta.stagingReferences).toHaveLength(2);
    expect(meta.stagingReferences[0]).toMatchObject({
      ref: '@house',
      category: 'Location',
      description: 'Warm suburban house interior',
      sourceBlock: 'AESTHETIC',
    });
    expect(meta.stagingReferences[1]).toMatchObject({
      ref: '@compass',
      category: 'Props',
      description: 'Brass compass',
      sourceBlock: 'AESTHETIC',
    });
  });

  it('infers canonical Scene Topologies cleanly across bundled presets and empty scripts', () => {
    expect(inferSceneTopologyFromDocument(parseAuteurScript(SCRIPT_PRESETS[0].content))).toBe(
      'discontinuous_montage'
    );
    expect(inferSceneTopologyFromDocument(parseAuteurScript(SCRIPT_PRESETS[1].content))).toBe(
      'continuous_oner'
    );
    expect(inferSceneTopologyFromDocument(parseAuteurScript(SCRIPT_PRESETS[2].content))).toBe(
      'multi_camera_coverage'
    );
    expect(inferSceneTopologyFromDocument(parseAuteurScript(SCRIPT_PRESETS[3].content))).toBe(
      'continuous_oner'
    );
    expect(inferSceneTopologyFromDocument(parseAuteurScript(''))).toBe('empty');
  });
});

