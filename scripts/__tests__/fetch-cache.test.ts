import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type MirrorPaths, stageMirror } from '../fetch-cache';
import {
  isMirrorConsistent,
  type Manifest,
  type MirrorPin,
  PINNED_CACHE,
  readExistingManifest,
  verifyMirror,
} from '../pinnedCache';

describe('PINNED_CACHE', () => {
  it('pins one OpenRS2 cache by id, size and SHA-256', () => {
    expect(PINNED_CACHE.id).toBe(2772);
    expect(PINNED_CACHE.diskZipSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(PINNED_CACHE.diskZipBytes).toBeGreaterThan(100_000_000);
  });
});

describe('readExistingManifest', () => {
  let tmpDir: string;
  let manifestPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'fetch-cache-test-'));
    manifestPath = path.join(tmpDir, 'manifest.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when manifest does not exist', () => {
    expect(readExistingManifest(manifestPath)).toBeNull();
  });

  it('parses a valid manifest file', () => {
    const manifest: Manifest = {
      id: 2509,
      scope: 'runescape',
      game: 'oldschool',
      language: 'en',
      environment: 'live',
      timestamp: '2026-04-01T10:45:07.976649Z',
      builds: [{ major: 237, minor: null }],
      size: 167043756,
      fetchedAt: '2026-04-11T19:11:33.126Z',
      diskZipSha256: 'abc123',
      diskZipBytes: 167043756,
      source: 'https://archive.openrs2.org/caches/2509',
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const result = readExistingManifest(manifestPath);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(2509);
    expect(result?.diskZipSha256).toBe('abc123');
    expect(result?.builds[0]?.major).toBe(237);
  });

  it('returns null when the manifest file is corrupt JSON', () => {
    writeFileSync(manifestPath, '{ this is not json }');
    expect(readExistingManifest(manifestPath)).toBeNull();
  });

  it('returns null when the manifest file is truncated', () => {
    writeFileSync(manifestPath, '{"id": 2509, "scope": "runes');
    expect(readExistingManifest(manifestPath)).toBeNull();
  });
});

describe('isMirrorConsistent', () => {
  let tmpDir: string;
  let diskPath: string;
  let keysPath: string;

  const validManifest: Manifest = {
    id: 2509,
    scope: 'runescape',
    game: 'oldschool',
    language: 'en',
    environment: 'live',
    timestamp: '2026-04-01T10:45:07.976649Z',
    builds: [{ major: 237, minor: null }],
    size: 100,
    fetchedAt: '2026-04-11T19:11:33.126Z',
    diskZipSha256: 'abc123',
    diskZipBytes: 100,
    source: 'https://archive.openrs2.org/caches/2509',
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'fetch-cache-consistency-'));
    diskPath = path.join(tmpDir, 'disk.zip');
    keysPath = path.join(tmpDir, 'keys.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns true when files exist and disk.zip size matches manifest', () => {
    writeFileSync(diskPath, Buffer.alloc(100));
    writeFileSync(keysPath, '[]');
    expect(isMirrorConsistent(validManifest, diskPath, keysPath)).toBe(true);
  });

  it('returns false when disk.zip is missing', () => {
    writeFileSync(keysPath, '[]');
    expect(isMirrorConsistent(validManifest, diskPath, keysPath)).toBe(false);
  });

  it('returns false when keys.json is missing', () => {
    writeFileSync(diskPath, Buffer.alloc(100));
    expect(isMirrorConsistent(validManifest, diskPath, keysPath)).toBe(false);
  });

  it('returns false when disk.zip size mismatches manifest (partial write)', () => {
    writeFileSync(diskPath, Buffer.alloc(50));
    writeFileSync(keysPath, '[]');
    expect(isMirrorConsistent(validManifest, diskPath, keysPath)).toBe(false);
  });

  it('returns false when disk.zip is larger than manifest claims', () => {
    writeFileSync(diskPath, Buffer.alloc(200));
    writeFileSync(keysPath, '[]');
    expect(isMirrorConsistent(validManifest, diskPath, keysPath)).toBe(false);
  });
});

/**
 * `setup --check` accepts a mirror only through `verifyMirror`, and setup reuses one only through
 * `stageMirror`, so each corruption must fail the first and make the second copy again. A small
 * stand-in pin plays the full cache.
 */
describe('verifying and re-staging the mirror', () => {
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const FULL = Buffer.from('the full pinned cache, as a stand-in');
  const TRIMMED = Buffer.from('the trimmed cache');
  const PIN: MirrorPin = { id: 2772, diskZipSha256: sha(FULL), diskZipBytes: FULL.length, keys: [] };
  const TRACE = 'trace-spec';
  let tmpDir: string;
  let fullZip: string;
  let paths: MirrorPaths;

  /** The mirror as trim-cache leaves it: TRIMMED, recording FULL as what it was cut from. */
  function writeTrimmedMirror(overrides: Partial<Manifest> = {}): void {
    writeFileSync(paths.diskZipPath, TRIMMED);
    writeFileSync(paths.keysPath, '[]');
    const manifest: Manifest = {
      id: PIN.id,
      scope: 'runescape',
      game: 'oldschool',
      language: 'en',
      environment: 'live',
      timestamp: '2026-11-18T14:45:05.401534Z',
      builds: [{ major: 242, minor: null }],
      fetchedAt: '2026-11-24T00:00:00.000Z',
      diskZipSha256: sha(TRIMMED),
      diskZipBytes: TRIMMED.length,
      source: 'test',
      trimmed: true,
      trimmedFromSha256: PIN.diskZipSha256,
      trimmedFromBytes: PIN.diskZipBytes,
      traceSpecHash: TRACE,
      ...overrides,
    };
    writeFileSync(paths.manifestPath, JSON.stringify(manifest));
  }

  const verify = () =>
    verifyMirror(readExistingManifest(paths.manifestPath)!, {
      diskZipPath: paths.diskZipPath,
      keysPath: paths.keysPath,
      pin: PIN,
    });
  const stage = () => stageMirror(fullZip, { traceSpecHash: TRACE, paths, pin: PIN });

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'fetch-cache-verify-'));
    fullZip = path.join(tmpDir, 'full.zip');
    writeFileSync(fullZip, FULL);
    const dir = path.join(tmpDir, 'mirror');
    mkdirSync(dir);
    paths = {
      dir,
      manifestPath: path.join(dir, 'manifest.json'),
      diskZipPath: path.join(dir, 'disk.zip'),
      keysPath: path.join(dir, 'keys.json'),
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('accepts and keeps a good trimmed mirror', async () => {
    writeTrimmedMirror();
    expect(await verify()).toBeNull();
    expect(await stage()).toBe('kept');
    expect(readFileSync(paths.diskZipPath)).toEqual(TRIMMED);
  });

  it.each([
    [
      'a corrupt zip of the same length',
      () => {
        const corrupt = Buffer.from(TRIMMED);
        corrupt[3] ^= 0xff;
        writeFileSync(paths.diskZipPath, corrupt);
      },
      /disk\.zip has sha256 [0-9a-f]{64}, not the [0-9a-f]{64} its manifest records/,
    ],
    [
      'a wrong upstream hash',
      () => writeTrimmedMirror({ trimmedFromSha256: 'f'.repeat(64) }),
      /upstream sha256 f{64} .*not the pinned/,
    ],
    [
      'wrong keys',
      () => writeFileSync(paths.keysPath, '[{"mapsquare":1,"key":[1,2,3,4]}]'),
      /keys\.json is not the pinned key list/,
    ],
  ])('refuses %s, and setup copies the full cache over it', async (_name, corrupt, reason) => {
    writeTrimmedMirror();
    corrupt();

    expect(await verify()).toMatch(reason);
    expect(await stage()).toBe('copied');
    // The straight copy is the pinned cache, untrimmed, for trim-cache to trim.
    expect(readFileSync(paths.diskZipPath)).toEqual(FULL);
    expect(readFileSync(paths.keysPath, 'utf-8')).toBe('[]');
    const manifest = readExistingManifest(paths.manifestPath)!;
    expect(manifest.trimmed).toBeUndefined();
    expect(await verify()).toBeNull();
  });

  it('copies when the trace spec changed, even for a good mirror', async () => {
    writeTrimmedMirror({ traceSpecHash: 'older' });
    expect(await stage()).toBe('copied');
  });
});
