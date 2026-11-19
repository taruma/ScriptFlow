import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Plus} from 'lucide-react';
import {EXECUTION_HEADERS} from '../core/parser.ts';
import type {MacroBlockKind} from '../core/types.ts';
import {getMacroBlockMeta, UI_LABELS} from '../ui/labels.ts';

interface AddStagingBlockPickerProps {
  existingBlockNames: string[];
  onAddBlock: (headerName: string) => void;
}

const CANONICAL_STAGING_BLOCKS: readonly Exclude<MacroBlockKind, 'EXECUTION' | 'CUSTOM'>[] = [
  'INTENT',
  'LOGIC',
  'AESTHETIC',
  'OPENING',
  'CONTINUITY PROTOCOL',
  'CHARACTERS',
  'REFERENCES',
  'STAGE',
];

export function AddStagingBlockPicker({
  existingBlockNames,
  onAddBlock,
}: AddStagingBlockPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const existingSet = new Set(existingBlockNames.map((n) => n.trim().toUpperCase()));

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setCustomError(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setCustomError(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectBlock = (name: string) => {
    onAddBlock(name);
    setCustomName('');
    setCustomError(null);
    setIsOpen(false);
  };

  const handleSubmitCustom = (event: FormEvent) => {
    event.preventDefault();
    const normalized = customName
      .trim()
      .replace(/^\[+/, '')
      .replace(/\]+$/, '')
      .replace(/[^A-Za-z0-9 _/-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    if (!normalized) return;

    if (EXECUTION_HEADERS.has(normalized)) {
      setCustomError(UI_LABELS.staging.customHeaderReservedError);
      return;
    }

    handleSelectBlock(normalized);
  };

  return (
    <div
      ref={containerRef}
      className="mt-2.5 grid grid-cols-[minmax(0,1fr)_24px] items-start gap-1.5"
    >
      <div className="relative min-w-0">
        {isOpen && (
          <div className="mb-2 rounded-xl border border-border-main bg-surface shadow-lg overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle bg-surface-subtle px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                {UI_LABELS.staging.pickerHeader}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-1.5">
              {CANONICAL_STAGING_BLOCKS.map((kind) => {
                const meta = getMacroBlockMeta(kind);
                const alreadyAdded = existingSet.has(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => handleSelectBlock(kind)}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      alreadyAdded
                        ? 'opacity-45 cursor-not-allowed'
                        : 'hover:bg-surface-subtle cursor-pointer'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`${meta.badgeClass} inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-tight`}
                      >
                        [{kind}]
                      </span>
                      <span className="truncate text-[11px] text-text-muted">{meta.caption}</span>
                    </div>

                    {alreadyAdded && (
                      <span className="shrink-0 font-mono text-[9.5px] text-text-faint">
                        {UI_LABELS.staging.alreadyAdded}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={handleSubmitCustom}
              className="border-t border-border-subtle bg-surface-subtle/60 px-2.5 py-2"
            >
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={customName}
                  onChange={(e) => {
                    setCustomName(e.target.value);
                    if (customError) setCustomError(null);
                  }}
                  placeholder={UI_LABELS.staging.customHeaderPlaceholder}
                  aria-label={UI_LABELS.staging.customHeaderPlaceholder}
                  className="min-w-0 flex-1 rounded-lg border border-border-main bg-surface px-2.5 py-1 font-mono text-[11px] uppercase text-text-main placeholder:normal-case placeholder:font-sans placeholder-text-placeholder focus:border-text-muted focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={customName.trim().length === 0}
                  className="shrink-0 rounded-lg bg-btn-primary-bg px-2.5 py-1 text-[11px] font-semibold text-btn-primary-text hover:bg-btn-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {UI_LABELS.staging.customHeaderAdd}
                </button>
              </div>
              {customError && (
                <p className="mt-1 text-[10.5px] text-red-500">{customError}</p>
              )}
            </form>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-main py-2 text-xs font-medium text-text-muted hover:border-text-faint hover:bg-surface hover:text-text-main transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{UI_LABELS.document.addMacroBlock}</span>
        </button>
      </div>
      <div />
    </div>
  );
}
