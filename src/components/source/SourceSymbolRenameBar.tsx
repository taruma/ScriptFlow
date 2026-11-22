import {memo, useEffect, useMemo, useRef, type KeyboardEvent} from 'react';
import {AlertTriangle, ArrowRight, ChevronDown, ChevronUp, Tag, X} from 'lucide-react';
import type {ScriptSymbol, ScriptSymbolKind, SymbolRenameValidation} from '../../core/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';

interface SourceSymbolRenameBarProps {
  symbols: readonly ScriptSymbol[];
  selectedSymbol: ScriptSymbol | null;
  targetInput: string;
  validation: SymbolRenameValidation | null;
  activeOccurrenceIndex: number;
  onSelectSymbolId: (symbolId: string) => void;
  onTargetInputChange: (next: string) => void;
  onStepPrev: () => void;
  onStepNext: () => void;
  onApplyRename: () => void;
  onClose: () => void;
}

const SYMBOL_CATEGORY_ORDER: readonly ScriptSymbolKind[] = [
  'character',
  'reference',
  'token',
  'camera',
];

function getValidationMessage(
  symbol: ScriptSymbol,
  validation: SymbolRenameValidation
): string | null {
  const errs = UI_LABELS.source.renameTray.errors;
  switch (validation.reason) {
    case 'empty':
      return errs.empty;
    case 'unchanged':
      return null;
    case 'invalid_format':
      return errs.invalidFormat[symbol.kind];
    case 'collision':
      return errs.collision(validation.collidingSymbol ?? validation.normalizedTarget);
    default:
      return null;
  }
}

export const SourceSymbolRenameBar = memo(function SourceSymbolRenameBar({
  symbols,
  selectedSymbol,
  targetInput,
  validation,
  activeOccurrenceIndex,
  onSelectSymbolId,
  onTargetInputChange,
  onStepPrev,
  onStepNext,
  onApplyRename,
  onClose,
}: SourceSymbolRenameBarProps) {
  const targetInputRef = useRef<HTMLInputElement | null>(null);
  const labels = UI_LABELS.source.renameTray;

  useEffect(() => {
    if (selectedSymbol) {
      targetInputRef.current?.focus();
      targetInputRef.current?.select();
    }
  }, [selectedSymbol?.id]);

  const groupedSymbols = useMemo(() => {
    const groups = new Map<ScriptSymbolKind, ScriptSymbol[]>();
    for (const kind of SYMBOL_CATEGORY_ORDER) {
      groups.set(kind, []);
    }
    for (const sym of symbols) {
      groups.get(sym.kind)?.push(sym);
    }
    return SYMBOL_CATEGORY_ORDER.map((kind) => ({
      kind,
      items: groups.get(kind) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [symbols]);

  const handleTrayKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const handleTargetKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && validation?.valid) {
      event.preventDefault();
      onApplyRename();
    }
  };

  if (symbols.length === 0 || !selectedSymbol) {
    return (
      <div
        role="region"
        aria-label={labels.regionAria}
        onKeyDown={handleTrayKeyDown}
        className="mb-2.5 flex items-center justify-between gap-3 rounded-lg border border-border-main bg-surface px-3 py-2.5 shadow-2xs"
      >
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Tag className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          <span>{labels.emptyState}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.closeAria}
          title={labels.closeTitle}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-faint hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const occCount = selectedSymbol.occurrences.length;
  const canStep = occCount > 0;
  const canApply = Boolean(validation?.valid);
  const errorMessage =
    validation && targetInput.trim() !== selectedSymbol.value
      ? getValidationMessage(selectedSymbol, validation)
      : null;

  return (
    <div
      role="region"
      aria-label={labels.regionAria}
      onKeyDown={handleTrayKeyDown}
      className="mb-2.5 rounded-lg border border-border-main bg-surface px-3 py-2.5 shadow-2xs space-y-2"
    >
      {/* Row 1: Symbol selector + occurrence preview stepper + close */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 min-w-[210px] items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface-subtle px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted shrink-0">
            <Tag className="h-3 w-3 text-text-faint" />
            <span>{labels.categoryShort[selectedSymbol.kind]}</span>
          </span>
          <select
            value={selectedSymbol.id}
            onChange={(e) => onSelectSymbolId(e.target.value)}
            aria-label={labels.selectSymbolAria}
            className="flex-1 min-w-0 rounded-md border border-border-main bg-surface-subtle hover:bg-surface focus:bg-surface px-2.5 py-1 font-mono text-xs text-text-main outline-none focus:border-text-muted transition-colors cursor-pointer"
          >
            {groupedSymbols.map((group) => (
              <optgroup key={group.kind} label={labels.categoryLabels[group.kind]}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.value}
                    {item.detail ? ` (${item.detail})` : ''} · {labels.occurrenceCount(item.occurrences.length)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="min-w-[68px] text-right font-mono text-[11px] text-text-faint tabular-nums">
            {occCount > 0 ? labels.occurrencePosition(activeOccurrenceIndex + 1, occCount) : ''}
          </span>
          <button
            type="button"
            onClick={onStepPrev}
            disabled={!canStep}
            aria-label={labels.prevOccurrenceAria}
            title={labels.prevOccurrenceAria}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-main bg-surface-subtle text-text-muted hover:bg-surface-hover hover:text-text-main disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onStepNext}
            disabled={!canStep}
            aria-label={labels.nextOccurrenceAria}
            title={labels.nextOccurrenceAria}
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

      {/* Row 2: Target name input + Rename All action */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 min-w-[200px] items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-text-muted shrink-0">
            <ArrowRight className="h-3 w-3 text-text-faint" />
            <span>{labels.targetLabel}</span>
          </span>
          <input
            ref={targetInputRef}
            type="text"
            value={targetInput}
            onChange={(e) => onTargetInputChange(e.target.value)}
            onKeyDown={handleTargetKeyDown}
            data-native-undo="true"
            spellCheck={false}
            placeholder={labels.targetPlaceholder}
            aria-label={labels.targetInputAria}
            className={`flex-1 min-w-0 rounded-md border bg-surface-subtle focus:bg-surface px-2.5 py-1 font-mono text-xs text-text-main placeholder-text-placeholder outline-none transition-colors ${
              errorMessage
                ? 'border-amber-500/70 focus:border-amber-500'
                : 'border-border-main focus:border-text-muted'
            }`}
          />
        </div>

        <button
          type="button"
          onClick={onApplyRename}
          disabled={!canApply}
          title={labels.applyTitle}
          className="inline-flex items-center gap-1.5 rounded-md bg-btn-primary-bg px-3 py-1 text-[11px] font-semibold text-btn-primary-text hover:bg-btn-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
        >
          <span>{labels.applyButton}</span>
          <span className="font-mono text-[10px] opacity-80 tabular-nums">({occCount})</span>
        </button>
      </div>

      {/* Inline format / collision guard message */}
      {errorMessage && (
        <div
          role="alert"
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] ${
            validation?.reason === 'collision'
              ? 'border-red-500/30 bg-red-500/8 text-red-600 dark:text-red-400'
              : 'border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
});
