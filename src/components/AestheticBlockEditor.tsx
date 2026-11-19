import {useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent} from 'react';
import {Plus, X} from 'lucide-react';
import {
  parseAestheticLine,
  parseAestheticRows,
  serializeAestheticRows,
  type AestheticRow,
} from '../core/aesthetic.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {LiveHighlightedEditor} from './LiveHighlightedEditor.tsx';
import type {StagingBlockEditorProps} from './stagingBlockRegistry.ts';

interface PendingFocus {
  index: number;
  column: 'key' | 'value';
  caret: number;
}

/**
 * Structured 2-column live editor for [AESTHETIC] blocks:
 * Column 1 renders bold Lookbook keys (Medium, Lighting, Wardrobe, etc.),
 * Column 2 renders live-highlighted values with automatic hanging-indent alignment
 * across wrapped lines. Commits losslessly back to canonical plain text.
 */
export function AestheticBlockEditor({
  rawBody,
  aestheticTokens,
  autoFocus = false,
  onClearAutoFocus,
  onCommit,
  onFocusChange,
}: StagingBlockEditorProps) {
  const [rows, setRows] = useState<AestheticRow[]>(() => parseAestheticRows(rawBody));
  const [isContainerFocused, setIsContainerFocused] = useState(false);

  const keyRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const valueRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const lastCommittedRef = useRef<string>(rawBody);

  // Sync external plain-text updates (e.g. preset switches, Source Mode edits, patches)
  useEffect(() => {
    if (!isContainerFocused && rawBody !== lastCommittedRef.current) {
      lastCommittedRef.current = rawBody;
      setRows(parseAestheticRows(rawBody));
    }
  }, [rawBody, isContainerFocused]);

  useEffect(() => {
    if (!autoFocus) return;
    pendingFocusRef.current = {index: 0, column: 'key', caret: 0};
    keyRefs.current.get(0)?.focus();
    onClearAutoFocus?.();
  }, [autoFocus, onClearAutoFocus]);

  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;

    if (target.column === 'key') {
      const el = keyRefs.current.get(target.index);
      if (el) {
        pendingFocusRef.current = null;
        el.focus();
        const pos = Math.min(target.caret, el.value.length);
        el.setSelectionRange(pos, pos);
      }
    } else {
      const el = valueRefs.current.get(target.index);
      if (el) {
        pendingFocusRef.current = null;
        el.focus();
        const pos = Math.min(target.caret, el.value.length);
        el.setSelectionRange(pos, pos);
      }
    }
  });

  const commitRows = (nextRows: AestheticRow[]) => {
    setRows(nextRows);
    const serialized = serializeAestheticRows(nextRows);
    lastCommittedRef.current = serialized;
    onCommit(serialized);
  };

  const handleContainerFocus = () => {
    if (!isContainerFocused) {
      setIsContainerFocused(true);
      onFocusChange(true);
    }
  };

  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
      return;
    }
    setIsContainerFocused(false);
    onFocusChange(false);

    // Strip trailing empty rows cleanly on blur
    const trimmedRows = [...rows];
    while (
      trimmedRows.length > 1 &&
      ((trimmedRows[trimmedRows.length - 1].type === 'kv' &&
        (trimmedRows[trimmedRows.length - 1] as {type: 'kv'; key: string; value: string}).key.trim() ===
          '' &&
        (trimmedRows[trimmedRows.length - 1] as {type: 'kv'; key: string; value: string}).value.trim() ===
          '') ||
        (trimmedRows[trimmedRows.length - 1].type === 'free' &&
          (trimmedRows[trimmedRows.length - 1] as {type: 'free'; raw: string}).raw.trim() === ''))
    ) {
      trimmedRows.pop();
    }
    const serialized = serializeAestheticRows(trimmedRows).replace(/\n+$/, '');
    lastCommittedRef.current = serialized;
    setRows(parseAestheticRows(serialized));
    if (serialized !== rawBody) {
      onCommit(serialized);
    }
  };

  const handleKeyChange = (index: number, nextKey: string) => {
    // Typing ":" immediately advances focus into Column 2 (value)
    if (nextKey.includes(':')) {
      const [beforeColon, ...afterParts] = nextKey.split(':');
      const afterColon = afterParts.join(':').replace(/^\s+/, '');
      const nextRows = rows.map((row, idx) => {
        if (idx !== index) return row;
        const existingValue = row.type === 'kv' ? row.value : '';
        const mergedValue = afterColon
          ? existingValue
            ? `${afterColon} ${existingValue}`
            : afterColon
          : existingValue;
        return {type: 'kv' as const, key: beforeColon, value: mergedValue};
      });
      commitRows(nextRows);
      pendingFocusRef.current = {index, column: 'value', caret: afterColon.length};
      return;
    }

    const nextRows = rows.map((row, idx) =>
      idx === index && row.type === 'kv' ? {...row, key: nextKey} : row
    );
    commitRows(nextRows);
  };

  const handleValueChange = (index: number, nextValue: string) => {
    // Support pasting multiple Key: value lines cleanly into Column 2
    if (nextValue.includes('\n')) {
      const splitLines = nextValue.split(/\r?\n/);
      const firstValue = splitLines[0];
      const extraRows = splitLines.slice(1).map(parseAestheticLine);
      const nextRows = [
        ...rows.slice(0, index),
        rows[index].type === 'kv'
          ? {...rows[index], value: firstValue}
          : {type: 'free' as const, raw: firstValue},
        ...extraRows,
        ...rows.slice(index + 1),
      ];
      commitRows(nextRows);
      const lastNewIdx = index + extraRows.length;
      const lastRow = extraRows[extraRows.length - 1];
      pendingFocusRef.current = {
        index: lastNewIdx,
        column: 'value',
        caret: lastRow.type === 'kv' ? lastRow.value.length : lastRow.raw.length,
      };
      return;
    }

    const nextRows = rows.map((row, idx) => {
      if (idx !== index) return row;
      if (row.type === 'kv') {
        return {...row, value: nextValue};
      }
      // If a freeform line gets "Key: value" typed into it, promote it to a 2-column row
      return parseAestheticLine(nextValue);
    });
    commitRows(nextRows);
  };

  const insertRowAfter = (index: number) => {
    const nextRows = [
      ...rows.slice(0, index + 1),
      {type: 'kv' as const, key: '', value: ''},
      ...rows.slice(index + 1),
    ];
    commitRows(nextRows);
    pendingFocusRef.current = {index: index + 1, column: 'key', caret: 0};
  };

  const deleteRowAt = (index: number) => {
    if (rows.length <= 1) {
      commitRows([{type: 'kv', key: '', value: ''}]);
      pendingFocusRef.current = {index: 0, column: 'key', caret: 0};
      return;
    }
    const nextRows = rows.filter((_, idx) => idx !== index);
    commitRows(nextRows);
    const targetIdx = Math.max(0, index - 1);
    const targetRow = nextRows[targetIdx];
    pendingFocusRef.current = {
      index: targetIdx,
      column: 'value',
      caret: targetRow.type === 'kv' ? targetRow.value.length : targetRow.raw.length,
    };
  };

  const handleKeyInputKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    const row = rows[index];
    if (row.type !== 'kv') return;

    if (event.key === 'Enter') {
      event.preventDefault();
      pendingFocusRef.current = {index, column: 'value', caret: 0};
      valueRefs.current.get(index)?.focus();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (
      event.key === 'Backspace' &&
      row.key.length === 0 &&
      row.value.length === 0 &&
      rows.length > 1
    ) {
      event.preventDefault();
      deleteRowAt(index);
      return;
    }

    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      const prevRow = rows[index - 1];
      pendingFocusRef.current = {
        index: index - 1,
        column: prevRow.type === 'kv' ? 'key' : 'value',
        caret: prevRow.type === 'kv' ? prevRow.key.length : prevRow.raw.length,
      };
      if (prevRow.type === 'kv') {
        keyRefs.current.get(index - 1)?.focus();
      } else {
        valueRefs.current.get(index - 1)?.focus();
      }
      return;
    }

    if (event.key === 'ArrowDown' && index < rows.length - 1) {
      event.preventDefault();
      const nextRow = rows[index + 1];
      pendingFocusRef.current = {
        index: index + 1,
        column: nextRow.type === 'kv' ? 'key' : 'value',
        caret: 0,
      };
      if (nextRow.type === 'kv') {
        keyRefs.current.get(index + 1)?.focus();
      } else {
        valueRefs.current.get(index + 1)?.focus();
      }
    }
  };

  const handleValueKeyDown = (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;
    const caretStart = el.selectionStart ?? 0;
    const caretEnd = el.selectionEnd ?? 0;
    const hasSelection = caretStart !== caretEnd;
    const row = rows[index];

    if (event.key === 'Escape') {
      event.preventDefault();
      el.blur();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      insertRowAfter(index);
      return;
    }

    if (event.key === 'Backspace' && !hasSelection && caretStart === 0) {
      if (row.type === 'kv' && row.value.length === 0) {
        event.preventDefault();
        pendingFocusRef.current = {index, column: 'key', caret: row.key.length};
        keyRefs.current.get(index)?.focus();
        return;
      }
      if (row.type === 'free' && row.raw.length === 0 && rows.length > 1) {
        event.preventDefault();
        deleteRowAt(index);
        return;
      }
    }

    if (event.key === 'ArrowUp' && !hasSelection && caretStart === 0 && index > 0) {
      event.preventDefault();
      const prevRow = rows[index - 1];
      const len = prevRow.type === 'kv' ? prevRow.value.length : prevRow.raw.length;
      pendingFocusRef.current = {index: index - 1, column: 'value', caret: len};
      valueRefs.current.get(index - 1)?.focus();
      return;
    }

    const currentLen = row.type === 'kv' ? row.value.length : row.raw.length;
    if (
      event.key === 'ArrowDown' &&
      !hasSelection &&
      caretStart === currentLen &&
      index < rows.length - 1
    ) {
      event.preventDefault();
      pendingFocusRef.current = {index: index + 1, column: 'value', caret: 0};
      valueRefs.current.get(index + 1)?.focus();
    }
  };

  return (
    <div
      onFocus={handleContainerFocus}
      onBlur={handleContainerBlur}
      className="divide-y divide-border-subtle/70"
    >
      {rows.map((row, idx) => (
        <div
          key={idx}
          className={`group/kv relative pr-5 ${idx === 0 ? 'pb-1.5' : idx === rows.length - 1 ? 'pt-1.5' : 'py-1.5'}`}
        >
          {row.type === 'kv' ? (
            <div className="grid grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[100px_minmax(0,1fr)] items-start gap-2.5">
              {/* Column 1: Bold Lookbook Key */}
              <div className="min-w-0">
                <input
                  ref={(el) => {
                    if (el) keyRefs.current.set(idx, el);
                    else keyRefs.current.delete(idx);
                  }}
                  type="text"
                  value={row.key}
                  onChange={(e) => handleKeyChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyInputKeyDown(idx, e)}
                  aria-label={UI_LABELS.staging.aestheticKeyAria(idx)}
                  placeholder={UI_LABELS.staging.aestheticKeyPlaceholder}
                  spellCheck={false}
                  className="w-full m-0 p-0 border-0 bg-transparent font-script auteur-script-size leading-[1.44] font-semibold text-text-main placeholder-text-placeholder outline-none"
                />
              </div>

              {/* Column 2: Live-Highlighted Value (hanging-indent aligned across wrapped lines) */}
              <div className="min-w-0">
                <LiveHighlightedEditor
                  ref={(el) => {
                    if (el) valueRefs.current.set(idx, el);
                    else valueRefs.current.delete(idx);
                  }}
                  value={row.value}
                  onChange={(val) => handleValueChange(idx, val)}
                  mode="aestheticValue"
                  aestheticTokens={aestheticTokens}
                  ariaLabel={UI_LABELS.staging.aestheticValueAria(row.key, idx)}
                  placeholder={UI_LABELS.staging.aestheticValuePlaceholder}
                  onKeyDown={(e) => handleValueKeyDown(idx, e)}
                />
              </div>
            </div>
          ) : (
            /* Freeform fallback line if no Key: prefix is present */
            <LiveHighlightedEditor
              ref={(el) => {
                if (el) valueRefs.current.set(idx, el);
                else valueRefs.current.delete(idx);
              }}
              value={row.raw}
              onChange={(val) => handleValueChange(idx, val)}
              mode="aestheticValue"
              aestheticTokens={aestheticTokens}
              ariaLabel={UI_LABELS.staging.aestheticValueAria('', idx)}
              placeholder={UI_LABELS.staging.aestheticValuePlaceholder}
              onKeyDown={(e) => handleValueKeyDown(idx, e)}
            />
          )}

          {/* Quiet hover delete button per row */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              deleteRowAt(idx);
            }}
            title={UI_LABELS.staging.removeAestheticKeyTitle}
            aria-label={UI_LABELS.staging.removeAestheticKeyTitle}
            className={`absolute right-0 ${
              idx === 0 ? 'top-0' : 'top-1.5'
            } rounded p-0.5 text-text-faint opacity-0 group-hover/kv:opacity-100 hover:bg-surface-muted hover:text-text-main transition-opacity cursor-pointer`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {/* Focused-only Add Key button (zero idle vertical footprint) */}
      {isContainerFocused && (
        <div className="pt-1.5">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              insertRowAfter(rows.length - 1);
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] text-text-faint hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
          >
            <Plus className="h-3 w-3" />
            <span>{UI_LABELS.staging.addAestheticKey}</span>
          </button>
        </div>
      )}
    </div>
  );
}
