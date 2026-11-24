import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheState } from '../../cache/CacheManager';
import type { CacheIndex } from '../../rs/cache/CacheIndex';
import { log } from '../../util/Logger';
import { cacheSoundBufferLoader, type SoundEffectCache } from '../cacheSoundBuffers';
import { patchOf, tone } from '../synth/__tests__/fixtures';
import { encodeSoundPatch } from '../synth/__tests__/patchBytes';

/** Records what the loader writes; Node has no Web Audio. */
class FakeAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  channel: Float32Array | null = null;
  constructor(options: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
  }
  copyToChannel(source: Float32Array, channel: number): void {
    if (channel !== 0) throw new RangeError('mono');
    this.channel = source.slice();
  }
}

function fakeIndex(groups: Record<number, Uint8Array>): CacheIndex {
  return {
    archiveExists: (id: number) => id in groups,
    getFile: (id: number, file: number) => {
      if (file !== 0) return undefined;
      const bytes = groups[id];
      return { data: new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
    },
  } as unknown as CacheIndex;
}

/** A cache whose state the test drives; `subscribe` reports the current state at once, as CacheManager does. */
function fakeCache(state: CacheState, index: CacheIndex | null) {
  const listeners = new Set<(s: { state: CacheState }) => void>();
  const cache = {
    state,
    getState: () => ({ state: cache.state }),
    subscribe(listener: (s: { state: CacheState }) => void) {
      listeners.add(listener);
      listener({ state: cache.state });
      return () => listeners.delete(listener);
    },
    getSoundEffectIndex: () => (cache.state === 'LOADED' ? index : null),
    setState(next: CacheState) {
      cache.state = next;
      for (const listener of [...listeners]) listener({ state: next });
    },
    listenerCount: () => listeners.size,
  };
  return cache satisfies SoundEffectCache;
}

const SOUND = encodeSoundPatch(patchOf(tone({ durationMs: 100 })));
const SILENT = encodeSoundPatch(patchOf());
const MALFORMED = SOUND.subarray(0, 10);

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal('AudioBuffer', FakeAudioBuffer);
  warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cacheSoundBufferLoader', () => {
  it('renders index 4, group = sound id, file 0 into a mono 22,050 Hz buffer', async () => {
    const load = cacheSoundBufferLoader(fakeCache('LOADED', fakeIndex({ 2500: SOUND })));
    const buffer = (await load(2500)) as unknown as FakeAudioBuffer;
    expect(buffer).toBeInstanceOf(FakeAudioBuffer);
    expect(buffer.numberOfChannels).toBe(1);
    expect(buffer.sampleRate).toBe(22_050);
    expect(buffer.length).toBe(2205);
    expect(buffer.channel?.length).toBe(2205);
    expect(Math.max(...(buffer.channel ?? []))).toBeGreaterThan(0.9);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing group', 1, /not in the cache/],
    ['a malformed patch', 2, /not a valid synth patch/],
    ['a silent patch', 3, /no audible tones/],
  ])('resolves null for %s, with a warning', async (_case, id, message) => {
    const load = cacheSoundBufferLoader(fakeCache('LOADED', fakeIndex({ 2: MALFORMED, 3: SILENT })));
    await expect(load(id)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][1])).toMatch(message);
  });

  it('resolves null when the loaded cache has no sound-effect index, warning once', async () => {
    const load = cacheSoundBufferLoader(fakeCache('LOADED', null));
    await expect(load(1)).resolves.toBeNull();
    await expect(load(2)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('resolves null when Web Audio cannot build the buffer', async () => {
    vi.stubGlobal('AudioBuffer', undefined);
    const load = cacheSoundBufferLoader(fakeCache('LOADED', fakeIndex({ 2500: SOUND })));
    await expect(load(2500)).resolves.toBeNull();
    expect(String(warn.mock.calls[0][1])).toMatch(/could not be rendered/);
  });

  it('waits for a loading cache instead of reporting the sound unavailable', async () => {
    const cache = fakeCache('DOWNLOADING', fakeIndex({ 2500: SOUND }));
    const load = cacheSoundBufferLoader(cache);
    let result: unknown = 'pending';
    const first = load(2500).then((b) => {
      result = b;
    });
    const second = load(2500);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(result).toBe('pending');
    // Waiting requests share one subscription.
    expect(cache.listenerCount()).toBe(1);
    cache.setState('EXTRACTING');
    cache.setState('LOADED');
    await first;
    expect(result).toBeInstanceOf(FakeAudioBuffer);
    expect(await second).toBeInstanceOf(FakeAudioBuffer);
    expect(cache.listenerCount()).toBe(0);
  });

  it('rejects while the cache has failed, so the engine retries instead of marking the sound unavailable', async () => {
    const cache = fakeCache('DOWNLOADING', fakeIndex({ 2500: SOUND }));
    const load = cacheSoundBufferLoader(cache);
    const waiting = load(2500);
    cache.setState('ERROR');
    await expect(waiting).rejects.toThrow(/failed to load/);
    await expect(load(2500)).rejects.toThrow(/failed to load/);
    // A retried download recovers.
    cache.setState('UNLOADED');
    const retried = load(2500);
    cache.setState('LOADED');
    await expect(retried).resolves.toBeInstanceOf(FakeAudioBuffer);
  });

  it('yields to the event loop between long render slices', async () => {
    const groups: Record<number, Uint8Array> = {};
    const long = encodeSoundPatch(patchOf(tone({ durationMs: 3000 })));
    for (let id = 0; id < 20; id++) groups[id] = long;
    const load = cacheSoundBufferLoader(fakeCache('LOADED', fakeIndex(groups)));
    let timerTurns = 0;
    let done = false;
    const all = Promise.all(Object.keys(groups).map((id) => load(Number(id)))).then(() => {
      done = true;
    });
    while (!done) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      timerTurns++;
    }
    await all;
    expect(timerTurns).toBeGreaterThan(1);
  });
});
