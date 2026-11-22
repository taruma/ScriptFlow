import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AlignLeft, Search, Tag} from 'lucide-react';
import {
  collectScriptSymbols,
  findSourceMatches,
  renameScriptSymbol,
  replaceAllSourceMatches,
  replaceSourceMatch,
  validateSymbolRename,
  type AestheticToken,
  type AuteurDocument,
  type ExtractedMetadata,
  type HighlightOverlayRange,
  type SourceFindOptions,
  type SourceSearchScope,
} from '../core/index.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {LiveHighlightedEditor} from './LiveHighlightedEditor.tsx';
import {SourceFindReplaceBar} from './source/SourceFindReplaceBar.tsx';
import {SourceSymbolRenameBar} from './source/SourceSymbolRenameBar.tsx';

type ActiveSourceTool = 'none' | 'find' | 'rename';

interface SourceEditorProps {
  rawText: string;
  doc: AuteurDocument;
  metadata: ExtractedMetadata;
  aestheticTokens: AestheticToken[];
  readOnly?: boolean;
  onChange: (nextRawText: string) => void;
  onCommitCheckpoint?: (nextRawText: string, toastMessage?: string) => void;
  onFormatScript?: () => void;
}

const DEFAULT_FIND_OPTIONS: SourceFindOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  scope: 'all',
};

const EMPTY_OVERLAY_RANGES: readonly HighlightOverlayRange[] = [];

export const SourceEditor = memo(function SourceEditor({
  rawText,
  doc,
  metadata,
  aestheticTokens,
  readOnly = false,
  onChange,
  onCommitCheckpoint,
  onFormatScript,
}: SourceEditorProps) {
  const [activeTool, setActiveTool] = useState<ActiveSourceTool>('none');

  // Find & Replace state
  const [findQuery, setFindQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findOptions, setFindOptions] = useState<SourceFindOptions>(DEFAULT_FIND_OPTIONS);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // Safe Symbol Rename state
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState('');
  const [activeSymbolOccIndex, setActiveSymbolOccIndex] = useState(0);

  // Scroll trigger counter so clicking Next/Prev or changing active match scrolls mirror smoothly
  const [scrollTick, setScrollTick] = useState(0);
  const mirrorRef = useRef<HTMLDivElement | null>(null);

  const lineCount = rawText.length === 0 ? 0 : rawText.split('\n').length;
  const charCount = rawText.length;

  // Close Rename tray automatically if script becomes read-only (e.g. switching to bundled example)
  useEffect(() => {
    if (readOnly && activeTool === 'rename') {
      setActiveTool('none');
    }
  }, [readOnly, activeTool]);

  // Derived Find matches (only computed when Find tray is open)
  const findResult = useMemo(() => {
    if (activeTool !== 'find') {
      return {matches: [], error: null};
    }
    return findSourceMatches(rawText, findQuery, findOptions, doc);
  }, [activeTool, rawText, findQuery, findOptions, doc]);

  const safeFindIndex =
    findResult.matches.length > 0 ? activeMatchIndex % findResult.matches.length : 0;

  // Derived script symbols (only computed when Rename tray is open)
  const symbols = useMemo(() => {
    if (activeTool !== 'rename') {
      return [];
    }
    return collectScriptSymbols(rawText, doc, metadata);
  }, [activeTool, rawText, doc, metadata]);

  const selectedSymbol = useMemo(() => {
    if (symbols.length === 0) return null;
    if (selectedSymbolId) {
      const found = symbols.find((s) => s.id === selectedSymbolId);
      if (found) return found;
    }
    return symbols[0];
  }, [symbols, selectedSymbolId]);

  // Keep selectedSymbolId & renameTarget synced when opening Rename or when symbol list changes
  useEffect(() => {
    if (activeTool !== 'rename') return;
    if (!selectedSymbol) {
      setSelectedSymbolId(null);
      setRenameTarget('');
      return;
    }
    if (selectedSymbolId !== selectedSymbol.id) {
      setSelectedSymbolId(selectedSymbol.id);
      setRenameTarget(selectedSymbol.value);
      setActiveSymbolOccIndex(0);
    }
  }, [activeTool, selectedSymbol, selectedSymbolId]);

  const safeSymbolOccIndex =
    selectedSymbol && selectedSymbol.occurrences.length > 0
      ? activeSymbolOccIndex % selectedSymbol.occurrences.length
      : 0;

  const renameValidation = useMemo(() => {
    if (!selectedSymbol) return null;
    return validateSymbolRename(selectedSymbol, renameTarget, symbols);
  }, [selectedSymbol, renameTarget, symbols]);

  // Build zero-width-shift highlight ranges for the active tray
  const highlightRanges = useMemo<readonly HighlightOverlayRange[]>(() => {
    if (activeTool === 'find' && findResult.matches.length > 0) {
      return findResult.matches.map((m, idx) => ({
        start: m.start,
        end: m.end,
        active: idx === safeFindIndex,
      }));
    }
    if (activeTool === 'rename' && selectedSymbol && selectedSymbol.occurrences.length > 0) {
      return selectedSymbol.occurrences.map((occ, idx) => ({
        start: occ.start,
        end: occ.end,
        active: idx === safeSymbolOccIndex,
      }));
    }
    return EMPTY_OVERLAY_RANGES;
  }, [activeTool, findResult.matches, safeFindIndex, selectedSymbol, safeSymbolOccIndex]);

  // Smoothly scroll the active highlighted match into view whenever navigation advances
  useEffect(() => {
    if (scrollTick === 0 || highlightRanges.length === 0) return;
    const mirror = mirrorRef.current;
    if (!mirror) return;
    const activeEl = mirror.querySelector<HTMLElement>('[data-search-active="true"]');
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    }
  }, [scrollTick, safeFindIndex, safeSymbolOccIndex, highlightRanges.length]);

  const handleToggleTool = useCallback(
    (tool: Exclude<ActiveSourceTool, 'none'>) => {
      setActiveTool((prev) => {
        const next = prev === tool ? 'none' : tool;
        if (next === 'rename') {
          setActiveSymbolOccIndex(0);
          setScrollTick((t) => t + 1);
        } else if (next === 'find' && findQuery.length > 0) {
          setScrollTick((t) => t + 1);
        }
        return next;
      });
    },
    [findQuery.length]
  );

  // Find & Replace handlers
  const handleQueryChange = useCallback((next: string) => {
    setFindQuery(next);
    setActiveMatchIndex(0);
    setScrollTick((t) => t + 1);
  }, []);

  const handleToggleFindOption = useCallback((key: 'caseSensitive' | 'wholeWord' | 'regex') => {
    setFindOptions((prev) => ({...prev, [key]: !prev[key]}));
    setActiveMatchIndex(0);
    setScrollTick((t) => t + 1);
  }, []);

  const handleScopeChange = useCallback((scope: SourceSearchScope) => {
    setFindOptions((prev) => ({...prev, scope}));
    setActiveMatchIndex(0);
    setScrollTick((t) => t + 1);
  }, []);

  const handleStepFindPrev = useCallback(() => {
    const total = findResult.matches.length;
    if (total === 0) return;
    setActiveMatchIndex((prev) => (prev - 1 + total) % total);
    setScrollTick((t) => t + 1);
  }, [findResult.matches.length]);

  const handleStepFindNext = useCallback(() => {
    const total = findResult.matches.length;
    if (total === 0) return;
    setActiveMatchIndex((prev) => (prev + 1) % total);
    setScrollTick((t) => t + 1);
  }, [findResult.matches.length]);

  const handleReplaceActive = useCallback(() => {
    if (readOnly || findResult.matches.length === 0 || findResult.error) return;
    const result = replaceSourceMatch(
      rawText,
      findQuery,
      replaceText,
      findOptions,
      safeFindIndex,
      doc
    );
    if (result.replacedCount === 0 || result.nextRawText === rawText) return;
    const nextFound = findSourceMatches(result.nextRawText, findQuery, findOptions);
    if (nextFound.matches.length === 0) {
      setActiveMatchIndex(0);
    } else if (nextFound.matches.length >= findResult.matches.length) {
      setActiveMatchIndex((safeFindIndex + 1) % nextFound.matches.length);
    } else {
      setActiveMatchIndex(safeFindIndex >= nextFound.matches.length ? 0 : safeFindIndex);
    }
    const commit = onCommitCheckpoint ?? onChange;
    commit(result.nextRawText, UI_LABELS.toasts.sourceReplacedCount(result.replacedCount));
    setScrollTick((t) => t + 1);
  }, [
    readOnly,
    findResult.matches.length,
    findResult.error,
    rawText,
    findQuery,
    replaceText,
    findOptions,
    safeFindIndex,
    doc,
    onCommitCheckpoint,
    onChange,
  ]);

  const handleReplaceAll = useCallback(() => {
    if (readOnly || findResult.matches.length === 0 || findResult.error) return;
    const result = replaceAllSourceMatches(rawText, findQuery, replaceText, findOptions, doc);
    if (result.replacedCount === 0 || result.nextRawText === rawText) return;
    const commit = onCommitCheckpoint ?? onChange;
    commit(result.nextRawText, UI_LABELS.toasts.sourceReplacedCount(result.replacedCount));
    setActiveMatchIndex(0);
  }, [
    readOnly,
    findResult.matches.length,
    findResult.error,
    rawText,
    findQuery,
    replaceText,
    findOptions,
    doc,
    onCommitCheckpoint,
    onChange,
  ]);

  // Safe Symbol Rename handlers
  const handleSelectSymbolId = useCallback(
    (nextId: string) => {
      setSelectedSymbolId(nextId);
      const nextSym = symbols.find((s) => s.id === nextId);
      setRenameTarget(nextSym ? nextSym.value : '');
      setActiveSymbolOccIndex(0);
      setScrollTick((t) => t + 1);
    },
    [symbols]
  );

  const handleStepSymbolPrev = useCallback(() => {
    const total = selectedSymbol?.occurrences.length ?? 0;
    if (total === 0) return;
    setActiveSymbolOccIndex((prev) => (prev - 1 + total) % total);
    setScrollTick((t) => t + 1);
  }, [selectedSymbol]);

  const handleStepSymbolNext = useCallback(() => {
    const total = selectedSymbol?.occurrences.length ?? 0;
    if (total === 0) return;
    setActiveSymbolOccIndex((prev) => (prev + 1) % total);
    setScrollTick((t) => t + 1);
  }, [selectedSymbol]);

  const handleApplyRename = useCallback(() => {
    if (readOnly || !selectedSymbol) return;
    const result = renameScriptSymbol(rawText, selectedSymbol, renameTarget, symbols);
    if (!result.ok || result.replacedCount === 0) return;

    const nextId = `${selectedSymbol.kind}:${result.validation.normalizedTarget}`;
    setSelectedSymbolId(nextId);
    setRenameTarget(result.validation.normalizedTarget);
    setActiveSymbolOccIndex(0);

    const commit = onCommitCheckpoint ?? onChange;
    commit(
      result.nextRawText,
      UI_LABELS.toasts.symbolRenamed(
        selectedSymbol.value,
        result.validation.normalizedTarget,
        result.replacedCount
      )
    );
    setScrollTick((t) => t + 1);
  }, [readOnly, selectedSymbol, rawText, renameTarget, symbols, onCommitCheckpoint, onChange]);

  const toolButtonClass = (isActive: boolean) =>
    `inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
      isActive
        ? 'border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text'
        : 'border-border-main bg-surface text-text-muted hover:bg-surface-hover hover:text-text-main'
    }`;

  return (
    <main className="mx-auto w-full max-w-[820px] px-4 sm:px-6 pt-5 pb-20">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="font-serif text-sm text-text-muted">{UI_LABELS.source.heading}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleToggleTool('find')}
            aria-expanded={activeTool === 'find'}
            title={readOnly ? UI_LABELS.source.findReadOnlyTitle : UI_LABELS.source.findTitle}
            aria-label={UI_LABELS.source.findAria}
            className={toolButtonClass(activeTool === 'find')}
          >
            <Search
              className={`h-3 w-3 ${activeTool === 'find' ? 'text-btn-primary-text' : 'text-text-faint'}`}
            />
            <span>{UI_LABELS.source.findButton}</span>
          </button>

          {!readOnly && (
            <button
              type="button"
              onClick={() => handleToggleTool('rename')}
              aria-expanded={activeTool === 'rename'}
              title={UI_LABELS.source.renameTitle}
              aria-label={UI_LABELS.source.renameAria}
              className={toolButtonClass(activeTool === 'rename')}
            >
              <Tag
                className={`h-3 w-3 ${activeTool === 'rename' ? 'text-btn-primary-text' : 'text-text-faint'}`}
              />
              <span>{UI_LABELS.source.renameButton}</span>
            </button>
          )}

          {!readOnly && onFormatScript && (
            <button
              type="button"
              onClick={onFormatScript}
              title={UI_LABELS.source.formatTitle}
              aria-label={UI_LABELS.source.formatAria}
              className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
            >
              <AlignLeft className="h-3 w-3 text-text-faint" />
              <span>{UI_LABELS.source.formatButton}</span>
            </button>
          )}

          <div className="ml-1 flex items-center gap-2 font-mono text-[11px] text-text-faint tabular-nums">
            <span>{UI_LABELS.source.linesCount(lineCount)}</span>
            <span aria-hidden="true">·</span>
            <span>{UI_LABELS.source.charsCount(charCount)}</span>
          </div>
        </div>
      </div>

      {activeTool === 'find' && (
        <SourceFindReplaceBar
          query={findQuery}
          replacement={replaceText}
          options={findOptions}
          matchCount={findResult.matches.length}
          activeMatchIndex={safeFindIndex}
          regexError={findResult.error}
          readOnly={readOnly}
          onQueryChange={handleQueryChange}
          onReplacementChange={setReplaceText}
          onToggleOption={handleToggleFindOption}
          onScopeChange={handleScopeChange}
          onStepPrev={handleStepFindPrev}
          onStepNext={handleStepFindNext}
          onReplaceActive={handleReplaceActive}
          onReplaceAll={handleReplaceAll}
          onClose={() => setActiveTool('none')}
        />
      )}

      {activeTool === 'rename' && !readOnly && (
        <SourceSymbolRenameBar
          symbols={symbols}
          selectedSymbol={selectedSymbol}
          targetInput={renameTarget}
          validation={renameValidation}
          activeOccurrenceIndex={safeSymbolOccIndex}
          onSelectSymbolId={handleSelectSymbolId}
          onTargetInputChange={setRenameTarget}
          onStepPrev={handleStepSymbolPrev}
          onStepNext={handleStepSymbolNext}
          onApplyRename={handleApplyRename}
          onClose={() => setActiveTool('none')}
        />
      )}

      <div className="rounded-lg border border-border-main bg-surface p-4 shadow-2xs">
        <LiveHighlightedEditor
          value={rawText}
          onChange={onChange}
          mode="source"
          aestheticTokens={aestheticTokens}
          highlightRanges={highlightRanges}
          mirrorRef={mirrorRef}
          readOnly={readOnly}
          minHeightClass="min-h-[540px]"
          ariaLabel={UI_LABELS.source.ariaLabel}
          placeholder={UI_LABELS.source.placeholder}
        />
      </div>
    </main>
  );
});
