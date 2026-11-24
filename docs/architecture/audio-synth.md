# Sound-effect synthesizer

[`src/audio/synth/`](../../src/audio/synth/) turns a cache sound effect into PCM in the browser, so
the app plays sounds straight from the game cache and ships no rendered audio. It is pure
TypeScript with no Node or DOM dependency.

```ts
import { renderSoundEffect } from '../audio/synth';

const pcm = renderSoundEffect(bytes); // { samples: Float32Array, sampleRate: 22050 } | null
```

`renderSoundEffect` throws `PatchDecodeError` for malformed bytes and returns `null` for a patch
that makes no sound. `decodeSoundPatch` and `renderPatch` are the two halves, exported for tests
and tools. Output is deterministic: noise comes from a fixed table.

## Format

A sound effect is index 4, group = sound id, file 0. Every group of cache 2437 and 2485 decodes
with no bytes left over. Our reading of the layout:

| Part | Encoding | Meaning |
|---|---|---|
| Patch | 10 tone slots, then 2 x u16 | A slot is empty when its first byte is 0. The u16s are a loop region in ms, unused for one-shot playback. |
| Envelope | u8 shape, i32 min, i32 max, u8 count, count x (u16 position, u16 level) | A curve across the tone: position and level are fractions of 65536, and level picks a value between min and max. |
| Tone | pitch envelope, volume envelope, 3 optional envelope pairs, partials, echo, u16 duration ms, u16 start ms, filter | The pairs are vibrato (rate, depth), tremolo (rate, depth) and gate (off, on). A pair is absent when its first byte is 0. |
| Partials | up to 5 x (usmart volume %, smart detune, usmart delay ms), ended by a 0 | The wiki's "harmonics". |
| Echo | usmart delay ms, usmart volume % | The wiki's "reverb". |
| Filter | u8 stage counts (high nibble zeros, low nibble poles, max 4 each); 2 x u16 gain; u8 end mask; (u16 frequency, u16 magnitude) per stage; then the end setting of each stage whose mask bit is set; then a morph curve if any stage or the gain differs between the ends | An IIR filter that morphs between two settings. |

`usmart` is one byte below `0x80`, else two bytes minus `0x8000`; `smart` is one byte minus 64,
else two bytes minus `0xc000`. Pitch shapes: 1 square, 2 sine, 3 saw, 4 noise; 0 is silent.

## Rendering model

Everything runs at 22,050 Hz. Each tone renders into its own buffer, then the tones are summed at
their start offsets and hard-clipped to ±1. The sound lasts until the latest tone ends.

1. **Oscillators.** Each partial is an oscillator whose phase advances by whole 1/32768ths of a
   cycle per sample, truncated. Its frequency is `min + sweep * 2^(detune / 120)`, where `sweep`
   is the pitch envelope's value above `min`. Detune scales the sweep only, not the floor. Its
   amplitude is volume % times partial %, with 100% x 100% at full scale. A delay shifts the
   partial's output later; the envelopes still run from the tone start.
2. **Waveforms.** Square is +1 for the first half cycle. Sine starts at 0, rising. Saw rises from
   -1. Noise holds a random ±1 for 1/12.5 of a cycle.
3. **Vibrato.** A second oscillator at the rate envelope's frequency in Hz, using the rate
   envelope's shape. It adds `wave * depth% * (pitch max - min) / 2` to the sweep.
4. **Tremolo.** The same, multiplying amplitude by `1 + wave * depth%`.
5. **Gate** (the wiki's "gap off" and "gap on"). Output alternates sounding and silent runs,
   starting sounding. A run lasts the on curve's value, a silence the off curve's, in samples.
   Both are mapped over the off curve's range with the min excluded.
6. **Echo.** A feedback comb inside the tone: `y[i] += y[i - delay] * volume%`.
7. **Filter.** A direct-form pole-zero filter of up to 4 conjugate zero pairs and 4 pole pairs,
   each `1 - 2r cos(theta) z^-1 + r^2 z^-2`, with these mappings:
   - frequency = `32.703 Hz * 2^(code / 8192)`, eight octaves above C1;
   - `r = 1 - 10^(-magnitude / 13107)`;
   - the input is attenuated by `0.003 dB` per gain code.

   The morph curve interpolates codes and gain between the two ends. Coefficients refresh every
   32 samples.

These rules come from the wiki's description of the synth's structure, standard DSP and fitting
against the reference renders. The [clean-room note](#clean-room-statement) lists the sources.
Where a measurement settled a constant, it was a direct one. Measured LFO rates fixed the phase
quantization, and a tremolo of 50 Hz measures 49.8 Hz. Sample-exact gate runs fixed the gate
rules. Per-frame pole fits of a white-noise tone through a moving resonance fixed the filter's
frequency scale.

## Fidelity

Our renders were compared with 290 reference renders of the same sound effects by
tolerant metrics:

| Metric | Median | 10th percentile |
|---|---|---|
| Log-magnitude STFT correlation | 0.90 | 0.76 |
| RMS-envelope correlation | 0.96 | 0.80 |
| Level difference | -0.08 dB | -0.8 dB |

Two renders of our own model that differ only in the noise seed correlate at 0.93 (median) on
the same STFT metric. Most of the corpus uses noise, so that is the practical ceiling.

Known gaps:

- **Gate start.** One patch (5000, gate range 4000-11750) starts silent in the reference. A
  start-silent rule fixes it but breaks several others.
- **Slow vibrato.** One vibrato with a rate range of 1-2 Hz (8070) runs at about half its expected
  rate in the reference. No rate rule fits it together with the vibratos measured elsewhere.
- **Audio-rate modulation.** Vibrato or tremolo at hundreds of Hz on saw or square carriers
  matches in band levels but not in sideband fine structure.
- **Duration.** 74 references are 256 samples shorter than their patch. One reference (9327) runs
  181 samples past it. We always render the patch length.
- **Loop region.** It is decoded but not used.

## Engine integration

[`cacheSoundBuffers.ts`](../../src/audio/cacheSoundBuffers.ts) is the app's `SoundBufferLoader`.
`useAudioManager` builds the engine with it over App's `CacheManager`, which loads index 4 with the
other runtime indices and exposes it through `getSoundEffectIndex()`.

- **Rendering.** On a sound's first request the loader reads index 4, group = sound id, file 0,
  calls `renderSoundEffect` and copies the samples into a mono 22,050 Hz `AudioBuffer`. The
  browser resamples to the context rate on playback, and the engine keeps the buffer per id.
  Renders run one at a time and yield to the event loop after 8 ms of work, so the startup
  preload of every frame and rule sound does not block the main thread. A render takes about
  3 ms median, 45 ms for the longest (9 s) patch, on a desktop CPU.
- **Cache not loaded yet.** A request waits for the cache. Resolving `null` instead would mark the
  id unavailable for the session. If the cache fails to load, waiting requests reject, and the
  engine retries them on the next play.
- **Unavailable sounds.** Once the cache is loaded, these resolve `null` with a warning, and the
  engine does not ask for the id again:
  - a missing or empty group;
  - a `PatchDecodeError`;
  - a patch that makes no sound;
  - a cache with no sound-effect index, which is reported once.
- **Coverage.** `scripts/trim-cache.ts` keeps the index-4 group of every id in `ALL_SOUND_IDS`
  (`soundNames.ts`), and `scripts/check-trimmed-cache.ts` checks them. Ids that are only named,
  not played, are trimmed to empty groups. `realCache.test.ts` decodes every playable id from the
  pinned setup cache (`.setup-cache/`) and from the real-cache test copy, when either is present.
- **Memory.** At 22,050 Hz mono float, the 350 s reference catalog is about 31 MB.

## Clean-room statement

This implementation was written from scratch. Its sources were:

- the [OSRS Wiki Audio article](https://oldschool.runescape.wiki/w/Audio), for the synth's
  high-level structure (facts only);
- RuneLite's BSD-licensed sound-effect cache loaders, to corroborate the byte layout;
- general DSP knowledge;
- black-box comparison of outputs against reference renders and the cache bytes.

The meaning of each field was established independently. No decompiled or deobfuscated client or
code derived from one, and no GPL, AGPL, LGPL, MPL or unlicensed implementation, was consulted for
the synth.
