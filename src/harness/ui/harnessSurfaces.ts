import type { GpuDetectionResult } from '../../util/gpuDetection';

/**
 * The UI surfaces the harness opens by name: `?open=<surface>[,<surface>…]` on load, or
 * `await uiHarness.open(surface)` once ready. Each is reached the way a player reaches it (App's own
 * handler for the button, menu item or hotkey, a real setting, the terminal fixtures), never by
 * mounting a component on its own. A route lives in harnessControls.ts, typed by this list.
 *
 * - `kind`: a **boot** surface depends on something decided before the app mounts (the GPU probe),
 *   so it exists only as a URL option; a **live** one also opens through the control API.
 * - `find`: the element that proves the surface is on screen. `open()` waits for it, and a combined
 *   `?open=` list checks every one is still up once all are open.
 * - `conflicts`: surfaces it cannot be shown with, checked both ways before a list is opened.
 * - `arg`: what `<surface>:<arg>` names, for the surfaces that take one.
 * - `transient`: shown for a moment only (the countdown), so a list does not check it is still up.
 * - `terminal`: a terminal dialog, opened as its terminal fixture (`showOutcome`, `?outcome=`).
 *   A list holds at most one, and none beside a surface that `hidesTerminal`.
 * - `hidesTerminal`: it hides or replaces a terminal dialog (a replay, a lesson, a fresh entry into
 *   the fight), so it is never listed with one.
 */
export interface HarnessSurfaceEntry {
  readonly kind: 'boot' | 'live';
  readonly find: () => Element | null;
  readonly conflicts?: readonly string[];
  readonly arg?: string;
  readonly transient?: boolean;
  readonly terminal?: boolean;
  readonly hidesTerminal?: boolean;
}

const css = (selector: string) => () => document.querySelector(selector);
/** An element whose own text is `text`, for the debug overlays, which carry no class of their own. */
const text = (value: string) => () =>
  Array.from(document.querySelectorAll('div, span')).find(
    (element) => element.childElementCount === 0 && element.textContent === value,
  ) ?? null;

/** The desktop top chrome's panes: it shows one at a time. */
const PANES = ['menu', 'practice', 'actions'] as const;
/** Anything that needs the desktop top chrome, which the Mobile layout replaces with its tool window. */
const DESKTOP_CHROME = [...PANES, 'replay'] as const;

export const HARNESS_SURFACES = {
  // Terminal dialogs: the terminal fixtures (`?outcome=`), base Yama only.
  death: { kind: 'live', find: css('.death-modal-overlay'), terminal: true },
  victory: { kind: 'live', find: css('.victory-modal-overlay'), terminal: true },

  // GPU: seeded probe results.
  'hardware-warning': { kind: 'boot', find: css('.hw-accel-warning.variant-gameplay') },
  'webgl2-gate': { kind: 'boot', find: css('.webgl2-gate') },

  // Drawers.
  settings: { kind: 'live', find: css('.controls-overlay.open') },
  plugins: { kind: 'live', find: css('.plugins-overlay.open') },

  // The desktop top chrome: its launchers, pressed.
  menu: { kind: 'live', find: css('.launcher-pane[data-pane="menu"]'), conflicts: ['practice', 'actions', 'mobile'] },
  practice: { kind: 'live', find: css('.launcher-pane[data-pane="practice"]'), conflicts: ['actions', 'mobile'] },
  actions: { kind: 'live', find: css('.launcher-pane[data-pane="actions"]'), conflicts: ['replay', 'mobile'] },
  replay: { kind: 'live', find: css('.replay-transport-dock'), conflicts: ['mobile'], hidesTerminal: true },

  // Modals, from their menu items and launchers.
  'encounter-picker': { kind: 'live', find: css('.picker-overlay') },
  'encounter-panel': { kind: 'live', find: css('.encounter-panel-overlay'), arg: 'encounter kind' },
  modifiers: { kind: 'live', find: css('.modifiers-modal-overlay') },
  'quick-search': { kind: 'live', find: css('.quick-search-overlay') },
  training: { kind: 'live', find: css('.tutorial-picker-backdrop') },
  shortcuts: { kind: 'live', find: css('.shortcuts-modal-overlay') },
  credits: { kind: 'live', find: css('.credits-modal-overlay') },
  'cache-explorer': { kind: 'live', find: css('.cache-explorer-overlay') },

  // Training: a lesson's overlay, and a spotlight tour.
  tutorial: {
    kind: 'live',
    find: css('.tutorial-overlay'),
    conflicts: ['tour'],
    arg: 'tutorial id',
    hidesTerminal: true,
  },
  tour: { kind: 'live', find: css('.osrs-tutorial-popover'), arg: 'tutorial id', hidesTerminal: true },

  // Arrival: the encounter's entry.
  'title-card': {
    kind: 'live',
    find: css('.encounter-title-card:not(.encounter-title-card--reserved)'),
    hidesTerminal: true,
  },
  countdown: { kind: 'live', find: css('.fight-start-countdown'), transient: true, hidesTerminal: true },

  // Toasts and hints.
  'hint-toast': { kind: 'live', find: css('.zoom-hint-toast') },
  'hint-bar': { kind: 'live', find: css('.hint-bar-anchor[data-visible]') },
  // App shows the warning only while Settings, which explains it, is closed.
  'viewport-size-warning': { kind: 'live', find: css('.viewport-size-strip'), conflicts: ['settings'] },

  // Plugin overlays that are off by default (XP drops and the boss bar are on).
  'dps-overlay': { kind: 'live', find: css('[data-tutorial="detailed-dps-panel"]') },
  'prayer-flick': { kind: 'live', find: css('[data-tutorial="prayer-flick-overlay"]') },
  'status-bars': { kind: 'live', find: css('[data-status-bars]') },

  // Debug overlays, from their settings.
  fps: { kind: 'live', find: css('.fps-overlay') },
  'tick-timing': { kind: 'live', find: css('[aria-label="Tick timing sparkline"]') },
  'sound-debug': { kind: 'live', find: text('Sound Debug') },
  'modifier-keys': { kind: 'live', find: css('[data-modifier]') },

  // The Mobile layout and its own chrome. A modal opened after `mobile` takes its sheet form.
  mobile: { kind: 'live', find: css('.osm-tools'), conflicts: [...DESKTOP_CHROME] },
  'mobile-edit-bar': { kind: 'live', find: css('.layout-edit-pill'), conflicts: [...DESKTOP_CHROME] },
} as const satisfies Record<string, HarnessSurfaceEntry>;

export type HarnessSurface = keyof typeof HARNESS_SURFACES;
type BootSurface = {
  [K in HarnessSurface]: (typeof HARNESS_SURFACES)[K]['kind'] extends 'boot' ? K : never;
}[HarnessSurface];
export type LiveHarnessSurface = Exclude<HarnessSurface, BootSurface>;
/**
 * The terminal surfaces, from their `terminal` flag. Each opens as the fixture `showOutcome`
 * installs, so its name has to be a `HarnessOutcome` (harnessControls.ts passes it straight there).
 */
export type TerminalHarnessSurface = {
  [K in HarnessSurface]: (typeof HARNESS_SURFACES)[K] extends { readonly terminal: true } ? K : never;
}[HarnessSurface];

const entryOf = (surface: HarnessSurface): HarnessSurfaceEntry => HARNESS_SURFACES[surface];

export const TERMINAL_SURFACES: readonly TerminalHarnessSurface[] = (
  Object.keys(HARNESS_SURFACES) as HarnessSurface[]
).filter((surface): surface is TerminalHarnessSurface => entryOf(surface).terminal === true);

export function isTerminalSurface(name: string): name is TerminalHarnessSurface {
  return (TERMINAL_SURFACES as readonly string[]).includes(name);
}

export function isHarnessSurface(name: string): name is HarnessSurface {
  return Object.hasOwn(HARNESS_SURFACES, name);
}

export function isBootSurface(surface: HarnessSurface): surface is BootSurface {
  return HARNESS_SURFACES[surface].kind === 'boot';
}

export interface SurfaceRequest {
  readonly surface: HarnessSurface;
  readonly arg?: string;
}

/** `name` or `name:arg`, checked against the list. */
export function parseSurfaceRequest(request: string): SurfaceRequest {
  const at = request.indexOf(':');
  const name = at < 0 ? request : request.slice(0, at);
  const arg = at < 0 ? undefined : request.slice(at + 1);
  if (!isHarnessSurface(name)) {
    throw new Error(`Unknown UI harness surface '${name}'. Known: ${Object.keys(HARNESS_SURFACES).join(', ')}`);
  }
  const entry: HarnessSurfaceEntry = HARNESS_SURFACES[name];
  if (arg !== undefined && !entry.arg) throw new Error(`'${name}' takes no argument (got '${arg}')`);
  return arg === undefined ? { surface: name } : { surface: name, arg };
}

/**
 * Parse a whole `?open=` list and reject a combination the app cannot show: a surface listed twice,
 * two that conflict (either side may name the other, or a terminal surface meets another or one
 * that hides it), or anything beside the WebGL2 gate, which replaces the app.
 */
export function parseSurfaceList(requests: readonly string[]): SurfaceRequest[] {
  const parsed = requests.map(parseSurfaceRequest);
  const names = parsed.map(({ surface }) => surface);
  if (names.includes('webgl2-gate') && names.length > 1) {
    throw new Error("'webgl2-gate' replaces the whole app, so it opens alone");
  }
  for (const [index, name] of names.entries()) {
    if (names.indexOf(name) !== index) throw new Error(`'${name}' is listed twice`);
  }
  for (const [index, name] of names.entries()) {
    const entry: HarnessSurfaceEntry = HARNESS_SURFACES[name];
    for (const other of names.slice(index + 1)) {
      const otherEntry: HarnessSurfaceEntry = HARNESS_SURFACES[other];
      const terminalClash =
        (entry.terminal && (otherEntry.terminal || otherEntry.hidesTerminal)) ||
        (otherEntry.terminal && entry.hidesTerminal);
      if (terminalClash || entry.conflicts?.includes(other) || otherEntry.conflicts?.includes(name)) {
        throw new Error(`'${name}' and '${other}' cannot be open together`);
      }
    }
  }
  return parsed;
}

/**
 * What the seeded GPU probe reports for the requested surfaces: a software renderer for the
 * in-game warning, no WebGL2 for the gate, and otherwise the hardware the harness always assumed.
 */
export function harnessGpuStatus(open: readonly string[]): GpuDetectionResult {
  if (open.includes('webgl2-gate')) {
    return { status: 'no-webgl2', renderer: null, vendor: null };
  }
  if (open.includes('hardware-warning')) {
    return {
      status: 'software',
      renderer: 'Google SwiftShader (ui-harness)',
      vendor: 'Google Inc. (Google)',
    };
  }
  return { status: 'hardware', renderer: 'ui-harness', vendor: null };
}
