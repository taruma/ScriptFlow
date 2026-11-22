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
 * Canonical `[AESTHETIC]` shorthand token mapping segment:
 * `Description -> TOKEN` with optional trailing `(reference: @ref)` / `(ref: @ref)`
 * (supports both ASCII `->` and Unicode `→`).
 */
export const AESTHETIC_TOKEN_SEGMENT_REGEX =
  /^(.*?)\s*(?:->|→)\s*([A-Za-z0-9_-]+)(?:\s*\(\s*(?:reference|ref)\s*:\s*(@[A-Za-z0-9_-]+)\s*\))?\s*$/i;

/**
 * Standalone `[AESTHETIC]` reference anchor without a `-> TOKEN` mapping:
 * e.g. `Sunlit Victorian house (reference: @house)` or `Red vintage coupe (ref: @car)`.
 */
export const AESTHETIC_STANDALONE_REF_REGEX =
  /^(.*?)\s*\(\s*(?:reference|ref)\s*:\s*(@[A-Za-z0-9_-]+)\s*\)\s*$/i;

export type AestheticRow =
  | {type: 'kv'; key: string; value: string}
  | {type: 'free'; raw: string};

export interface ParsedAestheticTokenSegment {
  description: string;
  token: string;
  reference?: string;
}

export interface ParsedAestheticStandaloneRef {
  description: string;
  reference: string;
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
 * Parses a single semicolon-delimited `[AESTHETIC]` segment (`Description -> TOKEN [(reference: @ref)]`).
 * Returns null when the segment does not declare a shorthand token mapping.
 */
export function parseAestheticTokenSegment(segment: string): ParsedAestheticTokenSegment | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  const match = AESTHETIC_TOKEN_SEGMENT_REGEX.exec(trimmed);
  if (!match) return null;

  const token = match[2].trim();
  if (!token) return null;

  const reference = match[3]?.trim() || undefined;

  return {
    description: match[1].trim(),
    token,
    ...(reference ? {reference} : {}),
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
 * Extracts standalone `(reference: @ref)` / `(ref: @ref)` bindings from an `[AESTHETIC]`
 * value string on segments that do NOT declare a `-> TOKEN` shorthand mapping.
 */
export function extractAestheticStandaloneReferences(
  value: string
): ParsedAestheticStandaloneRef[] {
  if (!value.includes('@')) {
    return [];
  }

  const results: ParsedAestheticStandaloneRef[] = [];
  for (const rawSeg of value.split(';')) {
    const trimmed = rawSeg.trim();
    if (!trimmed) continue;
    // Skip token-mapped segments (handled by extractAestheticTokenSegments)
    if (parseAestheticTokenSegment(trimmed)) continue;

    const match = AESTHETIC_STANDALONE_REF_REGEX.exec(trimmed);
    if (match && match[2]) {
      results.push({
        description: match[1].trim(),
        reference: match[2].trim(),
      });
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
