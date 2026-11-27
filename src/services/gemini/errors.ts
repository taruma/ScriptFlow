import type {AgentTurnTrace, GeminiErrorCode} from './interactionTypes.ts';

export type {GeminiErrorCode};

export class GeminiServiceError extends Error {
  readonly code: GeminiErrorCode;
  readonly status?: number;
  readonly causeError?: unknown;
  readonly trace?: AgentTurnTrace;

  constructor(
    code: GeminiErrorCode,
    message: string,
    options?: {status?: number; cause?: unknown; trace?: AgentTurnTrace}
  ) {
    super(message);
    this.name = 'GeminiServiceError';
    this.code = code;
    this.status = options?.status;
    this.causeError = options?.cause;
    this.trace = options?.trace;
  }
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!error || typeof error !== 'object') return false;
  const err = error as {name?: unknown; code?: unknown; message?: unknown};
  if (err.name === 'AbortError' || err.code === 'ABORT_ERR') return true;
  if (typeof err.message === 'string' && /aborted|abort/i.test(err.message)) return true;
  return false;
}

function extractHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as {status?: unknown; statusCode?: unknown; response?: {status?: unknown}};
  if (typeof err.status === 'number') return err.status;
  if (typeof err.statusCode === 'number') return err.statusCode;
  if (typeof err.response?.status === 'number') return err.response.status;
  return undefined;
}

function extractRawErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as {message?: unknown}).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Unknown Gemini API error.';
}

function isApiKeyCredentialError(lower: string): boolean {
  return (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('unauthenticated')
  );
}

function isFileUnavailableError(status: number | undefined, lower: string): boolean {
  if (isApiKeyCredentialError(lower)) return false;

  const mentionsFile =
    lower.includes('you do not have permission to access the file') ||
    /\bfiles\/[a-z0-9_-]+/i.test(lower) ||
    /\bfile\b/.test(lower);
  if (!mentionsFile) return false;

  return (
    status === 403 ||
    status === 404 ||
    status === 400 ||
    lower.includes('permission_denied') ||
    lower.includes('do not have permission') ||
    lower.includes('not_found') ||
    lower.includes('not found') ||
    lower.includes('expired') ||
    lower.includes('not in an active state') ||
    lower.includes('failed_precondition')
  );
}

function isInteractionUnavailableError(
  status: number | undefined,
  lower: string,
  hadPreviousInteraction?: boolean
): boolean {
  if (!hadPreviousInteraction || isApiKeyCredentialError(lower)) return false;

  const mentionsInteraction =
    lower.includes('interaction') || lower.includes('previous_interaction');
  if (mentionsInteraction) {
    return (
      status === 400 ||
      status === 403 ||
      status === 404 ||
      lower.includes('not_found') ||
      lower.includes('not found') ||
      lower.includes('expired') ||
      lower.includes('invalid') ||
      lower.includes('permission_denied') ||
      lower.includes('do not have permission')
    );
  }

  return status === 404 && !lower.includes('model');
}

/**
 * Normalizes SDK, HTTP, SSE, network, and abort errors into clean user-facing GeminiServiceError instances.
 */
export function classifyGeminiError(
  error: unknown,
  signal?: AbortSignal,
  options?: {hadPreviousInteraction?: boolean}
): GeminiServiceError {
  if (error instanceof GeminiServiceError) {
    return error;
  }

  if (isAbortError(error, signal)) {
    return new GeminiServiceError('aborted', 'Request cancelled.', {cause: error});
  }

  const status = extractHttpStatus(error);
  const rawMessage = extractRawErrorMessage(error);
  const lower = rawMessage.toLowerCase();

  if (isFileUnavailableError(status, lower)) {
    return new GeminiServiceError(
      'file_unavailable',
      'A Gemini Files API attachment expired (48-hour limit) or belongs to a different API key. Re-upload or remove it in Scene Brief and try again.',
      {status, cause: error}
    );
  }

  if (isInteractionUnavailableError(status, lower, options?.hadPreviousInteraction)) {
    return new GeminiServiceError(
      'interaction_expired',
      'Previous Gemini session chain expired or is unavailable for this API key.',
      {status, cause: error}
    );
  }

  if (
    status === 401 ||
    status === 403 ||
    isApiKeyCredentialError(lower) ||
    lower.includes('permission_denied')
  ) {
    return new GeminiServiceError(
      'invalid_api_key',
      'Your Gemini API key was rejected. Check or replace your key in AI Settings.',
      {status, cause: error}
    );
  }

  if (
    status === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    return new GeminiServiceError(
      'quota_exceeded',
      'Gemini API rate limit or quota exceeded. Wait a moment, switch to Gemini 4 Hydrogen, or check your billing tier.',
      {status, cause: error}
    );
  }

  if (status === 404 || lower.includes('not_found') || lower.includes('model not found')) {
    return new GeminiServiceError(
      'model_not_found',
      'The selected Gemini 4 model is unavailable for this API key. Try switching models in AI Settings.',
      {status, cause: error}
    );
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('err_network') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('load failed') ||
    (error instanceof TypeError && lower.includes('fetch'))
  ) {
    return new GeminiServiceError(
      'network_error',
      'Could not reach the Gemini API. Check your internet connection and try again.',
      {status, cause: error}
    );
  }

  return new GeminiServiceError(
    'api_error',
    rawMessage.trim().length > 0 ? rawMessage : 'Gemini Interactions request failed.',
    {status, cause: error}
  );
}
