/**
 * One-time setup: everything the app needs that this repository does not ship, generated from one
 * pinned Old School RuneScape cache (scripts/fetch-cache.ts `PINNED_CACHE`). Idempotent; re-run it
 * at any time. Outputs go to the git-ignored paths the app already serves:
 *
 *   .setup-cache/                        the verified full cache, kept for offline re-runs
 *   public/assets/ui/**, encounters/**   interface sprites (scripts/assets/sprite-manifest.json)
 *   public/*_click*.webp                 click-cross animations (same manifest)
 *   public/fonts/RuneScape-*.ttf         the interface's pixel fonts
 *   public/assets/encounters/inferno-arena-map.webp, and the Inferno arena test fixture
 *   public/osrs-cache/                   the trimmed cache the browser loads
 *   public/assets/ui/healthbar/          RuneLite's healthbars from a pinned commit, and recolors
 *   public/assets/items/                 item icons, from RuneLite's icon endpoint
 *
 * Flags:
 *   --offline  never touch the network; needs the pinned cache and a previous run's downloads
 *   --check    generate nothing and touch no network; fail with a list of what is missing or does
 *              not match its pin (`npm run build` runs this). See scripts/setupOutputs.ts.
 *   --accept-changed-icons  pin what RuneLite serves now, for item icons whose bytes changed or
 *              that have no pin yet
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import JSZip from 'jszip';
import { CacheSystem } from '../src/rs/cache/CacheSystem';
import { Bzip2 } from '../src/rs/compression/Bzip2';
import { generateFonts } from './assets/generateFonts';
import { generateSprites, readSpriteManifest } from './assets/generateSprites';
import { ensureHealthbars } from './assets/runeliteHealthbars';
import { ensureFullCache } from './fetch-cache';
import { mirrorItemIcons } from './fetch-item-icons';
import { writeInfernoArenaMap } from './generate-inferno-arena-map.mts';
import { PINNED_CACHE } from './pinnedCache';
import { describeMissing, findMissingOutputs } from './setupOutputs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const INFERNO_ARENA_FIXTURE = path.join(REPO_ROOT, 'src/encounters/inferno/__tests__/fixtures/inferno-arena.json.gz');

async function readCacheFiles(zipPath: string): Promise<Map<string, ArrayBuffer>> {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const files = new Map<string, ArrayBuffer>();
  for (const entry of Object.values(zip.files)) {
    const name = path.basename(entry.name);
    if (!entry.dir && name.startsWith('main_file_cache.')) files.set(name, await entry.async('arraybuffer'));
  }
  return files;
}

/** Runs a sibling script in its own process, as `npm run build` does, failing setup if it fails. */
function runScript(script: string, args: string[]): void {
  const result = spawnSync(process.execPath, [...process.execArgv, path.join(import.meta.dirname, script), ...args], {
    stdio: 'inherit',
    cwd: REPO_ROOT,
  });
  if (result.status !== 0) throw new Error(`[setup] ${script} failed (exit ${result.status ?? result.signal})`);
}

function step(label: string): () => void {
  const start = Date.now();
  console.log(`\n[setup] ${label}`);
  return () => console.log(`[setup] ${label}: done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--check')) {
    const missing = await findMissingOutputs({ verify: true });
    if (missing.length > 0) {
      console.error(`[setup] ${describeMissing(missing)}`);
      process.exitCode = 1;
      return;
    }
    console.log('[setup] All generated assets are present.');
    return;
  }
  const offline = process.argv.includes('--offline');
  const started = Date.now();

  let done = step(`Pinned cache ${PINNED_CACHE.id}`);
  const fullZip = await ensureFullCache(offline);
  done();

  const manifest = readSpriteManifest();
  if (manifest.cache !== PINNED_CACHE.id) {
    throw new Error(
      `[setup] sprite-manifest.json was derived from cache ${manifest.cache}, not the pinned ${PINNED_CACHE.id}`,
    );
  }

  done = step('Reading the cache');
  await Bzip2.initWasm();
  const files = await readCacheFiles(fullZip);
  done();

  done = step('Sprites');
  const sprites = await generateSprites(CacheSystem.fromMap('dat2', files, [8]), REPO_ROOT);
  console.log(`[setup] ${sprites} sprites written`);
  done();

  done = step('Fonts');
  const fonts = generateFonts(CacheSystem.fromMap('dat2', files, [8, 13]), path.join(REPO_ROOT, 'public/fonts'));
  console.log(`[setup] ${fonts.length} fonts written`);
  done();

  done = step('Inferno arena map and fixture');
  await writeInfernoArenaMap(files);
  // Loaded lazily: the bake pulls in the app's cache manager, which nothing else here needs.
  const { bakeInfernoArena } = await import('../src/encounters/inferno/__tests__/bakeInfernoArena');
  const { serializeInfernoArena } = await import('../src/encounters/inferno/__tests__/infernoArenaFixture');
  const arena = serializeInfernoArena(await bakeInfernoArena(files));
  mkdirSync(path.dirname(INFERNO_ARENA_FIXTURE), { recursive: true });
  writeFileSync(INFERNO_ARENA_FIXTURE, gzipSync(arena, { level: 9 }));
  done();
  files.clear();

  done = step('Runtime cache mirror');
  runScript('fetch-cache.ts', ['--offline']);
  runScript('trim-cache.ts', []);
  done();

  done = step('Healthbars');
  await ensureHealthbars({ offline });
  done();

  done = step('Item icons');
  await mirrorItemIcons({ offline, acceptChangedIcons: process.argv.includes('--accept-changed-icons') });
  done();

  console.log(`\n[setup] Complete in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

main().catch((err) => {
  // Setup's own failures carry a `[step]` prefix and say how to recover; anything else needs its stack.
  const message = err instanceof Error ? err.message : String(err);
  console.error(/^\[[\w-]+\]/.test(message) || !(err instanceof Error) ? message : (err.stack ?? message));
  process.exit(1);
});
