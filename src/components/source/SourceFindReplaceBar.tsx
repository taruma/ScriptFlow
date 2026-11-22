import {memo, useEffect, useRef, type KeyboardEvent} from 'react';
import {AlertCircle, ChevronDown, ChevronUp, Replace, Search, X} from 'lucide-react';
import type {SourceFindOptions, SourceSearchScope} from '../../core/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';

interface SourceFindReplaceBarProps {
  query: string;
  replacement: string;
  options: SourceFindOptions;
  matchCount: number;
  activeMatchIndex: number;
  regexError: string | null;
  readOnly: boolean;
  onQueryChange: (next: string) => void;
  onReplacementChange: (next: string) => void;
  onToggleOption: (key: 'caseSensitive' | 'wholeWord' | 'regex') => void;
  onScopeChange: (scope: SourceSearchScope) => void;
  onStepPrev: () => void;
  onStepNext: () => void;
  onReplaceActive: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

const SCOPES: readonly SourceSearchScope[] = ['all', 'staging', 'execution'];

export const SourceFindReplaceBar = memo(function SourceFindReplaceBar({
  query,
  replacement,
  options,
  matchCount,
  activeMatchIndex,
  regexError,
  readOnly,
  onQueryChange,
  onReplacementChange,
  onToggleOption,
  onScopeChange,
  onStepPrev,
  onStepNext,
  onReplaceActive,
  onReplaceAll,
  onClose,
}: SourceFindReplaceBarProps) {
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const labels = UI_LABELS.source.findTray;

  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  const handleTrayKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const handleFindKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        onStepPrev();
      } else {
        onStepNext();
      }
    }
  };

  const handleReplaceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !readOnly && matchCount > 0 && !regexError) {
      event.preventDefault();
      onReplaceActive();
    }
  };

  const hasQuery = query.length > 0;
  const canStep = matchCount > 0 && !regexError;
  const canReplace = !readOnly && hasQuery && matchCount > 0 && !regexError;

  const toggleClass = (active: boolean) =>
    `inline-flex items-center justify-center h-6 min-w-[26px] px-1.5 rounded-md border font-mono text-[11px] transition-colors cursor-pointer ${
      active
        ? 'bg-btn-primary-bg text-btn-primary-text border-btn-primary-bg font-semibold'
        : 'bg-surface-subtle text-text-muted border-border-main hover:bg-surface-hover hover:text-text-main'
    }`;

  return (
    <div
      role="region"
      aria-label={labels.regionAria}
      onKeyDown={handleTrayKeyDown}
      className="mb-2.5 rounded-lg border border-border-main bg-surface px-3 py-2.5 shadow-2xs space-y-2"
    >
      {/* Row 1: Find input + match toggles + counter + navigation + close */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-faint"
          />
          <input
            ref={findInputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleFindKeyDown}
            data-native-undo="true"
            spellCheck={false}
            placeholder={labels.findPlaceholder}
            aria-label={labels.findInputAria}
            className={`w-full rounded-md border bg-surface-subtle focus:bg-surface pl-8 pr-2.5 py-1 font-mono text-xs text-text-main placeholder-text-placeholder outline-none transition-colors ${
              regexError
                ? 'border-red-500/70 focus:border-red-500'
                : 'border-border-main focus:border-text-muted'
            }`}
          />
        </div>

        <div className="flex items-center gap-1" role="group" aria-label={labels.findInputAria}>
          <button
            type="button"
            onClick={() => onToggleOption('caseSensitive')}
            aria-pressed={options.caseSensitive}
            title={labels.caseSensitiveTitle}
            className={toggleClass(options.caseSensitive)}
          >
            {labels.caseSensitiveShort}
          </button>
          <button
            type="button"
            onClick={() => onToggleOption('wholeWord')}
            aria-pressed={options.wholeWord}
            title={labels.wholeWordTitle}
            className={toggleClass(options.wholeWord)}
          >
            {labels.wholeWordShort}
          </button>
          <button
            type="button"
            onClick={() => onToggleOption('regex')}
            aria-pressed={options.regex}
            title={labels.regexTitle}
            className={toggleClass(options.regex)}
          >
            {labels.regexShort}
          </button>
        </div>

        <div className="flex items-center gap-1 pl-1">
          <span
            className={`min-w-[68px] text-right font-mono text-[11px] tabular-nums ${
              hasQuery && matchCount === 0 && !regexError ? 'text-amber-600 dark:text-amber-400' : 'text-text-faint'
            }`}
          >
            {!hasQuery || regexError
              ? ''
              : matchCount > 0
                ? labels.matchCounter(activeMatchIndex + 1, matchCount)
                : labels.noMatches}
          </span>
          <button
            type="button"
            onClick={onStepPrev}
            disabled={!canStep}
            aria-label={labels.prevAria}
            title={labels.prevTitle}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-main bg-surface-subtle text-text-muted hover:bg-surface-hover hover:text-text-main disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onStepNext}
            disabled={!canStep}
            aria-label={labels.nextAria}
            title={labels.nextTitle}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-main bg-surface-subtle text-text-muted hover:bg-surface-hover hover:text-text-main disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.closeAria}
            title={labels.closeTitle}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-faint hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Inline Regex Syntax Error */}
      {regexError && (
        <div
          role="alert"
          className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/8 px-2.5 py-1 text-[11px] text-red-600 dark:text-red-400"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-mono">
            {labels.regexErrorPrefix} {regexError}
          </span>
        </div>
      )}

      {/* Row 2: Scope switcher + Replace controls (hidden in read-only mode) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div
          role="group"
          aria-label={labels.scopeGroupAria}
          className="inline-flex items-center rounded-md border border-border-main bg-surface-muted p-0.5 shrink-0"
        >
          {SCOPES.map((scope) => {
            const active = options.scope === scope;
            return (
              <button
                key={scope}
                type="button"
                onClick={() => onScopeChange(scope)}
                aria-pressed={active}
                className={`rounded-[5px] px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-surface text-text-main shadow-2xs font-semibold'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                {labels.scopes[scope]}
              </button>
            );
          })}
        </div>

        {!readOnly && (
          <div className="flex flex-1 min-w-[220px] items-center gap-1.5">
            <div className="relative flex-1 min-w-[140px]">
              <Replace
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-faint"
              />
              <input
                type="text"
                value={replacement}
                onChange={(e) => onReplacementChange(e.target.value)}
                onKeyDown={handleReplaceKeyDown}
                data-native-undo="true"
                spellCheck={false}
                placeholder={labels.replacePlaceholder}
                aria-label={labels.replaceInputAria}
                className="w-full rounded-md border border-border-main bg-surface-subtle focus:bg-surface pl-8 pr-2.5 py-1 font-mono text-xs text-text-main placeholder-text-placeholder outline-none focus:border-text-muted transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={onReplaceActive}
              disabled={!canReplace}
              title={labels.replaceOneTitle}
              className="inline-flex items-center rounded-md border border-border-main bg-surface-subtle px-2.5 py-1 text-[11px] font-medium text-text-body hover:bg-surface-hover hover:text-text-main disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
            >
              {labels.replaceOne}
            </button>
            <button
              type="button"
              onClick={onReplaceAll}
              disabled={!canReplace}
              title={labels.replaceAllTitle}
              className="inline-flex items-center rounded-md bg-btn-primary-bg px-2.5 py-1 text-[11px] font-semibold text-btn-primary-text hover:bg-btn-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
            >
              {labels.replaceAll}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
