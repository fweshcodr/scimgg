/**
 * The notch ladder used by the scale picker and Alt+scroll.
 *
 * A custom value can sit between notches, but the next Alt+scroll returns it to this ladder.
 *
 * Keep fractional stops on sixths. Arbitrary ratios make equivalent 1px sprite outlines land at
 * different device-pixel widths, and values below 7/6 do not leave enough pixels to reconstruct
 * those outlines evenly.
 */
export const PANEL_SCALE_STOPS = [1, 7 / 6, 4 / 3, 3 / 2, 5 / 3, 11 / 6, 2, 13 / 6, 7 / 3, 5 / 2, 8 / 3, 17 / 6, 3];
