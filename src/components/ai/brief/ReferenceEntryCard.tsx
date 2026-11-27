import {memo, type MouseEvent as ReactMouseEvent} from 'react';
import {
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  Play,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  isReferenceAttachmentExpired,
  type ReferenceEntry,
  type VideoProcessingMode,
} from '../../../ui/aiAssistant.ts';
import {
  buildAttachmentFingerprint,
  buildTextExcerpt,
  CARD_PREVIEW_HEIGHT,
  computeReferenceCardWidth,
  formatByteSize,
} from '../../../ui/briefMedia.ts';
import {UI_LABELS} from '../../../ui/labels.ts';

export interface ReferenceEntryCardProps {
  entry: ReferenceEntry;
  onUpdateReference: (
    refId: string,
    patch: Partial<Pick<ReferenceEntry, 'handle' | 'label' | 'note' | 'attachment'>>
  ) => void;
  onRemoveReference: (refId: string) => void;
  onPreviewMouseEnter: (entry: ReferenceEntry, event: ReactMouseEvent<HTMLDivElement>) => void;
  onPreviewMouseLeave: () => void;
  onInspectEntry: (entryId: string) => void;
}

export const ReferenceEntryCard = memo(function ReferenceEntryCard({
  entry,
  onUpdateReference,
  onRemoveReference,
  onPreviewMouseEnter,
  onPreviewMouseLeave,
  onInspectEntry,
}: ReferenceEntryCardProps) {
  const labels = UI_LABELS.ai.briefTray;

  const att = entry.attachment;
  const isYoutube = att?.source === 'youtube';
  const isFilesApi = att?.source === 'files_api';
  const isExpiredFilesApi = Boolean(att && isReferenceAttachmentExpired(att));
  const isInlineText = att?.source === 'inline' && typeof att.inlineText === 'string';
  const previewUrl = att?.previewUrl;
  const localVideoSrc = entry.kind === 'video' && !isYoutube ? att?.localMediaUrl : undefined;
  const isInspectable = Boolean(att);

  const cardWidth = computeReferenceCardWidth({
    kind: entry.kind,
    mediaWidth: att?.width,
    mediaHeight: att?.height,
  });

  const metaParts: string[] = [];
  if (att?.width && att?.height) {
    metaParts.push(`${att.width}×${att.height}`);
  }
  if (att?.sizeBytes) {
    metaParts.push(formatByteSize(att.sizeBytes));
  }
  if (isFilesApi) {
    metaParts.push(isExpiredFilesApi ? labels.cardFilesApiExpiredMeta : '48h');
  }
  const metaCaption = metaParts.join(' · ');
  const textSnippet = isInlineText
    ? buildTextExcerpt(att.inlineText ?? '', 5, 180).excerpt
    : '';

  const handleToggleVideoProcessingMode = () => {
    if (!entry.attachment || entry.kind !== 'video') return;
    const nextMode: VideoProcessingMode =
      entry.attachment.processingMode === 'agentic' ? 'static' : 'agentic';
    onUpdateReference(entry.id, {
      attachment: {
        ...entry.attachment,
        processingMode: nextMode,
        fingerprint: buildAttachmentFingerprint([
          entry.attachment.source,
          entry.attachment.uri ?? entry.attachment.fileName ?? entry.id,
          nextMode,
        ]),
      },
    });
  };

  return (
    <div
      style={{width: `${cardWidth}px`}}
      className="rounded-xl border border-border-main bg-surface-subtle/40 p-2 flex flex-col gap-1.5 shrink-0 max-w-full"
    >
      {/* Fixed-Height Preview Box (aspect ratio preserved via card width + object-contain) */}
      <div
        style={{height: `${CARD_PREVIEW_HEIGHT}px`}}
        onMouseEnter={(e) => onPreviewMouseEnter(entry, e)}
        onMouseLeave={onPreviewMouseLeave}
        onClick={() => {
          if (isInspectable) {
            onInspectEntry(entry.id);
          }
        }}
        title={
          isInspectable
            ? entry.kind === 'video' || entry.kind === 'audio'
              ? labels.previewPlayHint
              : labels.previewClickHint
            : undefined
        }
        className={`group/preview relative w-full rounded-lg overflow-hidden border border-border-subtle bg-surface-muted flex items-center justify-center ${
          isInspectable ? 'cursor-pointer' : ''
        } ${isExpiredFilesApi ? 'opacity-70' : ''}`}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={entry.label || entry.handle}
            className={`h-full w-full ${isYoutube ? 'object-cover' : 'object-contain'}`}
          />
        ) : localVideoSrc ? (
          <video
            src={localVideoSrc}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-contain bg-black/80"
          />
        ) : isInlineText ? (
          <div className="h-full w-full p-2 pt-7 pb-6 overflow-hidden bg-surface text-left">
            <pre className="whitespace-pre-wrap break-words font-mono text-[9px] leading-snug text-text-muted">
              {textSnippet}
            </pre>
          </div>
        ) : entry.kind === 'video' ? (
          <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-muted">
            <Film className="h-5 w-5 text-[var(--phase-continuity-text)]" />
            <span className="font-mono text-[9px] truncate max-w-full">
              {att?.fileName || 'Video'}
            </span>
          </div>
        ) : entry.kind === 'audio' ? (
          <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-muted">
            <Music className="h-5 w-5 text-[var(--phase-logic-text)]" />
            <span className="font-mono text-[9px] truncate max-w-full">
              {att?.fileName || 'Audio'}
            </span>
          </div>
        ) : entry.kind === 'document' ? (
          <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-muted">
            <FileText className="h-5 w-5 text-[var(--phase-aesthetic-text)]" />
            <span className="font-mono text-[9px] truncate max-w-full px-1">
              {att?.fileName || 'Document'}
            </span>
          </div>
        ) : entry.kind === 'image' ? (
          <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-muted">
            <ImageIcon className="h-5 w-5 text-text-faint" />
            <span className="font-mono text-[9px] truncate max-w-full px-1">
              {att?.fileName || 'Image'}
            </span>
          </div>
        ) : !att && entry.omittedAttachmentTag ? (
          <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-muted">
            <Tag className="h-4 w-4 text-text-faint" />
            <span className="font-mono text-[9px] truncate max-w-full px-1">
              {entry.omittedAttachmentTag}
            </span>
            <span className="text-[8px] leading-tight text-text-faint px-1 line-clamp-2">
              {UI_LABELS.ai.history.omittedMediaNotice}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-text-faint">
            <Tag className="h-4 w-4" />
            <span className="font-mono text-[9px] uppercase">{labels.cardManualBadge}</span>
          </div>
        )}

        {/* Subtle Center Inspect / Play Affordance on Hover */}
        {isInspectable && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 group-hover/preview:bg-black/20 transition-colors"
          >
            <span className="opacity-0 group-hover/preview:opacity-100 transition-opacity flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 border border-border-main text-text-main shadow-sm">
              {entry.kind === 'video' || entry.kind === 'audio' ? (
                <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </span>
          </div>
        )}

        {/* Top-left Handle Badge (Editable) */}
        <input
          type="text"
          data-native-undo="true"
          value={entry.handle}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onUpdateReference(entry.id, {handle: event.target.value})}
          placeholder={labels.handlePlaceholder}
          aria-label={labels.handleAria}
          className="absolute top-1 left-1 max-w-[74px] rounded bg-btn-primary-bg/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-btn-primary-text placeholder-btn-primary-text/60 outline-none focus:ring-1 focus:ring-surface z-10"
        />

        {/* Top-right Delete Button */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveReference(entry.id);
          }}
          aria-label={labels.removeRefAria}
          className="absolute top-1 right-1 rounded bg-surface/90 border border-border-main p-1 text-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer z-10"
        >
          <Trash2 className="h-3 w-3" />
        </button>

        {/* Bottom-left Source Badge */}
        {(isFilesApi || isYoutube || isInlineText) && (
          <span
            title={isExpiredFilesApi ? labels.cardFilesApiExpiredTitle : undefined}
            className={`absolute bottom-1 left-1 rounded border px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wider z-10 ${
              isYoutube
                ? 'auteur-phase-intent'
                : isExpiredFilesApi
                  ? 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300'
                  : isFilesApi
                    ? 'auteur-phase-aesthetic'
                    : 'border-border-main bg-surface/90 text-text-body'
            }`}
          >
            {isYoutube
              ? labels.cardYoutubeBadge
              : isExpiredFilesApi
                ? labels.cardFilesApiExpiredBadge
                : isFilesApi
                  ? labels.cardFilesApiBadge
                  : labels.cardInlineTextBadge}
          </span>
        )}

        {/* Bottom-right Video Processing Toggle (Static / Agentic) */}
        {entry.kind === 'video' && att && !isExpiredFilesApi && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleToggleVideoProcessingMode();
            }}
            title={labels.cardVideoModeTitle}
            className="absolute bottom-1 right-1 rounded border border-border-main bg-surface/90 px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase text-text-main hover:bg-surface cursor-pointer z-10"
          >
            {att.processingMode === 'agentic'
              ? labels.cardVideoModeAgentic
              : labels.cardVideoModeStatic}
          </button>
        )}
      </div>

      {/* Below Preview: Assigned Label & Optional Note */}
      <div className="space-y-1">
        <input
          type="text"
          data-native-undo="true"
          value={entry.label}
          onChange={(event) => onUpdateReference(entry.id, {label: event.target.value})}
          placeholder={labels.labelPlaceholder}
          aria-label={labels.labelAria}
          className="w-full rounded-md border border-border-main bg-surface px-2 py-1 text-xs font-medium text-text-main placeholder-text-placeholder focus:outline-none focus:ring-1 focus:ring-border-main"
        />
        <input
          type="text"
          data-native-undo="true"
          value={entry.note ?? ''}
          onChange={(event) => onUpdateReference(entry.id, {note: event.target.value})}
          placeholder={labels.notePlaceholder}
          aria-label={labels.noteAria}
          className="w-full rounded-md border border-border-subtle bg-surface px-2 py-1 text-[11px] text-text-body placeholder-text-placeholder focus:border-border-main focus:outline-none focus:ring-1 focus:ring-border-main"
        />
        {metaCaption && (
          <div className="px-0.5 font-mono text-[9px] text-text-faint truncate">{metaCaption}</div>
        )}
      </div>
    </div>
  );
});
