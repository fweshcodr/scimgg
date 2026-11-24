/**
 * Window event names shared by tutorial content and the live UI it drives. Constants only, no
 * DOM/React imports, so both the component and content layers can import them.
 */

/**
 * A tour is done with the Practice or Actions pane it had opened: the pane closes, so the menu the
 * tour pins (Training, its Exit, the entries later steps point at) is back on screen.
 *
 * Source: the step that shows the Practice pane (tutorial/content/onboarding-main.ts), as it is left
 * Listener: launcher/TopChrome.tsx
 */
export const TUTORIAL_CLOSE_PANE_EVENT = 'tutorial:close-pane';

/**
 * The fight's readouts are on screen: the desktop Practice pane opened.
 *
 * Source: launcher/TopChrome.tsx (Practice launcher)
 * Listener: the steps that wait for it (tutorial/content/onboarding-main.ts and
 * onboarding-advanced.ts), via SpotlightRunner
 */
export const TUTORIAL_HUD_OPENED_EVENT = 'tutorial:hud-opened';

/**
 * The quick search (Ctrl+K) opened.
 *
 * Source: QuickSearch.tsx, as it opens
 * Listener: the step that teaches it (tutorial/content/onboarding-main.ts), via SpotlightRunner
 */
export const TUTORIAL_QUICK_SEARCH_OPENED_EVENT = 'tutorial:quick-search-opened';

/**
 * A replay started playing, and its transport (`.replay-bar`) is on screen. Sent once playback
 * runs rather than when it is asked for: the Mobile Replay tab requests playback from an effect,
 * and a step moving on at the request spotlit controls that did not exist yet.
 *
 * Source: Grid, whichever control started playback (the Replay launcher, the Mobile Replay tab)
 * Listener: the step that waits for it (tutorial/content/onboarding-advanced.ts), via SpotlightRunner
 */
export const TUTORIAL_REPLAY_ENTERED_EVENT = 'tutorial:replay-entered';
