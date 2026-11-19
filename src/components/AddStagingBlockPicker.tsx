import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Plus, X} from 'lucide-react';
import {
  CANONICAL_STAGING_HEADERS,
  isReservedExecutionHeader,
  sanitizeStagingHeaderName,
} from '../core/parser.ts';
import {getMacroBlockMeta, UI_LABELS} from '../ui/labels.ts';

const CANONICAL_STAGING_BLOCKS = CANONICAL_STAGING_HEADERS;

interface StagingBlockPickerPanelProps {
  existingBlockNames: string[];
  onSelectBlock: (headerName: string) => void;
  onClose: () => void;
  className?: string;
}

/**
 * Reusable compact picker panel for canonical v0.4.0 Staging Macro-Blocks and custom headers.
 * Used both inline at between-block hover seams and above the bottom "+ Add macro-block" button.
 */
export function StagingBlockPickerPanel({
  existingBlockNames,
  onSelectBlock,
  onClose,
  className = '',
}: StagingBlockPickerPanelProps) {
  const [customName, setCustomName] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const existingSet = new Set(existingBlockNames.map((n) => n.trim().toUpperCase()));

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-staging-picker-trigger="true"]')) {
        return;
      }
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleSubmitCustom = (event: FormEvent) => {
    event.preventDefault();
    const normalized = sanitizeStagingHeaderName(customName);

    if (!normalized) return;

    if (isReservedExecutionHeader(normalized)) {
      setCustomError(UI_LABELS.staging.customHeaderReservedError);
      return;
    }

    onSelectBlock(normalized);
  };

  return (
    <div
      ref={panelRef}
      className={`rounded-xl border border-border-main bg-surface shadow-lg overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-subtle px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
          {UI_LABELS.staging.pickerHeader}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={UI_LABELS.confirm.cancel}
          className="rounded p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
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
              onClick={() => onSelectBlock(kind)}
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
        {customError && <p className="mt-1 text-[10.5px] text-red-500">{customError}</p>}
      </form>
    </div>
  );
}

interface AddStagingBlockPickerProps {
  existingBlockNames: string[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onAddBlock: (headerName: string) => void;
}

export function AddStagingBlockPicker({
  existingBlockNames,
  isOpen,
  onToggle,
  onClose,
  onAddBlock,
}: AddStagingBlockPickerProps) {
  return (
    <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_24px] items-start gap-1.5">
      <div className="relative min-w-0">
        {isOpen && (
          <StagingBlockPickerPanel
            existingBlockNames={existingBlockNames}
            onSelectBlock={onAddBlock}
            onClose={onClose}
            className="mb-2"
          />
        )}

        <button
          type="button"
          data-staging-picker-trigger="true"
          onClick={onToggle}
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
