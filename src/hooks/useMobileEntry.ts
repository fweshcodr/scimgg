import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canLockLandscape,
  enterFullscreenLandscape,
  exitFullscreen,
  type FullscreenRoute,
  isDocumentFullscreen,
  isStandaloneDisplay,
  resolveFullscreenRoute,
  STANDALONE_DISPLAY_QUERY,
} from '../util/fullscreen';

/**
 * The mobile entry flow. Nothing in it is a wall: the encounter and its chrome are on screen
 * from the first frame, and each moment is a compact sheet over the lower edge that any tap
 * elsewhere puts away.
 *
 * - Landscape, first visit: the welcome sheet, offering full screen (or, on iPhone, the Home
 *   Screen route) with the touch basics.
 * - Portrait: an invitation to turn sideways, since the OSRS mobile client only plays in
 *   landscape. "Look around" puts it away for the rest of the tab's session. Turning sideways
 *   while it is up follows on with the welcome's full-screen offer, on return visits too.
 * - Afterwards the full-screen stone in the left column carries the offer, and a glint points
 *   at it whenever the flow hands over to it.
 */

interface FullScreenState {
  /** `document.fullscreenElement` (or its webkit twin) is set: the page can leave it. */
  readonly element: boolean;
  /** Launched from the Home Screen: already without browser bars, and no way out of that. */
  readonly standalone: boolean;
}

const NOT_FULL_SCREEN: FullScreenState = { element: false, standalone: false };

export type WelcomeVariant = 'fullscreen' | 'home-screen' | 'plain';

export interface MobileEntryInputs {
  isMobileDevice: boolean;
  route: FullscreenRoute;
  /** Entering full screen also turns the screen to landscape (Android). */
  canLockLandscape: boolean;
  /** Persisted: the welcome was answered on an earlier visit (`hideMobileWarning`). */
  introSeen: boolean;
  /** This page load: the welcome was answered. */
  welcomeAnswered: boolean;
  /** This page load: the device turned to landscape while the portrait invitation was up. */
  turnedFromInvite: boolean;
  portrait: boolean;
  /** This tab's session: "Look around" put the portrait invitation away. */
  portraitDismissed: boolean;
  fullScreen: FullScreenState;
}

export interface MobileEntryView {
  /** The first-visit welcome sheet, landscape only. */
  welcome: WelcomeVariant | null;
  /** The portrait invitation; `canLockLandscape` adds a button that turns the screen itself. */
  rotateInvite: { readonly canLockLandscape: boolean } | null;
}

const NOTHING: MobileEntryView = { welcome: null, rotateInvite: null };

export function resolveMobileEntry(inputs: MobileEntryInputs): MobileEntryView {
  const {
    isMobileDevice,
    route,
    introSeen,
    welcomeAnswered,
    turnedFromInvite,
    portrait,
    portraitDismissed,
    fullScreen,
  } = inputs;
  if (!isMobileDevice) return NOTHING;
  if (portrait) {
    if (portraitDismissed) return NOTHING;
    return { welcome: null, rotateInvite: { canLockLandscape: inputs.canLockLandscape && !fullScreen.element } };
  }
  if (welcomeAnswered || (introSeen && !turnedFromInvite)) return NOTHING;
  let welcome: WelcomeVariant = 'plain';
  if (!fullScreen.element && !fullScreen.standalone) {
    if (route === 'api') welcome = 'fullscreen';
    else if (route === 'home-screen') welcome = 'home-screen';
  }
  // A return visit already knows the touch basics: the turn only follows on with full screen.
  if (introSeen && welcome === 'plain') return NOTHING;
  return { welcome, rotateInvite: null };
}

function readFullScreen(): FullScreenState {
  const element = isDocumentFullscreen();
  // Chromium also matches `(display-mode: fullscreen)` during element full screen, so a Home
  // Screen launch can only be told apart while no element is full screen.
  return { element, standalone: !element && isStandaloneDisplay() };
}

/** Tracks element fullscreen and Home Screen launch, both of which can change while open. */
function useFullScreen(enabled: boolean): FullScreenState {
  const [fullScreen, setFullScreen] = useState<FullScreenState>(() => (enabled ? readFullScreen() : NOT_FULL_SCREEN));

  useEffect(() => {
    if (!enabled) return;
    const sync = () =>
      setFullScreen((prev) => {
        const next = readFullScreen();
        return prev.element === next.element && prev.standalone === next.standalone ? prev : next;
      });
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    const mql = typeof window.matchMedia === 'function' ? window.matchMedia(STANDALONE_DISPLAY_QUERY) : null;
    mql?.addEventListener('change', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      mql?.removeEventListener('change', sync);
    };
  }, [enabled]);

  return enabled ? fullScreen : NOT_FULL_SCREEN;
}

const PORTRAIT_QUERY = '(orientation: portrait)';

function readPortrait(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(PORTRAIT_QUERY).matches
    : false;
}

function usePortrait(enabled: boolean): boolean {
  const [portrait, setPortrait] = useState(() => enabled && readPortrait());
  useEffect(() => {
    if (!enabled || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(PORTRAIT_QUERY);
    const sync = () => setPortrait(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, [enabled]);
  return enabled && portrait;
}

/** Session-scoped, so a reload in the same tab keeps it but a new visit asks again. */
export const PORTRAIT_DISMISSED_KEY = 'scim:mobile-portrait-look-around';

function readPortraitDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(PORTRAIT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The always-visible full-screen stone in the Mobile layout's left column. `enter`/`exit`
 * mirror `document.fullscreenElement`; `home-screen` is an iPhone, where the only way in is
 * a Home Screen launch, so the stone explains that instead. Nothing where neither applies, or
 * where the page was launched from the Home Screen and has no browser bars to hide.
 */
export type FullscreenControl = 'enter' | 'exit' | 'home-screen' | null;

export function resolveFullscreenControl(
  isMobileDevice: boolean,
  route: FullscreenRoute,
  state: FullScreenState,
): FullscreenControl {
  if (!isMobileDevice || state.standalone) return null;
  if (route === 'api') return state.element ? 'exit' : 'enter';
  return route === 'home-screen' ? 'home-screen' : null;
}

export interface MobileEntry extends MobileEntryView {
  /** Must be called from a tap: enters full screen and locks landscape. Answers the welcome. */
  playFullscreen: () => void;
  /** Answers the welcome without full screen ("Not now", "Got it", "Play", a tap elsewhere). */
  dismissWelcome: () => void;
  /** "Look around": stays in portrait for the rest of the session. */
  lookAround: () => void;
  fullscreenControl: FullscreenControl;
  /** The full-screen stone's tap: leaves full screen when in it, else enters as `playFullscreen` does. */
  toggleFullscreen: () => void;
  /**
   * Bumped each time the flow hands the full-screen offer over to the stone: a sheet put away
   * without it, a return visit, or leaving full screen. The stone glints once per bump.
   */
  stoneAttention: number;
}

export function useMobileEntry(options: {
  isMobileDevice: boolean;
  introSeen: boolean;
  onIntroSeen: () => void;
}): MobileEntry {
  const { isMobileDevice, introSeen, onIntroSeen } = options;
  // Fixed browser capabilities, so read them once.
  const [route] = useState<FullscreenRoute>(() =>
    typeof document === 'undefined' ? 'none' : resolveFullscreenRoute(),
  );
  const [lockable] = useState(() => typeof document !== 'undefined' && canLockLandscape());
  const [welcomeAnswered, setWelcomeAnswered] = useState(false);
  const [turnedFromInvite, setTurnedFromInvite] = useState(false);
  const [portraitDismissed, setPortraitDismissed] = useState(readPortraitDismissed);
  const [stoneAttention, setStoneAttention] = useState(0);
  const fullScreen = useFullScreen(isMobileDevice);
  const portrait = usePortrait(isMobileDevice);
  const view = resolveMobileEntry({
    isMobileDevice,
    route,
    canLockLandscape: lockable,
    introSeen,
    welcomeAnswered,
    turnedFromInvite,
    portrait,
    portraitDismissed,
    fullScreen,
  });
  const fullscreenControl = resolveFullscreenControl(isMobileDevice, route, fullScreen);
  const nudgeStone = useCallback(() => setStoneAttention((n) => n + 1), []);

  // Declared before the effect below, so it reads whether the invitation was up before the turn.
  const inviteShownRef = useRef(false);
  useEffect(() => {
    if (!portrait && inviteShownRef.current) setTurnedFromInvite(true);
  }, [portrait]);
  const inviteShown = view.rotateInvite !== null;
  useEffect(() => {
    inviteShownRef.current = inviteShown;
  }, [inviteShown]);

  // A return visit opens on the bare game: point once at where full screen lives now.
  const greetedRef = useRef(false);
  const nothingShown = view.welcome === null && view.rotateInvite === null;
  useEffect(() => {
    if (greetedRef.current || !isMobileDevice) return;
    greetedRef.current = true;
    if (nothingShown && fullscreenControl === 'enter') nudgeStone();
  }, [isMobileDevice, nothingShown, fullscreenControl, nudgeStone]);

  // Swiping out of full screen (or Back) is not a mistake to correct, so no prompt: the stone,
  // which has just flipped to its enter icon, glints once instead.
  const wasElementRef = useRef(fullScreen.element);
  useEffect(() => {
    if (wasElementRef.current && !fullScreen.element) nudgeStone();
    wasElementRef.current = fullScreen.element;
  }, [fullScreen.element, nudgeStone]);

  const answerWelcome = useCallback(() => {
    setWelcomeAnswered(true);
    if (!introSeen) onIntroSeen();
  }, [introSeen, onIntroSeen]);

  const playFullscreen = useCallback(() => {
    // Request first, synchronously inside the tap, before any state update can re-render.
    void enterFullscreenLandscape();
    answerWelcome();
  }, [answerWelcome]);

  const dismissWelcome = useCallback(() => {
    answerWelcome();
    if (fullscreenControl) nudgeStone();
  }, [answerWelcome, fullscreenControl, nudgeStone]);

  const lookAround = useCallback(() => {
    setPortraitDismissed(true);
    try {
      window.sessionStorage.setItem(PORTRAIT_DISMISSED_KEY, '1');
    } catch {
      // Private mode without storage: it simply asks again next load.
    }
    if (fullscreenControl) nudgeStone();
  }, [fullscreenControl, nudgeStone]);

  const toggleFullscreen = useCallback(() => {
    if (isDocumentFullscreen()) {
      void exitFullscreen();
      return;
    }
    playFullscreen();
  }, [playFullscreen]);

  return {
    ...view,
    playFullscreen,
    dismissWelcome,
    lookAround,
    fullscreenControl,
    toggleFullscreen,
    stoneAttention,
  };
}
