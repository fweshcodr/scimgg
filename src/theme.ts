/**
 * Text colors the simulator's OSRS interfaces draw with: the prayer, combat and spellbook
 * names, the quick-prayer and autocast screens, the equipment screens and item tooltips, and
 * the context menu's target names, header and disabled rows. They belong to the game, not to
 * the app's chrome, so they stay frozen at the values those surfaces have always shown, and
 * the app palette (the `color-*` tokens) can move without touching them.
 *
 * Exposed as `THEME.colors.native.*` and as the `--native-*` CSS variables in `index.css`.
 */
export interface NativeTextColors {
  /** Interface names and headings (the game's orange). */
  readonly orange: string;
  /** Item and target names in tooltips and the context menu. */
  readonly orangeHover: string;
  /** Equipment-stat labels, the context menu header, tooltip extras. */
  readonly label: string;
  /** Equipment-stat values. */
  readonly body: string;
  /** Disabled menu rows and filter-view rules. */
  readonly muted: string;
  /** Spell names in tooltips. */
  readonly info: string;
}

/**
 * The palette for JS and canvas consumers. CSS consumers read the `var(--color-*)` and
 * `var(--native-*)` tokens on `index.css` `:root`; the colors both sides share must match,
 * which `src/__tests__/theme.test.ts` enforces.
 */
export const THEME = {
  colors: {
    background: 'rgb(34, 28, 20)',
    /** `--color-bg-elevated`, mirrored for the canvases that have to paint a raised surface. */
    bgElevated: '#2a221a',
    surface: '#181410',
    surfaceHighlight: 'rgba(255, 255, 255, 0.08)',
    surfaceDark: '#0c0a06',

    border: 'rgba(16, 16, 16, 0.8)',
    borderHighlight: '#3e3428',
    borderDark: '#121210',

    primary: '#cf8a3e',
    primaryHover: '#e6ad6a',
    primaryDim: 'rgba(255, 152, 31, 0.15)',
    secondary: '#c3a777',
    secondaryHover: '#d6be92',

    text: '#ffffff',
    textSecondary: '#c3a777',
    textMuted: '#9c8768',
    textHighlight: '#ffffff',

    success: '#86b46e',
    danger: '#cf715f',
    warning: '#e0b04a',
    info: '#85a3bd',

    heading: '#e2cea3',
    accentText: '#e0a35c',

    /**
     * The OSRS interfaces' own text colors (see `NativeTextColors`). Native panels, tooltips
     * and the context menu read these, never the app tokens above.
     */
    native: {
      orange: '#ff981f',
      orangeHover: '#ffac4d',
      label: '#c8aa6e',
      body: '#d6c4a8',
      muted: '#8e7c5e',
      info: '#60a5fa',
    } as NativeTextColors,

    yama: '#4a1812',
    yamaBorder: '#a32819',
    player: '#ffffff',
    playerBorder: '#000000',

    tile: {
      default: 'rgba(255, 255, 255, 0.03)',
      highlight: 'rgba(207, 138, 62, 0.2)',
      danger: 'rgba(248, 113, 113, 0.2)',
      safe: 'rgba(74, 222, 128, 0.2)',
      wave: 'rgba(96, 165, 250, 0.2)',
    },
  },

  typography: {
    // Matches the :root default in index.css. The pixel faces are the app's type everywhere.
    fontFamily: '"RuneScape Plain 12", sans-serif',
    monoFont: '"JetBrains Mono", "Fira Code", "Courier New", Courier, monospace',
    osrs: {
      plain12: '"RuneScape Plain 12", sans-serif',
      bold12: '"RuneScape Bold 12", sans-serif',
      plain11: '"RuneScape Plain 11", sans-serif',
      quill8: '"RuneScape Quill 8", sans-serif',
    },
    size: {
      xs: '11px',
      sm: '13px',
      md: '15px',
      lg: '18px',
      xl: '24px',
    },
    weight: {
      regular: 400,
      medium: 500,
      bold: 600,
    },
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },

  borderRadius: {
    sm: '2px',
    md: '2px',
    lg: '2px',
    full: '9999px',
  },

  shadows: {
    sm: '0 2px 4px rgba(0,0,0,0.2)',
    md: '0 8px 16px rgba(0,0,0,0.3)',
    lg: '0 16px 32px rgba(0,0,0,0.4)',
    glow: '0 0 15px rgba(207, 138, 62, 0.12)',
  },

  glass: {
    panel: 'rgb(34, 28, 20)',
    blur: '0px',
    border: '1px solid #121210',
  },
};
