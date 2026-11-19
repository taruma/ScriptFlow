import {normalizeLineEndings} from './parser.ts';

/**
 * Canonical [AESTHETIC] lookbook `Key: Value` line matcher.
 * Supports multi-word keys, digits, underscores, slashes, and hyphens (e.g. `Color Palette:`).
 */
export const AESTHETIC_KEY_VALUE_REGEX = /^\s*([A-Za-z0-9 _/-]+):(?:\s*(.*))?$/;

export type AestheticRow =
  | {type: 'kv'; key: string; value: string}
  | {type: 'free'; raw: string};

/**
 * Parses a single [AESTHETIC] line into a structured `Key: Value` row or a freeform fallback line.
 */
export function parseAestheticLine(line: string): AestheticRow {
  const match = AESTHETIC_KEY_VALUE_REGEX.exec(line);
  if (match) {
    return {
      type: 'kv',
      key: match[1].trim(),
      value: match[2] ?? '',
    };
  }
  return {
    type: 'free',
    raw: line,
  };
}

/**
 * Parses a raw [AESTHETIC] block body into editable rows.
 * An empty body yields a single blank key-value starter row for immediate editing.
 */
export function parseAestheticRows(rawBody: string): AestheticRow[] {
  const normalized = normalizeLineEndings(rawBody);
  if (normalized.length === 0) {
    return [{type: 'kv', key: '', value: ''}];
  }
  return normalized.split('\n').map(parseAestheticLine);
}

/**
 * Serializes structured [AESTHETIC] rows back into canonical plain-text lines.
 */
export function serializeAestheticRows(rows: readonly AestheticRow[]): string {
  return rows
    .map((row) => {
      if (row.type === 'free') {
        return row.raw;
      }
      const cleanKey = row.key.trim();
      const cleanValue = row.value;
      if (cleanKey.length === 0 && cleanValue.trim().length === 0) {
        return '';
      }
      if (cleanKey.length === 0) {
        return cleanValue;
      }
      if (cleanValue.length === 0) {
        return `${cleanKey}:`;
      }
      return `${cleanKey}: ${cleanValue}`;
    })
    .join('\n');
}

/**
 * Counts the number of declared `Key:` lookbook entries across [AESTHETIC] lines.
 */
export function countAestheticKeys(lines: readonly string[]): number {
  let count = 0;
  for (const line of lines) {
    if (parseAestheticLine(line).type === 'kv') {
      count += 1;
    }
  }
  return count;
}
