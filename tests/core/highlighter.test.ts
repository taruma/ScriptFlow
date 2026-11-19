import {describe, expect, it} from 'vitest';
import {
  extractMetadata,
  parseAuteurScript,
  segmentClauseText,
  tokenizeAestheticLine,
  tokenizeAestheticValue,
  tokenizeExecutionLine,
  tokenizeSourceDocument,
  tokenizeStagingBody,
  type HighlightSpan,
} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';

function flattenSpans(spans: readonly HighlightSpan[]): string {
  return spans.map((s) => s.text).join('');
}

describe('Pure Live Syntax & Clause-Underline Tokenizer', () => {
  it('preserves exact character-for-character text across all canonical presets in Source & Live modes', () => {
    for (const preset of SCRIPT_PRESETS) {
      const doc = parseAuteurScript(preset.content);
      const meta = extractMetadata(doc);

      const sourceSpans = tokenizeSourceDocument(preset.content, meta.aestheticTokens);
      expect(flattenSpans(sourceSpans)).toBe(preset.content);

      for (const block of doc.stagingBlocks) {
        const stagingSpans = tokenizeStagingBody(block.rawBody, block.kind, meta.aestheticTokens);
        expect(flattenSpans(stagingSpans)).toBe(block.rawBody);
      }

      for (const beat of doc.execution?.beats ?? []) {
        const execSpans = tokenizeExecutionLine(beat.raw, meta.aestheticTokens, true);
        expect(flattenSpans(execSpans)).toBe(beat.raw);
      }
    }
  });

  it('segments comma phrases vs period/semicolon sentences while leaving punctuation un-underlined', () => {
    const input = 'Slow dolly in, low angle. Hold for two beats; then pan right.';
    const spans = segmentClauseText(input);

    expect(flattenSpans(spans)).toBe(input);
    expect(spans.filter((s) => s.kind === 'clause_phrase').map((s) => s.text)).toEqual([
      'Slow dolly in',
    ]);
    expect(spans.filter((s) => s.kind === 'clause_sentence').map((s) => s.text)).toEqual([
      'low angle',
      'Hold for two beats',
      'then pan right',
    ]);
    expect(spans.filter((s) => s.kind === 'plain' && /^[,;.]$/.test(s.text)).map((s) => s.text)).toEqual([
      ',',
      '.',
      ';',
      '.',
    ]);
  });

  it('never splits decimals, ellipses, or abbreviations when segmenting clauses', () => {
    const input = 'Mr. Vance checks 2.39:1 framing... O.S. footsteps fade.';
    const spans = segmentClauseText(input);

    expect(flattenSpans(spans)).toBe(input);
    const sentences = spans.filter((s) => s.kind === 'clause_sentence');
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('Mr. Vance checks 2.39:1 framing... O.S. footsteps fade');
  });

  it('highlights inline @refs, lookbook tokens, banned stage directions, and skips clause underlines inside {dialogue}', () => {
    const tokens = [{token: 'LOC01', description: 'Hallway', lineIndex: 1}];
    const actionLine = '[ACT] @detective steps stage-left into LOC01, pausing.';
    const actionSpans = tokenizeExecutionLine(actionLine, tokens, false);

    expect(flattenSpans(actionSpans)).toBe(actionLine);
    expect(actionSpans.find((s) => s.kind === 'tag')?.text).toBe('[ACT]');
    expect(actionSpans.find((s) => s.kind === 'ref')?.text).toBe('@detective');
    expect(actionSpans.find((s) => s.kind === 'error')?.text).toBe('stage-left');
    expect(actionSpans.find((s) => s.kind === 'token')?.text).toBe('LOC01');

    const dialogueLine = 'Miller says (O.S., flat) {Stay put, Ray. Do not move.}';
    const dialogueSpans = tokenizeExecutionLine(dialogueLine, tokens, false);
    expect(flattenSpans(dialogueSpans)).toBe(dialogueLine);
    expect(dialogueSpans.find((s) => s.kind === 'speaker')?.text).toBe('Miller');
    expect(dialogueSpans.find((s) => s.kind === 'verb')?.text).toBe(' says (O.S., flat) ');
    expect(dialogueSpans.some((s) => s.kind === 'clause_phrase' || s.kind === 'clause_sentence')).toBe(
      false
    );
  });

  it('flags bracket tags inside [OPENING] and highlights [AESTHETIC] keys and -> TOKEN arrows', () => {
    const opening = 'Quiet room [CAM 01] with rain outside.';
    const openingSpans = tokenizeStagingBody(opening, 'OPENING', []);
    expect(flattenSpans(openingSpans)).toBe(opening);
    expect(openingSpans.find((s) => s.kind === 'error')?.text).toBe('[CAM 01]');

    const aestheticLine = 'Location: Rain-slicked alley -> LOC01, @hero silhouette';
    const aestheticSpans = tokenizeAestheticLine(aestheticLine);
    expect(flattenSpans(aestheticSpans)).toBe(aestheticLine);
    expect(aestheticSpans.find((s) => s.kind === 'aesthetic_key')?.text).toBe('Location:');
    expect(aestheticSpans.find((s) => s.kind === 'arrow')?.text).toBe('->');
    expect(aestheticSpans.find((s) => s.kind === 'token')?.text).toBe('LOC01');
    expect(aestheticSpans.find((s) => s.kind === 'ref')?.text).toBe('@hero');

    const valueOnly = 'Warm tungsten -> LIT02';
    expect(flattenSpans(tokenizeAestheticValue(valueOnly))).toBe(valueOnly);
  });
});
