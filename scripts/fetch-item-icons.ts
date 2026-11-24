/**
 * Build-time mirror of the item icons the interface paints.
 *
 * RuneLite publishes the OSRS client's rendered 2D item icons at
 * https://static.runelite.net/cache/item/icon/<id>.png. Hotlinking them makes rendering
 * depend on a third party's `access-control-allow-origin` header —
 * `PixelSprite` resamples these through a canvas, so losing CORS would stop item icons
 * from drawing at all rather than merely slowing them down. This copies them to
 * public/assets/items/ so production serves them from its own origin.
 *
 * RuneLite serves only its current rendering of each icon, so the URLs cannot be pinned to a
 * revision. The manifest pins each icon's SHA-256 instead, and every id must have a pin. Downloaded
 * bytes are checked against it before they are moved into public/, and an icon on disk that does not
 * match is downloaded again. If RuneLite now serves different bytes, or an id has no pin yet, the run
 * fails, names the icons and writes nothing for them; only `--accept-changed-icons` pins new bytes.
 *
 * Flags / env vars:
 *   --force                / ITEM_ICONS_FORCE=1     re-download every id, ignoring what is on disk
 *   --offline              / ITEM_ICONS_OFFLINE=1   never hit the network; fail if the mirror is incomplete
 *   --accept-changed-icons                          pin what RuneLite serves now for icons that changed
 *                                                  or have no pin yet
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { collectItemIconIds } from '../src/data/itemIconIds';
import { download } from './httpsDownload';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'public', 'assets', 'items');

/**
 * Committed, unlike the PNGs it describes, and deliberately outside public/ so a 60 kB
 * id list is not shipped to every visitor. `npm test` can run on a fresh clone, before setup,
 * so this file is the only thing itemIconIds.test.ts can prove coverage against.
 */
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts', 'item-icon-manifest.json');

const SOURCE_BASE = 'https://static.runelite.net/cache/item/icon';

/** The repo's networkPool default; also plain politeness toward a CDN we do not pay for. */
const CONCURRENCY = 8;
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;

export interface ItemIconManifest {
  source: string;
  /** Every id the UI can reach, ascending. A 404 fails the build, so there is no second list. */
  mirrored: number[];
  /** SHA-256 of each mirrored icon as last pinned, keyed by id. */
  sha256: Record<string, string>;
}

type IconResult = { kind: 'ok' } | { kind: 'drifted' } | { kind: 'failed'; reason: string };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The terminal chunk every PNG ends with: zero length, type `IEND`, and the CRC that is
 * therefore a constant. Checking it is what distinguishes a complete file from one truncated
 * after the signature.
 */
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

export function isUsablePngBytes(body: Buffer): boolean {
  return (
    body.length >= PNG_SIGNATURE.length + PNG_IEND.length &&
    body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
    body.subarray(body.length - PNG_IEND.length).equals(PNG_IEND)
  );
}

export function isUsablePng(filePath: string): boolean {
  // A killed run can leave a truncated file. Filename alone would promote it to `mirrored` and
  // ship it, so files found on disk are checked, not trusted.
  try {
    return isUsablePngBytes(readFileSync(filePath));
  } catch {
    return false;
  }
}

let tmpSequence = 0;

/** Unique per process: concurrent runs must not stage over each other. */
function tmpPathFor(dest: string): string {
  return `${dest}.${process.pid}.${tmpSequence++}.tmp`;
}

/**
 * Split the id set into what the mirror already holds and what still has to be fetched.
 * `force` ignores the mirror entirely; everything else resumes.
 */
export function partitionMirror(
  ids: readonly number[],
  outDir: string,
  force = false,
): { onDisk: number[]; todo: number[] } {
  const onDisk: number[] = [];
  const todo: number[] = [];
  for (const id of ids) {
    if (!force && isUsablePng(path.join(outDir, `${id}.png`))) onDisk.push(id);
    else todo.push(id);
  }
  return { onDisk, todo };
}

export function sha256Of(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** Ids whose icon on disk no longer matches its pin; ids without a pin are not drift. */
export function findDrift(ids: readonly number[], outDir: string, pins: Readonly<Record<string, string>>): number[] {
  return ids.filter((id) => {
    const pin = pins[id];
    return pin !== undefined && sha256Of(path.join(outDir, `${id}.png`)) !== pin;
  });
}

/** PNG file names in `outDir` that `mirrored` does not account for. */
export function selectOrphans(mirrored: readonly number[], outDir: string): string[] {
  const expected = new Set(mirrored.map((id) => `${id}.png`));
  return readdirSync(outDir).filter((name) => name.endsWith('.png') && !expected.has(name));
}

/**
 * Moves a downloaded icon into place only if its bytes hash to `pin`; `pin` null (only under
 * `--accept-changed-icons`) accepts any bytes. Returns whether it was placed. Staged then renamed:
 * an interrupted run must not leave a truncated PNG behind, because the next run skips anything
 * already on disk.
 */
export function placeIcon(dest: string, body: Buffer, pin: string | null): boolean {
  if (pin !== null && createHash('sha256').update(body).digest('hex') !== pin) return false;
  const tmp = tmpPathFor(dest);
  writeFileSync(tmp, body);
  renameSync(tmp, dest);
  return true;
}

/** Ids with no pinned SHA-256. Outside `--accept-changed-icons` there must be none. */
export function findUnpinned(ids: readonly number[], pins: Readonly<Record<string, string>>): number[] {
  return ids.filter((id) => pins[id] === undefined);
}

async function fetchIcon(id: number, pin: string | null): Promise<IconResult> {
  const dest = path.join(OUT_DIR, `${id}.png`);
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { status, body } = await download(`${SOURCE_BASE}/${id}.png`);

      // Not retried, and deliberately fatal upstream: with no runtime fallback, an id the UI
      // can reach but the CDN will not serve is a blank sprite in production. Empirically zero
      // of the 5,487 ids 404 today, so tolerating one would only ever hide a real regression.
      if (status === 404) return { kind: 'failed', reason: 'upstream has no icon for this id (404)' };

      if (status !== 200 || !body) {
        lastError = `HTTP ${status}`;
      } else if (!isUsablePngBytes(body)) {
        lastError = `response is not a complete PNG (${body.length} bytes)`;
      } else {
        // A complete PNG with other bytes is a re-render upstream, not a transient fault: no retry.
        return placeIcon(dest, body, pin) ? { kind: 'ok' } : { kind: 'drifted' };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_ATTEMPTS) await delay(RETRY_BASE_MS * 2 ** (attempt - 1));
  }

  return { kind: 'failed', reason: lastError };
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

function readPins(): Record<string, string> {
  if (!existsSync(MANIFEST_PATH)) return {};
  return (JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Partial<ItemIconManifest>).sha256 ?? {};
}

export interface MirrorOptions {
  readonly force?: boolean;
  readonly offline?: boolean;
  readonly acceptChangedIcons?: boolean;
}

/** Why a drifted icon fails the run, and the two ways forward. */
function describeDrift(drift: readonly number[], offline: boolean): string {
  const shown = drift.slice(0, 10).map((id) => `  ${SOURCE_BASE}/${id}.png`);
  return [
    `[fetch-item-icons] ${drift.length} icon(s) differ from their pinned SHA-256 in ${path.relative(REPO_ROOT, MANIFEST_PATH)}:`,
    ...shown,
    ...(drift.length > shown.length ? [`  ...and ${drift.length - shown.length} more`] : []),
    offline
      ? 'Run `npm run setup` online to download them again.'
      : 'RuneLite now serves different bytes for them. Restore the pinned files from a previous ' +
        'public/assets/items/, or review the new ones and pin them with `npm run setup -- --accept-changed-icons`.',
  ].join('\n');
}

/** Why an id without a pin fails the run: its bytes would be shipped unverified. */
function describeUnpinned(unpinned: readonly number[]): string {
  const shown = unpinned.slice(0, 10).map((id) => `  ${SOURCE_BASE}/${id}.png`);
  return [
    `[fetch-item-icons] ${unpinned.length} icon id(s) have no pinned SHA-256 in ${path.relative(REPO_ROOT, MANIFEST_PATH)}:`,
    ...shown,
    ...(unpinned.length > shown.length ? [`  ...and ${unpinned.length - shown.length} more`] : []),
    'Nothing unpinned is downloaded or shipped. Review the icons and pin them with ' +
      '`npm run setup -- --accept-changed-icons`.',
  ].join('\n');
}

/** Mirrors every icon the UI can reach into public/assets/items/; throws when one cannot be. */
export async function mirrorItemIcons({
  force = false,
  offline = false,
  acceptChangedIcons = false,
}: MirrorOptions = {}): Promise<void> {
  const ids = collectItemIconIds();

  mkdirSync(OUT_DIR, { recursive: true });

  const pins = readPins();
  const unpinned = acceptChangedIcons ? [] : findUnpinned(ids, pins);
  if (unpinned.length > 0) throw new Error(describeUnpinned(unpinned));
  const partition = partitionMirror(ids, OUT_DIR, force);
  // An icon on disk that no longer matches its pin is fetched again, so a damaged or edited file
  // is repaired; only bytes RuneLite itself now serves differently stay drifted below.
  const stale = new Set(offline ? [] : findDrift(partition.onDisk, OUT_DIR, pins));
  const onDisk = partition.onDisk.filter((id) => !stale.has(id));
  const todo = [...partition.todo, ...stale];
  const mirrored = new Set(onDisk);

  if (offline) {
    if (todo.length > 0) {
      throw new Error(
        `[fetch-item-icons] --offline requested but ${todo.length} of ${ids.length} icons are not mirrored`,
      );
    }
    console.log(`[fetch-item-icons] Offline mode, reusing ${mirrored.size} mirrored icons.`);
  } else if (todo.length === 0) {
    console.log(`[fetch-item-icons] All ${mirrored.size} icons already mirrored, skipping download.`);
  } else {
    console.log(`[fetch-item-icons] ${ids.length} ids: ${mirrored.size} on disk, fetching ${todo.length}.`);
  }

  const failed: string[] = [];
  const drifted: number[] = [];
  let done = 0;
  let lastLoggedPercent = -10;

  await runPool(offline ? [] : todo, async (id) => {
    const result = await fetchIcon(id, acceptChangedIcons ? null : pins[id]);
    if (result.kind === 'ok') mirrored.add(id);
    else if (result.kind === 'drifted') drifted.push(id);
    else failed.push(`${id}: ${result.reason}`);

    done++;
    const percent = Math.floor((done / todo.length) * 100);
    if (percent >= lastLoggedPercent + 10) {
      console.log(`[fetch-item-icons] ${percent}% (${done}/${todo.length})`);
      lastLoggedPercent = percent;
    }
  });

  if (failed.length > 0) {
    throw new Error(
      `[fetch-item-icons] ${failed.length} icon(s) could not be mirrored after ${MAX_ATTEMPTS} attempts:\n  ` +
        `${failed.slice(0, 20).join('\n  ')}${failed.length > 20 ? `\n  ...and ${failed.length - 20} more` : ''}`,
    );
  }
  drifted.sort((a, b) => a - b);
  if (drifted.length > 0) throw new Error(describeDrift(drifted, false));

  // Every reachable id is mirrored or the run threw above, so this is the id set itself.
  const mirroredIds = ids.filter((id) => mirrored.has(id));

  // A PNG the manifest does not claim would still be copied into dist/ by Vite.
  const orphans = selectOrphans(mirroredIds, OUT_DIR);
  for (const name of orphans) unlinkSync(path.join(OUT_DIR, name));
  if (orphans.length > 0) {
    console.log(`[fetch-item-icons] Pruned ${orphans.length} icon(s) the manifest no longer claims.`);
  }

  // Downloads were verified as they were placed; this catches icons reused from disk offline.
  const drift = acceptChangedIcons ? [] : findDrift(mirroredIds, OUT_DIR, pins);
  if (drift.length > 0) throw new Error(describeDrift(drift, offline));
  const sha256: Record<string, string> = {};
  for (const id of mirroredIds) {
    sha256[id] = acceptChangedIcons ? sha256Of(path.join(OUT_DIR, `${id}.png`)) : pins[id];
  }
  const manifest: ItemIconManifest = { source: SOURCE_BASE, mirrored: mirroredIds, sha256 };

  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!existsSync(MANIFEST_PATH) || readFileSync(MANIFEST_PATH, 'utf-8') !== serialized) {
    const tmp = tmpPathFor(MANIFEST_PATH);
    writeFileSync(tmp, serialized);
    renameSync(tmp, MANIFEST_PATH);
  }

  console.log(`[fetch-item-icons] Mirrored ${manifest.mirrored.length} icons.`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isEntrypoint = !!invokedPath && fileURLToPath(import.meta.url) === invokedPath;

if (isEntrypoint) {
  mirrorItemIcons({
    force: process.argv.includes('--force') || process.env.ITEM_ICONS_FORCE === '1',
    offline: process.argv.includes('--offline') || process.env.ITEM_ICONS_OFFLINE === '1',
    acceptChangedIcons: process.argv.includes('--accept-changed-icons'),
  }).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
