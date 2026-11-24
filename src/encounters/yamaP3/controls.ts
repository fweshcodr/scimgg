import type { EncounterControls, MechanicsToggleInfo } from '../../core/encounters/types';
import type { MechanicsConfig } from '../../types/simulation';
import { YAMA_SPAWN_FIREBALL_COMMAND, YAMA_SPAWN_VOID_FLARE_COMMAND } from './commands';
import { BASE_YAMA_CONFIG, type YamaContractConfig } from './contractConfig';

/**
 * Each glyph's color for the hint card, kept on the hue the game uses for it: "You absorb a Glyph
 * of Shadow." and "...of Fire." arrive as `<col=a53fff>` (272°) and `<col=ff8e32>` (27°)
 * (capture yama_divine_severance.txt, lines 471, 1006). The game's full-saturation values glare
 * beside the card's muted parchment text, and its purple misses 4.5:1, so both are toned into the
 * range of the app's status colors at matching luminance (6.7:1 or better on `--color-surface`).
 * Fixed rather than color tokens: the palette has no purple, and the glyphs never change color.
 */
const GLYPH_OF_SHADOW_COLOR = '#b58cd9';
const GLYPH_OF_FIRE_COLOR = '#dd8d4b';

/**
 * The one builder behind BOTH surfaces that describe a Yama variant's controls: the
 * manifest metadata the UI reads without instantiating a fight, and the live
 * encounter's `getDefaultMechanicsConfig`. Building either list anywhere else
 * reintroduces the drift `encounterModules.test.ts` pins against. The parameter
 * defaults to `BASE_YAMA_CONFIG` because that is what `new YamaEncounter()` runs.
 */
export function buildYamaControls(contract: YamaContractConfig = BASE_YAMA_CONFIG): EncounterControls {
  const defaultMechanicsConfig: Partial<MechanicsConfig> = {
    yamaMageRange: true,
    yamaMelee: true,
    waves: true,
    fireballs: true,
    fireballStart: 'random',
    duoSide: 'player1',
    voidFlares: true,
    yamaStartGlyphs: false,
    infiniteHealth: false,
    ...contract.defaultMechanicsConfig,
  };

  const mechanicsToggles: MechanicsToggleInfo[] = [
    { key: 'yamaMageRange', label: 'Yama Mage/Range' },
    { key: 'yamaMelee', label: 'Yama Melee' },
    { key: 'waves', label: 'Waves' },
    { key: 'fireballs', label: 'Fireballs' },
    {
      key: 'duoSide',
      label: 'Practice As',
      compactLabel: 'Play as',
      setup: true,
      choices: [
        { value: 'player1', label: 'Player 1' },
        { value: 'player2', label: 'Player 2' },
      ],
      info: "Player 2's fireballs use the opposite diagonal.",
    },
    {
      key: 'fireballStart',
      label: 'Fireball Orientation',
      compactLabel: 'Fireballs',
      setup: true,
      choices: [
        { value: 'random', label: 'Random' },
        { value: 'horizontal', label: 'Horizontal', icon: 'fireball-line-horizontal' },
        { value: 'vertical', label: 'Vertical', icon: 'fireball-line-vertical' },
      ],
      info: 'Also applies to fireballs you spawn.',
    },
    { key: 'voidFlares', label: 'Void Flares' },
    {
      // Drawn by YamaSceneObjectController; the engine never reads it.
      key: 'yamaStartGlyphs',
      label: 'Show Glyphs at Start',
      group: 'aid',
      setup: true,
      info: [
        { text: "Shows the previous phase's glyphs. Yama's first P3 attack matches the northern pair: " },
        { text: 'purple', color: GLYPH_OF_SHADOW_COLOR },
        { text: ' = ranged, ' },
        { text: 'orange', color: GLYPH_OF_FIRE_COLOR },
        { text: ' = magic. Not shown in-game; remember the northern glyphs from the previous phases instead.' },
      ],
    },
    ...(contract.mechanicsToggles ?? []),
  ];

  return {
    defaultMechanicsConfig,
    mechanicsToggles:
      contract.contractId === null ? mechanicsToggles : mechanicsToggles.filter(({ key }) => key !== 'duoSide'),
    debugActions: [
      { command: YAMA_SPAWN_FIREBALL_COMMAND, label: 'Spawn Fireball' },
      { command: YAMA_SPAWN_VOID_FLARE_COMMAND, label: 'Spawn Void Flare' },
    ],
    debugFlags: [
      { key: 'damageTiles', label: 'Damage Tiles' },
      { key: 'waveTiles', label: 'Wave Tiles' },
      { key: 'fireballDangerTiles', label: 'Fireball Danger Tiles' },
    ],
  };
}
