import type { Breakpoint, Envelope, Filter, SoundPatch, Tone } from '../patch';

/** Test-only encoder: writes a patch in the cache byte layout `decodeSoundPatch` reads. */
export function encodeSoundPatch(patch: SoundPatch): Uint8Array {
  const out: number[] = [];
  const u8 = (v: number) => out.push(v & 0xff);
  const u16 = (v: number) => out.push((v >> 8) & 0xff, v & 0xff);
  const i32 = (v: number) => out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  const usmart = (v: number) => (v < 0x80 ? u8(v) : u16(v + 0x8000));
  const smart = (v: number) => (v + 64 < 0x80 && v >= -64 ? u8(v + 64) : u16(v + 0xc000));
  const points = (ps: readonly Breakpoint[]) => {
    u8(ps.length);
    for (const p of ps) {
      u16(p.position);
      u16(p.level);
    }
  };
  const envelope = (e: Envelope) => {
    u8(e.shape);
    i32(e.min);
    i32(e.max);
    points(e.points);
  };
  const pair = (p: readonly [Envelope, Envelope] | null) => {
    if (!p) u8(0);
    else {
      envelope(p[0]);
      envelope(p[1]);
    }
  };
  const filter = (f: Filter | null) => {
    if (!f) {
      u8(0);
      return;
    }
    u8((f.zeros.length << 4) | f.poles.length);
    u16(f.gain[0]);
    u16(f.gain[1]);
    let mask = 0;
    [f.zeros, f.poles].forEach((stages, d) => {
      stages.forEach((s, i) => {
        if (s.frequency[0] !== s.frequency[1] || s.magnitude[0] !== s.magnitude[1]) mask |= 1 << (d * 4 + i);
      });
    });
    u8(mask);
    for (const stages of [f.zeros, f.poles]) {
      for (const s of stages) {
        u16(s.frequency[0]);
        u16(s.magnitude[0]);
      }
    }
    [f.zeros, f.poles].forEach((stages, d) => {
      stages.forEach((s, i) => {
        if (mask & (1 << (d * 4 + i))) {
          u16(s.frequency[1]);
          u16(s.magnitude[1]);
        }
      });
    });
    if (mask !== 0 || f.gain[0] !== f.gain[1]) points(f.morph ?? []);
  };
  const tone = (t: Tone) => {
    envelope(t.pitch);
    envelope(t.volume);
    pair(t.vibrato && [t.vibrato.rate, t.vibrato.depth]);
    pair(t.tremolo && [t.tremolo.rate, t.tremolo.depth]);
    pair(t.gate && [t.gate.off, t.gate.on]);
    for (const p of t.partials) {
      usmart(p.volume);
      smart(p.detune);
      usmart(p.delayMs);
    }
    usmart(0);
    usmart(t.echo.delayMs);
    usmart(t.echo.volume);
    u16(t.durationMs);
    u16(t.startMs);
    filter(t.filter);
  };
  for (const t of patch.tones) {
    if (t) tone(t);
    else u8(0);
  }
  u16(patch.loopStartMs);
  u16(patch.loopEndMs);
  return new Uint8Array(out);
}
