import type { Coordinate } from '../../types/simulation';
import type { Tutorial } from '../types';

const YAMA_KIND = 'yama_p3';
const WAVE_LANE_PRESET = 'yama_p3_wave_cross';

// The four lane markers, north (back) to south (front, toward the incoming wave).
const LANE_TILES: Coordinate[] = [
  [30, 40],
  [30, 38],
  [30, 36],
  [30, 34],
];
const LANE_START: Coordinate = [30, 40];

const WAVES_ONLY_MECHANICS = {
  yamaMageRange: false,
  yamaMelee: false,
  waves: true,
  fireballs: false,
  voidFlares: false,
  infiniteHealth: true,
} as const;

export const yamaWavesTutorial: Tutorial = {
  id: 'yama-waves',
  title: 'Shadow Waves',
  description: 'Shadow waves sweep across the arena and hurt you on contact. Learn to run through them safely.',
  slug: 'shadow-waves',
  surface: 'encounter',
  difficulty: 'beginner',
  estimatedDurationMin: 3,
  availability: 'wip',
  encounterContext: { kind: YAMA_KIND, autoEnter: true },
  introVideoUrl: '/tutorials/yama/waves-intro.mp4',
  steps: [
    {
      kind: 'video',
      title: 'Shadow waves',
      body:
        'Yama sends shadow waves sweeping across the floor. ' +
        'Touching one hurts you, but you can run through the gap behind a wave as it passes.',
      videoUrl: '/tutorials/yama/waves-intro.mp4',
    },
    {
      kind: 'world-highlight',
      title: 'The dodge lane',
      body:
        "We've marked a lane of four tiles down the center, alternating " +
        '<b>teal</b> and <b>purple</b>. They are stepping stones: you stand on one ' +
        'and run to the next as a wave passes, so the colors swap with every step.<br><br>' +
        'Walk to the <b>teal</b> tile at the back of the lane to start.',
      target: { type: 'tile', tile: LANE_START },
      advanceOn: { type: 'player-on-target' },
      setup: [
        { type: 'reset' },
        { type: 'set-mechanics', mechanics: { ...WAVES_ONLY_MECHANICS } },
        { type: 'activate-tile-preset', presetId: WAVE_LANE_PRESET },
      ],
    },
    {
      kind: 'info',
      title: 'Run over the wave',
      body:
        "You're on the back tile. Watch the wave roll up the lane toward you.<br><br>" +
        'When it reaches the marker <b>four tiles in front of you</b>, click the next ' +
        "tile in the lane to run forward. You'll cross the wave's path just after it " +
        'sweeps past, so it passes harmlessly beneath you. Repeat from your new ' +
        'tile for the next wave.',
      highlight: { type: 'tiles', tiles: LANE_TILES },
    },
    {
      kind: 'checkpoint',
      title: 'Your turn',
      body:
        'Start on the back tile. Each time a wave reaches the marker four tiles ahead, ' +
        'click the next marker to run over it. Infinite health is on, so take your time.',
      seed: {
        encounterKind: YAMA_KIND,
        mechanics: { ...WAVES_ONLY_MECHANICS },
        activatePresetId: WAVE_LANE_PRESET,
      },
    },
    {
      kind: 'wait-for-event',
      title: 'Survive the waves',
      body: 'Run from marker to marker as each wave reaches the tile four ahead of you.',
      eventName: 'wave_activated',
      // `wave_activated` fires once per tick while a wave is on the floor. Counting
      // a full sweep makes this step complete as the floor clears, rather than
      // ending after the first few ticks.
      count: 55,
      successMessage: 'Nicely run.',
      setup: [{ type: 'reset' }, { type: 'activate-tile-preset', presetId: WAVE_LANE_PRESET }],
    },
    {
      kind: 'info',
      title: 'Done',
      body:
        "That's shadow waves. When a wave reaches the tile four ahead, run forward to " +
        'cross it just as it passes. The lane markers stay in Plugins → tile presets ' +
        'if you want to keep practicing.',
      continueLabel: 'Done',
    },
  ],
};
