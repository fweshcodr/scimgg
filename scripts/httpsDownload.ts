/**
 * HTTPS GETs for the pinned files setup downloads (the full cache in fetch-cache.ts, item icons and
 * RuneLite healthbars) and for the Wiki sync scripts. Every request has three limits, so neither a
 * dead, a trickling nor an oversized response can hang setup or fill the disk:
 *   - `idleMs`: no response or no body bytes for this long abandons it (a dead socket);
 *   - `deadlineMs`: the whole fetch, redirects and body included, must finish within this long
 *     (a connection that keeps sending a byte now and then);
 *   - `maxBytes`: a `Content-Length` above it is refused before any body is read, and a body that
 *     grows past it is abandoned at the chunk that crosses it.
 */
import type { ClientRequest, IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import http from 'node:http';
import https from 'node:https';

export interface DownloadLimits {
  readonly idleMs: number;
  readonly deadlineMs: number;
  readonly maxBytes: number;
}

/**
 * An icon or a healthbar: a few KB, which any working connection fetches in well under a minute.
 * The largest pinned icon is under 10 KB, so 1 MiB is far beyond any real one.
 */
export const SMALL_FILE_LIMITS: DownloadLimits = { idleMs: 15_000, deadlineMs: 60_000, maxBytes: 1024 * 1024 };

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** `URL.hostname` keeps the brackets of an IPv6 literal. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface FetchOptions {
  readonly headers?: OutgoingHttpHeaders;
  readonly maxRedirects?: number;
}

/**
 * Follows redirects to a 200 and hands its response to `readBody`, under `limits`. A non-200 final
 * status resolves `{ status, value: null }` without reading the body. When a limit runs out the
 * request is destroyed and the promise rejects, `readBody`'s stream included. `readBody` must attach
 * its stream listeners synchronously, as the byte cap counts the same `data` events.
 *
 * Only `https:` is fetched, except `http:` to a loopback host (tests serve slow streams locally). A
 * redirect may not leave the scheme or the host it started on: none of the sources redirects (checked
 * 2026-11-24: archive.openrs2.org, static.runelite.net, raw.githubusercontent.com and the Wiki API
 * all answer 200 directly), so one that starts to is reported rather than followed to another host.
 */
export function fetchWithLimits<T>(
  url: string,
  limits: DownloadLimits,
  readBody: (response: IncomingMessage) => Promise<T>,
  { headers, maxRedirects = 5 }: FetchOptions = {},
): Promise<{ status: number; value: T | null }> {
  const start = new URL(url);
  const localHttp = start.protocol === 'http:' && LOOPBACK_HOSTS.has(start.hostname);
  if (start.protocol !== 'https:' && !localHttp)
    return Promise.reject(new Error(`Refusing ${url}: only https: is fetched (http: only from a loopback host)`));
  const client = localHttp ? http : https;
  let request: ClientRequest | null = null;
  let response: IncomingMessage | null = null;
  const abandon = (err: Error) => {
    response?.destroy(err);
    request?.destroy(err);
  };

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${url} did not finish within ${limits.deadlineMs / 1000}s`);
      abandon(err);
      reject(err);
    }, limits.deadlineMs);
  });

  const open = (current: string) =>
    new Promise<IncomingMessage>((resolve, reject) => {
      request = client.get(current, { headers }, resolve).on('error', reject);
      // Socket inactivity, from connect through the last body byte.
      request.setTimeout(limits.idleMs, () => {
        abandon(new Error(`No data from ${current} for ${limits.idleMs / 1000}s`));
      });
    });

  const run = async (): Promise<{ status: number; value: T | null }> => {
    let current = url;
    for (let left = maxRedirects; ; left--) {
      const res = await open(current);
      const status = res.statusCode ?? 0;
      if (REDIRECT_STATUSES.has(status) && res.headers.location) {
        res.resume();
        if (left <= 0) throw new Error(`Too many redirects (${maxRedirects}) fetching ${url}`);
        const next = new URL(res.headers.location, current);
        if (next.protocol !== start.protocol) throw new Error(`${current} redirected to another scheme: ${next}`);
        if (next.host !== start.host) throw new Error(`${current} redirected to another host: ${next}`);
        current = next.toString();
        continue;
      }
      if (status !== 200) {
        res.resume();
        return { status, value: null };
      }
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > limits.maxBytes) {
        res.destroy();
        throw new Error(`${current} declares ${declared} bytes, more than the ${limits.maxBytes} allowed`);
      }
      response = res;
      let received = 0;
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > limits.maxBytes)
          abandon(new Error(`${current} sent more than the ${limits.maxBytes} bytes allowed`));
      });
      return { status, value: await readBody(res) };
    }
  };

  return Promise.race([run(), deadline]).finally(() => clearTimeout(timer));
}

/** Reads a whole response body; rejects if the stream fails, is cut off or is destroyed. */
export function readAll(response: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('error', reject);
  });
}

/**
 * One whole response body, held in memory. Resolves with the body only on 200: a 404 from a CDN is
 * often a styled HTML page, so status is checked before any bytes are kept, or HTML would be written
 * out named `.png`.
 */
export async function download(
  url: string,
  limits: DownloadLimits = SMALL_FILE_LIMITS,
  options: FetchOptions = {},
): Promise<{ status: number; body: Buffer | null }> {
  const { status, value } = await fetchWithLimits(url, limits, readAll, options);
  return { status, body: value };
}
