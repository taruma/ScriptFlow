/**
 * Pure, zero-dependency Markdown block & inline parser for AI Assistant messages
 * and streamed thought summaries. Produces a safe AST for React rendering
 * without HTML string injection.
 */

export type MarkdownInline =
  | {type: 'text'; text: string}
  | {type: 'code'; code: string}
  | {type: 'strong'; children: MarkdownInline[]}
  | {type: 'em'; children: MarkdownInline[]}
  | {type: 'strike'; children: MarkdownInline[]}
  | {type: 'link'; label: MarkdownInline[]; href: string};

export interface MarkdownListItem {
  children: MarkdownInline[];
  nestedLists: MarkdownListBlock[];
}

export interface MarkdownListBlock {
  type: 'list';
  ordered: boolean;
  start: number;
  items: MarkdownListItem[];
}

export type MarkdownBlock =
  | {type: 'heading'; level: 1 | 2 | 3 | 4; children: MarkdownInline[]}
  | {type: 'paragraph'; children: MarkdownInline[]}
  | MarkdownListBlock
  | {type: 'code_block'; language: string; code: string}
  | {type: 'blockquote'; blocks: MarkdownBlock[]}
  | {type: 'hr'};

const SAFE_LINK_PROTOCOL = /^(?:https?:|mailto:)/i;

function pushText(out: MarkdownInline[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === 'text') {
    last.text += text;
  } else {
    out.push({type: 'text', text});
  }
}

function findClosingDelimiter(
  input: string,
  from: number,
  delimiter: string
): number {
  let idx = from;
  while (idx < input.length) {
    if (input[idx] === '\\') {
      idx += 2;
      continue;
    }
    if (input.startsWith(delimiter, idx)) {
      return idx;
    }
    idx += 1;
  }
  return -1;
}

/**
 * Parses inline Markdown spans: `code`, **bold**, *italic*, ~~strike~~, and [label](url).
 * Intentionally avoids intra-word underscores so snake_case script identifiers stay literal.
 */
export function parseMarkdownInline(input: string): MarkdownInline[] {
  const result: MarkdownInline[] = [];
  let i = 0;

  while (i < input.length) {
    // Escaped punctuation
    if (input[i] === '\\' && i + 1 < input.length) {
      pushText(result, input[i + 1]);
      i += 2;
      continue;
    }

    // Inline code span: `...`
    if (input[i] === '`') {
      let tickCount = 1;
      while (input[i + tickCount] === '`') tickCount++;
      const fence = '`'.repeat(tickCount);
      const end = input.indexOf(fence, i + tickCount);
      if (end !== -1) {
        const rawCode = input.slice(i + tickCount, end);
        const trimmedCode =
          rawCode.length >= 2 && rawCode.startsWith(' ') && rawCode.endsWith(' ')
            ? rawCode.slice(1, -1)
            : rawCode;
        result.push({type: 'code', code: trimmedCode});
        i = end + tickCount;
        continue;
      }
    }

    // Bold + italic: ***...***
    if (input.startsWith('***', i) && input[i + 3] && input[i + 3] !== ' ') {
      const end = findClosingDelimiter(input, i + 3, '***');
      if (end !== -1 && end > i + 3) {
        result.push({
          type: 'strong',
          children: [{type: 'em', children: parseMarkdownInline(input.slice(i + 3, end))}],
        });
        i = end + 3;
        continue;
      }
    }

    // Bold: **...**
    if (input.startsWith('**', i) && input[i + 2] && input[i + 2] !== ' ') {
      const end = findClosingDelimiter(input, i + 2, '**');
      if (end !== -1 && end > i + 2) {
        result.push({
          type: 'strong',
          children: parseMarkdownInline(input.slice(i + 2, end)),
        });
        i = end + 2;
        continue;
      }
    }

    // Strikethrough: ~~...~~
    if (input.startsWith('~~', i) && input[i + 2] && input[i + 2] !== ' ') {
      const end = findClosingDelimiter(input, i + 2, '~~');
      if (end !== -1 && end > i + 2) {
        result.push({
          type: 'strike',
          children: parseMarkdownInline(input.slice(i + 2, end)),
        });
        i = end + 2;
        continue;
      }
    }

    // Italic: *...*
    if (input[i] === '*' && input[i + 1] && input[i + 1] !== ' ' && input[i + 1] !== '*') {
      const end = findClosingDelimiter(input, i + 1, '*');
      if (end !== -1 && end > i + 1 && input[end - 1] !== ' ') {
        result.push({
          type: 'em',
          children: parseMarkdownInline(input.slice(i + 1, end)),
        });
        i = end + 1;
        continue;
      }
    }

    // Link: [label](href)
    if (input[i] === '[') {
      const closeBracket = input.indexOf(']', i + 1);
      if (closeBracket !== -1 && input[closeBracket + 1] === '(') {
        const closeParen = input.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const labelRaw = input.slice(i + 1, closeBracket);
          const hrefRaw = input.slice(closeBracket + 2, closeParen).trim();
          if (SAFE_LINK_PROTOCOL.test(hrefRaw)) {
            result.push({
              type: 'link',
              label: parseMarkdownInline(labelRaw),
              href: hrefRaw,
            });
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    pushText(result, input[i]);
    i += 1;
  }

  return result;
}

interface ListMarkerMatch {
  indent: number;
  ordered: boolean;
  start: number;
  content: string;
}

function matchListMarker(line: string): ListMarkerMatch | null {
  const expanded = line.replace(/^\t+/, (tabs) => '  '.repeat(tabs.length));
  const unordered = expanded.match(/^(\s*)[-*+]\s+(.*)$/);
  if (unordered) {
    return {
      indent: unordered[1].length,
      ordered: false,
      start: 1,
      content: unordered[2],
    };
  }
  const ordered = expanded.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (ordered) {
    return {
      indent: ordered[1].length,
      ordered: true,
      start: Number.parseInt(ordered[2], 10) || 1,
      content: ordered[3],
    };
  }
  return null;
}

function isHorizontalRule(line: string): boolean {
  return /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line);
}

function isHeading(line: string): {level: 1 | 2 | 3 | 4; text: string} | null {
  const match = line.match(/^\s*(#{1,4})\s+(.*)$/);
  if (!match) return null;
  const level = Math.min(4, Math.max(1, match[1].length)) as 1 | 2 | 3 | 4;
  return {level, text: match[2].replace(/\s+#+\s*$/, '').trim()};
}

function isFenceStart(line: string): string | null {
  const match = line.match(/^\s*```([A-Za-z0-9_-]*)\s*$/);
  return match ? match[1] : null;
}

function parseListAt(
  lines: string[],
  startIndex: number,
  baseIndent: number,
  ordered: boolean
): {block: MarkdownListBlock; nextIndex: number} {
  const firstMatch = matchListMarker(lines[startIndex]);
  const items: MarkdownListItem[] = [];
  const listStart = firstMatch?.start ?? 1;
  let i = startIndex;

  while (i < lines.length) {
    // Skip blank lines only if the next non-blank line continues this list (same indent + kind, or deeper nested list)
    if (lines[i].trim() === '') {
      let lookahead = i + 1;
      while (lookahead < lines.length && lines[lookahead].trim() === '') {
        lookahead++;
      }
      if (lookahead >= lines.length) {
        i = lookahead;
        break;
      }
      const nextMarker = matchListMarker(lines[lookahead]);
      if (
        nextMarker &&
        ((nextMarker.indent === baseIndent && nextMarker.ordered === ordered) ||
          nextMarker.indent > baseIndent)
      ) {
        i = lookahead;
        continue;
      }
      break;
    }

    const marker = matchListMarker(lines[i]);
    if (!marker) {
      // Continuation text indented under the previous list item
      if (items.length > 0 && /^\s{2,}/.test(lines[i])) {
        const lastItem = items[items.length - 1];
        const contInline = parseMarkdownInline(lines[i].trim());
        lastItem.children = [...lastItem.children, {type: 'text', text: ' '}, ...contInline];
        i++;
        continue;
      }
      break;
    }

    if (marker.indent < baseIndent) {
      break;
    }

    if (marker.indent > baseIndent) {
      if (items.length === 0) break;
      const nested = parseListAt(lines, i, marker.indent, marker.ordered);
      items[items.length - 1].nestedLists.push(nested.block);
      i = nested.nextIndex;
      continue;
    }

    if (marker.ordered !== ordered) {
      break;
    }

    items.push({
      children: parseMarkdownInline(marker.content.trim()),
      nestedLists: [],
    });
    i++;
  }

  return {
    block: {
      type: 'list',
      ordered,
      start: listStart,
      items,
    },
    nextIndex: i,
  };
}

/**
 * Parses a Markdown string into a structured array of blocks for clean React rendering.
 */
export function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
  const normalized = raw.replace(/\r\n?/g, '\n');
  if (normalized.trim().length === 0) return [];

  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block
    const fenceLang = isFenceStart(line);
    if (fenceLang !== null) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push({
        type: 'code_block',
        language: fenceLang,
        code: codeLines.join('\n'),
      });
      continue;
    }

    // Horizontal rule
    if (isHorizontalRule(line)) {
      blocks.push({type: 'hr'});
      i++;
      continue;
    }

    // Heading (# .. ####)
    const heading = isHeading(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading.level,
        children: parseMarkdownInline(heading.text),
      });
      i++;
      continue;
    }

    // Blockquote (> ...)
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'blockquote',
        blocks: parseMarkdownBlocks(quoteLines.join('\n')),
      });
      continue;
    }

    // Ordered / unordered list (including nested sub-lists)
    const listMarker = matchListMarker(line);
    if (listMarker) {
      const parsed = parseListAt(lines, i, listMarker.indent, listMarker.ordered);
      blocks.push(parsed.block);
      i = parsed.nextIndex;
      continue;
    }

    // Paragraph (coalesce contiguous non-structural lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      isFenceStart(lines[i]) === null &&
      !isHorizontalRule(lines[i]) &&
      !isHeading(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !matchListMarker(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    blocks.push({
      type: 'paragraph',
      children: parseMarkdownInline(paraLines.join('\n')),
    });
  }

  return blocks;
}
