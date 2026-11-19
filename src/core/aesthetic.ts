import {normalizeLineEndings} from './parser.ts';

/**
 * Canonical [AESTHETIC] lookbook `Key: Value` line matcher.
 * Supports multi-word keys, digits, underscores, slashes, and hyphens (e.g. `Color Palette:`).
 * Requires at least one non-whitespace key character so `: value` / `  : value` stay freeform.
 */
export const AESTHETIC_KEY_VALUE_REGEX = /^\s*([A-Za-z0-9_/-][A-Za-z0-9 _/-]*):(?:\s*(.*))?$/;

/**
 * Lossless line capture regex for syntax highlighting `[AESTHETIC]` lines
 * (`leadingWs`, `keyWithColon`, `afterColonWs`, `value`).
 */
export const AESTHETIC_LINE_CAPTURE_REGEX = /^(\s*)([A-Za-z0-9_/-][A-Za-z0-9 _/-]*:)(\s*)(.*)$/;

/** Canonical shorthand token identifier in `[AESTHETIC]` mappings (e.g. `LOC01`, `EV01`) */
export const AESTHETIC_TOKEN_NAME_REGEX = /^[A-Za-z0-9_-]+$/;

/**
 * Canonical `[AESTHETIC]` shorthand token mapping segment: `Description -> TOKEN`
 * (supports both ASCII `->` and Unicode `→`).
 */
export const AESTHETIC_TOKEN_SEGMENT_REGEX = /^(.*?)\s*(?:->|→)\s*([A-Za-z0-9_-]+)\s*$/;

export type AestheticRow =
  | {type: 'kv'; key: string; value: string}
  | {type: 'free'; raw: string};

export interface ParsedAestheticTokenSegment {
  description: string;
  token: string;
}

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
 * Parses a single semicolon-delimited `[AESTHETIC]` segment (`Description -> TOKEN`).
 * Returns null when the segment does not declare a shorthand token mapping.
 */
export function parseAestheticTokenSegment(segment: string): ParsedAestheticTokenSegment | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  const match = AESTHETIC_TOKEN_SEGMENT_REGEX.exec(trimmed);
  if (!match) return null;

  const token = match[2].trim();
  if (!token) return null;

  return {
    description: match[1].trim(),
    token,
  };
}

/**
 * Extracts all `Description -> TOKEN` mappings from an `[AESTHETIC]` value string
 * (supporting multiple semicolon-delimited mappings on one line).
 */
export function extractAestheticTokenSegments(value: string): ParsedAestheticTokenSegment[] {
  if (!value.includes('->') && !value.includes('→')) {
    return [];
  }

  const results: ParsedAestheticTokenSegment[] = [];
  for (const rawSeg of value.split(';')) {
    const parsed = parseAestheticTokenSegment(rawSeg);
    if (parsed) {
      results.push(parsed);
    }
  }
  return results;
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
