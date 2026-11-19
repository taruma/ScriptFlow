import {useEffect, useRef} from 'react';
import {AlertTriangle, X} from 'lucide-react';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

export interface ConfirmDialogRequest {
  title: string;
  description: string;
  excerpt?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  request: ConfirmDialogRequest | null;
  onClose: () => void;
}

/**
 * Decoupled, reusable confirmation modal for destructive or irreversible user actions.
 * Keeps confirmation UX completely separated from domain entities and editors.
 */
export function ConfirmDialog({request, onClose}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!request) return;

    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [request, onClose]);

  if (!request) return null;

  const tone = request.tone ?? 'danger';
  const confirmLabel = request.confirmLabel ?? UI_LABELS.confirm.delete;
  const cancelLabel = request.cancelLabel ?? UI_LABELS.confirm.cancel;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={request.title || UI_LABELS.confirm.dialogAria}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlay}
    >
      <div className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                tone === 'danger'
                  ? 'border-red-500/25 bg-red-500/10 text-red-500'
                  : 'border-border-main bg-surface-muted text-text-main'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
            <h3 className="font-serif text-[14px] font-bold tracking-tight text-text-main">
              {request.title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={cancelLabel}
            className={UI_TOKENS.button.iconClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-4 space-y-2.5">
          <p className="text-xs leading-relaxed text-text-muted">{request.description}</p>

          {request.excerpt && (
            <div className="rounded-lg border border-border-subtle bg-surface-subtle px-2.5 py-2 font-script text-[12px] leading-snug text-text-muted line-clamp-2 break-words">
              {request.excerpt}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-subtle px-4 py-2.5">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            className={UI_TOKENS.button.secondary}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              request.onConfirm();
              onClose();
            }}
            className={tone === 'danger' ? UI_TOKENS.button.danger : UI_TOKENS.button.primary}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
