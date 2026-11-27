import {useCallback, useEffect, useState} from 'react';
import {CloudUpload, X} from 'lucide-react';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import type {NewReferenceEntryDraft} from '../brief/briefHelpers.ts';
import {GeminiFilesPanel} from '../brief/GeminiFilesPanel.tsx';

export interface ComposerCloudFilesModalProps {
  isOpen: boolean;
  apiKey: string;
  hasApiKey: boolean;
  attachedUris: ReadonlySet<string>;
  onClose: () => void;
  onOpenSettings: () => void;
  onAttachDraft: (draft: NewReferenceEntryDraft) => void;
}

export function ComposerCloudFilesModal({
  isOpen,
  apiKey,
  hasApiKey,
  attachedUris,
  onClose,
  onOpenSettings,
  onAttachDraft,
}: ComposerCloudFilesModalProps) {
  const [isBusy, setIsBusy] = useState(false);

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

  const handleCloseAndOpenSettings = useCallback(() => {
    onClose();
    onOpenSettings();
  }, [onClose, onOpenSettings]);

  const noop = useCallback(() => {}, []);

  if (!isOpen) return null;

  const labels = UI_LABELS.ai.composerAttach;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.cloudModalAria}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlay}
    >
      <div className="bg-surface w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col max-h-[85dvh]">
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-text-main"
            >
              <CloudUpload className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main">
                {labels.cloudModalTitle}
              </h2>
              <p className="text-[11px] text-text-muted truncate">{labels.cloudModalSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.cloudModalCloseAria}
            className={UI_TOKENS.button.iconClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto auteur-pane-scroll p-4">
          <GeminiFilesPanel
            isOpen={true}
            hideHeader
            apiKey={apiKey}
            hasApiKey={hasApiKey}
            attachedUris={attachedUris}
            onClosePanel={onClose}
            onRequestOpenPanel={noop}
            onUploadStarted={noop}
            onUploadBusyChange={setIsBusy}
            onCloseModalAndOpenSettings={handleCloseAndOpenSettings}
            onAddReferenceEntry={onAttachDraft}
          />
        </div>
      </div>
    </div>
  );
}
