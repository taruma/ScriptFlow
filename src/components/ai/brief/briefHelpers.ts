import type {
  ReferenceAttachment,
  ReferenceEntry,
  ReferenceKind,
} from '../../../ui/aiAssistant.ts';

export interface NewReferenceEntryDraft {
  kind: ReferenceKind;
  label: string;
  note?: string;
  attachment?: ReferenceAttachment;
}

export interface HoverPreviewState {
  entry: ReferenceEntry;
  top: number;
  left: number;
}

export async function readImageNaturalDimensions(
  objectUrl: string
): Promise<{width: number; height: number} | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({width: img.naturalWidth, height: img.naturalHeight});
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = objectUrl;
  });
}

export function formatExpirationLabel(iso?: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
