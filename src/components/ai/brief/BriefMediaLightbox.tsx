import {createPortal} from 'react-dom';
import {ExternalLink, Music, X} from 'lucide-react';
import type {ReferenceEntry} from '../../../ui/aiAssistant.ts';
import {
  buildTextExcerpt,
  extractYouTubeVideoId,
  formatByteSize,
} from '../../../ui/briefMedia.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import {formatExpirationLabel, type HoverPreviewState} from './briefHelpers.ts';

export interface BriefMediaLightboxProps {
  hoverPreview: HoverPreviewState | null;
  inspectedEntry: ReferenceEntry | null;
  onCloseInspect: () => void;
}

export function BriefMediaLightbox({
  hoverPreview,
  inspectedEntry,
  onCloseInspect,
}: BriefMediaLightboxProps) {
  const labels = UI_LABELS.ai.briefTray;
  const canPortal = typeof document !== 'undefined';

  if (!canPortal) return null;

  return (
    <>
      {/* Floating Hover Preview Portal (never clipped by modal overflow) */}
      {hoverPreview &&
        !inspectedEntry &&
        hoverPreview.entry.attachment &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: `${hoverPreview.top}px`,
              left: `${hoverPreview.left}px`,
            }}
            className="pointer-events-none z-[120] w-[320px] max-w-[min(340px,calc(100vw-32px))] rounded-xl border border-border-main bg-surface p-2.5 shadow-2xl space-y-2 text-text-main"
          >
            {hoverPreview.entry.attachment.previewUrl ? (
              <div className="rounded-lg overflow-hidden border border-border-subtle bg-surface-muted flex items-center justify-center max-h-[260px]">
                <img
                  src={hoverPreview.entry.attachment.previewUrl}
                  alt={hoverPreview.entry.label || hoverPreview.entry.handle}
                  className="max-h-[260px] w-auto max-w-full object-contain"
                />
              </div>
            ) : typeof hoverPreview.entry.attachment.inlineText === 'string' ? (
              <div className="rounded-lg border border-border-subtle bg-surface-subtle p-2.5 max-h-[220px] overflow-hidden">
                <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-text-body">
                  {buildTextExcerpt(hoverPreview.entry.attachment.inlineText, 12, 700).excerpt}
                </pre>
              </div>
            ) : (
              <div className="rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2.5 space-y-1 text-[11px]">
                <div className="font-mono text-[10px] text-text-muted truncate">
                  {hoverPreview.entry.attachment.fileName || hoverPreview.entry.attachment.mimeType}
                </div>
                {hoverPreview.entry.attachment.uri && (
                  <div className="font-mono text-[10px] text-text-faint break-all line-clamp-2">
                    {hoverPreview.entry.attachment.uri}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="min-w-0 flex items-center gap-1.5">
                <span className="rounded bg-btn-primary-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold text-btn-primary-text shrink-0">
                  {hoverPreview.entry.handle || `@${hoverPreview.entry.kind}`}
                </span>
                <span className="font-medium text-text-main truncate">
                  {hoverPreview.entry.label || hoverPreview.entry.attachment.fileName || 'Reference'}
                </span>
              </div>
              <span className="font-mono text-[9px] text-text-faint shrink-0">
                {hoverPreview.entry.kind === 'video' || hoverPreview.entry.kind === 'audio'
                  ? labels.previewPlayHint
                  : labels.previewClickHint}
              </span>
            </div>
          </div>,
          document.body
        )}

      {/* Click-to-Inspect Lightbox Overlay */}
      {inspectedEntry &&
        inspectedEntry.attachment &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${inspectedEntry.handle} ${inspectedEntry.label || 'preview'}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                onCloseInspect();
              }
            }}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-4"
          >
            <div className="bg-surface w-full max-w-3xl max-h-[88dvh] rounded-2xl border border-border-main shadow-2xl overflow-hidden flex flex-col text-text-main">
              {/* Lightbox Header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle bg-surface-subtle shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="rounded bg-btn-primary-bg px-1.5 py-0.5 font-mono text-[11px] font-semibold text-btn-primary-text shrink-0">
                    {inspectedEntry.handle || `@${inspectedEntry.kind}`}
                  </span>
                  <span className="text-sm font-semibold text-text-main truncate">
                    {inspectedEntry.label || inspectedEntry.attachment.fileName || 'Reference'}
                  </span>
                  {inspectedEntry.attachment.sizeBytes ? (
                    <span className="font-mono text-[11px] text-text-faint shrink-0">
                      {formatByteSize(inspectedEntry.attachment.sizeBytes)}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {inspectedEntry.attachment.source === 'youtube' &&
                    inspectedEntry.attachment.uri && (
                      <a
                        href={inspectedEntry.attachment.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${UI_TOKENS.ai.pillButton} text-[11px] py-1 px-2.5`}
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>{labels.previewOpenYoutube}</span>
                      </a>
                    )}
                  <button
                    type="button"
                    onClick={onCloseInspect}
                    aria-label={labels.previewCloseAria}
                    className={UI_TOKENS.button.iconClose}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Lightbox Content */}
              <div className="flex-1 min-h-0 overflow-auto auteur-pane-scroll p-4 flex flex-col items-center justify-center bg-app/50">
                {inspectedEntry.attachment.source === 'youtube' && inspectedEntry.attachment.uri ? (
                  (() => {
                    const videoId = extractYouTubeVideoId(inspectedEntry.attachment.uri);
                    return videoId ? (
                      <div className="w-full aspect-video rounded-xl overflow-hidden border border-border-main bg-black">
                        <iframe
                          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                          title={inspectedEntry.label || 'YouTube preview'}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="h-full w-full border-0"
                        />
                      </div>
                    ) : null;
                  })()
                ) : inspectedEntry.kind === 'image' && inspectedEntry.attachment.previewUrl ? (
                  <img
                    src={inspectedEntry.attachment.previewUrl}
                    alt={inspectedEntry.label || inspectedEntry.handle}
                    className="max-h-[70dvh] max-w-full rounded-xl border border-border-subtle object-contain bg-surface"
                  />
                ) : inspectedEntry.kind === 'video' && inspectedEntry.attachment.localMediaUrl ? (
                  <video
                    src={inspectedEntry.attachment.localMediaUrl}
                    controls
                    autoPlay
                    className="max-h-[70dvh] max-w-full rounded-xl border border-border-main bg-black"
                  />
                ) : inspectedEntry.kind === 'audio' && inspectedEntry.attachment.localMediaUrl ? (
                  <div className="w-full max-w-md rounded-xl border border-border-main bg-surface p-5 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-text-main">
                      <Music className="h-4 w-4 text-[var(--phase-logic-text)]" />
                      <span className="truncate">
                        {inspectedEntry.attachment.fileName || inspectedEntry.label}
                      </span>
                    </div>
                    <audio
                      src={inspectedEntry.attachment.localMediaUrl}
                      controls
                      autoPlay
                      className="w-full"
                    />
                  </div>
                ) : typeof inspectedEntry.attachment.inlineText === 'string' ? (
                  <div className="w-full rounded-xl border border-border-main bg-surface overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-border-subtle bg-surface-subtle text-[11px] text-text-muted">
                      <span className="font-mono truncate">
                        {inspectedEntry.attachment.fileName || inspectedEntry.attachment.mimeType}
                      </span>
                      <span className="font-mono text-[10px] text-text-faint shrink-0">
                        {labels.previewLinesChars(
                          inspectedEntry.attachment.inlineText.split(/\r?\n/).length,
                          inspectedEntry.attachment.inlineText.length
                        )}
                      </span>
                    </div>
                    <pre className="max-h-[64dvh] overflow-auto auteur-pane-scroll p-4 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-body">
                      {inspectedEntry.attachment.inlineText}
                    </pre>
                  </div>
                ) : (
                  <div className="w-full max-w-lg rounded-xl border border-border-main bg-surface p-4 space-y-2.5 text-xs">
                    <p className="text-text-muted leading-relaxed">{labels.previewNoLocalMedia}</p>
                    <div className="space-y-1 font-mono text-[11px] text-text-body">
                      {inspectedEntry.attachment.fileName && (
                        <div>
                          <span className="text-text-faint">File: </span>
                          {inspectedEntry.attachment.fileName}
                        </div>
                      )}
                      <div>
                        <span className="text-text-faint">MIME: </span>
                        {inspectedEntry.attachment.mimeType}
                      </div>
                      {inspectedEntry.attachment.uri && (
                        <div className="break-all">
                          <span className="text-text-faint">{labels.previewFilesApiUriLabel}: </span>
                          {inspectedEntry.attachment.uri}
                        </div>
                      )}
                      {formatExpirationLabel(inspectedEntry.attachment.expirationTime) && (
                        <div>
                          <span className="text-text-faint">{labels.previewExpiresLabel}: </span>
                          {formatExpirationLabel(inspectedEntry.attachment.expirationTime)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
