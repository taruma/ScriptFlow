import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {Code2, X} from 'lucide-react';
import {
  getUtf8ByteLength,
  TEXT_SECTION_PRESET_TAGS,
  validateSectionTag,
} from '../../../ui/aiAssistant.ts';
import {formatByteSize, MAX_INLINE_TEXT_BYTES} from '../../../ui/briefMedia.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface ComposerTextSectionModalProps {
  isOpen: boolean;
  editingSection?: {id: string; tag: string; content: string} | null;
  onClose: () => void;
  onSave: (payload: {id?: string; tag: string; content: string}) => void;
}

export function ComposerTextSectionModal({
  isOpen,
  editingSection = null,
  onClose,
  onSave,
}: ComposerTextSectionModalProps) {
  const [tagInput, setTagInput] = useState(editingSection?.tag ?? 'screenplay');
  const [content, setContent] = useState(editingSection?.content ?? '');

  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const tagInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTagInput(editingSection?.tag ?? 'screenplay');
    setContent(editingSection?.content ?? '');

    const focusTimer = window.setTimeout(() => {
      if (editingSection) {
        contentRef.current?.focus();
      } else {
        contentRef.current?.focus();
      }
    }, 10);

    return () => window.clearTimeout(focusTimer);
  }, [editingSection, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, {capture: true});
    return () => document.removeEventListener('keydown', handleKeyDown, {capture: true});
  }, [isOpen, onClose]);

  const tagValidation = useMemo(() => validateSectionTag(tagInput), [tagInput]);
  const byteLength = useMemo(() => getUtf8ByteLength(content), [content]);
  const lineCount = useMemo(
    () => (content.length === 0 ? 0 : content.split(/\r?\n/).length),
    [content]
  );

  if (!isOpen) return null;

  const labels = UI_LABELS.ai.composerAttach;
  const isEditing = Boolean(editingSection);
  const isOverLimit = byteLength > MAX_INLINE_TEXT_BYTES;
  const hasContent = content.trim().length > 0;
  const canSubmit = tagValidation.valid && hasContent && !isOverLimit;

  const sizeLabel = formatByteSize(byteLength) || '0 B';
  const tagError =
    tagValidation.valid || tagInput.trim().length === 0
      ? !tagValidation.valid && isEditing
        ? labels.textSectionTagEmptyError
        : null
      : tagValidation.error === 'reserved'
        ? labels.textSectionTagReservedError(tagValidation.tag)
        : labels.textSectionTagEmptyError;

  const handleSubmit = () => {
    if (!tagValidation.valid || !hasContent || isOverLimit) {
      if (!tagValidation.valid) {
        tagInputRef.current?.focus();
      } else {
        contentRef.current?.focus();
      }
      return;
    }
    onSave({
      ...(editingSection ? {id: editingSection.id} : {}),
      tag: tagValidation.tag,
      content,
    });
  };

  const handleContentKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.textSectionModalAria}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlay}
    >
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col max-h-[88dvh]">
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-[var(--phase-logic-text)]"
            >
              <Code2 className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main">
                {isEditing ? labels.textSectionModalEditTitle : labels.textSectionModalTitle}
              </h2>
              <p className="text-[11px] text-text-muted truncate">
                {labels.textSectionModalSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.textSectionModalCloseAria}
            className={UI_TOKENS.button.iconClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto auteur-pane-scroll p-4 space-y-3.5">
          {/* Section Tag Input + Live Preview + Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="composer-text-section-tag"
                className="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
              >
                {labels.textSectionTagLabel}
              </label>
              {tagValidation.valid && (
                <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-logic">
                  {`<${tagValidation.tag}>…</${tagValidation.tag}>`}
                </span>
              )}
            </div>

            <input
              ref={tagInputRef}
              id="composer-text-section-tag"
              type="text"
              data-native-undo="true"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder={labels.textSectionTagPlaceholder}
              aria-label={labels.textSectionTagAria}
              aria-invalid={Boolean(tagError)}
              className={`w-full rounded-xl border px-3 py-1.5 font-mono text-xs text-text-main bg-surface-subtle focus:bg-surface focus:outline-none focus:ring-1 ${
                tagError
                  ? 'border-red-500/60 focus:ring-red-500/40'
                  : 'border-border-main focus:ring-border-main'
              }`}
            />

            {tagError && (
              <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
                {tagError}
              </p>
            )}

            <div
              role="group"
              aria-label={labels.textSectionTagPresetsAria}
              className="flex flex-wrap items-center gap-1.5 pt-0.5"
            >
              {TEXT_SECTION_PRESET_TAGS.map((preset) => {
                const isSelected = tagValidation.valid && tagValidation.tag === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setTagInput(preset)}
                    className={`rounded-lg border px-2 py-0.5 font-mono text-[10.5px] transition-colors cursor-pointer ${
                      isSelected
                        ? 'auteur-phase-logic font-semibold'
                        : 'border-border-subtle bg-surface-subtle text-text-muted hover:text-text-main hover:bg-surface-hover'
                    }`}
                  >
                    {`<${preset}>`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section Content Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="composer-text-section-content"
                className="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
              >
                {labels.textSectionContentLabel}
              </label>
              <span
                className={`font-mono text-[10px] tabular-nums ${
                  isOverLimit ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-text-faint'
                }`}
              >
                {labels.textSectionStats(lineCount, sizeLabel)}
              </span>
            </div>

            <textarea
              ref={contentRef}
              id="composer-text-section-content"
              rows={12}
              data-native-undo="true"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={handleContentKeyDown}
              placeholder={labels.textSectionContentPlaceholder}
              aria-label={labels.textSectionContentAria}
              className={`w-full rounded-xl border p-3 font-mono text-xs leading-relaxed text-text-main placeholder-text-placeholder bg-surface-subtle focus:bg-surface focus:outline-none focus:ring-1 resize-y min-h-[200px] max-h-[48dvh] auteur-pane-scroll ${
                isOverLimit
                  ? 'border-red-500/60 focus:ring-red-500/40'
                  : 'border-border-main focus:ring-border-main'
              }`}
            />

            {isOverLimit && (
              <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
                {labels.textSectionContentTooLargeError(sizeLabel)}
              </p>
            )}
          </div>
        </div>

        <div className={`${UI_TOKENS.modal.footer} items-center gap-2`}>
          <span className="text-[11px] text-text-faint mr-auto">
            {labels.textSectionSubmitHint}
          </span>
          <button type="button" onClick={onClose} className={UI_TOKENS.button.secondary}>
            {labels.textSectionCancelButton}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={`${UI_TOKENS.button.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isEditing ? labels.textSectionSaveButton : labels.textSectionAttachButton}
          </button>
        </div>
      </div>
    </div>
  );
}
