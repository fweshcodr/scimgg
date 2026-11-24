import type { EncounterControls } from '../../core/encounters/types';
import { getMonsterHp } from '../../data/monsterData';
import { ZUK_DEBUG_ACTIONS } from './commands';

export const ZUK_SCOPE_NOTES = [
  'Automatic: glyph patrol and shadow protection; Zuk hybrid blasts and enrage cadence; player combat against final-wave NPCs.',
  'Automatic: one Jad below 480 HP, four enrage healers below 240 HP, three Jad healers at half HP. Phase triggers latch on player hits; the strict Zuk thresholds are a simulator model, not capture-proven equality behavior.',
  "Automatic: sets (zukSets, on by default). The opening set lands 72 ticks after the current start (one observation) and each later set 350 ticks after the previous one. Once Zuk first drops below 600 HP the clock pauses; Jad's spawn resumes it with 175 ticks added once, after which it repeats every 350 ticks for the rest of the fight. Sets accumulate beside surviving actors: no population cap is modeled. Switching the toggle off freezes the clock and switching it back on continues it; showing, replacing or clearing layouts never re-arms it.",
  'Automatic: a skipped opening set follows simulator policy, since the capture never shows one. If Zuk drops below 600 HP before the opening set is admitted, the surviving clock is the ordinary 350-tick period with the elapsed opening time already spent, so the next set lands 525 ticks after Jad minus that elapsed time. The exact epoch is not capture-proven.',
  'Automatic: one path the capture never shows stays unsupported rather than guessed. If healing lifts Zuk above 600 HP while the clock is paused before Jad, the scheduler admits no further sets and publishes no countdown. Healing back to exactly 600 HP keeps the pause.',
  'Automatic: healing. Enrage healers cast at Zuk every 3 ticks and each heal lands 4 ticks after its cast; they heal 15 to 24 HP with an explicitly modeled uniform seeded draw. Jad healers heal Jad for a fixed 10 HP every 4 ticks under the packet-fit model, but only while untagged and adjacent: a tagged Jad healer pursues and melees without healing (Inferno JalTok-Jad rule, unlike Fight Caves).',
  'Jad healer layout: three distinct random tiles in the 3x4 box north of Jad, toward Zuk, never on the player. The box is fitted to six captured healers, not a verified rule. Jad and children are removed six ticks after Jad death (one observation).',
  'Minion combat: magers and rangers open on the glyph and switch to the player when attacked, including failed spells. Both damage their target every 4 ticks. Configured reach is 15 tiles for magers and 16 for rangers, not measured final-wave maxima.',
  'Healer combat: Jad healers pursue and melee after individual engagement. Tags persist regardless of distance while the player is alive and present; a dead or missing player permits return to their living parent along a modeled direct path. Distance-based Inferno resets are not modeled without specific evidence, not ruled out in the real game. Enrage healers stop new healing casts when tagged and launch three damaging sparks every 3 ticks after their one-tick recovery.',
  'Minion combat: set members use standard half-speed flinching with separate opening guards; Jad retargets without rephasing. They reacquire the player on their next action if their target dies or disappears. Jad damages the glyph or the player. Ranged and magic cues repeat every 8 ticks; melee recovery is 4 ticks. Ranged/magic protection is checked 3 ticks after the cue, an observable policy rather than an established internal rule.',
  'Jad model: seeded equal magic/ranged choices at distance, equal choices among all three styles in melee range, an 8-tick opening and provisional 15-tile reach. Jad uses standard NPC pursuit and overlap escape. These choices are simulator models, not proved game rules.',
  'Manual: show, replace and clear recorded NPC layouts. Demonstrations add inert visual-only actors with forced styles, no damage and no healing. The Jad ranged demonstration remains animation-only.',
  'Manual: the set-timer overlay (zukSetTimer) is a player-driven clock kept separate from the encounter scheduler. It never reads the published countdown: keeping that clock yourself is the skill being practiced.',
  'Sparks: automatic volleys and the replayable emit-spark-volley command share the same landing queue. Each spark lands at cast+3 and damages the player within one tile, before movement. Landings survive source death, removal and Clear minions; reset or boss defeat clears them. Automatic targets follow three overlapping strips in a source-relative 7x4 area, with explicitly modeled seeded sampling and off-row behavior.',
  'Presentation: attacks, identified hurt/death sounds and healer casts play through event audio. Rangers emit two projectiles with an approximate facing-relative launch model. Live healing shows one parent graphic per application tick. Nonlethal hits trigger configured defend clips; unknown sounds remain silent. Existing spawn, glyph reaction and mager impact effects remain active.',
  'Presentation models: NPC hurt sounds play per resolved hit, including zero and burn damage, but not healing. Enrage-healer deaths play their identified sound. Exact distance suppression and exceptional sound multiplicity remain unverified. Ranger projectiles use a bounded launch-position model.',
  'Unavailable: natural regeneration, exact muzzle rules and Jad impact graphic 157, whose height is unresolved. Unidentified sounds remain silent rather than using invented IDs.',
  "Glyph model: 600 HP, level-one zero-bonus defense inputs, real minion damage and immunity to Zuk blasts. Its death stops patrol and removes protection; Zuk keeps attacking on his existing cadence. There is no automatic replacement, and the player cannot attack the glyph. Reset glyph restores 600 HP at the patrol center without stealing existing player aggro, and pre-enrage also reconciles Zuk's cast clock to the shield's fresh spawn tick so his cadence stays phase-locked to it; an already-enraged clock is left untouched rather than silently slowed.",
  'Product behavior: boss defeat enters a six-tick resolving phase before victory; deterministic seeds let a reset with the same seeds reconstruct the same run. No game corpse-retention duration is asserted.',
  "Practice phases: Start restores full Zuk HP; Pre-Jad starts at 480 HP and Pre-Healers at 240 HP with Jad already cleared. No minions are spawned until the player crosses the next threshold. Every selection clears old minions, NPC hits and queued sparks and reconciles Zuk's cast clock to the shield's own spawn tick, so his cadence always stays phase-locked to wherever the shield actually is - discarding any real enrage-speed history, zukAttacks toggle staleness or prior manual reset drift. A living glyph is healed without changing its position, direction or patrol clock; a dead or missing glyph is recreated at the patrol center in the run's remembered direction. Player state, equipment, mechanics toggles and random streams are preserved. Start resets the set clock to 72 ticks; Pre-Jad pauses at 350 until Jad adds 175; Pre-Healers uses a 525-tick baseline with that bonus already applied. These are practice setups, not reconstructed fight histories; the raw HP slider never enters a phase.",
] as const;

export function buildZukControls(): EncounterControls {
  const maxHp = getMonsterHp(7706);
  if (maxHp === undefined) throw new TypeError('Missing Zuk monster HP');
  return {
    bossHpPresets: [
      {
        label: 'Start',
        hp: maxHp,
        hint: 'Full health, no minions. Heals the shield in place and restarts the opening set timer.',
      },
      { label: 'Pre-Jad', hp: 480, hint: 'No minions. Damage Zuk to spawn Jad. Heals the shield in place.' },
      { label: 'Pre-Healers', hp: 240, hint: 'Jad cleared. Damage Zuk to spawn healers. Heals the shield in place.' },
    ],
    defaultMechanicsConfig: {
      infiniteHealth: false,
      zukAttacks: true,
      zukSets: true,
      zukSetTimer: false,
      zukShieldSafeTiles: false,
      zukShieldStart: 'random',
    },
    mechanicsToggles: [
      {
        key: 'zukShieldStart',
        label: 'Starting Shield Direction',
        setup: true,
        choices: [
          { value: 'random', label: 'Random' },
          { value: 'left', label: 'Left', icon: 'left' },
          { value: 'right', label: 'Right', icon: 'right' },
        ],
        info: 'Left and right as seen facing Zuk. Applies from your next attempt.',
      },
      { key: 'zukAttacks', label: 'Zuk Attacks' },
      {
        key: 'zukSets',
        label: 'Mager/Ranger Sets',
        info: 'Automatically spawns mager and ranger sets during the fight.',
      },
      {
        key: 'zukSetTimer',
        label: 'Set Timer',
        group: 'aid',
        setup: true,
        info: 'Manually track when the next set spawns.',
      },
      {
        key: 'zukShieldSafeTiles',
        label: 'Shield Safe Tiles',
        group: 'aid',
        info: 'Green shows shield coverage for the next tick. Your true tile must already be inside before Zuk checks; moving in afterward cannot block a blast already aimed at you. Zuk attacks only.',
      },
    ],
    debugActions: ZUK_DEBUG_ACTIONS,
  };
}
