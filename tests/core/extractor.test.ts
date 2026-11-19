import {describe, expect, it} from 'vitest';
import {extractMetadata, parseAuteurScript} from '../../src/core/index.ts';
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
    const coverageMeta = extractMetadata(parseAuteurScript(SCRIPT_PRESETS[0].content));
    expect(coverageMeta.beatLinks.map((l) => l.transition)).toEqual([
      'ESTABLISH',
      'CUT',
      'RECALL',
    ]);
    expect(coverageMeta.beatLinks[1].isCutFromPrevious).toBe(true);
    expect(coverageMeta.beatLinks[2].isCutFromPrevious).toBe(true);

    // Subway Train Oner: CAM 01 held across all 5 beats
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

    // Heist Montage: plain [CAM] severs inheritance with CUT hairlines between lines
    const montageMeta = extractMetadata(parseAuteurScript(SCRIPT_PRESETS[3].content));
    expect(montageMeta.beatLinks.map((l) => l.transition)).toEqual([
      'MONTAGE',
      'MONTAGE',
      'MONTAGE',
      'MONTAGE',
    ]);
    expect(montageMeta.beatLinks[0].isCutFromPrevious).toBe(false);
    expect(montageMeta.beatLinks.slice(1).every((l) => l.isCutFromPrevious)).toBe(true);
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
});
