import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadToStaging } from '../fetch-cache';
import { download } from '../httpsDownload';

/**
 * A local server standing in for a CDN: `/file` answers at once, `/trickle` sends a byte every 20 ms
 * forever (never idle, never done), `/silent` sends headers and then nothing, `/cut` drops the
 * connection mid-body, `/hop/<n>` waits 60 ms and redirects n times before trickling, `/huge`
 * declares a body larger than any cap here, `/chunked` streams 1,000 bytes with no length,
 * `/to-file` redirects to `/file`, `/away` redirects to the same server under another host name, and
 * `/agent` echoes the User-Agent it received.
 */
let server: http.Server;
let base: string;
const timers = new Set<NodeJS.Timeout>();

beforeEach(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    if (url === '/file') {
      res.writeHead(200, { 'content-length': '5' }).end('hello');
      return;
    }
    if (url === '/cut') {
      res.writeHead(200, { 'content-length': '100' });
      res.write('partial', () => res.destroy());
      return;
    }
    if (url === '/huge') {
      res.writeHead(200, { 'content-length': '1000000000' });
      res.flushHeaders();
      return;
    }
    if (url === '/chunked') {
      res.writeHead(200);
      let sent = 0;
      const timer = setInterval(() => {
        if (sent++ < 10) res.write('x'.repeat(100));
        else res.end();
      }, 5);
      timers.add(timer);
      res.on('close', () => clearInterval(timer));
      return;
    }
    if (url === '/to-file') {
      res.writeHead(302, { location: '/file' }).end();
      return;
    }
    if (url === '/away') {
      res.writeHead(302, { location: `${base.replace('127.0.0.1', 'localhost')}/file` }).end();
      return;
    }
    if (url === '/agent') {
      res.writeHead(200).end(req.headers['user-agent'] ?? '');
      return;
    }
    if (url === '/silent') {
      res.writeHead(200, { 'content-length': '100' });
      res.flushHeaders();
      return;
    }
    const hop = /^\/hop\/(\d+)$/.exec(url);
    if (hop) {
      const left = Number(hop[1]);
      const timer = setTimeout(() => {
        res.writeHead(302, { location: left > 0 ? `/hop/${left - 1}` : '/trickle' }).end();
      }, 60);
      timers.add(timer);
      return;
    }
    res.writeHead(200, { 'content-length': '1000000' });
    const timer = setInterval(() => res.write('x'), 20);
    timers.add(timer);
    res.on('close', () => clearInterval(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('download limits', () => {
  it('fetches a file that arrives in time', async () => {
    const { status, body } = await download(`${base}/file`, { idleMs: 1_000, deadlineMs: 2_000, maxBytes: 1_000_000 });
    expect(status).toBe(200);
    expect(body?.toString()).toBe('hello');
  });

  it('abandons a body that trickles past the deadline, though it is never idle', async () => {
    const started = Date.now();
    await expect(download(`${base}/trickle`, { idleMs: 1_000, deadlineMs: 300, maxBytes: 1_000_000 })).rejects.toThrow(
      /did not finish within 0\.3s/,
    );
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('counts redirects against the same deadline', async () => {
    // Five 60 ms hops, each well inside the idle limit, add up past a 200 ms deadline.
    await expect(download(`${base}/hop/5`, { idleMs: 1_000, deadlineMs: 200, maxBytes: 1_000_000 })).rejects.toThrow(
      /did not finish within 0\.2s/,
    );
  });

  it('rejects a body the server cuts off', async () => {
    await expect(download(`${base}/cut`, { idleMs: 1_000, deadlineMs: 2_000, maxBytes: 1_000_000 })).rejects.toThrow();
  });

  it('abandons a connection that goes silent', async () => {
    await expect(download(`${base}/silent`, { idleMs: 150, deadlineMs: 5_000, maxBytes: 1_000_000 })).rejects.toThrow(
      /No data from/,
    );
  });
});

describe('download size cap', () => {
  const limits = { idleMs: 1_000, deadlineMs: 5_000, maxBytes: 500 };

  it('refuses a declared Content-Length above the cap before reading the body', async () => {
    // The body never arrives, so only the header check can end this before the deadline.
    const started = Date.now();
    await expect(download(`${base}/huge`, limits)).rejects.toThrow(/declares 1000000000 bytes, more than the 500/);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('abandons an undeclared body as soon as it grows past the cap', async () => {
    await expect(download(`${base}/chunked`, limits)).rejects.toThrow(/sent more than the 500 bytes allowed/);
  });

  it('reads an undeclared body that stays within the cap', async () => {
    const { body } = await download(`${base}/chunked`, { ...limits, maxBytes: 1_000 });
    expect(body?.length).toBe(1_000);
  });
});

describe('download sources', () => {
  const limits = { idleMs: 1_000, deadlineMs: 2_000, maxBytes: 1_000 };

  it('follows a redirect on the same host', async () => {
    const { body } = await download(`${base}/to-file`, limits);
    expect(body?.toString()).toBe('hello');
  });

  it('refuses a redirect to another host', async () => {
    await expect(download(`${base}/away`, limits)).rejects.toThrow(/redirected to another host: http:\/\/localhost:/);
  });

  it('refuses plain http to anything but a loopback host, without connecting', async () => {
    await expect(download('http://example.invalid/icon.png', limits)).rejects.toThrow(/only https: is fetched/);
    await expect(download('ftp://127.0.0.1/icon.png', limits)).rejects.toThrow(/only https: is fetched/);
  });

  it("sends the caller's headers", async () => {
    const { body } = await download(`${base}/agent`, limits, { headers: { 'user-agent': 'scimgg-test/1' } });
    expect(body?.toString()).toBe('scimgg-test/1');
  });
});

describe('downloadToStaging', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'download-staging-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('stages and hashes a body that arrives in time', async () => {
    const staged = await downloadToStaging(`${base}/file`, path.join(dir, 'disk.zip'), 'disk.zip', {
      idleMs: 1_000,
      deadlineMs: 2_000,
      maxBytes: 1_000_000,
    });
    expect(staged.bytes).toBe(5);
    expect(staged.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('gives up on a body past the size cap and leaves no staging file', async () => {
    const dest = path.join(dir, 'disk.zip');
    await expect(
      downloadToStaging(`${base}/chunked`, dest, 'disk.zip', { idleMs: 1_000, deadlineMs: 2_000, maxBytes: 500 }),
    ).rejects.toThrow(/sent more than the 500 bytes allowed/);
    await vi.waitFor(() => expect(existsSync(`${dest}.tmp`)).toBe(false));
  });

  it('gives up on a trickling download at the deadline and leaves no staging file', async () => {
    const dest = path.join(dir, 'disk.zip');
    await expect(
      downloadToStaging(`${base}/trickle`, dest, 'disk.zip', { idleMs: 1_000, deadlineMs: 300, maxBytes: 1_000_000 }),
    ).rejects.toThrow(/did not finish within 0\.3s/);
    // The write stream closes asynchronously after the abort.
    await vi.waitFor(() => expect(existsSync(`${dest}.tmp`)).toBe(false));
  });
});
