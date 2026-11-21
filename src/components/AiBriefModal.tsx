import {useEffect} from 'react';
import {FileText, Plus, Trash2, X} from 'lucide-react';
import type {DraftBriefState, ReferenceEntry} from '../ui/aiAssistant.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

export interface AiBriefModalProps {
  isOpen: boolean;
  brief: DraftBriefState;
  briefHasContent: boolean;
  onClose: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onAddReference: () => void;
  onUpdateReference: (
    refId: string,
    patch: Partial<Pick<ReferenceEntry, 'handle' | 'label' | 'note'>>
  ) => void;
  onRemoveReference: (refId: string) => void;
  onUpdateSpecs: (specs: string) => void;
  onUpdateSubtext: (subtext: string) => void;
  onClearBrief: () => void;
}

export function AiBriefModal(props: AiBriefModalProps) {
  if (!props.isOpen) return null;
  return <AiBriefModalContent {...props} />;
}

function AiBriefModalContent({
  brief,
  briefHasContent,
  onClose,
  onSetEnabled,
  onAddReference,
  onUpdateReference,
  onRemoveReference,
  onUpdateSpecs,
  onUpdateSubtext,
  onClearBrief,
}: Omit<AiBriefModalProps, 'isOpen'>) {
  const labels = UI_LABELS.ai.briefTray;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlay}
    >
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-text-main"
            >
              <FileText className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main">
                {labels.title}
              </h2>
              <p className="text-[11px] text-text-muted truncate">{labels.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={labels.closeAria}
            className={UI_TOKENS.button.iconClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div
          aria-label={labels.regionAria}
          className="overflow-y-auto auteur-pane-scroll px-5 py-4 space-y-5"
        >
          {/* Include in AI Context Toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-subtle/60 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-main">{labels.enableLabel}</div>
                <div className="text-[11px] text-text-muted">{labels.enableDesc}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={brief.enabled}
                aria-label={labels.enableAria}
                onClick={() => onSetEnabled(!brief.enabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  brief.enabled
                    ? 'border-btn-primary-bg bg-btn-primary-bg'
                    : 'border-border-main bg-surface-muted'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                    brief.enabled
                      ? 'translate-x-4 bg-btn-primary-text'
                      : 'translate-x-0.5 bg-text-muted'
                  }`}
                />
              </button>
            </div>
            {!brief.enabled && briefHasContent && (
              <p className="text-[11px] text-text-muted px-1">{labels.pausedHint}</p>
            )}
          </div>

          {/* Cast & References */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {labels.refsHeading}
              </span>
              <button
                type="button"
                onClick={onAddReference}
                aria-label={labels.addRefAria}
                className={`${UI_TOKENS.ai.pillButton} text-[11px] py-1 px-2.5`}
              >
                <Plus className="h-3 w-3" />
                <span>{labels.addRefButton}</span>
              </button>
            </div>

            {brief.references.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-main bg-surface-subtle/50 px-3.5 py-3 text-xs text-text-muted leading-relaxed">
                {labels.emptyRefsHint}
              </div>
            ) : (
              <div className="space-y-2">
                {brief.references.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-border-main bg-surface-subtle/50 p-2.5 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        data-native-undo="true"
                        value={entry.handle}
                        onChange={(event) =>
                          onUpdateReference(entry.id, {handle: event.target.value})
                        }
                        placeholder={labels.handlePlaceholder}
                        aria-label={labels.handleAria}
                        className="w-28 shrink-0 rounded-lg border border-border-main bg-surface px-2.5 py-1.5 font-mono text-xs text-text-main placeholder-text-placeholder focus:outline-none focus:ring-1 focus:ring-border-main"
                      />
                      <input
                        type="text"
                        data-native-undo="true"
                        value={entry.label}
                        onChange={(event) =>
                          onUpdateReference(entry.id, {label: event.target.value})
                        }
                        placeholder={labels.labelPlaceholder}
                        aria-label={labels.labelAria}
                        className="min-w-0 flex-1 rounded-lg border border-border-main bg-surface px-2.5 py-1.5 text-xs text-text-main placeholder-text-placeholder focus:outline-none focus:ring-1 focus:ring-border-main"
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveReference(entry.id)}
                        aria-label={labels.removeRefAria}
                        className="p-1.5 rounded-lg text-text-faint hover:text-red-600 dark:hover:text-red-400 hover:bg-surface transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      data-native-undo="true"
                      value={entry.note ?? ''}
                      onChange={(event) =>
                        onUpdateReference(entry.id, {note: event.target.value})
                      }
                      placeholder={labels.notePlaceholder}
                      aria-label={labels.noteAria}
                      className="w-full rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-text-body placeholder-text-placeholder focus:border-border-main focus:outline-none focus:ring-1 focus:ring-border-main"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <hr className="border-border-subtle" />

          {/* Format & Specs */}
          <section className="space-y-1.5">
            <label
              htmlFor="auteur-ai-brief-specs"
              className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {labels.specsLabel}
            </label>
            <textarea
              id="auteur-ai-brief-specs"
              rows={3}
              data-native-undo="true"
              value={brief.specs}
              onChange={(event) => onUpdateSpecs(event.target.value)}
              placeholder={labels.specsPlaceholder}
              aria-label={labels.specsAria}
              className={`${UI_TOKENS.input.field} min-h-[76px] resize-y leading-relaxed auteur-pane-scroll`}
            />
          </section>

          {/* Subtext & Context */}
          <section className="space-y-1.5">
            <label
              htmlFor="auteur-ai-brief-subtext"
              className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {labels.subtextLabel}
            </label>
            <textarea
              id="auteur-ai-brief-subtext"
              rows={3}
              data-native-undo="true"
              value={brief.subtext}
              onChange={(event) => onUpdateSubtext(event.target.value)}
              placeholder={labels.subtextPlaceholder}
              aria-label={labels.subtextAria}
              className={`${UI_TOKENS.input.field} min-h-[76px] resize-y leading-relaxed auteur-pane-scroll`}
            />
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-subtle bg-surface-subtle flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            {briefHasContent && (
              <button
                type="button"
                onClick={onClearBrief}
                aria-label={labels.clearAria}
                className="text-xs font-medium text-text-faint hover:text-text-main transition-colors cursor-pointer"
              >
                {labels.clearButton}
              </button>
            )}
          </div>

          <button type="button" onClick={onClose} className={UI_TOKENS.button.primary}>
            {labels.doneButton}
          </button>
        </div>
      </div>
    </div>
  );
}
