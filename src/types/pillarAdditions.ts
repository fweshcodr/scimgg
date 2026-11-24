/**
 * Inferno Additions and Colosseum Additions: the pillar options of the plugin-hub plugin Tzhaar/Colo
 * Additions (BSD-2), split into one plugin per arena with the same options. Each stops drawing its
 * arena's pillars and can mark the tiles under them.
 *
 * Presentation alone: a hidden pillar still blocks movement, line of sight and projectiles, and an
 * Inferno pillar keeps its health bar and hitsplats, as the plugin hides only the pillar object.
 * Its outer-scenery and Sol arena guard options are not carried.
 */

/** How a pillar's tiles are marked: the plugin's `PillarMarkerStyle`. */
export type PillarMarkerStyle = 'borderedTile' | 'tileFill' | 'line';

export interface PillarAdditionsOptions {
  readonly hidePillars: boolean;
  /** Marks the tiles under each standing pillar, hidden or not, as the plugin's overlay does. */
  readonly markPillarTiles: boolean;
  readonly pillarMarkerStyle: PillarMarkerStyle;
  /** `#rrggbb`; its alpha is {@link PillarAdditionsOptions.pillarTileOpacity}. */
  readonly pillarTileColor: string;
  /** 0 to 1. */
  readonly pillarTileOpacity: number;
}

/**
 * The plugin's defaults (tile color rgb(40, 40, 40)), except pillars stay visible until hiding is
 * opted into (the plugin hides them by default) and the tile color is 60% opaque (the plugin's 150/255).
 */
export const DEFAULT_PILLAR_ADDITIONS_OPTIONS: PillarAdditionsOptions = {
  hidePillars: false,
  markPillarTiles: true,
  pillarMarkerStyle: 'borderedTile',
  pillarTileColor: '#282828',
  pillarTileOpacity: 0.6,
};

export const PILLAR_MARKER_STYLES: readonly { readonly value: PillarMarkerStyle; readonly label: string }[] = [
  { value: 'borderedTile', label: 'Bordered tile' },
  { value: 'tileFill', label: 'Tile fill' },
  { value: 'line', label: 'Line' },
];

/**
 * The Inferno's pillar LOCs (`INFERNO_OBJECTS_TO_HIDE`, TzhaarColoAdditionsPlugin.java:63): the
 * three transform LOCs the encounter places (30353-30355) and the cracked states they draw as
 * (30284-30287). The collapse is NPC 7710, which the plugin leaves drawn.
 */
export const INFERNO_PILLAR_LOC_IDS: ReadonlySet<number> = new Set([30284, 30285, 30286, 30287, 30353, 30354, 30355]);

/** `COLOSSEUM_PILLARS` (TzhaarColoAdditionsPlugin.java:69): static scenery in map square 7216. */
export const COLOSSEUM_PILLAR_LOC_IDS: ReadonlySet<number> = new Set([52490, 52491]);

const ALL_PILLAR_LOC_IDS: ReadonlySet<number> = new Set([...INFERNO_PILLAR_LOC_IDS, ...COLOSSEUM_PILLAR_LOC_IDS]);
const NO_LOC_IDS: ReadonlySet<number> = new Set();

/** Each Additions plugin's options, or `null` while that plugin is off. */
export interface PillarAdditionsPlugins {
  readonly inferno: PillarAdditionsOptions | null;
  readonly colosseum: PillarAdditionsOptions | null;
}

/** The enabled Additions plugins, each with the pillar LOCs it acts on. */
export function enabledPillarAdditions(
  plugins: PillarAdditionsPlugins | null | undefined,
): readonly { readonly locIds: ReadonlySet<number>; readonly options: PillarAdditionsOptions }[] {
  const enabled: { locIds: ReadonlySet<number>; options: PillarAdditionsOptions }[] = [];
  if (plugins?.inferno) enabled.push({ locIds: INFERNO_PILLAR_LOC_IDS, options: plugins.inferno });
  if (plugins?.colosseum) enabled.push({ locIds: COLOSSEUM_PILLAR_LOC_IDS, options: plugins.colosseum });
  return enabled;
}

/** The pillar LOC ids not drawn; the same set object while the choice is unchanged. */
export function hiddenPillarLocIds(plugins: PillarAdditionsPlugins | null | undefined): ReadonlySet<number> {
  const inferno = plugins?.inferno?.hidePillars === true;
  const colosseum = plugins?.colosseum?.hidePillars === true;
  if (inferno && colosseum) return ALL_PILLAR_LOC_IDS;
  if (inferno) return INFERNO_PILLAR_LOC_IDS;
  if (colosseum) return COLOSSEUM_PILLAR_LOC_IDS;
  return NO_LOC_IDS;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function parsePillarAdditionsOptions(value: unknown): PillarAdditionsOptions {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const defaults = DEFAULT_PILLAR_ADDITIONS_OPTIONS;
  const flag = (key: 'hidePillars' | 'markPillarTiles') =>
    typeof source[key] === 'boolean' ? source[key] : defaults[key];
  const opacity = source.pillarTileOpacity;
  return {
    hidePillars: flag('hidePillars'),
    markPillarTiles: flag('markPillarTiles'),
    pillarMarkerStyle:
      PILLAR_MARKER_STYLES.find((style) => style.value === source.pillarMarkerStyle)?.value ??
      defaults.pillarMarkerStyle,
    pillarTileColor:
      typeof source.pillarTileColor === 'string' && HEX_COLOR.test(source.pillarTileColor)
        ? source.pillarTileColor.toLowerCase()
        : defaults.pillarTileColor,
    pillarTileOpacity:
      typeof opacity === 'number' && Number.isFinite(opacity) && opacity >= 0 && opacity <= 1
        ? opacity
        : defaults.pillarTileOpacity,
  };
}
