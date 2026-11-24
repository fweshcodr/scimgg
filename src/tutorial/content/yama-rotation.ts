import type { Tutorial } from '../types';

const YAMA_KIND = 'yama_p3';

const ATTACK_ONLY_MECHANICS = {
  yamaMageRange: true,
  yamaMelee: false,
  waves: false,
  fireballs: false,
  voidFlares: false,
  infiniteHealth: true,
} as const;

export const yamaRotationTutorial: Tutorial = {
  id: 'yama-rotation',
  title: 'Prayer Switching',
  description:
    'Yama alternates between ranged and magic attacks. Switch protection prayers in time to block the damage.',
  slug: 'prayer-switching',
  surface: 'encounter',
  difficulty: 'intermediate',
  estimatedDurationMin: 5,
  prerequisites: ['yama-basics'],
  availability: 'wip',
  encounterContext: { kind: YAMA_KIND, autoEnter: true },
  introVideoUrl: '/tutorials/yama/rotation-intro.mp4',
  steps: [
    {
      kind: 'video',
      title: "Yama's attacks",
      body:
        'Yama alternates magic and ranged attacks. ' +
        'Pray <b>Protect from Magic</b> for the fire attack and ' +
        '<b>Protect from Missiles</b> for the shadow attack.',
      videoUrl: '/tutorials/yama/rotation-intro.mp4',
    },
    {
      kind: 'info',
      title: 'Watch the tell',
      body:
        "Yama's outline changes color to show which attack is coming. " + 'Switch your prayer to match before it hits.',
    },
    {
      kind: 'checkpoint',
      title: 'Switch your prayers',
      body: 'Match your prayer to each attack to block all the damage.',
      seed: {
        encounterKind: YAMA_KIND,
        mechanics: { ...ATTACK_ONLY_MECHANICS },
      },
    },
    {
      kind: 'wait-for-event',
      title: 'Switch prayers 5 times',
      body: 'Swap between Protect from Magic and Protect from Missiles to match each attack. Watch the outline color.',
      eventName: 'prayer_changed',
      // This gate counts switches because there is no per-switch correctness signal.
      count: 5,
      successMessage: 'Five switches in. Keep matching each attack.',
    },
    {
      kind: 'info',
      title: 'Done',
      body: "That's prayer switching. Watch the outline color and match your prayer to each attack.",
      continueLabel: 'Done',
    },
  ],
};
