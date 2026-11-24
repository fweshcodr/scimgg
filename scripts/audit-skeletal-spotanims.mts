/**
 * Audit every spotanim the app can reference and report which use a skeletal sequence.
 *
 * Skeletal spotanims take the per-frame posing path in `SpotAnimRenderer`; frame-based ones are
 * baked. Run this after adding an encounter's effects to see whether any of them land on the
 * posing path: npx tsx scripts/audit-skeletal-spotanims.mts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { SPELL_VISUALS } from '../src/data/spellVisuals';
import { WEAPON_COMBAT_VISUALS } from '../src/data/weaponCombatVisuals.generated';
import type { CacheInfo } from '../src/rs/cache/CacheInfo';
import { CacheSystem } from '../src/rs/cache/CacheSystem';
import { Bzip2 } from '../src/rs/compression/Bzip2';
import { ArchiveSeqTypeLoader } from '../src/rs/config/seqtype/SeqTypeLoader';
import { SpotAnimID } from '../src/rs/config/spotanimtype/SpotAnimID';
import { ArchiveSpotAnimTypeLoader } from '../src/rs/config/spotanimtype/SpotAnimTypeLoader';
import { discoverCacheUsage } from './discoverCacheUsage';
import { PINNED_CACHE } from './pinnedCache';

const CONFIG_INDEX = 2;
const SEQ_ARCHIVE = 12;
const SPOTANIM_ARCHIVE = 13;

const CACHE_INFO: CacheInfo = {
  name: 'osrs',
  game: 'oldschool',
  environment: 'live',
  revision: PINNED_CACHE.builds[0].major,
  timestamp: PINNED_CACHE.timestamp,
  size: 0,
};

/** Every spotanim id reachable from app data, mirroring what `scripts/trim-cache.ts` warms. */
async function collectSpotAnimIds(): Promise<Map<number, string>> {
  const ids = new Map<number, string>();
  const add = (id: unknown, label: string) => {
    if (typeof id === 'number' && id >= 0 && !ids.has(id)) ids.set(id, label);
  };

  for (const [name, id] of Object.entries(SpotAnimID)) add(id, name);
  for (const [itemId, v] of Object.entries(WEAPON_COMBAT_VISUALS)) {
    add(v.castSpotanim, `weapon ${itemId} cast`);
    add(v.projectileId, `weapon ${itemId} projectile`);
    add(v.hitSpotanim, `weapon ${itemId} hit`);
  }
  for (const [spell, v] of Object.entries(SPELL_VISUALS)) {
    add(v.castSpotanimId, `spell ${spell} cast`);
    add(v.projectileId, `spell ${spell} projectile`);
    add(v.hitSpotanimId, `spell ${spell} hit`);
  }
  // Literals written straight into encounter/render source never reach the tables above; trim-cache
  // warms them from this same scan, so omitting it would let a new skeletal id ship unreported.
  const usage = await discoverCacheUsage(process.cwd());
  for (const id of usage.spotAnimIds) add(id, 'source literal');
  return ids;
}

async function main(): Promise<void> {
  await Bzip2.initWasm();
  const zip = await JSZip.loadAsync(readFileSync(join(process.cwd(), 'public', 'osrs-cache', 'disk.zip')));
  const files = new Map<string, ArrayBuffer>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const name = path.split('/').pop() ?? path;
    if (name === 'main_file_cache.dat2' || name.startsWith('main_file_cache.idx')) {
      files.set(name, await entry.async('arraybuffer'));
    }
  }
  const config = CacheSystem.fromMap('dat2', files, [CONFIG_INDEX]).getIndex(CONFIG_INDEX);
  const spotAnims = new ArchiveSpotAnimTypeLoader(CACHE_INFO, config.getArchive(SPOTANIM_ARCHIVE));
  const seqs = new ArchiveSeqTypeLoader(CACHE_INFO, config.getArchive(SEQ_ARCHIVE));

  const ids = await collectSpotAnimIds();
  const skeletal: string[] = [];
  let checked = 0;
  let animated = 0;

  for (const [id, label] of ids) {
    let spot: ReturnType<typeof spotAnims.load> | undefined;
    try {
      spot = spotAnims.load(id);
    } catch {
      // Most ids in this set are projectile ids rather than spotanims; a miss is expected.
      continue;
    }
    if (!spot || spot.sequenceId < 0) continue;
    checked++;
    const seq = seqs.load(spot.sequenceId);
    if (!seq) continue;
    if ((seq.frameIds?.length ?? 0) > 0) {
      animated++;
      continue;
    }
    if (!seq.isSkeletalSeq()) continue;
    skeletal.push(
      `${id} ${label}: model=${spot.modelId} seq=${seq.id} duration=${seq.skeletalEnd - seq.skeletalStart} client ticks`,
    );
  }

  console.log(`Referenced spotanim ids: ${ids.size} (${checked} carry a sequence, ${animated} frame-based)\n`);
  console.log(`Skeletal (posed per frame): ${skeletal.length}`);
  for (const line of skeletal) console.log(`  ${line}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
