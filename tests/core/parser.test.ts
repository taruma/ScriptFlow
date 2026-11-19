import {describe, expect, it} from 'vitest';
import {
  CANONICAL_STAGING_HEADERS,
  exportPlainText,
  isMultiBlockAuteurScript,
  parseAuteurScript,
  parseExecutionLine,
  parseSubState,
} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';

describe('Auteur Script v0.4.0 Parser', () => {
  it('parses all 4 canonical presets with lossless raw round-tripping', () => {
    for (const preset of SCRIPT_PRESETS) {
      const doc = parseAuteurScript(preset.content);

      expect(doc.stagingBlocks.map((b) => b.name)).toEqual([
        'INTENT',
        'LOGIC',
        'AESTHETIC',
        'OPENING',
      ]);
      expect(doc.execution).not.toBeNull();
      expect(doc.execution?.headerName).toBe('EXECUTION');
      expect(doc.execution!.beats.length).toBeGreaterThanOrEqual(3);
      expect(exportPlainText(doc.raw)).toBe(exportPlainText(preset.content));
    }
  });

  it('treats blank lines inside [EXECUTION] as harmless spacers without merging or dropping beats', () => {
    const raw = `[INTENT]
Create a scene.

[EXECUTION]
[CAM 01] MS -> [ACT] Arthur raises the lamp -> <glass rattle>

[CAM 02] CU -> [ACT] Rosa steps back -> <floorboard creak>


[CAM 01] -> [ACT] Arthur lowers the lamp -> <soft click>`;

    const doc = parseAuteurScript(raw);
    expect(doc.execution?.beats).toHaveLength(3);
    expect(doc.execution?.beats.map((b) => b.index)).toEqual([1, 2, 3]);
    expect(doc.execution?.beats[0].subStates).toHaveLength(3);
    expect(doc.execution?.beats[1].subStates).toHaveLength(3);
    expect(doc.execution?.beats[2].subStates).toHaveLength(3);
  });

  it('never treats [TAG] lines inside [EXECUTION] as new Staging Macro-Blocks', () => {
    const raw = `[INTENT]
Create a scene.

[EXECUTION]
[CAM 01] -> [BLOCK] Miller frame-left -> [ACT] Miller slides the folder -> <paper scrape>
[CAM 02] CU on Ray -> [LIGHT] strobe sweeps across the wall -> [ACT] Ray squints`;

    const doc = parseAuteurScript(raw);
    expect(doc.stagingBlocks).toHaveLength(1);
    expect(doc.stagingBlocks[0].name).toBe('INTENT');
    expect(doc.execution?.beats).toHaveLength(2);
    expect(doc.execution?.beats[0].subStates[1].kind).toBe('block');
    expect(doc.execution?.beats[1].subStates[1].kind).toBe('light');
  });

  it('preserves -> inside [AESTHETIC] as token mapping without splitting as Execution chains', () => {
    const raw = `[AESTHETIC]
Location Mapping: Vintage retro bowling alley with neon lanes -> LOC01; Symmetrical library -> LOC02
Wardrobe Mapping: Evan in mustard track jacket -> EV01

[EXECUTION]
[CAM 01] WS in LOC01 -> [ACT] Evan in EV01 sets the bag down → <dull thud>`;

    const doc = parseAuteurScript(raw);
    expect(doc.stagingBlocks).toHaveLength(1);
    expect(doc.stagingBlocks[0].lines).toHaveLength(2);
    expect(doc.stagingBlocks[0].lines[0]).toContain('-> LOC01');
    expect(doc.execution?.beats).toHaveLength(1);
    expect(doc.execution?.beats[0].subStates).toHaveLength(3);
    expect(doc.execution?.beats[0].subStates[2]).toMatchObject({
      kind: 'foley',
      body: 'dull thud',
    });
  });

  it('parses all v0.4.0 inline syntax constructs cleanly', () => {
    const multiWord = parseSubState('Detective Miller says (low, guarded) {Stay right there.}', 0);
    expect(multiWord.kind).toBe('dialogue');
    expect(multiWord.dialogue).toEqual({
      speaker: 'Detective Miller',
      modifiers: '(low, guarded)',
      line: 'Stay right there.',
    });

    const french = parseSubState("Rosa says in French (calmly) {C'est fini.}", 1);
    expect(french.kind).toBe('dialogue');
    expect(french.dialogue).toEqual({
      speaker: 'Rosa',
      language: 'French',
      modifiers: '(calmly)',
      line: "C'est fini.",
    });

    const osParen = parseSubState('Miller says (O.S., flat) {They mean twenty years.}', 2);
    expect(osParen.kind).toBe('dialogue');
    expect(osParen.dialogue).toEqual({
      speaker: 'Miller',
      modifiers: '(O.S., flat)',
      line: 'They mean twenty years.',
    });

    const osPrefix = parseSubState('Arthur says O.S. (strained protest) {Hold the door!}', 3);
    expect(osPrefix.kind).toBe('dialogue');
    expect(osPrefix.dialogue).toEqual({
      speaker: 'Arthur',
      modifiers: 'O.S. (strained protest)',
      line: 'Hold the door!',
    });

    const bareDialogue = parseSubState('Miller says {Look at the dates, Ray.}', 4);
    expect(bareDialogue.kind).toBe('dialogue');
    expect(bareDialogue.dialogue).toEqual({
      speaker: 'Miller',
      line: 'Look at the dates, Ray.',
    });

    const foley = parseSubState('<steel table groaning under weight>', 5);
    expect(foley).toMatchObject({kind: 'foley', body: 'steel table groaning under weight'});

    const score = parseSubState('(sparse bowed cello drone)', 6);
    expect(score).toMatchObject({kind: 'score', body: 'sparse bowed cello drone'});

    const onscreenText = parseSubState('【THREE YEARS LATER】', 7);
    expect(onscreenText).toMatchObject({kind: 'onscreen_text', body: 'THREE YEARS LATER'});
  });

  it('splits both ASCII -> and Unicode → chaining operators inside [EXECUTION]', () => {
    const beat = parseExecutionLine(
      '[STATE IN] Mark grips rail → [ACT] Mark swings forward -> <steel ring> → [STATE OUT] Mark lands',
      1,
      10
    );
    expect(beat.subStates.map((s) => s.kind)).toEqual([
      'state_boundary',
      'action',
      'foley',
      'state_boundary',
    ]);
    expect(beat.subStates[0].tag).toBe('STATE IN');
    expect(beat.subStates[3].tag).toBe('STATE OUT');
  });

  it('detects multi-block canonical Auteur Scripts vs inline snippets for paste hydration', () => {
    expect(CANONICAL_STAGING_HEADERS).toContain('AESTHETIC');
    expect(CANONICAL_STAGING_HEADERS).toContain('INTENT');

    expect(
      isMultiBlockAuteurScript('[INTENT]\nTense standoff.\n\n[EXECUTION]\n[CAM 01] MS -> [ACT] Hold')
    ).toBe(true);
    expect(isMultiBlockAuteurScript('[INTENT]\nSingle header only')).toBe(false);
    expect(isMultiBlockAuteurScript('[CAM 01] MS -> [ACT] Ray walks in')).toBe(false);
  });
});
