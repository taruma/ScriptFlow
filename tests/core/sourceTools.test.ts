import {describe, expect, it} from 'vitest';
import {
  collectScriptSymbols,
  findSourceMatches,
  overlayHighlightSpans,
  parseAuteurScript,
  renameScriptSymbol,
  replaceAllSourceMatches,
  replaceSourceMatch,
  tokenizeSourceDocument,
  validateSymbolRename,
  type SourceFindOptions,
} from '../../src/core/index.ts';

const SAMPLE_SCRIPT = `[INTENT]
Create a tense subway thriller featuring @image1 as Elena (voice: @voice1) and @image10 as Marcus inside LOC01.

[AESTHETIC]
Location: rain-slicked subway platform -> LOC01 (reference: @ref_loc)
Alternate: dry tunnel -> LOC01_ALT
Wardrobe: crimson trench coat -> COAT_RED

[EXECUTION]
[CAM 01] MS, eye level -> [ACT] Elena grips COAT_RED on LOC01 while @image10 watches from the stairs -> Elena says {Wait here, Marcus.}
[CAM 02] CU on Marcus -> [ACT] Marcus nods toward CAM 01 hallway lights -> Marcus says (low) {Let's move.} -> Clerk says {Next train in two minutes.}
[CAM 01] -> [ACT] Elena steps forward across LOC01 -> <distant rail hum>`;

const BASE_FIND: SourceFindOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  scope: 'all',
};

describe('Source Find & Replace (with Regex & Scope)', () => {
  it('finds case-insensitive and case-sensitive matches with accurate offsets and line indices', () => {
    const insensitive = findSourceMatches(SAMPLE_SCRIPT, 'elena', BASE_FIND);
    expect(insensitive.error).toBeNull();
    expect(insensitive.matches).toHaveLength(4);
    expect(insensitive.matches[0].lineIndex).toBe(1);
    expect(SAMPLE_SCRIPT.slice(insensitive.matches[0].start, insensitive.matches[0].end)).toBe(
      'Elena'
    );

    const sensitive = findSourceMatches(SAMPLE_SCRIPT, 'elena', {
      ...BASE_FIND,
      caseSensitive: true,
    });
    expect(sensitive.matches).toHaveLength(0);
  });

  it('respects whole-word boundaries for plain words and @handles', () => {
    const partialRef = findSourceMatches(SAMPLE_SCRIPT, '@image1', BASE_FIND);
    expect(partialRef.matches).toHaveLength(3); // @image1 + two @image10 prefixes

    const wholeRef = findSourceMatches(SAMPLE_SCRIPT, '@image1', {
      ...BASE_FIND,
      wholeWord: true,
    });
    expect(wholeRef.matches).toHaveLength(1);
    expect(wholeRef.matches[0].text).toBe('@image1');

    const wholeToken = findSourceMatches(SAMPLE_SCRIPT, 'LOC01', {
      ...BASE_FIND,
      wholeWord: true,
    });
    expect(wholeToken.matches).toHaveLength(4); // excludes LOC01_ALT
  });

  it('filters matches cleanly by Staging and Execution scope without mutating [EXECUTION] header', () => {
    const stagingOnly = findSourceMatches(SAMPLE_SCRIPT, 'Elena', {
      ...BASE_FIND,
      scope: 'staging',
    });
    expect(stagingOnly.matches).toHaveLength(1);

    const executionOnly = findSourceMatches(SAMPLE_SCRIPT, 'Elena', {
      ...BASE_FIND,
      scope: 'execution',
    });
    expect(executionOnly.matches).toHaveLength(3);

    const execHeaderSearch = findSourceMatches(SAMPLE_SCRIPT, 'EXECUTION', {
      ...BASE_FIND,
      scope: 'execution',
    });
    expect(execHeaderSearch.matches).toHaveLength(0);
  });

  it('supports regex search, capture-group replacements, and guards invalid or zero-length patterns', () => {
    const regexFind = findSourceMatches(SAMPLE_SCRIPT, '\\[CAM (\\d+)\\]', {
      caseSensitive: true,
      wholeWord: false,
      regex: true,
      scope: 'execution',
    });
    expect(regexFind.error).toBeNull();
    expect(regexFind.matches).toHaveLength(3);

    const regexReplace = replaceAllSourceMatches(
      SAMPLE_SCRIPT,
      '\\[CAM (\\d+)\\]',
      '[CAM 1$1]',
      {
        caseSensitive: true,
        wholeWord: false,
        regex: true,
        scope: 'execution',
      }
    );
    expect(regexReplace.error).toBeNull();
    expect(regexReplace.replacedCount).toBe(3);
    expect(regexReplace.nextRawText).toContain('[CAM 101] MS, eye level');
    expect(regexReplace.nextRawText).toContain('[CAM 102] CU on Marcus');

    // Invalid regex returns an error without throwing
    const invalid = findSourceMatches(SAMPLE_SCRIPT, '[unclosed(', {
      ...BASE_FIND,
      regex: true,
    });
    expect(invalid.matches).toHaveLength(0);
    expect(invalid.error).toBeTruthy();

    // Zero-length regex pattern does not hang
    const zeroLen = findSourceMatches(SAMPLE_SCRIPT, '^', {
      ...BASE_FIND,
      regex: true,
    });
    expect(zeroLen.error).toBeNull();
    expect(zeroLen.matches).toHaveLength(0);
  });

  it('treats $ literally in plain-text replace mode and supports single-match replacement', () => {
    const single = replaceSourceMatch(SAMPLE_SCRIPT, 'Elena', '$1_Maya', BASE_FIND, 1);
    expect(single.replacedCount).toBe(1);
    // Staging line untouched; first Execution occurrence replaced literally with $1_Maya
    expect(single.nextRawText).toContain('@image1 as Elena');
    expect(single.nextRawText).toContain('[ACT] $1_Maya grips COAT_RED');
    expect(single.nextRawText).toContain('Elena says {Wait here, Marcus.}');
  });
});

describe('overlayHighlightSpans lossless slicing', () => {
  it('preserves exact character-for-character document text and emits one active anchor', () => {
    const baseSpans = tokenizeSourceDocument(SAMPLE_SCRIPT, []);
    const found = findSourceMatches(SAMPLE_SCRIPT, 'Elena', BASE_FIND);
    const overlaid = overlayHighlightSpans(
      baseSpans,
      found.matches.map((m, idx) => ({
        start: m.start,
        end: m.end,
        active: idx === 1,
      }))
    );

    expect(overlaid.map((s) => s.text).join('')).toBe(SAMPLE_SCRIPT);
    const activeAnchors = overlaid.filter((s) => s.isActiveAnchor);
    expect(activeAnchors).toHaveLength(1);
    expect(overlaid.filter((s) => s.overlay === 'active').map((s) => s.text).join('')).toBe(
      'Elena'
    );
  });
});

describe('Safe Symbol Rename', () => {
  it('collects characters (bound + dialogue speakers), @refs, lookbook tokens, and camera slots', () => {
    const symbols = collectScriptSymbols(SAMPLE_SCRIPT);
    const byId = new Map(symbols.map((s) => [s.id, s]));

    expect(byId.get('character:Elena')?.occurrences).toHaveLength(4);
    expect(byId.get('character:Marcus')?.occurrences).toHaveLength(5);
    expect(byId.get('character:Clerk')?.occurrences).toHaveLength(1);

    // @image1 must not collide with @image10
    expect(byId.get('reference:@image1')?.occurrences).toHaveLength(1);
    expect(byId.get('reference:@image10')?.occurrences).toHaveLength(2);
    expect(byId.get('reference:@voice1')?.occurrences).toHaveLength(1);
    expect(byId.get('reference:@ref_loc')?.occurrences).toHaveLength(1);

    // LOC01 must not collide with LOC01_ALT
    expect(byId.get('token:LOC01')?.occurrences).toHaveLength(4);
    expect(byId.get('token:LOC01_ALT')?.occurrences).toHaveLength(1);
    expect(byId.get('token:COAT_RED')?.occurrences).toHaveLength(2);

    // CAM 01 matches ONLY bracketed [CAM 01] tags, NOT plain prose "toward CAM 01 hallway lights"
    expect(byId.get('camera:CAM 01')?.occurrences).toHaveLength(2);
    expect(byId.get('camera:CAM 02')?.occurrences).toHaveLength(1);
  });

  it('blocks collisions (including camera slot collisions) and invalid syntax formats', () => {
    const symbols = collectScriptSymbols(SAMPLE_SCRIPT);
    const cam01 = symbols.find((s) => s.id === 'camera:CAM 01')!;
    const ref1 = symbols.find((s) => s.id === 'reference:@image1')!;
    const token1 = symbols.find((s) => s.id === 'token:LOC01')!;

    // Camera collision blocked (CAM 01 -> existing CAM 02)
    const camCollision = validateSymbolRename(cam01, 'cam 02', symbols);
    expect(camCollision.valid).toBe(false);
    expect(camCollision.reason).toBe('collision');
    expect(camCollision.collidingSymbol).toBe('CAM 02');

    // Camera invalid format blocked
    const camInvalid = validateSymbolRename(cam01, 'CAMERA ONE', symbols);
    expect(camInvalid.valid).toBe(false);
    expect(camInvalid.reason).toBe('invalid_format');

    // Reference missing @ blocked
    const refInvalid = validateSymbolRename(ref1, 'image2', symbols);
    expect(refInvalid.valid).toBe(false);
    expect(refInvalid.reason).toBe('invalid_format');

    // Reference collision blocked
    const refCollision = validateSymbolRename(ref1, '@image10', symbols);
    expect(refCollision.valid).toBe(false);
    expect(refCollision.reason).toBe('collision');

    // Token with spaces blocked
    const tokenInvalid = validateSymbolRename(token1, 'SUBWAY STATION', symbols);
    expect(tokenInvalid.valid).toBe(false);
    expect(tokenInvalid.reason).toBe('invalid_format');

    // Refusing rename returns original text unchanged
    const blockedResult = renameScriptSymbol(SAMPLE_SCRIPT, cam01, 'CAM 02', symbols);
    expect(blockedResult.ok).toBe(false);
    expect(blockedResult.nextRawText).toBe(SAMPLE_SCRIPT);
  });

  it('performs boundary-safe renames cleanly across all symbol categories and re-parses cleanly', () => {
    const symbols = collectScriptSymbols(SAMPLE_SCRIPT);

    // 1. Rename camera slot CAM 01 -> CAM 03 (normalizes lowercase input)
    const cam01 = symbols.find((s) => s.id === 'camera:CAM 01')!;
    const camRenamed = renameScriptSymbol(SAMPLE_SCRIPT, cam01, 'cam  03', symbols);
    expect(camRenamed.ok).toBe(true);
    expect(camRenamed.replacedCount).toBe(2);
    expect(camRenamed.nextRawText).toContain('[CAM 03] MS, eye level');
    expect(camRenamed.nextRawText).toContain('[CAM 03] -> [ACT]');
    // Plain prose mention outside brackets stays untouched
    expect(camRenamed.nextRawText).toContain('toward CAM 01 hallway lights');
    const reparsedCam = parseAuteurScript(camRenamed.nextRawText);
    expect(reparsedCam.execution?.beats[0].subStates[0].camera?.slot).toBe('CAM 03');

    // 2. Rename @image1 -> @hero1 without touching @image10
    const ref1 = symbols.find((s) => s.id === 'reference:@image1')!;
    const refRenamed = renameScriptSymbol(SAMPLE_SCRIPT, ref1, '@hero1', symbols);
    expect(refRenamed.ok).toBe(true);
    expect(refRenamed.replacedCount).toBe(1);
    expect(refRenamed.nextRawText).toContain('@hero1 as Elena');
    expect(refRenamed.nextRawText).toContain('@image10 as Marcus');
    expect(refRenamed.nextRawText).toContain('while @image10 watches');

    // 3. Rename LOC01 -> PLATFORM_A without touching LOC01_ALT
    const loc1 = symbols.find((s) => s.id === 'token:LOC01')!;
    const tokenRenamed = renameScriptSymbol(SAMPLE_SCRIPT, loc1, 'PLATFORM_A', symbols);
    expect(tokenRenamed.ok).toBe(true);
    expect(tokenRenamed.replacedCount).toBe(4);
    expect(tokenRenamed.nextRawText).toContain('-> PLATFORM_A (reference: @ref_loc)');
    expect(tokenRenamed.nextRawText).toContain('-> LOC01_ALT');
    expect(tokenRenamed.nextRawText).toContain('steps forward across PLATFORM_A');

    // 4. Rename character Elena -> Nadia
    const elena = symbols.find((s) => s.id === 'character:Elena')!;
    const charRenamed = renameScriptSymbol(SAMPLE_SCRIPT, elena, 'Nadia', symbols);
    expect(charRenamed.ok).toBe(true);
    expect(charRenamed.replacedCount).toBe(4);
    expect(charRenamed.nextRawText).toContain('@image1 as Nadia');
    expect(charRenamed.nextRawText).toContain('Nadia says {Wait here, Marcus.}');
  });
});
