import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { threadId } from 'node:worker_threads';
import JSZip from 'jszip';

const MANIFEST = 'files.json';

function isCacheFile(name: string): boolean {
  return name === 'main_file_cache.dat2' || name.startsWith('main_file_cache.idx');
}

/** The bytes of a file read whole; a small read can share Node's buffer pool, so it is copied out. */
function readArrayBuffer(path: string): ArrayBuffer {
  const bytes = readFileSync(path);
  const { buffer, byteOffset, byteLength } = bytes;
  return (
    byteOffset === 0 && byteLength === buffer.byteLength ? buffer : buffer.slice(byteOffset, byteOffset + byteLength)
  ) as ArrayBuffer;
}

async function inflateCacheFiles(zipPath: string): Promise<Map<string, ArrayBuffer>> {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const files = new Map<string, ArrayBuffer>();
  for (const entry of Object.values(zip.files)) {
    const name = entry.name.split('/').at(-1);
    if (!entry.dir && name && isCacheFile(name)) files.set(name, await entry.async('arraybuffer'));
  }
  return files;
}

/** Publishes an unpacked copy whole or not at all; a reader never sees a partly written one. */
function publishUnpacked(root: string, key: string, files: Map<string, ArrayBuffer>): void {
  const target = join(root, key);
  const staging = `${target}.tmp-${process.pid}-${threadId}`;
  try {
    mkdirSync(staging, { recursive: true });
    for (const [name, data] of files) writeFileSync(join(staging, name), new Uint8Array(data));
    writeFileSync(join(staging, MANIFEST), JSON.stringify([...files.keys()]));
    renameSync(staging, target);
  } catch {
    // Unwritable, or another reader published first: this run already has its files in memory.
    rmSync(staging, { recursive: true, force: true });
    return;
  }
  // Copies of a replaced zip are never read again.
  const prefix = `${key.slice(0, key.indexOf('@'))}@`;
  for (const entry of readdirSync(root)) {
    if (entry !== key && entry.startsWith(prefix) && !entry.includes('.tmp-')) {
      rmSync(join(root, entry), { recursive: true, force: true });
    }
  }
}

/**
 * The `main_file_cache.*` files of an openrs2 `disk.zip`, keyed by file name for `CacheSystem.fromMap`.
 *
 * Inflating the 160 MB real cache costs seconds of CPU in every suite that opens it, so the first
 * reader leaves an unpacked copy in `.unpacked/` beside the zip, keyed by the zip's size and mtime,
 * and later readers in any worker or run read that instead. Readers racing the first unpack inflate
 * the zip themselves, as all of them did before. Each call returns its own buffers.
 */
export async function readCacheZipFiles(zipPath: string): Promise<Map<string, ArrayBuffer>> {
  const { size, mtimeMs } = statSync(zipPath);
  const root = join(dirname(zipPath), '.unpacked');
  const key = `${basename(zipPath)}@${size}-${Math.trunc(mtimeMs)}`;
  let names: string[] | null = null;
  try {
    names = JSON.parse(readFileSync(join(root, key, MANIFEST), 'utf-8')) as string[];
  } catch {
    // Not unpacked yet.
  }
  if (names) return new Map(names.map((name) => [name, readArrayBuffer(join(root, key, name))]));
  const files = await inflateCacheFiles(zipPath);
  publishUnpacked(root, key, files);
  return files;
}
