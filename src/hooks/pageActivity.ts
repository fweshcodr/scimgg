/**
 * Whether the page is in the background: its tab hidden (minimized, another tab), or its window
 * left for another window or app.
 *
 * "Left" means a real window `blur` since the last `focus`, not `document.hasFocus()`. A tab opened
 * from the address bar is visible and in front, but keyboard focus is still in the browser's own
 * chrome until the page is clicked, so `hasFocus()` is false from the first frame with nothing to
 * say the player has gone anywhere. The cost: if the page never had focus, leaving it fires no
 * `blur` either, so it keeps running until it has been focused once.
 */
export type PageActivity = 'hidden' | 'focused' | 'unfocused';

let blurred = false;

// Tracked for the page's whole life, not per subscriber, so a blur that lands while nothing is
// listening (a setting switched off) is still known when something starts listening again.
// Capture phase, so the flag is current before any subscriber reads it; that phase also sees every
// element's focus and blur on its way down, which are not the window's and must not count.
if (typeof window !== 'undefined') {
  window.addEventListener(
    'blur',
    (e) => {
      if (!(e.target instanceof Node)) blurred = true;
    },
    true,
  );
  window.addEventListener(
    'focus',
    (e) => {
      if (!(e.target instanceof Node)) blurred = false;
    },
    true,
  );
}

export function getPageActivity(): PageActivity {
  if (document.visibilityState === 'hidden') return 'hidden';
  return blurred ? 'unfocused' : 'focused';
}

/** Calls `onChange` after the activity may have changed. Returns the unsubscribe. */
export function subscribePageActivity(onChange: () => void): () => void {
  window.addEventListener('blur', onChange);
  window.addEventListener('focus', onChange);
  window.addEventListener('pageshow', onChange);
  window.addEventListener('pagehide', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    window.removeEventListener('blur', onChange);
    window.removeEventListener('focus', onChange);
    window.removeEventListener('pageshow', onChange);
    window.removeEventListener('pagehide', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}

/** Tests only: forget a blur left over from a previous test. */
export function resetPageActivityForTests(): void {
  blurred = false;
}
