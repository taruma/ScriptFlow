import {useEffect, useRef, useState} from 'react';
import {BookOpen, X} from 'lucide-react';
import {BUNDLED_AI_GUIDE_SECTIONS} from '../data/guide/index.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {MarkdownContent} from './MarkdownContent.tsx';

export interface AiGuideModalProps {
  isOpen: boolean;
  initialTabId?: string;
  onClose: () => void;
}

export function AiGuideModal({isOpen, initialTabId, onClose}: AiGuideModalProps) {
  const firstId = BUNDLED_AI_GUIDE_SECTIONS[0]?.id ?? '';
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (initialTabId && BUNDLED_AI_GUIDE_SECTIONS.some((s) => s.id === initialTabId)) {
      return initialTabId;
    }
    return firstId;
  });
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialTabId && BUNDLED_AI_GUIDE_SECTIONS.some((s) => s.id === initialTabId)) {
      setActiveTabId(initialTabId);
    }
  }, [initialTabId, isOpen]);

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

  useEffect(() => {
    if (!isOpen) return;
    if (bodyScrollRef.current) {
      bodyScrollRef.current.scrollTop = 0;
    }
  }, [activeTabId, isOpen]);

  if (!isOpen || BUNDLED_AI_GUIDE_SECTIONS.length === 0) return null;

  const labels = UI_LABELS.ai.guide;
  const activeSection =
    BUNDLED_AI_GUIDE_SECTIONS.find((s) => s.id === activeTabId) ?? BUNDLED_AI_GUIDE_SECTIONS[0];

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
      <div className="bg-surface w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col max-h-[88dvh]">
        {/* Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-text-main"
            >
              <BookOpen className="h-3.5 w-3.5" />
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

        {/* Section Tabs */}
        <div className="px-4 py-2.5 border-b border-border-subtle bg-surface shrink-0">
          <div
            role="tablist"
            aria-label={labels.tabsAria}
            className={`${UI_TOKENS.button.segmentedGroup} grid w-full`}
            style={{
              gridTemplateColumns: `repeat(${BUNDLED_AI_GUIDE_SECTIONS.length}, minmax(0, 1fr))`,
            }}
          >
            {BUNDLED_AI_GUIDE_SECTIONS.map((section) => {
              const selected = section.id === activeSection.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTabId(section.id)}
                  className={`${
                    selected ? UI_TOKENS.button.segmentedItemActive : UI_TOKENS.button.segmentedItem
                  } justify-center truncate`}
                >
                  <span className="truncate">{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Markdown Body */}
        <div
          ref={bodyScrollRef}
          role="tabpanel"
          aria-label={activeSection.label}
          className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll px-4 py-4 md:px-5 bg-app/30"
        >
          <div className="rounded-xl border border-border-subtle bg-surface p-4 md:p-5 shadow-2xs">
            <MarkdownContent content={activeSection.body} />
          </div>
        </div>

        {/* Footer */}
        <div className={`${UI_TOKENS.modal.footer} items-center gap-3`}>
          <span className="text-[11px] text-text-muted mr-auto truncate">
            {activeSection.summary}
          </span>
          <button type="button" onClick={onClose} className={UI_TOKENS.button.primary}>
            {labels.doneButton}
          </button>
        </div>
      </div>
    </div>
  );
}
