import {
  forwardRef,
  Fragment,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  DIALOGUE_REGEX,
  EXECUTION_HEADERS,
  FOLEY_REGEX,
  MACRO_HEADER_REGEX,
  ONSCREEN_TEXT_REGEX,
  SCORE_REGEX,
  SUBSTATE_TAG_REGEX,
  classifyMacroBlock,
} from '../core/parser.ts';
import type {AestheticToken, MacroBlockKind} from '../core/types.ts';
import {getMacroBlockMeta} from '../ui/labels.ts';

export type LiveEditorMode = 'substate' | 'staging' | 'aestheticValue' | 'source';

interface LiveHighlightedEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  mode: LiveEditorMode;
  stagingKind?: MacroBlockKind;
  aestheticTokens?: AestheticToken[];
  placeholder?: string;
  ariaLabel: string;
  minHeightClass?: string;
  isLead?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlights inline @refs, declared [AESTHETIC] tokens, and optional banned stage-left/right
 * terms with ZERO horizontal width shift so the caret matches the backdrop character-for-character.
 */
function highlightInlineFragments(
  text: string,
  aestheticTokens: AestheticToken[],
  flagBannedViewport: boolean,
  isProportional: boolean,
  flagBracketsAsError = false
): ReactNode {
  if (!text) return null;

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

  const out: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }

    const matched = match[0];
    if (matched.startsWith('@')) {
      out.push(
        <span
          key={`r-${match.index}`}
          className={`auteur-live-tok-ref ${isProportional ? '' : 'font-medium'}`}
        >
          {matched}
        </span>
      );
    } else if (/^stage-(?:left|right)$/i.test(matched)) {
      out.push(
        <span key={`e-${match.index}`} className="auteur-live-tok-error text-red-500">
          {matched}
        </span>
      );
    } else if (flagBracketsAsError && matched.startsWith('[')) {
      out.push(
        <span key={`b-${match.index}`} className="auteur-live-tok-error text-red-500">
          {matched}
        </span>
      );
    } else if (tokenSet.has(matched)) {
      out.push(
        <span
          key={`t-${match.index}`}
          className={`auteur-live-tok-ref ${isProportional ? '' : 'font-semibold'}`}
        >
          {matched}
        </span>
      );
    } else {
      out.push(matched);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }

  return out;
}

/**
 * Highlights a single Sub-State segment verbatim (preserving exact whitespace and character count).
 */
function highlightSubStateSegment(
  segment: string,
  aestheticTokens: AestheticToken[],
  isProportional: boolean,
  isLead = false
): ReactNode {
  if (!segment) return null;

  const leadingWsMatch = /^(\s*)/.exec(segment);
  const leadingWs = leadingWsMatch ? leadingWsMatch[1] : '';
  const trailingWsMatch = /(\s*)$/.exec(segment);
  const trailingWs = trailingWsMatch ? trailingWsMatch[1] : '';
  const core = segment.slice(leadingWs.length, segment.length - trailingWs.length);

  if (!core) {
    return segment;
  }

  let renderedCore: ReactNode;

  // 1. Bracketed Tag ([CAM 01], [CAM], [ACT], [BLOCK], [LIGHT], [STATE IN], Tier-2)
  const tagMatch = SUBSTATE_TAG_REGEX.exec(core);
  if (tagMatch) {
    const tagRaw = `[${tagMatch[1]}]`;
    const rest = core.slice(tagRaw.length);
    const upper = tagMatch[1].trim().toUpperCase();
    const isCamera = upper === 'CAM' || /^CAM\s+\d+[A-Z]?$/.test(upper);

    renderedCore = (
      <>
        <span
          className={`${isCamera ? 'auteur-live-tok-cam' : 'auteur-live-tok-tag'} ${
            isProportional ? '' : 'font-semibold'
          }`}
        >
          {tagRaw}
        </span>
        <span
          className={
            isLead && isCamera
              ? `${isProportional ? '' : 'font-medium'} text-text-main`
              : 'text-text-body'
          }
        >
          {highlightInlineFragments(rest, aestheticTokens, true, isProportional)}
        </span>
      </>
    );
  } else if (FOLEY_REGEX.test(core)) {
    renderedCore = <span className="auteur-live-tok-foley">{core}</span>;
  } else if (ONSCREEN_TEXT_REGEX.test(core)) {
    renderedCore = <span className="auteur-live-tok-text">{core}</span>;
  } else if (SCORE_REGEX.test(core)) {
    renderedCore = <span className="auteur-live-tok-score">{core}</span>;
  } else if (DIALOGUE_REGEX.test(core)) {
    const braceIdx = core.indexOf('{');
    const saysMatch = /\s+says\b/.exec(core);
    if (braceIdx !== -1 && saysMatch) {
      const speakerPart = core.slice(0, saysMatch.index);
      const verbAndModsPart = core.slice(saysMatch.index, braceIdx);
      const speechPart = core.slice(braceIdx);

      renderedCore = (
        <>
          <span className={isProportional ? 'auteur-live-tok-speaker' : 'auteur-tok-speaker font-bold'}>
            {speakerPart}
          </span>
          <span className={`auteur-tok-verb ${isProportional ? '' : 'italic'}`}>
            {verbAndModsPart}
          </span>
          <span className="auteur-live-tok-dial">
            {highlightInlineFragments(speechPart, aestheticTokens, false, isProportional)}
          </span>
        </>
      );
    } else {
      renderedCore = (
        <span className="text-text-body">
          {highlightInlineFragments(core, aestheticTokens, true, isProportional)}
        </span>
      );
    }
  } else {
    // Partial typing states (e.g. while user is mid-way typing "{dialogue" or "<foley" or "[TAG")
    renderedCore = (
      <span className="text-text-body">
        {highlightInlineFragments(core, aestheticTokens, true, isProportional)}
      </span>
    );
  }

  return (
    <>
      {leadingWs}
      {renderedCore}
      {trailingWs}
    </>
  );
}

/**
 * Highlights an Execution line containing optional -> / → chains verbatim.
 */
function highlightExecutionLine(
  line: string,
  aestheticTokens: AestheticToken[],
  isProportional: boolean,
  isLead = false
): ReactNode {
  const parts = line.split(/(\s*(?:->|→)\s*)/);
  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      return (
        <span
          key={`arr-${idx}`}
          className={`auteur-tok-arrow ${isProportional ? '' : 'font-bold'}`}
        >
          {part}
        </span>
      );
    }
    return (
      <Fragment key={`seg-${idx}`}>
        {highlightSubStateSegment(part, aestheticTokens, isProportional, isLead && idx === 0)}
      </Fragment>
    );
  });
}

/**
 * Highlights @refs and -> TOKEN mappings inside an [AESTHETIC] value verbatim.
 */
function highlightAestheticValue(val: string, isProportional: boolean): ReactNode {
  const regex = /(->|→)(\s*)([A-Za-z0-9_-]+)|((?<![A-Za-z0-9._%+-])@[A-Za-z0-9_-]+)/g;
  const out: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(val)) !== null) {
    if (match.index > lastIdx) {
      out.push(val.slice(lastIdx, match.index));
    }
    if (match[1]) {
      out.push(
        <span
          key={`a-${match.index}`}
          className={`auteur-tok-arrow ${isProportional ? '' : 'font-semibold'}`}
        >
          {match[1]}
        </span>
      );
      out.push(match[2]);
      out.push(
        <span
          key={`tk-${match.index}`}
          className={`auteur-live-tok-ref ${isProportional ? '' : 'font-semibold'}`}
        >
          {match[3]}
        </span>
      );
    } else if (match[4]) {
      out.push(
        <span
          key={`rf-${match.index}`}
          className={`auteur-live-tok-ref ${isProportional ? '' : 'font-medium'}`}
        >
          {match[4]}
        </span>
      );
    }
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < val.length) {
    out.push(val.slice(lastIdx));
  }
  return out;
}

/**
 * Highlights a single line inside [AESTHETIC] (Label: keys + -> TOKEN mappings + @refs) verbatim.
 */
function highlightAestheticLine(line: string, isProportional: boolean): ReactNode {
  const kvMatch = /^(\s*)([A-Za-z0-9 _/-]+:)(\s*)(.*)$/.exec(line);

  if (kvMatch) {
    return (
      <>
        {kvMatch[1]}
        <span className={isProportional ? 'auteur-live-tok-key' : 'font-semibold text-text-main'}>
          {kvMatch[2]}
        </span>
        {kvMatch[3]}
        <span className="text-text-body">{highlightAestheticValue(kvMatch[4], isProportional)}</span>
      </>
    );
  }

  return <span className="text-text-body">{highlightAestheticValue(line, isProportional)}</span>;
}

function highlightStagingBody(
  text: string,
  kind: MacroBlockKind,
  aestheticTokens: AestheticToken[]
): ReactNode {
  const lines = text.split('\n');
  const flagViewport = kind === 'LOGIC' || kind === 'OPENING';
  const flagBrackets = kind === 'OPENING';

  return lines.map((line, idx) => (
    <Fragment key={idx}>
      {idx > 0 && '\n'}
      {kind === 'AESTHETIC' ? (
        highlightAestheticLine(line, true)
      ) : (
        <span className="text-text-body">
          {highlightInlineFragments(line, aestheticTokens, flagViewport, true, flagBrackets)}
        </span>
      )}
    </Fragment>
  ));
}

function highlightSourceDocument(text: string, aestheticTokens: AestheticToken[]): ReactNode {
  const lines = text.split('\n');
  let inExecution = false;
  let activeStagingKind: MacroBlockKind = 'CUSTOM';

  return lines.map((line, idx) => {
    const trimmed = line.trim();
    let content: ReactNode;

    if (!inExecution && MACRO_HEADER_REGEX.test(trimmed)) {
      const headerName = trimmed.slice(1, -1).trim();
      const kind = classifyMacroBlock(headerName);
      if (EXECUTION_HEADERS.has(headerName)) {
        inExecution = true;
      } else {
        activeStagingKind = kind;
      }
      const leadingWs = /^(\s*)/.exec(line)?.[1] ?? '';
      const trailingWs = /(\s*)$/.exec(line)?.[1] ?? '';
      content = (
        <>
          {leadingWs}
          <span
            className={`${getMacroBlockMeta(kind).badgeClass} font-semibold rounded-[3px] py-[1px]`}
            style={{boxShadow: 'inset 0 0 0 1px currentColor'}}
          >
            {trimmed}
          </span>
          {trailingWs}
        </>
      );
    } else if (inExecution) {
      content = highlightExecutionLine(line, aestheticTokens, false, true);
    } else if (activeStagingKind === 'AESTHETIC') {
      content = highlightAestheticLine(line, false);
    } else {
      content = (
        <span className="text-text-body">
          {highlightInlineFragments(
            line,
            aestheticTokens,
            activeStagingKind === 'LOGIC' || activeStagingKind === 'OPENING',
            false,
            activeStagingKind === 'OPENING'
          )}
        </span>
      );
    }

    return (
      <Fragment key={idx}>
        {idx > 0 && '\n'}
        {content}
      </Fragment>
    );
  });
}

/**
 * Pixel-locked syntax-highlighted overlay editor using CSS Grid layering.
 * Uses proportional IBM Plex Sans in Live Mode (with uniform glyph weight/kerning)
 * and compact JetBrains Mono in Source Mode, keeping 100% native textarea caret,
 * selection, undo/redo, and clipboard behavior with zero horizontal drift.
 */
export const LiveHighlightedEditor = forwardRef<HTMLTextAreaElement, LiveHighlightedEditorProps>(
  function LiveHighlightedEditor(
    {
      value,
      onChange,
      mode,
      stagingKind = 'CUSTOM',
      aestheticTokens = [],
      placeholder,
      ariaLabel,
      minHeightClass = '',
      isLead = false,
      onKeyDown,
      onFocus,
      onBlur,
    },
    ref
  ) {
    const isSourceMode = mode === 'source';

    let highlighted: ReactNode;
    if (mode === 'substate') {
      highlighted = highlightExecutionLine(value, aestheticTokens, true, isLead);
    } else if (mode === 'aestheticValue') {
      highlighted = <span className="text-text-body">{highlightAestheticValue(value, true)}</span>;
    } else if (mode === 'staging') {
      highlighted = highlightStagingBody(value, stagingKind, aestheticTokens);
    } else {
      highlighted = highlightSourceDocument(value, aestheticTokens);
    }

    // Ensure empty strings or trailing newlines hold exact matching height in the mirror div
    const trailingSentinel = value.length === 0 || value.endsWith('\n') ? '\u200b' : '';

    const typographyClass = isSourceMode
      ? 'font-mono auteur-source-size leading-[1.5] tracking-normal auteur-live-mono'
      : 'font-script auteur-script-size leading-[1.44] tracking-normal auteur-live-proportional';

    const sharedTypography = `col-start-1 row-start-1 w-full m-0 p-0 border-0 font-normal ${typographyClass} whitespace-pre-wrap break-words`;

    const metricStyle = {
      fontVariantLigatures: 'none' as const,
      fontKerning: 'none' as const,
      tabSize: 2,
    };

    return (
      <div className={`grid grid-cols-1 grid-rows-1 w-full ${minHeightClass}`}>
        <div
          aria-hidden="true"
          className={`${sharedTypography} pointer-events-none select-none ${minHeightClass}`}
          style={metricStyle}
        >
          {highlighted}
          {trailingSentinel}
        </div>

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          rows={1}
          spellCheck={false}
          aria-label={ariaLabel}
          placeholder={placeholder}
          className={`${sharedTypography} auteur-live-textarea bg-transparent resize-none overflow-hidden outline-none ${minHeightClass}`}
          style={metricStyle}
        />
      </div>
    );
  }
);
