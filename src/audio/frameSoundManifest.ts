import { uniqueSoundIds } from './extracted-frame-sounds.json';

/**
 * Every sound id reachable through a cache animation's frame sounds — npc clips, the player's
 * clips and spotanim sequences alike — as extracted by `scripts/extract-frame-sounds.ts`.
 *
 * Preloaded as one set rather than per encounter because nothing declares ownership of these:
 * `FrameSoundTracker` plays whatever animation is on screen. An id that is not already fetched is
 * silent on its first trigger and dropped outright on any repeat while the fetch is still in
 * flight (the lazy-load path in `AudioEngine.play`), which is what a hand-maintained per-encounter
 * list gets wrong the moment someone adds an animation and forgets the list.
 */
export const FRAME_SOUND_IDS: readonly number[] = uniqueSoundIds;
