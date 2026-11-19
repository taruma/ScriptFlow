import {describe, expect, it} from 'vitest';
import {
  countAestheticKeys,
  extractAestheticTokenSegments,
  extractAestheticTokens,
  parseAestheticEntries,
  parseAestheticLine,
  parseAestheticRows,
  parseAuteurScript,
  serializeAestheticRows,
  toAuteurEnvelope,
} from '../../src/core/index.ts';

describe('Aesthetic Lookbook Row Codec', () => {
  it('parses key: value lines and preserves freeform notes losslessly', () => {
    const body = [
      'Medium: 35mm Kodak Vision3 500T, 2.39:1 anamorphic.',
      'Color/Light: Sodium vapor wash -> LIT01',
      'Plain freeform note without colon',
      'Wardrobe:',
    ].join('\n');

    const rows = parseAestheticRows(body);
    expect(rows).toEqual([
      {type: 'kv', key: 'Medium', value: '35mm Kodak Vision3 500T, 2.39:1 anamorphic.'},
      {type: 'kv', key: 'Color/Light', value: 'Sodium vapor wash -> LIT01'},
      {type: 'free', raw: 'Plain freeform note without colon'},
      {type: 'kv', key: 'Wardrobe', value: ''},
    ]);

    expect(serializeAestheticRows(rows)).toBe(body);
  });

  it('yields a single blank starter row for an empty body and serializes cleanly', () => {
    const rows = parseAestheticRows('');
    expect(rows).toEqual([{type: 'kv', key: '', value: ''}]);
    expect(serializeAestheticRows(rows)).toBe('');
  });

  it('counts declared lookbook keys while ignoring blank and freeform lines', () => {
    const lines = [
      'Medium: Digital 65mm',
      '',
      'Just a loose style note',
      '  Lighting: Overhead practicals',
      'Location Mapping: Corridor -> LOC01',
    ];
    expect(countAestheticKeys(lines)).toBe(3);
  });

  it('stays 100% aligned with IR parseAestheticEntries', () => {
    const lines = [
      'Camera Stock: 16mm grainy',
      'Freeform line',
      'Wardrobe Mapping: Navy coat -> COAT01',
    ];

    const entries = parseAestheticEntries(lines, 'MB2');
    const rows = lines.map(parseAestheticLine);

    expect(entries).toEqual([
      {id: 'MB2.0', key: 'Camera Stock', value: '16mm grainy'},
      {id: 'MB2.1', key: null, value: 'Freeform line'},
      {id: 'MB2.2', key: 'Wardrobe Mapping', value: 'Navy coat -> COAT01'},
    ]);

    rows.forEach((row, idx) => {
      if (row.type === 'kv') {
        expect(entries[idx].key).toBe(row.key);
        expect(entries[idx].value).toBe(row.value);
      } else {
        expect(entries[idx].key).toBeNull();
        expect(entries[idx].value).toBe(row.raw);
      }
    });
  });

  it('treats whitespace-only colon prefixes as freeform lines and keeps token extraction consistent across extractor and IR', () => {
    expect(parseAestheticLine(': orphan value')).toEqual({type: 'free', raw: ': orphan value'});
    expect(parseAestheticLine('   : orphan value')).toEqual({
      type: 'free',
      raw: '   : orphan value',
    });

    const script = `[AESTHETIC]
Location: dim alley -> LOC01; neon diner → LOC02
   : unlabelled note -> NOTE01`;

    const extracted = extractAestheticTokens(parseAuteurScript(script));
    const envelopeTokens = toAuteurEnvelope(script).derived.tokenMappings;

    expect(extractAestheticTokenSegments('dim alley -> LOC01; neon diner → LOC02')).toEqual([
      {description: 'dim alley', token: 'LOC01'},
      {description: 'neon diner', token: 'LOC02'},
    ]);
    expect(extracted.map(({token, description, category}) => ({token, description, category}))).toEqual(
      envelopeTokens.map(({token, description, category}) => ({token, description, category}))
    );
  });
});
