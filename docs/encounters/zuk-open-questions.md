# TzKal-Zuk — what is still unsettled

Each entry: what is unknown, what the encounter does meanwhile, and the evidence that would settle
it. Facts and citations are in the [facts spec](./zuk-facts-spec.md); simulator stand-ins are in the
[policy](./zuk-policy.md). New observations must discriminate between candidates; repeating the same
narrow scenario may not. More samples can estimate a distribution, not recover a hidden RNG; a
developer statement would outrank a convenient uniform model.

## 1. Glyph destruction — no observation

Neither wave-69 capture records the glyph's destruction (W69 ends in player defeat, T in Zuk's
death), so Zuk's next cast and target, existing flights, minion reacquisition and any replacement are
unobserved. The Wiki says only that destruction exposes the player. Meanwhile: [policy](./zuk-policy.md#glyph-damage-and-destruction). The glyph's defence,
damage taken from rangers or Jad, and the health-bar inconsistency (facts § 8) are likewise open.

**Would settle it:** a minion destroying the glyph in the normal and the enraged phase, including
while a Zuk blast is in flight, with one untouched glyph-targeted minion and one already on the
player, showing the lethal hit, the glyph's sequence and removal, Zuk's casts around it and every
projectile's target.

## 2. Set schedule branches — opening, skipped opening, recovery, cap

- **Opening anchor (`n=1`).** Control + 72 and actor-add + 80 both fit; so might patrol coupling.
  Do not add an "endpoint minus one" rule (endpoint t99, set t98). Would settle it: independent runs
  with different glyph directions and login histories, each showing actor creation, control, glyph
  moves and first-set creation.
- **Skipped opening.** No capture skips the opening set. Candidates, with S = fight start,
  P = early pause, O = scheduled opening, J = Jad spawn:

  | Candidate | Deadline |
  |---|---|
  | Fresh repeat + extension | J + 525 |
  | Subtract actual elapsed (simulator policy) | J + 525 − (P − S) |
  | Subtract scheduled opening | J + 525 − (O − S) |

  Simulator policy; the captures do not distinguish these alternatives. Anonymous community
  accounts conflict; the most specific one times a rounded video interval (about 4:35, 458 ticks, from
  Jad to the set) that fits the second row but does not verify it.
- **Same-tick suppression.** An unverified community report says a hitsplat on the scheduled tick
  prevents the opening set; another report is a possible counterexample. Not modeled.
- **Recovery above 600 before Jad** (unsupported in the simulator) and **a downward re-crossing after
  post-enrage healing**: unobserved.
- **Population cap.** Unverified, mutually inconsistent community reports describe a cap on live set
  NPCs (not lifetime sets). None is modeled; counted classes, partial pairs and release of a blocked
  deadline are unknown.

**Would settle it:** runs that cross below 600 at different early times and wait past Jad for the
delayed set; a run that regenerates through 601+ before Jad; and live magers accumulated, with every
actor counted around a due tick and around Jad.

## 3. 480/240 equality and the enrage offset

The capture skips both equality values; the strict rule is simulator policy, not proven. The single
enrage transition fits both last-cast + 7 (the simulator's) and threshold + 1. **Would settle it:**
the exact varbit 5653 held at 480 then 479, and at 240 then 239 (not estimated from XP or
headbars); crossings of 240 at different phases of the 10-tick cycle, including late in it.

## 4. Spark generator — one window, one player row

Supported: cast + 3 landings, pre-movement 3×3 damage, survival after source removal. Open: the
random law within a strip, behavior off the recorded row (fixed, player- or healer-relative bounds),
a horizontal threshold versus a bearing rule, internal draw order, damage modifiers, stacking on an
identical center, and whether a volley on the visible death-sequence tick was committed before the
server's death tick. The damage fit is pre-movement, so there is no landing-tick escape. One window
is one sample of the process, not 270 samples: do not infer a batch-size distribution.

**Would settle it:** stationary segments on several north/south rows, horizontal offsets of 2 and 3 at
different depths, crossings of the direction boundaries, deliberate exposure to identical centers,
and repeated stationary eligible positions across fresh attempts.

## 5. Healer rules

- **Enrage-healer expiry**: all four were killed; no expiry is observed or modeled. Would settle it:
  healers left alive past the observed windows, with their removal told apart from parent death or
  instance cleanup.
- **Heal distributions**: both species' samplers (uniform 15-24, fixed 10) are models. Also unknown:
  heals at full parent HP and the fate of a cast heal when its caster dies.
- **Jad-healer aggro**: an untagged healer's approach is constrained by captures; distance-based
  loss of a player tag and the ensuing return remain unobserved, as do underfoot and unreachable
  cases and whether a tagged adjacent Yt-HurKot keeps healing (Yt-HurKot article versus the TzTok-Jad
  paragraph; untouched peers healing does not settle it).
- **Tagged Jal-MejJak attack refusal**: onset, duration, ordinary versus special attacks, rejection
  versus queued intent. The one W69 sample (a repeat special accepted one tick after the first hit,
  facts § 6) is a bound, not proof of a one-tick rule or of equal ordinary and special behavior.
  Meanwhile: the one-tick first-engagement [lockout](./zuk-policy.md#healing). **Would settle
  it:** stationary ordinary blowpipe attacks with no eating or switches, with every click through the
  turn, then special attacks separately.

## 6. Jad healer placement — `n=2`

Two batches for Jad at `[30,35]`, three healers each, every one north of Jad on a distinct tile:
W69 t877 `[30,41]`, `[31,40]`, `[30,40]` (lines 14955-14960); tbow t300 `[32,40]`, `[30,43]`,
`[31,40]` (tbow lines 9224-9229). The two batches exclude one fixed pack. Both fit
[JalTok-Jad](https://oldschool.runescape.wiki/w/JalTok-Jad)'s "always spawn north of it". 4 of the 6
are adjacent to Jad, unlike waves 67-68 (0 of 28; [Inferno open questions](./inferno-open-questions.md)
C15). The simulator uses a separate north-box model for wave 69; the generating rule is unknown. All
six lie in x 30-32, y 40-43, the box the [policy](./zuk-policy.md#jad-healer-placement) draws from;
that box is fitted to these six samples. Whether x 33-34 (Jad's east columns) or rows farther north
are possible is unknown. **Would settle it:** more wave-69 Jad healer spawns; a healer outside the
box widens it.

## 7. Natural regeneration

Not implemented. Twelve +1 steps, the last two 103 and 98 apart; no full-HP observation. **Would
settle it:** another full wave-69 run, especially one reaching enrage at a different time.

## 8. Set-member opening, flinch and reach

The +6/+8 opening guards reproduce the recordings but are not proven floors, and every W69 tag hits
the same mager cadence phase. Splash engagement of set members, tags at other phases of the 4-tick
glyph-attack cycle, and whether a pulled mager returns to the glyph are unobserved, as are melee
selection and W69 pursuit; the true W69 reach is unknown. **Would settle it:** tags at spawn +
0/+1/+2 and at all four phases of the glyph-attack cycle, with short and long flights and verified
splashes, then after controlled idle intervals; cardinal, diagonal and overlap positions and blocked
paths; W69 gaps of 14-17+ separately by species.

## 9. Jad selector and opening

Style weights, melee priority, underfoot behavior, the untouched opening, W69 range and cancellation
before release are unpublished and unobserved. **Would settle it:** untouched glyph attacks, repeated
styles, adjacency and range-boundary cases.

## 10. Presentation and terminal effects

- Exporter semantics for omitted `height`/`delay` fields (157, 451, 659) and the ranger muzzle rule.
- Delivery rule for the incoming-hit sound families (do not hard-code a radius) and graphic 444
  client-slot replacement.
- Intra-tick order of Zuk's attack, heals and set spawns; whether a due set spawns on a below-600
  crossing tick is observable.
- What Zuk's death does to minions and player-targeted flights still present. T's kill (t590→591)
  has no Zuk shot in flight to the player, so it does not settle the in-flight case.
