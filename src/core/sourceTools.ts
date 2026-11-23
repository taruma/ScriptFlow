import {AESTHETIC_TOKEN_NAME_REGEX} from './aesthetic.ts';
import {extractMetadata} from './extractor.ts';
import type {HighlightSpan} from './highlighter.ts';
import {parseAuteurScript} from './parser.ts';
import type {AuteurDocument, ExtractedMetadata} from './types.ts';

export type SourceSearchScope = 'all' | 'staging' | 'execution';

export interface SourceFindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  scope: SourceSearchScope;
}

export interface SourceTextMatch {
  /** Inclusive UTF-16 start offset in rawText */
  start: number;
  /** Exclusive UTF-16 end offset in rawText */
  end: number;
  /** Exact matched substring from rawText */
  text: string;
  /** 0-based line index in rawText */
  lineIndex: number;
}

export interface SourceFindResult {
  matches: SourceTextMatch[];
  error: string | null;
}

export interface SourceReplaceResult {
  nextRawText: string;
  replacedCount: number;
  error: string | null;
}

export interface HighlightOverlayRange {
  start: number;
  end: number;
  active?: boolean;
}

export interface OverlaidHighlightSpan extends HighlightSpan {
  overlay?: 'match' | 'active';
  /** True on the very first rendered slice of the active highlight range */
  isActiveAnchor?: boolean;
}

export type ScriptSymbolKind = 'character' | 'reference' | 'token' | 'camera';

export interface ScriptSymbol {
  id: string;
  kind: ScriptSymbolKind;
  value: string;
  detail?: string;
  occurrences: SourceTextMatch[];
}

export type SymbolRenameErrorReason = 'empty' | 'unchanged' | 'invalid_format' | 'collision';

export interface SymbolRenameValidation {
  valid: boolean;
  normalizedTarget: string;
  reason: SymbolRenameErrorReason | null;
  collidingSymbol?: string;
}

export interface SymbolRenameResult {
  ok: boolean;
  nextRawText: string;
  replacedCount: number;
  validation: SymbolRenameValidation;
}

const MAX_SOURCE_MATCHES = 5000;
const WORD_CHAR_REGEX = /[A-Za-z0-9_]/;
const REFERENCE_SCAN_REGEX = /(?<![A-Za-z0-9_.-])(@[A-Za-z0-9_-]+)(?![A-Za-z0-9_-])/g;
const REFERENCE_TARGET_REGEX = /^@[A-Za-z0-9_-]+$/;
const CAMERA_TARGET_REGEX = /^CAM\s+(\d+[A-Z]?)$/i;
const CHARACTER_TARGET_REGEX = /^[A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface LineSpan {
  lineIndex: number;
  start: number;
  end: number;
  endWithBreak: number;
}

function computeLineSpans(rawText: string): LineSpan[] {
  const spans: LineSpan[] = [];
  let lineIndex = 0;
  let start = 0;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    if (ch === '\r' || ch === '\n') {
      const breakLen = ch === '\r' && rawText[i + 1] === '\n' ? 2 : 1;
      spans.push({
        lineIndex,
        start,
        end: i,
        endWithBreak: i + breakLen,
      });
      i += breakLen - 1;
      start = i + 1;
      lineIndex += 1;
    }
  }

  spans.push({
    lineIndex,
    start,
    end: rawText.length,
    endWithBreak: rawText.length,
  });

  return spans;
}

function resolveLineIndexAtOffset(lineSpans: readonly LineSpan[], offset: number): number {
  let lo = 0;
  let hi = lineSpans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const span = lineSpans[mid];
    if (offset < span.start) {
      hi = mid - 1;
    } else if (offset >= span.endWithBreak && mid < lineSpans.length - 1) {
      lo = mid + 1;
    } else {
      return span.lineIndex;
    }
  }
  return lineSpans.length > 0 ? lineSpans[lineSpans.length - 1].lineIndex : 0;
}

export interface CharacterRange {
  start: number;
  end: number;
}

/**
 * Resolves the exact UTF-16 character ranges covered by a Source search scope:
 * - `'all'`: full document
 * - `'staging'`: everything before the `[EXECUTION]` Macro-Block header line (or full doc if absent)
 * - `'execution'`: body lines strictly after the `[EXECUTION]` Macro-Block header line
 */
export function getSourceScopeRanges(
  rawText: string,
  scope: SourceSearchScope,
  doc?: AuteurDocument
): CharacterRange[] {
  if (rawText.length === 0) return [];
  if (scope === 'all') {
    return [{start: 0, end: rawText.length}];
  }

  const parsed = doc ?? parseAuteurScript(rawText);
  const lineSpans = computeLineSpans(rawText);

  if (!parsed.execution) {
    return scope === 'staging' ? [{start: 0, end: rawText.length}] : [];
  }

  const execHeaderLine = parsed.execution.headerLineIndex;
  const execHeaderSpan = lineSpans[execHeaderLine];
  if (!execHeaderSpan) {
    return scope === 'staging' ? [{start: 0, end: rawText.length}] : [];
  }

  if (scope === 'staging') {
    const end = execHeaderSpan.start;
    return end > 0 ? [{start: 0, end}] : [];
  }

  // 'execution': strictly after the `[EXECUTION]` header line break so searching/replacing
  // Execution prose never mutates the `[EXECUTION]` Macro-Block header itself.
  const start = execHeaderSpan.endWithBreak;
  return start < rawText.length ? [{start, end: rawText.length}] : [];
}

function buildSearchPattern(query: string, options: Pick<SourceFindOptions, 'wholeWord' | 'regex'>): string {
  if (options.regex) {
    return options.wholeWord ? `\\b(?:${query})\\b` : query;
  }

  const escaped = escapeRegExp(query);
  if (!options.wholeWord) {
    return escaped;
  }

  const firstChar = query[0] ?? '';
  const lastChar = query[query.length - 1] ?? '';
  const needsLeadingBoundary = WORD_CHAR_REGEX.test(firstChar) || firstChar === '@';
  const needsTrailingBoundary = WORD_CHAR_REGEX.test(lastChar);

  const prefix = needsLeadingBoundary ? '(?<![A-Za-z0-9_])' : '';
  const suffix = needsTrailingBoundary ? '(?![A-Za-z0-9_])' : '';
  return `${prefix}${escaped}${suffix}`;
}

function compileSearchRegExp(
  query: string,
  options: Pick<SourceFindOptions, 'caseSensitive' | 'wholeWord' | 'regex'>,
  global: boolean
): {regex: RegExp | null; error: string | null} {
  if (query.length === 0) {
    return {regex: null, error: null};
  }
  const pattern = buildSearchPattern(query, options);
  const flags = `${global ? 'g' : ''}${options.caseSensitive ? '' : 'i'}m`;
  try {
    return {regex: new RegExp(pattern, flags), error: null};
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid regular expression';
    return {regex: null, error: message};
  }
}

/**
 * Pure deterministic Find engine for Source View.
 * Supports plain text, case-sensitivity, whole-word boundaries (including `@handles`),
 * JavaScript regular expressions (with multiline `^`/`$` and zero-length infinite-loop protection),
 * and Phase-scoped filtering (`all` | `staging` | `execution`).
 */
export function findSourceMatches(
  rawText: string,
  query: string,
  options: SourceFindOptions,
  doc?: AuteurDocument
): SourceFindResult {
  if (query.length === 0) {
    return {matches: [], error: null};
  }

  const {regex, error} = compileSearchRegExp(query, options, true);
  if (error || !regex) {
    return {matches: [], error};
  }

  const ranges = getSourceScopeRanges(rawText, options.scope, doc);
  if (ranges.length === 0) {
    return {matches: [], error: null};
  }

  const lineSpans = computeLineSpans(rawText);
  const matches: SourceTextMatch[] = [];

  for (const range of ranges) {
    const slice = rawText.slice(range.start, range.end);
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(slice)) !== null) {
      const matchText = match[0];
      const matchStart = range.start + match.index;
      const matchEnd = matchStart + matchText.length;

      if (matchText.length > 0) {
        matches.push({
          start: matchStart,
          end: matchEnd,
          text: matchText,
          lineIndex: resolveLineIndexAtOffset(lineSpans, matchStart),
        });
        if (matches.length >= MAX_SOURCE_MATCHES) {
          return {matches, error: null};
        }
      } else {
        // Prevent infinite loop on zero-length regex assertions (e.g. `^`, `$`, `.*`)
        if (regex.lastIndex >= slice.length) {
          break;
        }
        regex.lastIndex += 1;
      }
    }
  }

  return {matches, error: null};
}

function expandReplacementText(
  matchedText: string,
  replacement: string,
  query: string,
  options: Pick<SourceFindOptions, 'caseSensitive' | 'wholeWord' | 'regex'>
): string {
  if (!options.regex) {
    return replacement;
  }

  const {regex} = compileSearchRegExp(query, options, false);
  if (!regex) {
    return replacement;
  }
  return matchedText.replace(regex, replacement);
}

/**
 * Replaces a single match by index within the current Find results.
 * In plain-text mode, replacement strings (including `$` characters) are inserted literally.
 * In regex mode, standard backreferences (`$1`, `$2`, `$&`, `$<name>`) are expanded.
 */
export function replaceSourceMatch(
  rawText: string,
  query: string,
  replacement: string,
  options: SourceFindOptions,
  matchIndex: number,
  doc?: AuteurDocument
): SourceReplaceResult {
  const found = findSourceMatches(rawText, query, options, doc);
  if (found.error) {
    return {nextRawText: rawText, replacedCount: 0, error: found.error};
  }
  const target = found.matches[matchIndex];
  if (!target) {
    return {nextRawText: rawText, replacedCount: 0, error: null};
  }

  const expanded = expandReplacementText(target.text, replacement, query, options);
  const nextRawText = rawText.slice(0, target.start) + expanded + rawText.slice(target.end);
  return {
    nextRawText,
    replacedCount: 1,
    error: null,
  };
}

/**
 * Replaces all non-overlapping matches inside the selected scope in a single deterministic pass.
 */
export function replaceAllSourceMatches(
  rawText: string,
  query: string,
  replacement: string,
  options: SourceFindOptions,
  doc?: AuteurDocument
): SourceReplaceResult {
  const found = findSourceMatches(rawText, query, options, doc);
  if (found.error || found.matches.length === 0) {
    return {nextRawText: rawText, replacedCount: 0, error: found.error};
  }

  let out = '';
  let cursor = 0;

  for (const match of found.matches) {
    if (match.start < cursor) continue;
    out += rawText.slice(cursor, match.start);
    out += expandReplacementText(match.text, replacement, query, options);
    cursor = match.end;
  }
  out += rawText.slice(cursor);

  return {
    nextRawText: out,
    replacedCount: found.matches.length,
    error: null,
  };
}

/**
 * Slices an array of lossless `HighlightSpan`s at overlay range boundaries so search/rename
 * highlights paint cleanly on top of syntax-highlighted Source prose with zero character loss
 * and zero horizontal metric drift.
 */
export function overlayHighlightSpans(
  spans: readonly HighlightSpan[],
  ranges: readonly HighlightOverlayRange[]
): OverlaidHighlightSpan[] {
  if (ranges.length === 0 || spans.length === 0) {
    return spans as OverlaidHighlightSpan[];
  }

  const sorted = [...ranges]
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (sorted.length === 0) {
    return spans as OverlaidHighlightSpan[];
  }

  const out: OverlaidHighlightSpan[] = [];
  let spanOffset = 0;
  let rangeIdx = 0;
  let activeAnchorEmitted = false;

  for (const span of spans) {
    const spanStart = spanOffset;
    const spanEnd = spanStart + span.text.length;
    spanOffset = spanEnd;

    if (span.text.length === 0) {
      continue;
    }

    // Advance past ranges that end before this span begins
    while (rangeIdx < sorted.length && sorted[rangeIdx].end <= spanStart) {
      rangeIdx += 1;
    }

    let cursor = spanStart;
    let probe = rangeIdx;

    while (probe < sorted.length && sorted[probe].start < spanEnd) {
      const range = sorted[probe];
      const overlapStart = Math.max(cursor, range.start);
      const overlapEnd = Math.min(spanEnd, range.end);

      if (overlapStart > cursor) {
        out.push({
          ...span,
          text: span.text.slice(cursor - spanStart, overlapStart - spanStart),
        });
      }

      if (overlapEnd > overlapStart) {
        const isActive = range.active === true;
        const isActiveAnchor = isActive && !activeAnchorEmitted;
        if (isActiveAnchor) {
          activeAnchorEmitted = true;
        }
        out.push({
          ...span,
          text: span.text.slice(overlapStart - spanStart, overlapEnd - spanStart),
          overlay: isActive ? 'active' : 'match',
          ...(isActiveAnchor ? {isActiveAnchor: true} : {}),
        });
        cursor = overlapEnd;
      }

      if (range.end <= spanEnd) {
        probe += 1;
      } else {
        break;
      }
    }

    if (cursor < spanEnd) {
      out.push({
        ...span,
        text: span.text.slice(cursor - spanStart),
      });
    }
  }

  return out;
}

// ============================================================================
// Safe Symbol Rename Engine
// ============================================================================

function findRegexOccurrences(
  rawText: string,
  regex: RegExp,
  lineSpans: readonly LineSpan[],
  captureGroupIndex = 0
): SourceTextMatch[] {
  const occurrences: SourceTextMatch[] = [];
  regex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawText)) !== null) {
    const full = match[0];
    if (full.length === 0) {
      if (regex.lastIndex >= rawText.length) break;
      regex.lastIndex += 1;
      continue;
    }

    let start = match.index;
    let text = full;

    if (captureGroupIndex > 0 && match[captureGroupIndex] !== undefined) {
      const groupText = match[captureGroupIndex];
      const relIdx = full.indexOf(groupText);
      if (relIdx >= 0) {
        start = match.index + relIdx;
        text = groupText;
      }
    }

    occurrences.push({
      start,
      end: start + text.length,
      text,
      lineIndex: resolveLineIndexAtOffset(lineSpans, start),
    });
  }

  return occurrences;
}

function findSymbolOccurrences(
  rawText: string,
  kind: ScriptSymbolKind,
  value: string,
  lineSpans: readonly LineSpan[]
): SourceTextMatch[] {
  const escaped = escapeRegExp(value);

  switch (kind) {
    case 'reference': {
      const re = new RegExp(`(?<![A-Za-z0-9_.-])(${escaped})(?![A-Za-z0-9_-])`, 'g');
      return findRegexOccurrences(rawText, re, lineSpans, 1);
    }
    case 'token': {
      const re = new RegExp(`(?<![A-Za-z0-9_-])(${escaped})(?![A-Za-z0-9_-])`, 'g');
      return findRegexOccurrences(rawText, re, lineSpans, 1);
    }
    case 'camera': {
      // Match strictly inside bracketed camera tags (e.g. `[CAM 01]`) while normalizing flexible whitespace
      const slotParts = value.trim().split(/\s+/);
      const camPattern =
        slotParts.length === 2
          ? `${escapeRegExp(slotParts[0])}\\s+${escapeRegExp(slotParts[1])}`
          : escaped;
      const re = new RegExp(`\\[\\s*(${camPattern})\\s*\\]`, 'gi');
      return findRegexOccurrences(rawText, re, lineSpans, 1);
    }
    case 'character': {
      const firstChar = value[0] ?? '';
      const lastChar = value[value.length - 1] ?? '';
      const prefix = WORD_CHAR_REGEX.test(firstChar) ? '(?<![A-Za-z0-9_])' : '';
      const suffix = WORD_CHAR_REGEX.test(lastChar) ? '(?![A-Za-z0-9_])' : '';
      const re = new RegExp(`${prefix}(${escaped})${suffix}`, 'g');
      return findRegexOccurrences(rawText, re, lineSpans, 1);
    }
  }
}

/**
 * Extracts all renameable Auteur Script symbols across 4 deterministic categories:
 * - `character`: cast names bound via `@ref as Name` plus unique dialogue speakers in `[EXECUTION]`
 * - `reference`: `@handle` visual/audio/character references across Staging and Execution
 * - `token`: `[AESTHETIC]` shorthand lookbook `TOKEN` identifiers
 * - `camera`: numbered `[CAM ##]` optical camera slots
 */
export function collectScriptSymbols(
  rawText: string,
  doc?: AuteurDocument,
  metadata?: ExtractedMetadata
): ScriptSymbol[] {
  if (rawText.trim().length === 0) return [];

  const parsedDoc = doc ?? parseAuteurScript(rawText);
  const resolvedMeta = metadata ?? extractMetadata(parsedDoc);
  const lineSpans = computeLineSpans(rawText);
  const symbols: ScriptSymbol[] = [];

  // 1. Characters (cast bindings + dialogue speakers)
  const seenCharacters = new Set<string>();
  const addCharacter = (name: string, detail?: string) => {
    const cleaned = name.trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seenCharacters.has(key)) return;
    seenCharacters.add(key);
    const occurrences = findSymbolOccurrences(rawText, 'character', cleaned, lineSpans);
    if (occurrences.length > 0) {
      symbols.push({
        id: `character:${cleaned}`,
        kind: 'character',
        value: cleaned,
        ...(detail ? {detail} : {}),
        occurrences,
      });
    }
  };

  for (const binding of resolvedMeta.characters) {
    addCharacter(binding.name, binding.ref);
  }
  if (parsedDoc.execution) {
    for (const beat of parsedDoc.execution.beats) {
      for (const sub of beat.subStates) {
        if (sub.kind === 'dialogue' && sub.dialogue?.speaker) {
          addCharacter(sub.dialogue.speaker, 'Speaker');
        }
      }
    }
  }

  // 2. References (@handles from bindings, visual refs, tokens, and inline occurrences)
  const refDetails = new Map<string, string>();
  const refOriginalCase = new Map<string, string>();
  const registerRef = (ref: string, detail?: string) => {
    const cleaned = ref.trim();
    if (!REFERENCE_TARGET_REGEX.test(cleaned)) return;
    const key = cleaned.toLowerCase();
    if (!refOriginalCase.has(key)) {
      refOriginalCase.set(key, cleaned);
    }
    if (detail && !refDetails.has(key)) {
      refDetails.set(key, detail);
    }
  };

  for (const binding of resolvedMeta.characters) {
    registerRef(binding.ref, binding.name);
    if (binding.voiceRef) {
      registerRef(binding.voiceRef, `${binding.name} voice`);
    }
  }
  for (const visualRef of resolvedMeta.stagingReferences) {
    registerRef(visualRef.ref, visualRef.category ?? visualRef.sourceBlock);
  }
  for (const token of resolvedMeta.aestheticTokens) {
    if (token.reference) {
      registerRef(token.reference, token.token);
    }
  }

  REFERENCE_SCAN_REGEX.lastIndex = 0;
  let refMatch: RegExpExecArray | null;
  while ((refMatch = REFERENCE_SCAN_REGEX.exec(rawText)) !== null) {
    registerRef(refMatch[1]);
  }

  for (const [key, value] of refOriginalCase.entries()) {
    const occurrences = findSymbolOccurrences(rawText, 'reference', value, lineSpans);
    if (occurrences.length > 0) {
      const detail = refDetails.get(key);
      symbols.push({
        id: `reference:${value}`,
        kind: 'reference',
        value,
        ...(detail ? {detail} : {}),
        occurrences,
      });
    }
  }

  // 3. Lookbook Tokens ([AESTHETIC] -> TOKEN)
  const seenTokens = new Set<string>();
  for (const token of resolvedMeta.aestheticTokens) {
    if (seenTokens.has(token.token)) continue;
    seenTokens.add(token.token);
    const occurrences = findSymbolOccurrences(rawText, 'token', token.token, lineSpans);
    if (occurrences.length > 0) {
      symbols.push({
        id: `token:${token.token}`,
        kind: 'token',
        value: token.token,
        ...(token.category ? {detail: token.category} : {}),
        occurrences,
      });
    }
  }

  // 4. Numbered Camera Slots ([CAM ##])
  for (const slotDef of Object.values(resolvedMeta.cameraSlots)) {
    const occurrences = findSymbolOccurrences(rawText, 'camera', slotDef.slot, lineSpans);
    if (occurrences.length > 0) {
      symbols.push({
        id: `camera:${slotDef.slot}`,
        kind: 'camera',
        value: slotDef.slot,
        ...(slotDef.firstDescriptor ? {detail: slotDef.firstDescriptor} : {}),
        occurrences,
      });
    }
  }

  return symbols;
}

/**
 * Normalizes a user-entered rename target for a symbol kind (e.g. trims whitespace,
 * canonicalizes `cam  3` -> `CAM 3`, preserves exact casing for characters/tokens/refs).
 */
export function normalizeSymbolTarget(kind: ScriptSymbolKind, rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  if (kind === 'camera') {
    const match = CAMERA_TARGET_REGEX.exec(trimmed);
    if (match) {
      return `CAM ${match[1].toUpperCase()}`;
    }
    return trimmed.replace(/\s+/g, ' ').toUpperCase();
  }

  return trimmed;
}

/**
 * Validates a proposed symbol rename against canonical Auteur Script syntax
 * and blocks collisions against existing symbols in the same category (including camera slots).
 */
export function validateSymbolRename(
  symbol: ScriptSymbol,
  rawTarget: string,
  allSymbols: readonly ScriptSymbol[]
): SymbolRenameValidation {
  const normalizedTarget = normalizeSymbolTarget(symbol.kind, rawTarget);

  if (normalizedTarget.length === 0) {
    return {valid: false, normalizedTarget: '', reason: 'empty'};
  }

  if (normalizedTarget === symbol.value) {
    return {valid: false, normalizedTarget, reason: 'unchanged'};
  }

  let isValidFormat = false;
  switch (symbol.kind) {
    case 'reference':
      isValidFormat = REFERENCE_TARGET_REGEX.test(normalizedTarget);
      break;
    case 'token':
      isValidFormat = AESTHETIC_TOKEN_NAME_REGEX.test(normalizedTarget);
      break;
    case 'camera':
      isValidFormat = CAMERA_TARGET_REGEX.test(normalizedTarget);
      break;
    case 'character':
      isValidFormat = CHARACTER_TARGET_REGEX.test(normalizedTarget);
      break;
  }

  if (!isValidFormat) {
    return {valid: false, normalizedTarget, reason: 'invalid_format'};
  }

  const collision = allSymbols.find((other) => {
    if (other.id === symbol.id || other.kind !== symbol.kind) {
      return false;
    }
    if (symbol.kind === 'token') {
      return other.value === normalizedTarget;
    }
    return other.value.toLowerCase() === normalizedTarget.toLowerCase();
  });

  if (collision) {
    return {
      valid: false,
      normalizedTarget,
      reason: 'collision',
      collidingSymbol: collision.value,
    };
  }

  return {
    valid: true,
    normalizedTarget,
    reason: null,
  };
}

/**
 * Performs a deterministic, boundary-safe symbol rename across all recorded occurrences.
 * Refuses invalid syntax or colliding targets without mutating the document.
 */
export function renameScriptSymbol(
  rawText: string,
  symbol: ScriptSymbol,
  rawTarget: string,
  allSymbols: readonly ScriptSymbol[]
): SymbolRenameResult {
  const validation = validateSymbolRename(symbol, rawTarget, allSymbols);
  if (!validation.valid || symbol.occurrences.length === 0) {
    return {
      ok: false,
      nextRawText: rawText,
      replacedCount: 0,
      validation,
    };
  }

  const sorted = [...symbol.occurrences].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;

  for (const occ of sorted) {
    if (occ.start < cursor) continue;
    out += rawText.slice(cursor, occ.start);
    out += validation.normalizedTarget;
    cursor = occ.end;
  }
  out += rawText.slice(cursor);

  return {
    ok: true,
    nextRawText: out,
    replacedCount: sorted.length,
    validation,
  };
}
