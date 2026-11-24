import type { CacheState } from '../cache/CacheManager';
import type { CacheIndex } from '../rs/cache/CacheIndex';
import { log } from '../util/Logger';
import type { SoundBufferLoader } from './AudioEngine';
import { PatchDecodeError, renderSoundEffect } from './synth';

/** The part of the runtime cache the loader reads; `CacheManager` provides it. */
export interface SoundEffectCache {
  getState(): { readonly state: CacheState };
  subscribe(listener: (state: { readonly state: CacheState }) => void): () => void;
  /** Index 4: one group per sound id, the synth patch in file 0. */
  getSoundEffectIndex(): CacheIndex | null;
}

/**
 * Renders after this long in one turn yield to the event loop first. The startup preload asks for
 * every frame and rule sound at once; rendering them back to back (~3 ms each) would block the
 * main thread for most of a second.
 */
const RENDER_SLICE_MS = 8;

/**
 * Renders game sounds from the runtime cache's sound-effect index, one `AudioBuffer` per id.
 *
 * A request made while the cache is still loading waits for it: resolving `null` would mark the id
 * unavailable for the session (the `SoundBufferLoader` contract). If the cache fails to load the
 * load rejects, which the engine retries on the next request. Once the cache is loaded, a missing
 * group, a malformed or silent patch, or a missing sound-effect index resolves `null` with a
 * warning, and the engine does not ask for that id again.
 */
export function cacheSoundBufferLoader(cache: SoundEffectCache): SoundBufferLoader {
  const loaded = readiness(cache);
  const schedule = renderScheduler();
  let missingIndexWarned = false;
  return async (soundId) => {
    await loaded();
    const index = cache.getSoundEffectIndex();
    if (!index) {
      if (!missingIndexWarned)
        log.warn('AudioEngine', 'The loaded cache has no sound-effect index; game sounds are off');
      missingIndexWarned = true;
      return null;
    }
    return schedule(() => renderBuffer(index, soundId));
  };
}

function renderBuffer(index: CacheIndex, soundId: number): AudioBuffer | null {
  try {
    const file = index.archiveExists(soundId) ? index.getFile(soundId, 0) : undefined;
    if (!file) {
      log.warn('AudioEngine', `Sound ${soundId} is not in the cache`);
      return null;
    }
    const pcm = renderSoundEffect(new Uint8Array(file.data.buffer, file.data.byteOffset, file.data.byteLength));
    if (!pcm) {
      log.warn('AudioEngine', `Sound ${soundId} has no audible tones`);
      return null;
    }
    const buffer = new AudioBuffer({ numberOfChannels: 1, length: pcm.samples.length, sampleRate: pcm.sampleRate });
    buffer.copyToChannel(pcm.samples, 0);
    return buffer;
  } catch (error) {
    const what = error instanceof PatchDecodeError ? 'is not a valid synth patch' : 'could not be rendered';
    log.warn('AudioEngine', `Sound ${soundId} ${what}:`, error);
    return null;
  }
}

/** Resolves once the cache is loaded; rejects if it fails, and waits afresh on the next call. */
function readiness(cache: SoundEffectCache): () => Promise<void> {
  let pending: Promise<void> | null = null;
  return () => {
    const { state } = cache.getState();
    if (state === 'LOADED') return Promise.resolve();
    if (state === 'ERROR') return Promise.reject(new Error('The game cache failed to load'));
    pending ??= new Promise<void>((resolve, reject) => {
      let settled = false;
      let unsubscribe: (() => void) | null = null;
      // `subscribe` calls the listener synchronously with the current state, before it returns.
      unsubscribe = cache.subscribe(({ state: next }) => {
        if (settled || (next !== 'LOADED' && next !== 'ERROR')) return;
        settled = true;
        unsubscribe?.();
        pending = null;
        if (next === 'LOADED') resolve();
        else reject(new Error('The game cache failed to load'));
      });
      if (settled) unsubscribe();
    });
    return pending;
  };
}

/** Runs render tasks one at a time, yielding to the event loop once a slice has run long. */
function renderScheduler(): <T>(task: () => T) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  let sliceStart = Number.NEGATIVE_INFINITY;
  return (task) => {
    const run = tail.then(async () => {
      if (performance.now() - sliceStart > RENDER_SLICE_MS) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        sliceStart = performance.now();
      }
      return task();
    });
    tail = run.catch(() => {});
    return run;
  };
}
