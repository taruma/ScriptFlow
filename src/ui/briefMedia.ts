import type {ReferenceKind} from './aiAssistant.ts';

export const IMAGE_MAX_LONGEST_EDGE = 1600;
export const IMAGE_COMPRESSION_QUALITY = 0.85;
export const MAX_INLINE_TEXT_BYTES = 256 * 1024; // 256 KB
export const MAX_FILES_API_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const INLINE_TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'tsv',
  'srt',
  'vtt',
  'xml',
  'yaml',
  'yml',
  'log',
]);

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'mpeg', 'mpg', '3gp', 'flv']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'aiff', 'aif']);

export type LocalDropRoute = 'inline_image' | 'inline_text' | 'files_api_required';

export interface CompressedImageResult {
  base64: string;
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  sizeBytes: number;
  originalSizeBytes: number;
}

export interface LocalTextFileResult {
  text: string;
  mimeType: string;
  sizeBytes: number;
}

function getFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === trimmed.length - 1) return '';
  return trimmed.slice(dotIdx + 1).toLowerCase();
}

/**
 * Computes proportional target dimensions bounded by `maxLongestEdge`,
 * never upscaling smaller images.
 */
export function computeDownscaledDimensions(
  width: number,
  height: number,
  maxLongestEdge: number = IMAGE_MAX_LONGEST_EDGE
): {width: number; height: number} {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const safeMax = Math.max(1, Math.round(maxLongestEdge));
  const longest = Math.max(safeW, safeH);
  if (longest <= safeMax) {
    return {width: safeW, height: safeH};
  }
  const scale = safeMax / longest;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

/**
 * Infers the canonical Auteur reference kind from MIME type and/or filename extension.
 */
export function inferReferenceKindFromMime(
  mimeType?: string,
  fileName?: string
): Exclude<ReferenceKind, 'text'> {
  const mime = (mimeType ?? '').trim().toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || mime.startsWith('text/') || mime === 'application/json') {
    return 'document';
  }

  const ext = fileName ? getFileExtension(fileName) : '';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return 'document';
}

/**
 * Infers a reliable MIME type when browsers leave `file.type` empty (common for `.md` or `.srt`).
 */
export function inferMimeTypeFromFile(file: {name: string; type?: string}): string {
  const rawType = (file.type ?? '').trim();
  if (rawType.length > 0) return rawType;
  const ext = getFileExtension(file.name);
  switch (ext) {
    case 'md':
    case 'markdown':
      return 'text/markdown';
    case 'txt':
    case 'log':
    case 'srt':
    case 'vtt':
      return 'text/plain';
    case 'json':
      return 'application/json';
    case 'csv':
      return 'text/csv';
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'mp3':
      return 'audio/mp3';
    case 'wav':
      return 'audio/wav';
    case 'm4a':
      return 'audio/m4a';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Routes a dropped local file to inline image compression, inline plain-text reading,
 * or Gemini Files API upload.
 */
export function classifyLocalDropFile(file: {
  name: string;
  type: string;
  size: number;
}): LocalDropRoute {
  const mime = (file.type ?? '').trim().toLowerCase();
  const ext = getFileExtension(file.name);

  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) {
    return 'inline_image';
  }

  const isPlainText =
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    INLINE_TEXT_EXTENSIONS.has(ext);

  if (isPlainText && file.size <= MAX_INLINE_TEXT_BYTES) {
    return 'inline_text';
  }

  return 'files_api_required';
}

/**
 * Formats a byte count into a concise human-readable label (e.g., `214 KB`, `12.4 MB`).
 */
export function formatByteSize(bytes?: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Strips the file extension to produce a clean default subject label.
 */
export function filenameToDefaultLabel(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return 'Reference';
  const stripped = trimmed.replace(/\.[^/.]+$/, '').trim();
  return stripped.length > 0 ? stripped : trimmed;
}

/**
 * Validates whether a string is a YouTube video URL (standard watch, shorts, embed, or youtu.be).
 */
export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

/**
 * Extracts the 11-character YouTube video ID from common YouTube URL formats.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    let id: string | null = null;

    if (host === 'youtu.be') {
      id = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (parsed.pathname === '/watch') {
        id = parsed.searchParams.get('v');
      } else if (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'v' || segments[0] === 'live') {
        id = segments[1] ?? null;
      }
    }

    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Normalizes any supported YouTube URL into canonical `https://www.youtube.com/watch?v=<id>`.
 */
export function normalizeYouTubeUrl(url: string): string | null {
  const id = extractYouTubeVideoId(url);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Returns the standard YouTube thumbnail URL for preview cards.
 */
export function getYouTubeThumbnailUrl(url: string): string | null {
  const id = extractYouTubeVideoId(url);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/**
 * Computes a fast, deterministic content fingerprint (FNV-1a 32-bit) so attachments
 * are sent once per Gemini Interactions conversation chain.
 */
export function buildAttachmentFingerprint(parts: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x1f;
    hash = Math.imul(hash, 0x01000193);
  }
  return `att_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Browser adapter: downscales an image file so its longest edge is at most `maxLongestEdge` (default 1600px)
 * and compresses it via `<canvas>` (default 0.85 quality) for fast, high-clarity inline Gemini input.
 */
export async function compressImageFile(
  file: File,
  options?: {maxLongestEdge?: number; quality?: number}
): Promise<CompressedImageResult> {
  const maxLongestEdge = options?.maxLongestEdge ?? IMAGE_MAX_LONGEST_EDGE;
  const quality = options?.quality ?? IMAGE_COMPRESSION_QUALITY;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not decode image "${file.name}".`));
      el.src = objectUrl;
    });

    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    const {width, height} = computeDownscaledDimensions(naturalW, naturalH, maxLongestEdge);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas context unavailable for image compression.');
    }

    const preferWebp = file.type === 'image/png' || file.type === 'image/webp';
    const targetMime: 'image/jpeg' | 'image/webp' = preferWebp ? 'image/webp' : 'image/jpeg';

    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);

    let dataUrl = canvas.toDataURL(targetMime, quality);
    let actualMime: 'image/jpeg' | 'image/webp' = targetMime;

    // Fallback to JPEG if browser cannot encode WebP
    if (targetMime === 'image/webp' && !dataUrl.startsWith('data:image/webp')) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      actualMime = 'image/jpeg';
    }

    const commaIdx = dataUrl.indexOf(',');
    const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    const estimatedBytes = Math.round((base64.length * 3) / 4);

    return {
      base64,
      dataUrl,
      mimeType: actualMime,
      width,
      height,
      sizeBytes: estimatedBytes,
      originalSizeBytes: file.size,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Browser adapter: reads a small plain-text/Markdown/JSON/CSV file locally for inline attachment.
 */
export async function readLocalTextFile(file: File): Promise<LocalTextFileResult> {
  if (file.size > MAX_INLINE_TEXT_BYTES) {
    throw new Error(
      `"${file.name}" (${formatByteSize(file.size)}) exceeds the 256 KB inline text limit. Upload it via Files API instead.`
    );
  }
  const text = await file.text();
  return {
    text,
    mimeType: inferMimeTypeFromFile(file),
    sizeBytes: file.size,
  };
}
