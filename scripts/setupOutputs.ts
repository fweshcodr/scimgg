/**
 * What `npm run setup` leaves behind, and what of it is missing now. Read-only and offline:
 * `npm run build` fails on anything missing (`setup.ts --check`), and `npm run dev` prints one line
 * about it (this file run directly) and starts anyway.
 *
 * It covers what the running app serves. The Inferno arena test fixture setup also writes is a test
 * input: suites that read it skip without it, and `SCIM_REQUIRE_SETUP=1` makes them fail instead.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INFERNO_ARENA_MAP_IMAGE } from '../src/encounters/inferno/arenaMapImage';
import { PIXEL_FONTS } from './assets/generateFonts';
import { HEALTHBAR_DIR, healthbarFiles, unpinnedHealthbars } from './assets/runeliteHealthbars';
import type { SpriteManifest } from './assets/spriteRecipes';
import { computeTraceSpecHash } from './discoverCacheUsage';
import { isMirrorConsistent, PINNED_CACHE, readExistingManifest, verifyMirror } from './pinnedCache';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface ItemIconPins {
  mirrored: number[];
  sha256: Record<string, string>;
}

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, relative), 'utf-8')) as T;
}

const exists = (relative: string) => existsSync(path.join(REPO_ROOT, relative));

/**
 * One line per kind of missing output. `verify` (`setup --check`) also hashes what it can against
 * its pin: the trimmed cache (`verifyMirror`: its zip, its upstream cache, its keys), item icons
 * and healthbars. Without it (the dev server's notice) only presence and the zip's length count.
 *
 * A trimmed cache whose trace spec no longer matches the source (an id added to `ALL_SOUND_IDS`,
 * an encounter's new NPC) counts as missing too: the trim dropped archives the app now requests.
 */
export async function findMissingOutputs({ verify }: { verify: boolean }): Promise<string[]> {
  const missing: string[] = [];

  const mirror = readExistingManifest();
  const mirrorProblem = verify && mirror ? await verifyMirror(mirror) : null;
  if (!mirror || mirror.id !== PINNED_CACHE.id || mirror.trimmed !== true || !isMirrorConsistent(mirror)) {
    missing.push(`the trimmed cache ${PINNED_CACHE.id} in public/osrs-cache/`);
  } else if (mirrorProblem) {
    missing.push(`a valid trimmed cache in public/osrs-cache/: ${mirrorProblem}`);
  } else if (mirror.traceSpecHash !== (await computeTraceSpecHash(REPO_ROOT))) {
    missing.push('a re-trim of public/osrs-cache/ (the trim lacks archives the app requests)');
  }

  const sprites = readJson<SpriteManifest>('scripts/assets/sprite-manifest.json').sprites.filter(
    (recipe) => !exists(recipe.path),
  );
  if (sprites.length > 0) missing.push(`${sprites.length} interface sprite(s), e.g. ${sprites[0]!.path}`);

  const fonts = PIXEL_FONTS.filter((font) => !exists(`public/fonts/${font.file}.ttf`));
  if (fonts.length > 0) missing.push(`${fonts.length} font(s), e.g. public/fonts/${fonts[0]!.file}.ttf`);

  const map = `public${INFERNO_ARENA_MAP_IMAGE.url}`;
  if (!exists(map)) missing.push(map);

  const absentBars = healthbarFiles().filter((name) => !existsSync(path.join(HEALTHBAR_DIR, name)));
  const driftedBars = verify ? unpinnedHealthbars().filter((name) => !absentBars.includes(name)) : [];
  if (absentBars.length > 0) missing.push(`${absentBars.length} healthbar sprite(s), e.g. ${absentBars[0]}`);
  if (driftedBars.length > 0) missing.push(`${driftedBars.length} healthbar(s) not matching their pins`);

  const icons = readJson<ItemIconPins>('scripts/item-icon-manifest.json');
  const badIcons = icons.mirrored.filter((id) => {
    const file = path.join(REPO_ROOT, 'public/assets/items', `${id}.png`);
    if (!existsSync(file)) return true;
    const pin = icons.sha256[id];
    return verify && pin !== undefined && createHash('sha256').update(readFileSync(file)).digest('hex') !== pin;
  });
  if (badIcons.length > 0) {
    missing.push(
      `${badIcons.length} item icon(s) in public/assets/items/${verify ? ' missing or not matching their pins' : ''}`,
    );
  }

  return missing;
}

export function describeMissing(missing: readonly string[]): string {
  return [
    'Generated assets are missing or do not match their pins:',
    ...missing.map((line) => `  - ${line}`),
    `Run \`npm run setup\` once (it downloads the pinned ~${Math.round(
      PINNED_CACHE.diskZipBytes / 1024 / 1024,
    )} MB game cache and builds them).`,
  ].join('\n');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  // The dev server's one-line notice: presence only, so it stays instant.
  const missing = await findMissingOutputs({ verify: false });
  if (missing.length > 0) {
    console.warn(
      `[setup] Generated assets are missing (${missing.join('; ')}). Run \`npm run setup\`; the app still starts.`,
    );
  }
}
