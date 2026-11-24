import { type LogCategory, log } from '../util/Logger';

/**
 * A request that failed in transport (offline, dropped connection, timeout, a 5xx/429
 * answer) rather than one the server answered with content we reject. Only these are
 * retried, and once retries run out they end in the loading screen's Retry state, so
 * they are logged rather than reported as crashes.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * The browser lacks a capability the app requires (e.g. WebAssembly under iOS Lockdown
 * Mode). The browser-support gate already tells the user, so this is not a defect to report.
 */
export class UnsupportedBrowserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedBrowserError';
  }
}

export interface RetryPolicy {
  readonly attempts: number;
  readonly baseDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { attempts: 3, baseDelayMs: 1000 };

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function toNetworkError(error: unknown): unknown {
  if (error instanceof NetworkError) return error;
  // fetch() and body reads reject with TypeError on transport failure ("Load failed",
  // "Failed to fetch", "NetworkError when attempting to fetch resource").
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  if (error instanceof TypeError || name === 'AbortError') {
    return new NetworkError((error as Error).message || 'network request failed');
  }
  return error;
}

/**
 * Awaits one transport step (a fetch or a body read), converting its transport
 * failures to {@link NetworkError}. Deliberately narrow: wrapping validation or
 * callback code would misfile a programming TypeError as a retryable network blip.
 */
export async function networkStep<T>(step: Promise<T>): Promise<T> {
  try {
    return await step;
  } catch (error) {
    throw toNetworkError(error);
  }
}

/** A stall this long, with no headers or body bytes arriving, counts as a dropped connection. */
export const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

export interface FetchedBody {
  readonly bytes: ArrayBuffer;
  readonly contentType: string | null;
}

/**
 * Fetches `url` and reads the whole body, rejecting on a non-2xx status. It gives up only
 * after `idleTimeoutMs` without progress, never on total duration, so a slow connection that
 * keeps receiving bytes always finishes while a stalled one fails as a {@link NetworkError}.
 */
export async function fetchBody(
  url: string,
  options: {
    readonly idleTimeoutMs?: number;
    readonly onProgress?: (receivedBytes: number, totalBytes: number | null) => void;
  } = {},
): Promise<FetchedBody> {
  const { idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS, onProgress } = options;
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const restartIdleTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, idleTimeoutMs);
  };

  restartIdleTimer();
  try {
    const response = await networkStep(fetch(url, { signal: controller.signal }));
    if (!response.ok) {
      const message = `${response.status} ${response.statusText}`;
      throw isRetryableStatus(response.status) ? new NetworkError(message) : new Error(message);
    }
    const contentType = response.headers.get('Content-Type');

    if (!response.body) {
      // Progress cannot be observed without a stream, so a slow body is never cut off here.
      clearTimeout(timer);
      const bytes = await networkStep(response.arrayBuffer());
      onProgress?.(bytes.byteLength, bytes.byteLength);
      return { bytes, contentType };
    }

    restartIdleTimer();
    const contentLength = Number.parseInt(response.headers.get('Content-Length') ?? '', 10);
    const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await networkStep(reader.read());
      if (done) break;
      restartIdleTimer();
      chunks.push(value);
      receivedBytes += value.length;
      onProgress?.(receivedBytes, totalBytes);
    }

    const bytes = new Uint8Array(receivedBytes);
    let position = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, position);
      position += chunk.length;
    }
    return { bytes: bytes.buffer, contentType };
  } catch (error) {
    if (timedOut) throw new NetworkError(`no data received for ${Math.round(idleTimeoutMs / 1000)}s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Reads a JSON document with {@link fetchBody}; malformed JSON is a content error, not retried. */
export async function fetchJson(url: string): Promise<unknown> {
  const { bytes } = await fetchBody(url);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Re-runs `attempt` with exponential backoff while it fails with a {@link NetworkError}. */
export async function retryTransient<T>(
  attempt: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<T> {
  for (let attemptNumber = 1; ; attemptNumber++) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof NetworkError) || attemptNumber >= policy.attempts) throw error;
      const delayMs = policy.baseDelayMs * 2 ** (attemptNumber - 1);
      log.warn('Cache', `Network request failed (attempt ${attemptNumber}/${policy.attempts}), retrying:`, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/** Logs load failures that are not code defects (network, unsupported browser) as warnings, not errors. */
export function logLoadFailure(category: LogCategory, message: string, error: unknown): void {
  if (error instanceof NetworkError || error instanceof UnsupportedBrowserError) {
    log.warn(category, message, error);
  } else {
    log.error(category, message, error);
  }
}
