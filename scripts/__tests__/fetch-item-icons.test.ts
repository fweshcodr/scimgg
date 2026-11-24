import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findDrift,
  findUnpinned,
  isUsablePng,
  partitionMirror,
  placeIcon,
  selectOrphans,
  sha256Of,
} from '../fetch-item-icons';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

let outDir: string;

function writeIcon(name: string, body: Buffer | string): void {
  writeFileSync(path.join(outDir, name), body);
}

/** A minimal file that passes the signature and terminal-chunk checks the resume path applies. */
function pngBytes(body: string): Buffer {
  return Buffer.concat([PNG_HEADER, Buffer.from(body), PNG_IEND]);
}

function writeValidIcon(id: number, body = 'rest of the sprite'): void {
  writeIcon(`${id}.png`, pngBytes(body));
}

beforeEach(() => {
  outDir = mkdtempSync(path.join(tmpdir(), 'item-icons-'));
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('isUsablePng', () => {
  it('accepts a file starting with the PNG signature', () => {
    writeValidIcon(1);
    expect(isUsablePng(path.join(outDir, '1.png'))).toBe(true);
  });

  // The CDN answers 404 with a styled HTML page, and a killed run or a partial cache restore
  // leaves a truncated file. Both are the wrong bytes under a right-looking name.
  it('rejects an HTML error page saved under a .png name', () => {
    writeIcon('2.png', '<!DOCTYPE html><title>404</title>');
    expect(isUsablePng(path.join(outDir, '2.png'))).toBe(false);
  });

  it('rejects a file truncated inside the signature', () => {
    writeIcon('3.png', PNG_HEADER.subarray(0, 4));
    expect(isUsablePng(path.join(outDir, '3.png'))).toBe(false);
  });

  it('rejects a file truncated after the signature', () => {
    writeIcon('6.png', PNG_HEADER);
    expect(isUsablePng(path.join(outDir, '6.png'))).toBe(false);
  });

  it('rejects an empty file', () => {
    writeIcon('4.png', '');
    expect(isUsablePng(path.join(outDir, '4.png'))).toBe(false);
  });

  it('reports a missing file as unusable rather than throwing', () => {
    expect(isUsablePng(path.join(outDir, 'absent.png'))).toBe(false);
  });

  it('reports a directory as unusable rather than throwing', () => {
    mkdirSync(path.join(outDir, '5.png'));
    expect(isUsablePng(path.join(outDir, '5.png'))).toBe(false);
  });
});

describe('partitionMirror', () => {
  it('fetches only what the mirror is missing', () => {
    writeValidIcon(10);
    writeValidIcon(30);

    expect(partitionMirror([10, 20, 30, 40], outDir)).toEqual({ onDisk: [10, 30], todo: [20, 40] });
  });

  it('re-fetches a file whose bytes are not a PNG', () => {
    writeValidIcon(10);
    writeIcon('20.png', '<!DOCTYPE html>');

    expect(partitionMirror([10, 20], outDir)).toEqual({ onDisk: [10], todo: [20] });
  });

  it('ignores the mirror entirely under force', () => {
    writeValidIcon(10);
    writeValidIcon(20);

    expect(partitionMirror([10, 20], outDir, true)).toEqual({ onDisk: [], todo: [10, 20] });
  });

  it('treats an empty mirror as everything to fetch', () => {
    expect(partitionMirror([1, 2], outDir)).toEqual({ onDisk: [], todo: [1, 2] });
  });
});

describe('selectOrphans', () => {
  it('finds icons the manifest no longer claims', () => {
    writeValidIcon(10);
    writeValidIcon(20);
    writeValidIcon(30);

    expect(selectOrphans([10, 30], outDir)).toEqual(['20.png']);
  });

  it('returns nothing when the mirror matches the manifest', () => {
    writeValidIcon(10);
    writeValidIcon(20);

    expect(selectOrphans([10, 20], outDir)).toEqual([]);
  });

  // Only the PNGs are the script's to delete; the directory is inside public/, where an
  // unrelated file appearing later must survive the prune.
  it('leaves non-PNG files alone', () => {
    writeValidIcon(10);
    writeIcon('README.md', 'not an icon');

    expect(selectOrphans([10], outDir)).toEqual([]);
  });

  it('reports every file when the manifest claims nothing', () => {
    writeValidIcon(10);
    writeValidIcon(20);

    expect(selectOrphans([], outDir).sort()).toEqual(['10.png', '20.png']);
  });
});

describe('findDrift', () => {
  it('reports only icons whose bytes no longer match their pin', () => {
    writeValidIcon(10, 'pinned');
    writeValidIcon(20, 'pinned');
    writeValidIcon(30, 'never pinned');
    const pins = { 10: sha256Of(path.join(outDir, '10.png')), 20: sha256Of(path.join(outDir, '10.png')) };
    writeValidIcon(20, 're-rendered upstream');

    expect(findDrift([10, 20, 30], outDir, pins)).toEqual([20]);
  });
});

describe('placeIcon', () => {
  const sha256 = (body: Buffer) => createHash('sha256').update(body).digest('hex');

  it('places downloaded bytes that match their pin', () => {
    const body = pngBytes('pinned');
    const dest = path.join(outDir, '10.png');

    expect(placeIcon(dest, body, sha256(body))).toBe(true);
    expect(readFileSync(dest).equals(body)).toBe(true);
    expect(readdirSync(outDir)).toEqual(['10.png']);
  });

  // The check comes before anything is written, so changed bytes never reach public/, not even
  // as a staging file.
  it('writes nothing for bytes that do not match their pin', () => {
    const dest = path.join(outDir, '10.png');

    expect(placeIcon(dest, pngBytes('re-rendered upstream'), sha256(pngBytes('pinned')))).toBe(false);
    expect(existsSync(dest)).toBe(false);
    expect(readdirSync(outDir)).toEqual([]);
  });

  it('leaves the pinned icon on disk in place when new bytes do not match', () => {
    writeValidIcon(10, 'pinned');
    const dest = path.join(outDir, '10.png');
    const pin = sha256Of(dest);

    expect(placeIcon(dest, pngBytes('re-rendered upstream'), pin)).toBe(false);
    expect(sha256Of(dest)).toBe(pin);
  });

  it('places any bytes when accepting changed icons (a null pin)', () => {
    const body = pngBytes('new rendering');
    const dest = path.join(outDir, '10.png');

    expect(placeIcon(dest, body, null)).toBe(true);
    expect(readFileSync(dest).equals(body)).toBe(true);
  });
});

describe('findUnpinned', () => {
  it('lists ids without a pin, which normal runs refuse', () => {
    expect(findUnpinned([10, 20, 30], { 10: 'a', 30: 'c' })).toEqual([20]);
  });

  it('is empty when every id is pinned', () => {
    expect(findUnpinned([10, 20], { 10: 'a', 20: 'b' })).toEqual([]);
  });
});
