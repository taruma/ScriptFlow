import {useEffect, useState} from 'react';
import {
  buildAttachmentFingerprint,
  extractYouTubeVideoId,
  getYouTubeThumbnailUrl,
  normalizeYouTubeUrl,
} from '../../../ui/briefMedia.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import type {NewReferenceEntryDraft} from './briefHelpers.ts';

export interface YouTubeAttachmentBarProps {
  isOpen: boolean;
  onClose: () => void;
  onAddReferenceEntry: (draft: NewReferenceEntryDraft) => void;
}

export function YouTubeAttachmentBar({
  isOpen,
  onClose,
  onAddReferenceEntry,
}: YouTubeAttachmentBarProps) {
  const labels = UI_LABELS.ai.briefTray;

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeLabel, setYoutubeLabel] = useState('');
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setYoutubeError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const youtubePreviewThumb = youtubeUrl.trim() ? getYouTubeThumbnailUrl(youtubeUrl) : null;

  const handleAttachYoutube = () => {
    const normalized = normalizeYouTubeUrl(youtubeUrl);
    if (!normalized) {
      setYoutubeError(labels.youtubeInvalidError);
      return;
    }
    const videoId = extractYouTubeVideoId(normalized);
    const thumb = getYouTubeThumbnailUrl(normalized) ?? undefined;

    onAddReferenceEntry({
      kind: 'video',
      label: youtubeLabel.trim() || (videoId ? `YouTube ${videoId}` : 'YouTube reference'),
      attachment: {
        source: 'youtube',
        mimeType: 'video/youtube',
        uri: normalized,
        previewUrl: thumb,
        processingMode: 'static',
        fingerprint: buildAttachmentFingerprint(['youtube', normalized]),
      },
    });

    setYoutubeUrl('');
    setYoutubeLabel('');
    setYoutubeError(null);
    onClose();
  };

  return (
    <div className="rounded-xl border border-border-main bg-surface-subtle/70 p-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        {youtubePreviewThumb && (
          <img
            src={youtubePreviewThumb}
            alt=""
            className="h-14 w-24 rounded-lg border border-border-main object-cover shrink-0 bg-surface-muted"
          />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <input
            type="url"
            data-native-undo="true"
            value={youtubeUrl}
            onChange={(event) => {
              setYoutubeUrl(event.target.value);
              if (youtubeError) setYoutubeError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAttachYoutube();
              }
            }}
            placeholder={labels.youtubeUrlPlaceholder}
            aria-label={labels.youtubeUrlAria}
            className={UI_TOKENS.input.field}
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              data-native-undo="true"
              value={youtubeLabel}
              onChange={(event) => setYoutubeLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAttachYoutube();
                }
              }}
              placeholder={labels.youtubeLabelPlaceholder}
              aria-label={labels.youtubeLabelAria}
              className={`${UI_TOKENS.input.field} flex-1`}
            />
            <button
              type="button"
              onClick={handleAttachYoutube}
              disabled={youtubeUrl.trim().length === 0}
              className={`${UI_TOKENS.button.primary} !px-3 !py-1.5 !text-xs disabled:opacity-40`}
            >
              {labels.youtubeAddButton}
            </button>
            <button
              type="button"
              onClick={() => {
                setYoutubeError(null);
                onClose();
              }}
              className={`${UI_TOKENS.button.secondary} !px-2.5 !py-1.5 !text-xs`}
            >
              {labels.youtubeCancelButton}
            </button>
          </div>
        </div>
      </div>
      {youtubeError && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{youtubeError}</p>
      )}
    </div>
  );
}
