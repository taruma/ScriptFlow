export type UrlLaunchParam = 'example' | 'url' | 'agents';

export type UrlLaunchAction =
  | {kind: 'none'}
  | {kind: 'conflict'; params: UrlLaunchParam[]}
  | {kind: 'example'; value: string}
  | {kind: 'url'; rawUrl: string; resolvedUrl: string; filename: string}
  | {kind: 'agents'; rawUrl: string; resolvedUrl: string; filename: string}
  | {kind: 'invalid_url'; param: 'url' | 'agents'; rawUrl: string; reason: string};

export type FetchRemoteTextResult =
  | {ok: true; content: string}
  | {ok: false; error: string};

const DEFAULT_MAX_REMOTE_BYTES = 5 * 1024 * 1024;
const LAUNCH_PARAM_KEYS: readonly UrlLaunchParam[] = ['example', 'url', 'agents'];

function extractFilenameFromUrl(parsedUrl: URL, fallback: string): string {
  const segments = parsedUrl.pathname.split('/').filter((segment) => segment.length > 0);
  const lastSegment = segments.length > 0 ? segments[segments.length - 1] : '';
  if (!lastSegment) return fallback;

  try {
    const decoded = decodeURIComponent(lastSegment).trim();
    return decoded.length > 0 ? decoded : fallback;
  } catch {
    return lastSegment.trim() || fallback;
  }
}

function validateRemoteUrl(
  param: 'url' | 'agents',
  rawUrl: string,
  baseHref: string
): UrlLaunchAction {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, baseHref);
  } catch {
    return {
      kind: 'invalid_url',
      param,
      rawUrl,
      reason: 'Could not parse URL.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      kind: 'invalid_url',
      param,
      rawUrl,
      reason: `Unsupported protocol "${parsed.protocol}" (only http: and https: are allowed).`,
    };
  }

  const fallbackFilename = param === 'agents' ? 'agent-context.json' : 'remote-script.json';
  const filename = extractFilenameFromUrl(parsed, fallbackFilename);

  return {
    kind: param,
    rawUrl,
    resolvedUrl: parsed.toString(),
    filename,
  };
}

/**
 * Pure parser for URL deep-link parameters (`?example=`, `?url=`, `?agents=`).
 * Enforces mutual exclusivity: passing more than one launch parameter returns `conflict`.
 */
export function parseUrlLaunchParams(
  search: string,
  baseHref = 'https://scriptflow.local/'
): UrlLaunchAction {
  const params = new URLSearchParams(search);
  const present: Array<{key: UrlLaunchParam; value: string}> = [];

  for (const key of LAUNCH_PARAM_KEYS) {
    const raw = params.get(key);
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length > 0) {
      present.push({key, value: trimmed});
    }
  }

  if (present.length === 0) {
    return {kind: 'none'};
  }

  if (present.length > 1) {
    return {
      kind: 'conflict',
      params: present.map((item) => item.key),
    };
  }

  const single = present[0];
  if (single.key === 'example') {
    return {kind: 'example', value: single.value};
  }

  return validateRemoteUrl(single.key, single.value, baseHref);
}

/**
 * Strips consumed deep-link query params (`example`, `url`, `agents`) via `history.replaceState`
 * while preserving unrelated query parameters and the URL hash.
 */
export function clearUrlLaunchParamsFromLocation(): void {
  if (typeof window === 'undefined' || !window.location || !window.history?.replaceState) {
    return;
  }

  try {
    const currentUrl = new URL(window.location.href);
    let changed = false;
    for (const key of LAUNCH_PARAM_KEYS) {
      if (currentUrl.searchParams.has(key)) {
        currentUrl.searchParams.delete(key);
        changed = true;
      }
    }
    if (!changed) return;

    const nextSearch = currentUrl.searchParams.toString();
    const nextRelativeUrl =
      currentUrl.pathname + (nextSearch ? `?${nextSearch}` : '') + currentUrl.hash;
    window.history.replaceState(window.history.state, '', nextRelativeUrl);
  } catch {
    // Ignore history errors in restricted browser contexts
  }
}

function getUtf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).byteLength;
  }
  return text.length;
}

/**
 * Fetches a remote plain-text or JSON file safely (`credentials: 'omit'`, max byte cap,
 * and friendly HTTP/CORS/network error messages).
 */
export async function fetchRemoteTextFile(
  resolvedUrl: string,
  options: {
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    maxBytes?: number;
  } = {}
): Promise<FetchRemoteTextResult> {
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchImpl) {
    return {ok: false, error: 'Fetch API is not available in this environment.'};
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_REMOTE_BYTES;

  let response: Response;
  try {
    response = await fetchImpl(resolvedUrl, {
      credentials: 'omit',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {ok: false, error: 'Request was cancelled.'};
    }
    return {
      ok: false,
      error:
        'Network or CORS error fetching the remote file. Ensure the URL is reachable and allows cross-origin requests.',
    };
  }

  if (!response.ok) {
    const statusLabel = response.statusText
      ? `HTTP ${response.status} ${response.statusText}`
      : `HTTP ${response.status}`;
    return {
      ok: false,
      error: `Remote server returned ${statusLabel}.`,
    };
  }

  const contentLengthHeader = response.headers?.get?.('content-length');
  if (contentLengthHeader) {
    const declaredBytes = Number(contentLengthHeader);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      return {
        ok: false,
        error: `Remote file exceeds the ${(maxBytes / (1024 * 1024)).toFixed(0)} MB size limit.`,
      };
    }
  }

  let content: string;
  try {
    content = await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {ok: false, error: 'Request was cancelled.'};
    }
    return {
      ok: false,
      error: 'Unable to read response body from the remote URL.',
    };
  }

  if (getUtf8ByteLength(content) > maxBytes) {
    return {
      ok: false,
      error: `Remote file exceeds the ${(maxBytes / (1024 * 1024)).toFixed(0)} MB size limit.`,
    };
  }

  return {ok: true, content};
}
