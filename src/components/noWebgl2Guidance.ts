/**
 * What the player is told when the browser will not give the simulator a WebGL2 context. One
 * place, because three surfaces say it: the full-page browser support screen, the in-viewport
 * status notice, and the GPU probe's own warning.
 *
 * WebGL2 is the only capability that can block the app (`util/browserSupport.ts`). Nothing here
 * can switch it on from the page, so the primary recommendation is the one that reliably works:
 * somewhere else. The causes a reader could act on themselves are an aside, not the headline.
 */
export const NO_WEBGL2_TITLE = '3D graphics unavailable';

export const NO_WEBGL2_BODY = "This browser can't run the WebGL2 graphics the simulator needs.";

/** The primary recommendation first; the settings worth a look after it. */
const STEPS = [
  'Try Scim.GG on another device, or in a different browser.',
  'To keep using this browser, make sure hardware acceleration is on and no extension is blocking WebGL.',
] as const;

/**
 * The quiet half of the advice: a real cause, and deliberately not a recommendation. Turning a
 * security protection off is the reader's call to make, not ours to suggest, so this says what
 * the narrow version of it is and stops.
 */
const LOCKDOWN_NOTE =
  "Lockdown Mode can also cause this. You can exclude one site in Safari's Website Settings, but we don't recommend turning off security protections.";

export function noWebgl2Steps(): readonly string[] {
  return STEPS;
}

/**
 * Apple's platforms, which are the only ones with Lockdown Mode. Kept here rather than exported
 * from a shared util because this copy is its only caller; `util/fullscreen.ts` owns the related
 * `isAppleTouchDevice`, which deliberately excludes the Macs this one has to include.
 */
function hasLockdownMode(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(navigator.userAgent ?? '');
}

/** Only where the setting exists; elsewhere it is advice about a switch the reader does not have. */
export function noWebgl2Note(): string | undefined {
  return hasLockdownMode() ? LOCKDOWN_NOTE : undefined;
}
