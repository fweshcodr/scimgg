import { describe, expect, it } from 'vitest';
import { CacheSystem } from '../../../rs/cache/CacheSystem';
import { IndexType } from '../../../rs/cache/IndexType';
import { Bzip2 } from '../../../rs/compression/Bzip2';
import { readCacheZipFiles } from '../../../test/helpers/cacheZipFiles';
import {
  findProjectCacheZip,
  REAL_CACHE_TEST_TIMEOUT_MS,
  skipWithoutRealCache,
} from '../../../test/helpers/real-cache';
import { setupOutputPath, skipWithoutSetup } from '../../../test/helpers/setupAssets';
import { ALL_SOUND_IDS } from '../../soundNames';
import { decodeSoundPatch, patchLength, renderSoundEffect, SYNTH_SAMPLE_RATE } from '..';

const SOUND_EFFECTS = IndexType.DAT2.soundEffects;

/** Hits, a prayer, spells, UI and boss sounds, spanning every feature of the format. */
const SAMPLE_IDS = [2500, 2517, 2567, 1930, 2675, 3825, 8070, 10046, 10319, 169];

/**
 * The real-cache test copy (`SCIM_REAL_CACHE_PATH` or `.test-cache/`) is an older build than the
 * app's sound list and may lack a few ids. The setup cache is the build `npm run setup` trims the
 * browser's cache from, so it must hold every one.
 */
const CACHES = [
  { name: 'the real-cache test copy', skip: skipWithoutRealCache(), zip: findProjectCacheZip, maxMissingShare: 0.05 },
  {
    name: 'the pinned setup cache',
    skip: skipWithoutSetup('fullCache'),
    zip: () => setupOutputPath('fullCache'),
    maxMissingShare: 0,
  },
];

describe.each(CACHES)('sound effects in $name', ({ skip, zip, maxMissingShare }) => {
  let bytesOf: Promise<(id: number) => Uint8Array | undefined> | null = null;

  function soundBytes(): Promise<(id: number) => Uint8Array | undefined> {
    bytesOf ??= (async () => {
      await Bzip2.initWasm();
      const index = CacheSystem.fromMap('dat2', await readCacheZipFiles(zip()!), [SOUND_EFFECTS]).getIndex(
        SOUND_EFFECTS,
      );
      return (id: number) => {
        if (!index.archiveExists(id)) return undefined;
        const file = index.getFile(id, 0);
        return file && new Uint8Array(file.data.buffer, file.data.byteOffset, file.data.byteLength);
      };
    })();
    return bytesOf;
  }

  it.skipIf(skip)(
    'decodes every sound id the app can play',
    async () => {
      const bytesOf = await soundBytes();
      const missing: number[] = [];
      for (const id of ALL_SOUND_IDS) {
        const bytes = bytesOf(id);
        if (!bytes) {
          missing.push(id);
          continue;
        }
        expect(() => decodeSoundPatch(bytes), `sound ${id}`).not.toThrow();
      }
      expect(missing.length, `missing ids ${missing.join(', ')}`).toBeLessThanOrEqual(
        Math.floor(ALL_SOUND_IDS.length * maxMissingShare),
      );
    },
    REAL_CACHE_TEST_TIMEOUT_MS,
  );

  it.skipIf(skip).each(SAMPLE_IDS)(
    'renders sound %i with its patch length, a non-zero peak within full scale, and no NaN',
    async (id) => {
      const bytes = (await soundBytes())(id);
      expect(bytes, `sound ${id} in the cache`).toBeDefined();
      const pcm = renderSoundEffect(bytes!);
      expect(pcm).not.toBeNull();
      const { samples, sampleRate } = pcm!;
      expect(sampleRate).toBe(SYNTH_SAMPLE_RATE);
      expect(samples.length).toBe(patchLength(decodeSoundPatch(bytes!)));
      expect(samples.length / sampleRate).toBeGreaterThan(0.02);
      expect(samples.length / sampleRate).toBeLessThanOrEqual(10);
      let peak = 0;
      for (const v of samples) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0.01);
      expect(peak).toBeLessThanOrEqual(1);
    },
    REAL_CACHE_TEST_TIMEOUT_MS,
  );
});
