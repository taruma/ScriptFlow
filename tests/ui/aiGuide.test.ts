import {describe, expect, it} from 'vitest';
import {
  AI_GUIDE_MANIFEST,
  BUNDLED_AI_GUIDE_SECTIONS,
  normalizeGuideMarkdown,
  resolveAiGuideCatalog,
} from '../../src/data/guide/index.ts';

describe('AI Guide Markdown registry (src/data/guide)', () => {
  it('resolves all bundled guide sections cleanly with normalized Markdown bodies', () => {
    expect(BUNDLED_AI_GUIDE_SECTIONS.length).toBe(AI_GUIDE_MANIFEST.length);
    expect(BUNDLED_AI_GUIDE_SECTIONS.map((s) => s.id)).toEqual([
      'workflow',
      'attachments',
      'cache_cost',
    ]);

    for (const section of BUNDLED_AI_GUIDE_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0);
      expect(section.summary.length).toBeGreaterThan(0);
      expect(section.body.length).toBeGreaterThan(40);
      expect(section.body).not.toContain('\r');
      expect(section.body.endsWith('\n')).toBe(false);
    }
  });

  it('normalizes BOM, CRLF, and trailing newlines cleanly', () => {
    expect(normalizeGuideMarkdown('\uFEFF## Title\r\n- item\r\n\n')).toBe('## Title\n- item');
  });

  it('throws clear errors for invalid, duplicate, or missing guide catalog entries', () => {
    expect(() =>
      resolveAiGuideCatalog(
        [{id: '   ', label: 'Empty', summary: 'x', file: 'a.md'}],
        {'./a.md': '# A'}
      )
    ).toThrow(/missing a non-empty "id"/i);

    expect(() =>
      resolveAiGuideCatalog(
        [
          {id: 'dup', label: 'First', summary: 'x', file: 'a.md'},
          {id: 'dup', label: 'Second', summary: 'y', file: 'b.md'},
        ],
        {'./a.md': '# A', './b.md': '# B'}
      )
    ).toThrow(/Duplicate AI Guide section id "dup"/i);

    expect(() =>
      resolveAiGuideCatalog(
        [{id: 'missing', label: 'Missing', summary: 'x', file: 'missing.md'}],
        {'./other.md': '# Other'}
      )
    ).toThrow(/Missing AI Guide markdown file "missing\.md"/i);
  });
});
