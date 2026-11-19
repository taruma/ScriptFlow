import type {ReactNode} from 'react';
import type {AestheticToken, SubStateNode} from '../core/types.ts';
import {UI_LABELS} from '../ui/labels.ts';

interface SubStateRendererProps {
  node: SubStateNode;
  aestheticTokens: AestheticToken[];
  isLead?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlights inline @references and declared [AESTHETIC] shorthand tokens (e.g. LOC01, EV01)
 * within Sub-State body text without mutating raw content.
 */
function renderInlineHighlightedText(text: string, aestheticTokens: AestheticToken[]): ReactNode {
  if (!text) return null;

  const tokenList = aestheticTokens
    .map((t) => t.token)
    .filter((tok) => tok.length >= 2)
    .sort((a, b) => b.length - a.length);

  const tokenPattern = tokenList.length > 0 ? `|\\b(?:${tokenList.map(escapeRegExp).join('|')})\\b` : '';
  const combinedRegex = new RegExp(`((?<![A-Za-z0-9._%+-])@[A-Za-z0-9_-]+${tokenPattern})`, 'g');

  const tokenMap = new Map(aestheticTokens.map((t) => [t.token, t.description]));

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const matched = match[0];
    if (matched.startsWith('@')) {
      parts.push(
        <span
          key={`ref-${match.index}`}
          className="auteur-tok-ref inline-block rounded px-1 py-0.25 text-[0.92em] font-medium"
        >
          {matched}
        </span>
      );
    } else {
      const desc = tokenMap.get(matched);
      parts.push(
        <span
          key={`tok-${match.index}`}
          title={desc ? `${matched}: ${desc}` : matched}
          className="auteur-tok-ref inline-block rounded px-1 py-0.25 text-[0.92em] font-semibold tracking-tight"
        >
          {matched}
        </span>
      );
    }

    lastIndex = match.index + matched.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export function SubStateRenderer({node, aestheticTokens, isLead = false}: SubStateRendererProps) {
  if (node.kind === 'camera') {
    const isBareHold = node.body.length === 0;
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-relaxed">
        <span className="auteur-tok-cam inline-block rounded px-1.5 py-0.25 text-[11px] font-semibold tracking-tight">
          [{node.tag}]
        </span>
        {isBareHold ? (
          <span className="text-xs italic text-text-faint">{UI_LABELS.execution.holdFraming}</span>
        ) : (
          <span className={`${isLead ? 'font-medium text-text-main' : 'text-text-body'}`}>
            {renderInlineHighlightedText(node.body, aestheticTokens)}
          </span>
        )}
      </span>
    );
  }

  if (
    node.kind === 'action' ||
    node.kind === 'block' ||
    node.kind === 'light' ||
    node.kind === 'state_boundary' ||
    node.kind === 'tier2'
  ) {
    return (
      <span className="inline leading-relaxed">
        <span className="auteur-tok-tag mr-2 inline-block rounded px-1.5 py-0.25 text-[11px] font-semibold tracking-tight align-baseline">
          [{node.tag}]
        </span>
        <span className="text-text-body">
          {renderInlineHighlightedText(node.body, aestheticTokens)}
        </span>
      </span>
    );
  }

  if (node.kind === 'dialogue' && node.dialogue) {
    const {speaker, language, modifiers, line} = node.dialogue;
    return (
      <span className="inline leading-relaxed">
        <strong className="auteur-tok-speaker font-bold">{speaker}</strong>{' '}
        <span className="auteur-tok-verb italic">
          says{language ? ` in ${language}` : ''}
          {modifiers ? ` ${modifiers}` : ''}
        </span>{' '}
        <span className="auteur-tok-dial inline rounded px-1.5 py-0.5 font-normal">
          {'{'}
          {renderInlineHighlightedText(line, aestheticTokens)}
          {'}'}
        </span>
      </span>
    );
  }

  if (node.kind === 'foley') {
    return (
      <span className="auteur-tok-foley inline rounded px-1.5 py-0.5 italic leading-relaxed">
        &lt;{renderInlineHighlightedText(node.body, aestheticTokens)}&gt;
      </span>
    );
  }

  if (node.kind === 'score') {
    return (
      <span className="auteur-tok-score inline rounded px-1.5 py-0.5 italic leading-relaxed">
        ({renderInlineHighlightedText(node.body, aestheticTokens)})
      </span>
    );
  }

  if (node.kind === 'onscreen_text') {
    return (
      <span className="auteur-tok-text inline rounded px-1.5 py-0.5 font-semibold tracking-tight leading-relaxed">
        【{node.body}】
      </span>
    );
  }

  return (
    <span className="text-text-body leading-relaxed">
      {renderInlineHighlightedText(node.body, aestheticTokens)}
    </span>
  );
}
