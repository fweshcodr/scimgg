import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Files `npm run setup` generates from the pinned game cache. None is committed, so a suite that
 * reads one skips on a fresh clone; `SCIM_REQUIRE_SETUP=1` makes that a failure instead.
 */
export const SETUP_OUTPUTS = {
  /** The pinned full cache (scripts/fetch-cache.ts `FULL_CACHE_ZIP`). */
  fullCache: '.setup-cache/openrs2-2772-disk.zip',
  infernoArena: 'src/encounters/inferno/__tests__/fixtures/inferno-arena.json.gz',
  infernoArenaMap: 'public/assets/encounters/inferno-arena-map.webp',
  fonts: 'public/fonts/RuneScape-Plain-12.ttf',
  /** Stands for every sprite in scripts/assets/sprite-manifest.json, click animations included. */
  sprites: 'public/assets/ui/packs/pack-vanilla/tabs/inventory.png',
  /** Stands for the healthbars setup downloads from RuneLite (scripts/assets/runeliteHealthbars.ts). */
  healthbars: 'public/assets/ui/healthbar/default_front_40px.png',
} as const;

export type SetupOutput = keyof typeof SETUP_OUTPUTS;

export function setupOutputPath(output: SetupOutput): string {
  return join(process.cwd(), SETUP_OUTPUTS[output]);
}

const reported = new Set<SetupOutput>();

/** The single skip rule for suites that need a setup output: optional locally, mandatory on request. */
export function skipWithoutSetup(output: SetupOutput): boolean {
  if (existsSync(setupOutputPath(output))) return false;
  const message = `${SETUP_OUTPUTS[output]} is missing; run \`npm run setup\` to generate it`;
  if (process.env.SCIM_REQUIRE_SETUP === '1') throw new Error(`SCIM_REQUIRE_SETUP=1 but ${message}`);
  if (!reported.has(output)) {
    reported.add(output);
    process.stderr.write(`[skip] ${message}.\n`);
  }
  return true;
}
