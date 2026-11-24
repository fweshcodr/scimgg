import type { EncounterControls } from '../../core/encounters/types';
import { getMonsterHp } from '../../data/monsterData';
import { SOL_NPC_ID } from '../../npcs/colosseum/constants';
import { SOL_HEREDIT_DEBUG_ACTIONS } from './commands';
import { SOL_PHASE_TRANSITIONS } from './phases';

/** Setup choice pinning Sol's regular attack style: `random`, `spear` or `shield`. */
export const SOL_HEREDIT_ATTACK_STYLE_KEY = 'solHereditAttackStyle';

export function buildSolHereditControls(): EncounterControls {
  const maxHp = getMonsterHp(SOL_NPC_ID);
  if (maxHp === undefined) throw new TypeError('Missing Sol Heredit monster HP');
  return {
    // 25% only adds the fourth beam crystal, so it is left out to keep the presets on one row.
    bossHpPresets: [
      { label: 'Start', hp: maxHp, hint: 'Spear and shield only.' },
      ...[
        { threshold: 0.9, hint: 'Adds triple attack and beams.' },
        { threshold: 0.75, hint: 'Adds grapple. Faster attacks.' },
        { threshold: 0.5, hint: 'Harder triple attack.' },
        { threshold: 0.1, hint: 'Enrage.' },
      ].map(({ threshold, hint }) => {
        if (!SOL_PHASE_TRANSITIONS.some((transition) => transition.threshold === threshold))
          throw new TypeError(`No Sol phase at ${threshold}`);
        return { label: `${Math.round(threshold * 100)}%`, hp: Math.floor(maxHp * threshold), hint };
      }),
    ],
    defaultMechanicsConfig: {
      infiniteHealth: false,
      solHereditAttacks: true,
      solHereditSand: true,
      solHereditBeams: true,
      solHereditTelegraph: false,
      [SOL_HEREDIT_ATTACK_STYLE_KEY]: 'random',
    },
    mechanicsToggles: [
      { key: 'solHereditAttacks', label: 'Sol Attacks' },
      {
        key: SOL_HEREDIT_ATTACK_STYLE_KEY,
        label: 'Attack Style',
        dependsOn: 'solHereditAttacks',
        setup: true,
        choices: [
          { value: 'random', label: 'Random' },
          { value: 'spear', label: 'Spear' },
          { value: 'shield', label: 'Shield' },
        ],
      },
      { key: 'solHereditSand', label: 'Molten Sand' },
      { key: 'solHereditBeams', label: 'Light Beams' },
      {
        key: 'solHereditTelegraph',
        label: 'Attack Telegraphs',
        group: 'aid',
        info: 'Shows where his next attack will land.',
      },
    ],
    debugActions: SOL_HEREDIT_DEBUG_ACTIONS,
    debugFlags: [{ key: 'beamDamageTiles', label: 'Beam Damage Tiles' }],
  };
}
