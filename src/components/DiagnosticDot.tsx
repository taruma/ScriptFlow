import {memo, useEffect, useRef, useState} from 'react';
import {AlertCircle, AlertTriangle, X} from 'lucide-react';
import type {LintDiagnostic} from '../core/types.ts';
import {UI_LABELS} from '../ui/labels.ts';

interface DiagnosticDotProps {
  diagnostics: LintDiagnostic[];
  align?: 'top' | 'center';
}

export const DiagnosticDot = memo(function DiagnosticDot({
  diagnostics,
  align = 'top',
}: DiagnosticDotProps) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isOpen = pinned || hovered;
  const hasError = diagnostics.some((d) => d.severity === 'error');

  useEffect(() => {
    if (!pinned) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setPinned(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pinned]);

  if (diagnostics.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex items-start justify-center ${align === 'center' ? 'self-center' : 'pt-1'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPinned((prev) => !prev);
        }}
        aria-label={UI_LABELS.diagnostics.triggerAria(diagnostics.length, hasError)}
        aria-expanded={isOpen}
        className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${
          hasError
            ? 'border-red-500/40 bg-red-500/12 text-red-500 hover:bg-red-500/20 focus-visible:ring-red-500/40'
            : 'border-amber-500/40 bg-amber-500/12 text-amber-500 hover:bg-amber-500/20 focus-visible:ring-amber-500/40'
        }`}
      >
        {hasError ? <AlertCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={UI_LABELS.diagnostics.dialogAria}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-7 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border-main bg-surface shadow-2xl text-text-main overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-border-subtle bg-surface-subtle px-3 py-2">
            <span className="text-[11px] font-semibold tracking-wide text-text-muted">
              {UI_LABELS.diagnostics.headerTitle(diagnostics.length)}
            </span>
            {pinned && (
              <button
                type="button"
                onClick={() => setPinned(false)}
                className="rounded-md p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main cursor-pointer"
                aria-label={UI_LABELS.diagnostics.closeAria}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="divide-y divide-border-subtle max-h-72 overflow-y-auto">
            {diagnostics.map((diag) => (
              <div key={diag.id} className="px-3.5 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold text-text-muted">
                    {diag.lens}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold uppercase ${
                      diag.severity === 'error' ? 'text-red-500' : 'text-amber-500'
                    }`}
                  >
                    {diag.severity}
                  </span>
                </div>
                <p className="text-xs font-semibold text-text-main leading-snug">
                  {diag.ruleName}
                </p>
                <p className="text-xs text-text-body leading-relaxed">{diag.message}</p>
                <p className="text-[11px] text-text-muted leading-relaxed border-t border-border-subtle pt-1.5">
                  <span className="font-semibold text-text-body">
                    {UI_LABELS.diagnostics.repairPrefix}
                  </span>
                  {diag.repairHint}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
