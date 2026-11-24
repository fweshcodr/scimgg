/**
 * Fallback radius for a positional rule that names no range of its own. Real ranges come off the
 * wire per sound (`sound_area range=`), so prefer setting one on the rule over leaning on this.
 */
export const MAX_ATTENUATION_RANGE = 15;
export const MAX_SIMULTANEOUS_SOUNDS = 32;
