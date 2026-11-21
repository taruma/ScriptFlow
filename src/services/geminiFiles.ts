import {GoogleGenAI} from '@google/genai';
import {inferMimeTypeFromFile, MAX_FILES_API_BYTES, formatByteSize} from '../ui/briefMedia.ts';

export interface GeminiUploadedFile {
  name: string;
  displayName: string;
  uri: string;
  mimeType: string;
  sizeBytes: number;
  state: 'ACTIVE' | 'PROCESSING' | 'FAILED' | string;
  expirationTime?: string;
  createTime?: string;
}

export interface GeminiFilesClientLike {
  files: {
    upload(params: {
      file: Blob | File;
      config?: {mimeType?: string; displayName?: string};
    }): Promise<Record<string, unknown>>;
    get(params: {name: string}): Promise<Record<string, unknown>>;
    list(params?: {config?: {pageSize?: number}}): Promise<unknown>;
    delete(params: {name: string}): Promise<unknown>;
  };
}

function defaultCreateFilesClient(apiKey: string): GeminiFilesClientLike {
  return new GoogleGenAI({apiKey}) as unknown as GeminiFilesClientLike;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled.', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Upload cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, {once: true});
  });
}

/**
 * Extracts a canonical `files/<id>` resource name from either a full Gemini Files API URI
 * or a resource name string.
 */
export function normalizeGeminiFileName(uriOrName: string): string {
  const trimmed = uriOrName.trim();
  const filesIdx = trimmed.indexOf('/files/');
  if (filesIdx !== -1) {
    const id = trimmed.slice(filesIdx + '/files/'.length).split(/[?#]/)[0] ?? '';
    return id ? `files/${id}` : trimmed;
  }
  if (trimmed.startsWith('files/')) return trimmed;
  return `files/${trimmed}`;
}

function mapRawGeminiFile(raw: Record<string, unknown>): GeminiUploadedFile {
  const name = typeof raw.name === 'string' ? raw.name : '';
  const displayName =
    typeof raw.displayName === 'string' && raw.displayName.trim().length > 0
      ? raw.displayName
      : name || 'Uploaded file';
  const uri =
    typeof raw.uri === 'string' && raw.uri.trim().length > 0
      ? raw.uri
      : name
        ? `https://generativelanguage.googleapis.com/v1beta/${normalizeGeminiFileName(name)}`
        : '';
  const mimeType =
    typeof raw.mimeType === 'string' && raw.mimeType.trim().length > 0
      ? raw.mimeType
      : 'application/octet-stream';
  const sizeBytes = Number(raw.sizeBytes) || 0;
  const state = typeof raw.state === 'string' ? raw.state : 'ACTIVE';
  const expirationTime =
    typeof raw.expirationTime === 'string' ? raw.expirationTime : undefined;
  const createTime = typeof raw.createTime === 'string' ? raw.createTime : undefined;

  return {
    name,
    displayName,
    uri,
    mimeType,
    sizeBytes,
    state,
    ...(expirationTime ? {expirationTime} : {}),
    ...(createTime ? {createTime} : {}),
  };
}

/**
 * Unwraps nested JSON error responses from Gemini Files API and surfaces actionable guidance
 * for 48-hour expiration, API-key scoping, and invalid credentials.
 */
export function formatGeminiFilesError(rawError: unknown): string {
  let message =
    typeof rawError === 'string'
      ? rawError
      : rawError instanceof Error
        ? rawError.message
        : String(rawError ?? 'Gemini Files API request failed.');

  for (let i = 0; i < 3; i += 1) {
    const trimmed = message.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) break;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const nestedErr = parsed?.error as Record<string, unknown> | string | undefined;
      if (nestedErr && typeof nestedErr === 'object' && typeof nestedErr.message === 'string') {
        message = nestedErr.message;
      } else if (typeof parsed?.message === 'string') {
        message = parsed.message;
      } else if (typeof nestedErr === 'string') {
        message = nestedErr;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  if (
    message.includes('You do not have permission to access the File') ||
    message.includes('PERMISSION_DENIED') ||
    (message.includes('403') && message.toLowerCase().includes('file'))
  ) {
    return 'Access denied to this Gemini Files API asset. Files expire after 48 hours and are bound to the API key that uploaded them—please re-upload or select an active file.';
  }

  if (message.includes('API_KEY_INVALID') || message.includes('API key not valid')) {
    return 'Invalid Gemini API key. Check your key in AI Settings.';
  }

  if (message.includes('Failed to convert server response to JSON')) {
    return 'Gemini Files API returned an internal serialization error (often caused by an aborted file entry in your account).';
  }

  return message;
}

/**
 * Lists active files on the user's Gemini Files API account directly from the browser.
 * Falls back to progressive `pageSize: 1` iteration if a corrupted/aborted file entry
 * causes batch listing to fail.
 */
export async function listGeminiFiles(options: {
  apiKey: string;
  createClient?: (apiKey: string) => GeminiFilesClientLike;
}): Promise<GeminiUploadedFile[]> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error('Add your Gemini API key in AI Settings to browse Gemini Files.');
  }

  const client = (options.createClient ?? defaultCreateFilesClient)(apiKey);
  const rawItems: Array<Record<string, unknown>> = [];

  const collectFromResult = async (result: unknown) => {
    if (!result) return;
    if (Array.isArray(result)) {
      for (const item of result) {
        if (item && typeof item === 'object') rawItems.push(item as Record<string, unknown>);
      }
      return;
    }
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.files)) {
      for (const item of obj.files) {
        if (item && typeof item === 'object') rawItems.push(item as Record<string, unknown>);
      }
      return;
    }
    if (typeof (obj as {[Symbol.asyncIterator]?: unknown})[Symbol.asyncIterator] === 'function') {
      for await (const item of result as AsyncIterable<unknown>) {
        if (item && typeof item === 'object') rawItems.push(item as Record<string, unknown>);
      }
    }
  };

  try {
    const batch = await client.files.list({config: {pageSize: 100}});
    await collectFromResult(batch);
  } catch {
    // Progressive fallback: harvest all healthy entries preceding any corrupt item
    try {
      const pager = await client.files.list({config: {pageSize: 1}});
      try {
        await collectFromResult(pager);
      } catch {
        // Keep whatever valid entries were harvested before the broken entry
      }
      if (rawItems.length === 0) {
        throw new Error('Unable to list files from Gemini Files API.');
      }
    } catch (fallbackErr) {
      throw new Error(formatGeminiFilesError(fallbackErr));
    }
  }

  const mapped = rawItems.map(mapRawGeminiFile).filter((f) => f.uri.length > 0);
  mapped.sort((a, b) => {
    const tA = a.createTime ? Date.parse(a.createTime) : 0;
    const tB = b.createTime ? Date.parse(b.createTime) : 0;
    return tB - tA;
  });
  return mapped;
}

/**
 * Uploads a browser `File` directly to Gemini Files API (up to 2 GB, 48h retention)
 * and polls until `state === 'ACTIVE'` so videos/audio/PDFs are immediately usable
 * in `interactions.create`.
 */
export async function uploadFileToGeminiFilesApi(options: {
  apiKey: string;
  file: File;
  displayName?: string;
  onStatus?: (status: 'uploading' | 'processing' | 'active') => void;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  createClient?: (apiKey: string) => GeminiFilesClientLike;
}): Promise<GeminiUploadedFile> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error('Add your Gemini API key in AI Settings before uploading to Gemini Files API.');
  }

  if (options.file.size > MAX_FILES_API_BYTES) {
    throw new Error(
      `"${options.file.name}" (${formatByteSize(options.file.size)}) exceeds the 2 GB Gemini Files API limit.`
    );
  }

  const client = (options.createClient ?? defaultCreateFilesClient)(apiKey);
  const mimeType = inferMimeTypeFromFile(options.file);
  const displayName = options.displayName?.trim() || options.file.name;

  options.onStatus?.('uploading');

  let uploadedRaw: Record<string, unknown>;
  try {
    uploadedRaw = await client.files.upload({
      file: options.file,
      config: {
        mimeType,
        displayName,
      },
    });
  } catch (err) {
    throw new Error(formatGeminiFilesError(err));
  }

  let fileInfo = mapRawGeminiFile(uploadedRaw);
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const maxPollAttempts = options.maxPollAttempts ?? 30;

  if (fileInfo.state === 'PROCESSING' && fileInfo.name) {
    options.onStatus?.('processing');
    let attempts = 0;
    while (fileInfo.state === 'PROCESSING' && attempts < maxPollAttempts) {
      await sleep(pollIntervalMs, options.signal);
      attempts += 1;
      try {
        const refreshed = await client.files.get({name: fileInfo.name});
        fileInfo = mapRawGeminiFile(refreshed);
      } catch (err) {
        throw new Error(formatGeminiFilesError(err));
      }
    }
  }

  if (fileInfo.state === 'FAILED') {
    throw new Error(`Gemini failed to process "${displayName}". Try a different file or format.`);
  }

  if (fileInfo.state === 'PROCESSING') {
    throw new Error(
      `"${displayName}" is still processing on Gemini Cloud. Wait a moment and pick it from your Gemini Files list.`
    );
  }

  options.onStatus?.('active');
  return fileInfo;
}

/**
 * Deletes an uploaded file from the user's Gemini Files API storage.
 */
export async function deleteGeminiFile(options: {
  apiKey: string;
  name: string;
  createClient?: (apiKey: string) => GeminiFilesClientLike;
}): Promise<void> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error('Add your Gemini API key in AI Settings to manage Gemini Files.');
  }

  const client = (options.createClient ?? defaultCreateFilesClient)(apiKey);
  try {
    await client.files.delete({name: normalizeGeminiFileName(options.name)});
  } catch (err) {
    throw new Error(formatGeminiFilesError(err));
  }
}
