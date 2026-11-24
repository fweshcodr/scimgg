import type { Tutorial } from '../types';

const YAMA_KIND = 'yama_p3';
const VOID_FLARE_COMMAND_ID = 'yama-spawn-void-flare' as const;

const FLARES_ONLY_MECHANICS = {
  yamaMageRange: false,
  yamaMelee: false,
  waves: false,
  fireballs: false,
  voidFlares: true,
  infiniteHealth: true,
} as const;

export const yamaVoidFlaresTutorial: Tutorial = {
  id: 'yama-voidflares',
  title: 'Void Flares',
  description: 'Orbs that Yama summons in the arena. Destroy them before they explode and damage you.',
  slug: 'void-flares',
  surface: 'encounter',
  difficulty: 'intermediate',
  estimatedDurationMin: 4,
  prerequisites: ['yama-basics'],
  availability: 'wip',
  encounterContext: { kind: YAMA_KIND, autoEnter: true },
  introVideoUrl: '/tutorials/yama/voidflares-intro.mp4',
  steps: [
    {
      kind: 'video',
      title: 'Void flares',
      body:
        'Yama spawns orbs called void flares. Click one to attack it and kill it before it explodes. ' +
        'If it pops, it deals damage no matter where you stand.',
      videoUrl: '/tutorials/yama/voidflares-intro.mp4',
    },
    {
      kind: 'wait-for-event',
      title: 'Kill it before it pops',
      body: 'Click the flare to attack it and kill it before it explodes.',
      eventName: 'voidflare_destroyed',
      count: 1,
      failEventName: 'voidflare_exploded',
      failPrompt: 'The flare exploded. Retry to try again.',
      successMessage: 'Clean kill!',
      // Setup runs before the subscription, so this spawned flare cannot satisfy the step.
      setup: [
        { type: 'reset' },
        { type: 'set-mechanics', mechanics: { ...FLARES_ONLY_MECHANICS } },
        { type: 'encounter-command', commandId: VOID_FLARE_COMMAND_ID },
      ],
    },
    {
      kind: 'checkpoint',
      title: 'Multiple flares',
      body: 'Now flares spawn on their own. Kill 2 in a row before any of them pop.',
      seed: {
        encounterKind: YAMA_KIND,
        mechanics: { ...FLARES_ONLY_MECHANICS },
      },
    },
    {
      kind: 'wait-for-event',
      title: 'Kill 2 flares cleanly',
      body: 'Kill both flares before they explode. Go for the one closest to popping first.',
      eventName: 'voidflare_destroyed',
      count: 2,
      failEventName: 'voidflare_exploded',
      failPrompt: 'A flare exploded. Try again from the checkpoint.',
      successMessage: 'Both down.',
    },
    {
      kind: 'info',
      title: 'Done',
      body: "That's void flares. Kill each one before it explodes, then carry on with the fight.",
      continueLabel: 'Done',
    },
  ],
};
