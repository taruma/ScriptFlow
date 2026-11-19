import {
  forwardRef,
  Fragment,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  tokenizeAestheticValue,
  tokenizeExecutionLine,
  tokenizeSourceDocument,
  tokenizeStagingBody,
  type HighlightSpan,
} from '../core/highlighter.ts';
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

function getToneClass(tone: HighlightSpan['tone'], isProportional: boolean): string {
  if (tone === 'lead') {
    return isProportional ? 'text-text-main' : 'font-medium text-text-main';
  }
  if (tone === 'dialogue') {
    return 'auteur-live-tok-dial';
  }
  if (tone === 'body') {
    return 'text-text-body';
  }
  return '';
}

function renderHighlightSpan(span: HighlightSpan, key: number, isProportional: boolean): ReactNode {
  const toneClass = getToneClass(span.tone, isProportional);

  switch (span.kind) {
    case 'plain':
      return toneClass ? (
        <span key={key} className={toneClass}>
          {span.text}
        </span>
      ) : (
        <Fragment key={key}>{span.text}</Fragment>
      );

    case 'clause_phrase':
      return (
        <span key={key} className={`${toneClass} auteur-clause-phrase`.trim()}>
          {span.text}
        </span>
      );

    case 'clause_sentence':
      return (
        <span key={key} className={`${toneClass} auteur-clause-sentence`.trim()}>
          {span.text}
        </span>
      );

    case 'ref':
      return (
        <span
          key={key}
          className={`auteur-live-tok-ref ${isProportional ? '' : 'font-medium'}`.trim()}
        >
          {span.text}
        </span>
      );

    case 'token':
      return (
        <span
          key={key}
          className={`auteur-live-tok-ref ${isProportional ? '' : 'font-semibold'}`.trim()}
        >
          {span.text}
        </span>
      );

    case 'error':
      return (
        <span key={key} className="auteur-live-tok-error text-red-500">
          {span.text}
        </span>
      );

    case 'cam':
      return (
        <span
          key={key}
          className={`auteur-live-tok-cam ${isProportional ? '' : 'font-semibold'}`.trim()}
        >
          {span.text}
        </span>
      );

    case 'tag':
      return (
        <span
          key={key}
          className={`auteur-live-tok-tag ${isProportional ? '' : 'font-semibold'}`.trim()}
        >
          {span.text}
        </span>
      );

    case 'foley':
      return (
        <span key={key} className="auteur-live-tok-foley">
          {span.text}
        </span>
      );

    case 'onscreen_text':
      return (
        <span key={key} className="auteur-live-tok-text">
          {span.text}
        </span>
      );

    case 'score':
      return (
        <span key={key} className="auteur-live-tok-score">
          {span.text}
        </span>
      );

    case 'speaker':
      return (
        <span
          key={key}
          className={isProportional ? 'auteur-live-tok-speaker' : 'auteur-tok-speaker font-bold'}
        >
          {span.text}
        </span>
      );

    case 'verb':
      return (
        <span key={key} className={`auteur-tok-verb ${isProportional ? '' : 'italic'}`.trim()}>
          {span.text}
        </span>
      );

    case 'arrow':
      return (
        <span key={key} className={`auteur-tok-arrow ${isProportional ? '' : 'font-bold'}`.trim()}>
          {span.text}
        </span>
      );

    case 'aesthetic_key':
      return (
        <span
          key={key}
          className={isProportional ? 'auteur-live-tok-key' : 'font-semibold text-text-main'}
        >
          {span.text}
        </span>
      );

    case 'macro_header': {
      const badgeClass = getMacroBlockMeta(span.macroKind ?? 'CUSTOM').badgeClass;
      return (
        <span
          key={key}
          className={`${badgeClass} font-semibold rounded-[3px] py-[1px]`}
          style={{boxShadow: 'inset 0 0 0 1px currentColor'}}
        >
          {span.text}
        </span>
      );
    }

    default:
      return <Fragment key={key}>{span.text}</Fragment>;
  }
}

/**
 * Pixel-locked syntax-highlighted overlay editor using CSS Grid layering.
 * Delegates all lexical/clause scanning to pure zero-React helpers in `src/core/highlighter.ts`
 * so proportional IBM Plex Sans (Live Mode) and JetBrains Mono (Source Mode) maintain exact
 * character-for-character caret alignment with zero horizontal drift.
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
    const isProportional = !isSourceMode;

    let spans: HighlightSpan[];
    if (mode === 'substate') {
      spans = tokenizeExecutionLine(value, aestheticTokens, isLead);
    } else if (mode === 'aestheticValue') {
      spans = tokenizeAestheticValue(value);
    } else if (mode === 'staging') {
      spans = tokenizeStagingBody(value, stagingKind, aestheticTokens);
    } else {
      spans = tokenizeSourceDocument(value, aestheticTokens);
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
          {spans.map((span, idx) => renderHighlightSpan(span, idx, isProportional))}
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
