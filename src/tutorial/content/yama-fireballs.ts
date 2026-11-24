import type { Tutorial } from '../types';

const YAMA_KIND = 'yama_p3';

const FIREBALL_ONLY_MECHANICS = {
  yamaMageRange: false,
  yamaMelee: false,
  waves: false,
  fireballs: true,
  voidFlares: false,
  infiniteHealth: true,
} as const;

export const yamaFireballsTutorial: Tutorial = {
  id: 'yama-fireballs',
  title: 'Shadow Crash',
  description: 'Yama drops a line of fireballs on you that explode where they land. Practice dodging them.',
  slug: 'shadow-crash',
  surface: 'encounter',
  difficulty: 'intermediate',
  estimatedDurationMin: 5,
  prerequisites: ['yama-waves'],
  availability: 'wip',
  encounterContext: { kind: YAMA_KIND, autoEnter: true },
  introVideoUrl: '/tutorials/yama/fireballs-intro.mp4',
  steps: [
    {
      kind: 'video',
      title: 'Reading the fireballs',
      body:
        'Fireballs land in a line, then a diagonal, then the opposite line. ' +
        'They detonate on landing in an hourglass shape along the line, so step to the side of the middle one.',
      videoUrl: '/tutorials/yama/fireballs-intro.mp4',
    },
    {
      kind: 'checkpoint',
      title: 'Practice run',
      body: 'Dodge a few rounds of fireballs without getting hit.',
      seed: {
        encounterKind: YAMA_KIND,
        mechanics: { ...FIREBALL_ONLY_MECHANICS },
      },
    },
    {
      kind: 'wait-for-event',
      title: 'Dodge 9 fireballs',
      body:
        'Step to the side of the middle fireball before the line lands.<br><br>' +
        '<b>Tip:</b> step sideways. Each burst is three sets: a straight line, a diagonal, then a straight line the other way.',
      eventName: 'fireball_impact',
      count: 9,
      successMessage: 'Well dodged.',
    },
    {
      kind: 'info',
      title: 'Done',
      body:
        "That's fireballs. Watch the line of three come down and step to the side of the middle one.<br><br>" +
        '<b>Next:</b> the perfect dodge, which speeds up your next attack.',
      continueLabel: 'Done',
    },
  ],
};
