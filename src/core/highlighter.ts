import {AESTHETIC_LINE_CAPTURE_REGEX} from './aesthetic.ts';
import {
  DIALOGUE_REGEX,
  EXECUTION_HEADERS,
  FOLEY_REGEX,
  MACRO_HEADER_REGEX,
  ONSCREEN_TEXT_REGEX,
  SCORE_REGEX,
  SUBSTATE_TAG_REGEX,
  classifyMacroBlock,
} from './parser.ts';
import type {AestheticToken, MacroBlockKind} from './types.ts';

export type HighlightSpanKind =
  | 'plain'
  | 'clause_phrase'
  | 'clause_sentence'
  | 'ref'
  | 'token'
  | 'error'
  | 'cam'
  | 'tag'
  | 'lead_text'
  | 'body_text'
  | 'foley'
  | 'onscreen_text'
  | 'score'
  | 'speaker'
  | 'verb'
  | 'dialogue'
  | 'arrow'
  | 'aesthetic_key'
  | 'macro_header';

export interface HighlightSpan {
  kind: HighlightSpanKind;
  text: string;
  macroKind?: MacroBlockKind;
  /** Optional tone wrapper for body/lead/dialogue text segments */
  tone?: 'lead' | 'body' | 'dialogue';
}

export interface InlineTokenizeOptions {
  flagBannedViewport: boolean;
  flagBracketsAsError?: boolean;
  highlightClauses?: boolean;
  tone?: 'lead' | 'body' | 'dialogue';
}

const ABBREVIATION_BEFORE_PERIOD_REGEX =
  /(?:^|[\s(])(?:(?:[A-Za-z]\.){1,3}[A-Za-z]|Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|vs|etc)$/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pushClauseSegment(
  out: HighlightSpan[],
  segment: string,
  kind: 'clause_phrase' | 'clause_sentence',
  tone?: 'lead' | 'body' | 'dialogue'
): void {
  if (!segment) return;

  const leadMatch = /^(\s*)/.exec(segment);
  const lead = leadMatch ? leadMatch[1] : '';
  const trailMatch = /(\s*)$/.exec(segment);
  const trail = trailMatch ? trailMatch[1] : '';
  const core = segment.slice(lead.length, segment.length - trail.length);

  if (!core) {
    out.push({kind: 'plain', text: segment, tone});
    return;
  }

  if (lead) out.push({kind: 'plain', text: lead, tone});
  out.push({kind, text: core, tone});
  if (trail) out.push({kind: 'plain', text: trail, tone});
}

/**
 * Splits plain prose into toggleable monochrome phrase/sentence underline spans:
 * - Comma-delimited phrases -> `clause_phrase`
 * - Period / semicolon clauses -> `clause_sentence`
 * Punctuation marks and surrounding spaces stay `plain` so they form crisp breaks,
 * while decimals (2.39:1), ellipses (...), and abbreviations (O.S., Mr.) are preserved intact.
 */
export function segmentClauseText(
  text: string,
  tone?: 'lead' | 'body' | 'dialogue'
): HighlightSpan[] {
  if (!text) return [];

  const out: HighlightSpan[] = [];
  let segStart = 0;
  let lastDelimiter: ',' | ';' | '.' | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === ',' || ch === ';') {
      const segment = text.slice(segStart, i);
      if (segment.length > 0) {
        pushClauseSegment(
          out,
          segment,
          ch === ',' ? 'clause_phrase' : 'clause_sentence',
          tone
        );
      }
      out.push({kind: 'plain', text: ch, tone});
      lastDelimiter = ch;
      segStart = i + 1;
      continue;
    }

    if (ch === '.') {
      const prev = i > 0 ? text[i - 1] : '';
      const next = i + 1 < text.length ? text[i + 1] : '';
      const isEllipsis = prev === '.' || next === '.';
      const isFollowedByBoundary = next === '' || /\s/.test(next);
      const isAbbreviation = ABBREVIATION_BEFORE_PERIOD_REGEX.test(text.slice(0, i));

      if (!isEllipsis && isFollowedByBoundary && !isAbbreviation) {
        const segment = text.slice(segStart, i);
        if (segment.length > 0) {
          pushClauseSegment(out, segment, 'clause_sentence', tone);
        }
        out.push({kind: 'plain', text: '.', tone});
        lastDelimiter = '.';
        segStart = i + 1;
      }
    }
  }

  if (segStart < text.length) {
    const tail = text.slice(segStart);
    const tailKind = lastDelimiter === ',' ? 'clause_phrase' : 'clause_sentence';
    pushClauseSegment(out, tail, tailKind, tone);
  }

  return out;
}

/**
 * Tokenizes inline `@refs`, declared `[AESTHETIC]` tokens, optional banned stage-left/right
 * phrases, disallowed brackets, and optional clause underlines character-for-character losslessly.
 */
export function tokenizeInlineFragments(
  text: string,
  aestheticTokens: readonly AestheticToken[],
  options: InlineTokenizeOptions
): HighlightSpan[] {
  if (!text) return [];

  const {
    flagBannedViewport,
    flagBracketsAsError = false,
    highlightClauses = true,
    tone,
  } = options;

  const tokenList = aestheticTokens
    .map((t) => t.token)
    .filter((tok) => tok.length >= 2)
    .sort((a, b) => b.length - a.length);

  const partsPattern: string[] = ['(?<![A-Za-z0-9._%+-])@[A-Za-z0-9_-]+'];
  if (flagBannedViewport) {
    partsPattern.push('\\bstage-(?:left|right)\\b');
  }
  if (flagBracketsAsError) {
    partsPattern.push('\\[[A-Za-z0-9 _-]+\\]');
  }
  if (tokenList.length > 0) {
    partsPattern.push(`\\b(?:${tokenList.map(escapeRegExp).join('|')})\\b`);
  }

  const regex = new RegExp(`(${partsPattern.join('|')})`, 'gi');
  const tokenSet = new Set(tokenList);

  const out: HighlightSpan[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushPlain = (chunk: string) => {
    if (!chunk) return;
    if (highlightClauses) {
      out.push(...segmentClauseText(chunk, tone));
    } else {
      out.push({kind: 'plain', text: chunk, tone});
    }
  };

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushPlain(text.slice(lastIndex, match.index));
    }

    const matched = match[0];
    if (matched.startsWith('@')) {
      out.push({kind: 'ref', text: matched});
    } else if (/^stage-(?:left|right)$/i.test(matched)) {
      out.push({kind: 'error', text: matched});
    } else if (flagBracketsAsError && matched.startsWith('[')) {
      out.push({kind: 'error', text: matched});
    } else if (tokenSet.has(matched)) {
      out.push({kind: 'token', text: matched});
    } else {
      pushPlain(matched);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    pushPlain(text.slice(lastIndex));
  }

  return out;
}

/**
 * Tokenizes a single Sub-State segment verbatim (preserving exact whitespace and character count).
 */
export function tokenizeSubStateSegment(
  segment: string,
  aestheticTokens: readonly AestheticToken[],
  isLead = false
): HighlightSpan[] {
  if (!segment) return [];

  const leadingWsMatch = /^(\s*)/.exec(segment);
  const leadingWs = leadingWsMatch ? leadingWsMatch[1] : '';
  const trailingWsMatch = /(\s*)$/.exec(segment);
  const trailingWs = trailingWsMatch ? trailingWsMatch[1] : '';
  const core = segment.slice(leadingWs.length, segment.length - trailingWs.length);

  if (!core) {
    return [{kind: 'plain', text: segment}];
  }

  const out: HighlightSpan[] = [];
  if (leadingWs) out.push({kind: 'plain', text: leadingWs});

  const tagMatch = SUBSTATE_TAG_REGEX.exec(core);
  if (tagMatch) {
    const tagRaw = `[${tagMatch[1]}]`;
    const rest = core.slice(tagRaw.length);
    const upper = tagMatch[1].trim().toUpperCase();
    const isCamera = upper === 'CAM' || /^CAM\s+\d+[A-Z]?$/.test(upper);

    out.push({kind: isCamera ? 'cam' : 'tag', text: tagRaw});
    if (rest) {
      out.push(
        ...tokenizeInlineFragments(rest, aestheticTokens, {
          flagBannedViewport: true,
          tone: isLead && isCamera ? 'lead' : 'body',
        })
      );
    }
  } else if (FOLEY_REGEX.test(core)) {
    out.push({kind: 'foley', text: core});
  } else if (ONSCREEN_TEXT_REGEX.test(core)) {
    out.push({kind: 'onscreen_text', text: core});
  } else if (SCORE_REGEX.test(core)) {
    out.push({kind: 'score', text: core});
  } else if (DIALOGUE_REGEX.test(core)) {
    const braceIdx = core.indexOf('{');
    const saysMatch = /\s+says\b/.exec(core);
    if (braceIdx !== -1 && saysMatch) {
      out.push({kind: 'speaker', text: core.slice(0, saysMatch.index)});
      out.push({kind: 'verb', text: core.slice(saysMatch.index, braceIdx)});
      out.push(
        ...tokenizeInlineFragments(core.slice(braceIdx), aestheticTokens, {
          flagBannedViewport: false,
          flagBracketsAsError: false,
          highlightClauses: false,
          tone: 'dialogue',
        })
      );
    } else {
      out.push(
        ...tokenizeInlineFragments(core, aestheticTokens, {
          flagBannedViewport: true,
          tone: 'body',
        })
      );
    }
  } else {
    out.push(
      ...tokenizeInlineFragments(core, aestheticTokens, {
        flagBannedViewport: true,
        tone: 'body',
      })
    );
  }

  if (trailingWs) out.push({kind: 'plain', text: trailingWs});
  return out;
}

/**
 * Tokenizes an Execution line containing optional `->` / `→` chains verbatim.
 */
export function tokenizeExecutionLine(
  line: string,
  aestheticTokens: readonly AestheticToken[],
  isLead = false
): HighlightSpan[] {
  if (!line) return [];
  const parts = line.split(/(\s*(?:->|→)\s*)/);
  const out: HighlightSpan[] = [];

  parts.forEach((part, idx) => {
    if (!part) return;
    if (idx % 2 === 1) {
      out.push({kind: 'arrow', text: part});
    } else {
      out.push(...tokenizeSubStateSegment(part, aestheticTokens, isLead && idx === 0));
    }
  });

  return out;
}

/**
 * Tokenizes `@refs`, `-> TOKEN` mappings, and clause underlines inside an `[AESTHETIC]` value.
 */
export function tokenizeAestheticValue(value: string): HighlightSpan[] {
  if (!value) return [];

  const regex = /(->|→)(\s*)([A-Za-z0-9_-]+)|((?<![A-Za-z0-9._%+-])@[A-Za-z0-9_-]+)/g;
  const out: HighlightSpan[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    if (match.index > lastIdx) {
      out.push(...segmentClauseText(value.slice(lastIdx, match.index), 'body'));
    }
    if (match[1]) {
      out.push({kind: 'arrow', text: match[1]});
      if (match[2]) out.push({kind: 'plain', text: match[2], tone: 'body'});
      out.push({kind: 'token', text: match[3]});
    } else if (match[4]) {
      out.push({kind: 'ref', text: match[4]});
    }
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < value.length) {
    out.push(...segmentClauseText(value.slice(lastIdx), 'body'));
  }

  return out;
}

/**
 * Tokenizes a single line inside `[AESTHETIC]` (`Label:` key + value mappings).
 */
export function tokenizeAestheticLine(line: string): HighlightSpan[] {
  if (!line) return [];

  const kvMatch = AESTHETIC_LINE_CAPTURE_REGEX.exec(line);
  if (kvMatch) {
    const out: HighlightSpan[] = [];
    if (kvMatch[1]) out.push({kind: 'plain', text: kvMatch[1]});
    out.push({kind: 'aesthetic_key', text: kvMatch[2]});
    if (kvMatch[3]) out.push({kind: 'plain', text: kvMatch[3]});
    if (kvMatch[4]) out.push(...tokenizeAestheticValue(kvMatch[4]));
    return out;
  }

  return tokenizeAestheticValue(line);
}

/**
 * Tokenizes an entire Phase 1 Staging block body verbatim (preserving newlines).
 */
export function tokenizeStagingBody(
  text: string,
  kind: MacroBlockKind,
  aestheticTokens: readonly AestheticToken[]
): HighlightSpan[] {
  const lines = text.split('\n');
  const flagViewport = kind === 'LOGIC' || kind === 'OPENING';
  const flagBrackets = kind === 'OPENING';
  const out: HighlightSpan[] = [];

  lines.forEach((line, idx) => {
    if (idx > 0) out.push({kind: 'plain', text: '\n'});
    if (kind === 'AESTHETIC') {
      out.push(...tokenizeAestheticLine(line));
    } else {
      out.push(
        ...tokenizeInlineFragments(line, aestheticTokens, {
          flagBannedViewport: flagViewport,
          flagBracketsAsError: flagBrackets,
          tone: 'body',
        })
      );
    }
  });

  return out;
}

/**
 * Tokenizes an entire canonical plain-text Auteur Script verbatim for Source Mode.
 */
export function tokenizeSourceDocument(
  text: string,
  aestheticTokens: readonly AestheticToken[]
): HighlightSpan[] {
  const lines = text.split('\n');
  let inExecution = false;
  let activeStagingKind: MacroBlockKind = 'CUSTOM';
  const out: HighlightSpan[] = [];

  lines.forEach((line, idx) => {
    if (idx > 0) out.push({kind: 'plain', text: '\n'});

    const trimmed = line.trim();
    const headerMatch = !inExecution ? MACRO_HEADER_REGEX.exec(trimmed) : null;
    const headerName = headerMatch ? headerMatch[1].trim() : '';
    if (!inExecution && headerName.length > 0) {
      const kind = classifyMacroBlock(headerName);
      if (EXECUTION_HEADERS.has(headerName)) {
        inExecution = true;
      } else {
        activeStagingKind = kind;
      }
      const leadingWs = /^(\s*)/.exec(line)?.[1] ?? '';
      const trailingWs = /(\s*)$/.exec(line)?.[1] ?? '';
      if (leadingWs) out.push({kind: 'plain', text: leadingWs});
      out.push({kind: 'macro_header', text: trimmed, macroKind: kind});
      if (trailingWs) out.push({kind: 'plain', text: trailingWs});
    } else if (inExecution) {
      out.push(...tokenizeExecutionLine(line, aestheticTokens, true));
    } else if (activeStagingKind === 'AESTHETIC') {
      out.push(...tokenizeAestheticLine(line));
    } else {
      out.push(
        ...tokenizeInlineFragments(line, aestheticTokens, {
          flagBannedViewport: activeStagingKind === 'LOGIC' || activeStagingKind === 'OPENING',
          flagBracketsAsError: activeStagingKind === 'OPENING',
          tone: 'body',
        })
      );
    }
  });

  return out;
}
