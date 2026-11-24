import type { Tutorial } from '../types';

const YAMA_KIND = 'yama_p3';

const PERFECT_DODGE_MECHANICS = {
  yamaMageRange: false,
  yamaMelee: false,
  waves: false,
  fireballs: true,
  voidFlares: false,
  infiniteHealth: true,
} as const;

export const yamaPerfectDodgeTutorial: Tutorial = {
  id: 'yama-perfect-dodge',
  title: 'Perfect Dodge',
  description:
    'Stand one tile to the side of a fireball line with Mark of Darkness active to dodge it and pull your next attack a tick earlier.',
  slug: 'perfect-dodge',
  surface: 'encounter',
  difficulty: 'advanced',
  estimatedDurationMin: 6,
  prerequisites: ['yama-fireballs'],
  availability: 'wip',
  encounterContext: { kind: YAMA_KIND, autoEnter: true },
  introVideoUrl: '/tutorials/yama/perfect-dodge-intro.mp4',
  steps: [
    {
      kind: 'video',
      title: 'What is a perfect dodge?',
      body:
        'With <b>Mark of Darkness</b> active, standing exactly <b>1 tile to the side of the middle fireball</b>, ' +
        'square on to the line the three fireballs form, makes your next attack come one tick sooner.',
      videoUrl: '/tutorials/yama/perfect-dodge-intro.mp4',
    },
    {
      kind: 'info',
      title: 'The setup',
      body:
        'You need:<br>' +
        "• <b>Mark of Darkness</b> active (we'll cast it for you)<br>" +
        '• To stand <b>1 tile from the middle fireball</b>, at a right angle to the line of three, never on it<br><br>' +
        'The lit tiles show where the fireballs land. Only two tiles count, one on each side of the middle fireball.',
    },
    {
      kind: 'checkpoint',
      title: 'Try a perfect dodge',
      body: 'Land 3 perfect dodges in a row. A yellow flash means you got it.',
      seed: {
        encounterKind: YAMA_KIND,
        mechanics: { ...PERFECT_DODGE_MECHANICS },
      },
    },
    {
      kind: 'wait-for-event',
      title: '3 perfect dodges',
      body: 'Stand exactly 1 tile to the side of the line, level with the middle fireball. Keep Mark of Darkness up, recasting it if it expires.',
      eventName: 'yama_perfect_dodge',
      count: 3,
      successMessage: 'Three in a row.',
      // The preceding checkpoint resets the encounter and applies
      // PERFECT_DODGE_MECHANICS via its seed. Cast Mark of Darkness here so
      // it lands on the freshly-seeded state, and so it re-runs on retry.
      setup: [{ type: 'cast-mark-of-darkness' }],
    },
    {
      kind: 'info',
      title: 'Done',
      body:
        "That's the perfect dodge. Keep Mark of Darkness up and step to the side of each line " +
        'to pull your attacks a tick earlier through the fight.',
      continueLabel: 'Done',
    },
  ],
};
