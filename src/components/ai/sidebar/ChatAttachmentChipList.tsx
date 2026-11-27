import {memo} from 'react';
import {Code2, FileText, Film, Image as ImageIcon, Music} from 'lucide-react';
import {
  isReferenceAttachmentExpired,
  type ChatMessageAttachment,
} from '../../../ui/aiAssistant.ts';
import {UI_LABELS} from '../../../ui/labels.ts';

export interface ChatAttachmentChipListProps {
  attachments: readonly ChatMessageAttachment[];
  onInspectAttachment?: (item: ChatMessageAttachment) => void;
}

function AttachmentIcon({
  kind,
  isSection,
}: {
  kind: ChatMessageAttachment['kind'];
  isSection?: boolean;
}) {
  if (isSection) {
    return <Code2 className="h-3 w-3 shrink-0 text-[var(--phase-logic-text)]" />;
  }
  switch (kind) {
    case 'video':
      return <Film className="h-3 w-3 shrink-0 text-[var(--phase-continuity-text)]" />;
    case 'audio':
      return <Music className="h-3 w-3 shrink-0 text-[var(--phase-logic-text)]" />;
    case 'image':
      return <ImageIcon className="h-3 w-3 shrink-0 text-text-muted" />;
    case 'document':
    default:
      return <FileText className="h-3 w-3 shrink-0 text-[var(--phase-aesthetic-text)]" />;
  }
}

export const ChatAttachmentChipList = memo(function ChatAttachmentChipList({
  attachments,
  onInspectAttachment,
}: ChatAttachmentChipListProps) {
  if (attachments.length === 0) return null;

  const labels = UI_LABELS.ai.briefTray;
  const attachLabels = UI_LABELS.ai.composerAttach;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
      {attachments.map((item) => {
        const att = item.attachment;
        const sectionTag = (item.sectionTag || att?.sectionTag)?.trim();
        const isSection = Boolean(sectionTag);
        const isExpired = Boolean(att && isReferenceAttachmentExpired(att));
        const isOmitted = Boolean(item.omitted || !att);
        const canInspect = Boolean(att && !isOmitted && onInspectAttachment);
        const displayName = isSection
          ? `<${sectionTag}>`
          : item.fileName?.trim() || item.label.trim() || item.kind;

        const sourceBadge = isExpired
          ? labels.cardFilesApiExpiredBadge
          : isSection
            ? attachLabels.sectionChipBadge
            : item.source === 'youtube'
              ? labels.cardYoutubeBadge
              : item.source === 'files_api'
                ? labels.cardFilesApiBadge
                : item.kind === 'document'
                  ? labels.cardInlineTextBadge
                  : null;

        const modeBadge =
          item.kind === 'video' && att && !isExpired
            ? att.processingMode === 'agentic'
              ? labels.cardVideoModeAgentic
              : labels.cardVideoModeStatic
            : null;

        const inner = (
          <>
            {att?.previewUrl ? (
              <img
                src={att.previewUrl}
                alt={displayName}
                className="h-5 w-5 rounded object-cover shrink-0 border border-border-subtle bg-surface-muted"
              />
            ) : (
              <AttachmentIcon kind={item.kind} isSection={isSection} />
            )}
            <span
              className={`max-w-[140px] truncate font-medium text-[11px] text-text-main ${
                isSection ? 'font-mono' : ''
              }`}
            >
              {displayName}
            </span>
            {sourceBadge && (
              <span
                className={`rounded border px-1 py-0 font-mono text-[8.5px] font-semibold uppercase tracking-wide shrink-0 ${
                  isExpired
                    ? 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300'
                    : isSection
                      ? 'auteur-phase-logic'
                      : item.source === 'youtube'
                        ? 'auteur-phase-intent'
                        : item.source === 'files_api'
                          ? 'auteur-phase-aesthetic'
                          : 'border-border-subtle bg-surface text-text-muted'
                }`}
              >
                {sourceBadge}
              </span>
            )}
            {modeBadge && (
              <span className="rounded border border-border-subtle bg-surface px-1 py-0 font-mono text-[8.5px] uppercase text-text-muted shrink-0">
                {modeBadge}
              </span>
            )}
          </>
        );

        const baseClassName = `inline-flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left transition-colors ${
          isExpired
            ? 'border-red-500/30 bg-red-500/5 opacity-85'
            : isOmitted
              ? 'border-border-subtle bg-surface-subtle/60 opacity-75'
              : 'border-border-main bg-surface-subtle/80'
        }`;

        if (canInspect) {
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onInspectAttachment?.(item)}
              title={isExpired ? labels.cardFilesApiExpiredTitle : attachLabels.inspectChipTitle}
              className={`${baseClassName} hover:bg-surface-hover cursor-pointer`}
            >
              {inner}
            </button>
          );
        }

        return (
          <span
            key={item.id}
            title={
              isExpired
                ? labels.cardFilesApiExpiredTitle
                : isOmitted
                  ? attachLabels.omittedInlineChipTitle
                  : undefined
            }
            className={baseClassName}
          >
            {inner}
          </span>
        );
      })}
    </div>
  );
});
