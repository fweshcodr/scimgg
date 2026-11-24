import type { GameEvent } from '../../core/events/types';
import type { MechanicsConfig } from '../../types/simulation';
import { PrayerType } from '../../types/simulation';
import type { Tutorial } from '../types';
import { clickPrayer, openPanelTab } from './cursorChoreography';
import { buildGuidedDrill } from './guidedDrill';

const YAMA_KIND = 'yama_p3';
const YAMA_ACTOR_ID = 'yama';
const VOID_FLARE_COMMAND_ID = 'yama-spawn-void-flare' as const;
const PLAYER_ACTOR_ID = 'player';

function isYamaBasicHitOnPlayer(event: GameEvent): event is Extract<GameEvent, { type: 'hit_applied' }> {
  return (
    event.type === 'hit_applied' &&
    event.targetId === PLAYER_ACTOR_ID &&
    (event.attackKind === 'magic_fire' || event.attackKind === 'range_shadow')
  );
}

const ATTACKS_ONLY: Partial<MechanicsConfig> = {
  yamaMageRange: true,
  yamaMelee: false,
  waves: false,
  fireballs: false,
  voidFlares: false,
  infiniteHealth: true,
};
const WAVES_ONLY: Partial<MechanicsConfig> = {
  yamaMageRange: false,
  yamaMelee: false,
  waves: true,
  fireballs: false,
  voidFlares: false,
  infiniteHealth: true,
};
const FIREBALLS_ONLY: Partial<MechanicsConfig> = {
  yamaMageRange: false,
  yamaMelee: false,
  waves: false,
  fireballs: true,
  voidFlares: false,
  infiniteHealth: true,
};
const FLARES_ONLY: Partial<MechanicsConfig> = {
  yamaMageRange: false,
  yamaMelee: false,
  waves: false,
  fireballs: false,
  voidFlares: true,
  infiniteHealth: true,
};

export const yamaBasicsTutorial: Tutorial = {
  id: 'yama-basics',
  title: 'Basics',
  description:
    'Learn the core mechanics of Yama Phase 3.\nStart here if you are a beginner to get a feel for the fight.',
  slug: 'basics',
  surface: 'encounter',
  difficulty: 'beginner',
  estimatedDurationMin: 8,
  encounterContext: { kind: YAMA_KIND, autoEnter: true, equipmentPresetKey: 'max-mage' },
  steps: [
    {
      kind: 'info',
      title: 'Welcome to Yama P3',
      body:
        'Yama Phase 3 has four things to deal with: <b>shadow waves</b>, <b>fireballs</b>, ' +
        '<b>void flares</b>, and his alternating magic/range attacks.<br><br>' +
        "We'll add them one at a time so you can learn each on its own.",
    },
    {
      kind: 'info',
      title: 'Meet Yama',
      body:
        'Yama stays in the <b>center of the arena</b> the whole phase.<br><br>' +
        "We'll learn the fight from a <b>mage perspective</b> first so you can ignore his melee. " +
        "We'll cover meleeing phase 3 later.",
      highlight: { type: 'npc', actorId: YAMA_ACTOR_ID },
    },

    ...buildGuidedDrill({
      encounterKind: YAMA_KIND,
      mechanics: ATTACKS_ONLY,
      // Magic-first keeps the demo and practice instructions aligned.
      openingCommandId: 'yama-opening-magic',
      explain: {
        title: "Yama's Basic Attacks",
        body:
          'Yama attacks you constantly, <b>alternating magic and ranged</b>. ' +
          'Pray <b>Protect from Magic</b> for fire and <b>Protect from Missiles</b> for shadow, ' +
          'swapping each attack.<br><br>' +
          'A <b>fire</b> animation flashes on you just before a magic hit; a <b>shadow</b> ' +
          'animation means ranged. Pray for whichever you see.<br><br>' +
          "<b>In game:</b> Yama's first phase-3 attack matches the color of the <b>northern glyphs</b>, " +
          'so you can note them in the earlier phases. This sim starts at phase 3, so its first attack is random.',
        highlight: { type: 'npc', actorId: YAMA_ACTOR_ID },
      },
      demo: {
        title: "Watch: Yama's Basic Attacks",
        body:
          'No input needed. Watch the cursor open the prayer book and switch prayers ' +
          "to match each attack, then you'll try it.",
        // Click prayers one tick before their attacks so they are active when the animation begins.
        // Yama's magic attack starts at tick 11 and ranged at tick 18 (constants.ts).
        cursor: {
          cues: [
            openPanelTab('prayer', { kind: 'ms', ms: 900 }, { label: 'Open the prayer book' }),
            clickPrayer(PrayerType.ProtectMagic, 10, { label: 'Fire attack\nProtect from Magic' }),
            clickPrayer(PrayerType.ProtectRange, 17, { label: 'Shadow attack\nProtect from Missiles' }),
          ],
          caption: {
            rows: [
              { cue: 'Fire', tone: 'fire', prayer: 'Protect from Magic' },
              { cue: 'Shadow', tone: 'shadow', prayer: 'Protect from Missiles' },
            ],
          },
        },
        // Seek to 5 so the first prayer glide starts after the 900ms book-open and its icons have rendered.
        // 5 + 19 ends at engine tick 24, just past the ranged hit at tick 21.
        fastForwardToTick: 5,
        stopAtTickOffset: 19,
      },
      ready: {
        title: 'Your turn',
        body:
          'Pray correctly against <b>two attacks in a row</b> to pass. ' +
          'In this practice, he will start with a <b>Magic</b> attack (the <b>fire</b> animation), so get ready to pray <b>Magic</b> first!',
        continueLabel: 'Start',
      },
      practice: {
        title: 'Two in a row',
        body: 'Pray correctly against <b>two attacks in a row</b>. Miss one and the streak resets.',
        // Both gates read the same hit_applied event: a wrong or absent prayer arrives with
        // prayedCorrectly:false and resets the streak instead of ending the drill.
        eventName: 'hit_applied',
        matcher: (e) => isYamaBasicHitOnPlayer(e) && e.prayedCorrectly === true,
        count: 2,
        failEventName: 'hit_applied',
        failMatcher: (e) => isYamaBasicHitOnPlayer(e) && e.prayedCorrectly === false,
        failResetsProgress: true,
        successMessage: 'Two in a row. That swap is the pattern for his basic attacks.',
      },
    }),

    ...buildGuidedDrill({
      encounterKind: YAMA_KIND,
      mechanics: WAVES_ONLY,
      explain: {
        title: 'Shadow Waves',
        body:
          'Yama sends <b>shadow waves</b> sweeping across the floor. ' +
          'Step over a wave just before it reaches you to avoid the damage.',
      },
      ready: {
        title: 'Ready?',
        body:
          'Waves will sweep across the floor. Step over each one just as it reaches you.<br><br>' +
          "Infinite health is on. Press <b>Start</b> when you're ready.",
        continueLabel: 'Start',
      },
      practice: {
        title: 'Survive the waves',
        body: 'Step over each wave as it reaches you.',
        eventName: 'wave_activated',
        // wave_activated fires once per tick a wave is on the floor, so this counts ticks, not waves.
        // wait-ticks skips wave set 0; 18 counted ticks finish just after the last remaining set.
        count: 18,
        successMessage: 'Nicely dodged.',
        extraSetup: [{ type: 'wait-ticks', ticks: 30 }],
      },
    }),

    ...buildGuidedDrill({
      encounterKind: YAMA_KIND,
      mechanics: FIREBALLS_ONLY,
      explain: {
        title: 'Fireballs',
        body:
          'Yama drops <b>fireballs</b> that land in a line of three on the floor. ' +
          'They detonate the moment they hit the ground, and each blast spreads out in an ' +
          '<b>hourglass</b> shape along that line.<br><br>' +
          'Dodge by stepping <b>to the side</b> of the middle fireball. One tile off the line is enough.',
      },
      ready: {
        title: 'Ready?',
        body:
          'Fireballs will drop in a line of three. Step to the side of the middle one before they land.<br><br>' +
          "Infinite health is on. Press <b>Start</b> when you're ready.",
        continueLabel: 'Start',
      },
      practice: {
        title: 'Dodge the fireballs',
        body: 'Step to the side of the middle fireball before the line detonates.',
        eventName: 'fireball_impact',
        // Three impacts complete one fireball burst.
        count: 3,
        successMessage: 'Well done.',
      },
    }),

    ...buildGuidedDrill({
      encounterKind: YAMA_KIND,
      mechanics: FLARES_ONLY,
      explain: {
        title: 'Void Flares',
        body:
          'Yama spawns <b>void flares</b>: orbs that explode if you leave them alone, hitting you ' +
          'wherever you stand. In phase 3 each flare spawns at half health, <b>71 of 140 HP</b>.<br><br>' +
          'He spawns <b>two</b> on a fixed cycle, and <b>one</b> more each time he uses his melee attack.<br><br>' +
          'Magic and standard ranged attacks always deal <b>max damage</b> to flares, so a max hit of ' +
          '71 or more kills one outright. Aim for <b>one shot</b>: a special attack such as the purging staff, ' +
          'with <b>Mark of Darkness</b> active and a <b>saturated heart</b> if you have one.',
      },
      ready: {
        title: 'Ready?',
        body:
          'Two <b>void flares</b> will appear. Click each one to attack it and destroy it before ' +
          "it bursts.<br><br>Infinite health is on. Press <b>Start</b> when you're ready.",
        continueLabel: 'Start',
      },
      practice: {
        title: 'Kill 2 flares before they explode',
        body: 'Click each flare to attack it and kill it before it explodes.',
        eventName: 'voidflare_destroyed',
        count: 2,
        failEventName: 'voidflare_exploded',
        failPrompt: 'A flare exploded! Retry to try again.',
        successMessage: 'Two flares cleared.',
        // Spawn immediately instead of waiting for the natural tick-60 beat.
        // These additive spawns run after the ready seed without resetting it.
        // The practice subscription attaches after setup, so these spawns do not pre-tick the counter.
        extraSetup: [
          { type: 'encounter-command', commandId: VOID_FLARE_COMMAND_ID },
          { type: 'encounter-command', commandId: VOID_FLARE_COMMAND_ID },
        ],
      },
    }),

    {
      kind: 'info',
      title: 'Put it together',
      body:
        "That's the full P3 mechanic set: attacks, waves, fireballs, and flares.<br><br>" +
        'To keep practicing, <b>jump into the simulator</b> with <b>infinite health (god mode)</b> on ' +
        "so you can't die, and toggle mechanics on and off in the settings or the Practice " +
        'controls to add them back one at a time.<br><br>' +
        "Exit training from the tutorial menu whenever you're ready. Good luck!",
      continueLabel: 'Done',
    },
  ],
};
