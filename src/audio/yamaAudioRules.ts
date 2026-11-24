import { play, type SoundRule } from './EventAudioPlayer';

/**
 * Every id and delay below is read off private gameplay captures; the
 * derivation and the sounds deliberately left out live in
 * `docs/architecture/audio-sound-ids.md`.
 *
 * Mechanic gating happens at event emission, not here: with Fireballs disabled the fight's own
 * fireballs never emit `fireball_spawned`, while practice-spawned ones still do.
 *
 * Void flares have no rule: the server sends no sound for a flare's death or detonation. Both
 * are frame sounds on the clips the renderer plays (`npc_voidflare_death` / `npc_voidflare_explode`).
 */
/**
 * Capture: bare `synth_sound` (full volume, no attenuation) on the
 * spawn tick, all three layers, at exactly these delays.
 */
const FIREBALL_BARRAGE = [
  { id: 9335, delayCycles: 3 },
  { id: 10255, delayCycles: 100 },
  { id: 10268, delayCycles: 105 },
];
/**
 * Capture: one bare `synth_sound 10238` per tick per wave on the
 * floor, for the 10-13 ticks a wave takes to cross — matching `wave_activated`, which
 * the encounter also emits once per tick a wave is live. Never attenuated.
 */
const VOID_WAVE_AMBIENT = 10238;

export const yamaAudioRules: Record<string, SoundRule> = {
  fireball_spawned: {
    resolve: () => play(FIREBALL_BARRAGE),
    preloadIds: FIREBALL_BARRAGE.map((sound) => sound.id),
  },

  wave_activated: {
    resolve: () => play(VOID_WAVE_AMBIENT),
    preloadIds: [VOID_WAVE_AMBIENT],
  },
};
