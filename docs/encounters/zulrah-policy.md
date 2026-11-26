# Zulrah — simulator policy

Where the [facts spec](./zulrah-facts-spec.md) runs out, the simulator decides. Each decision below
is listed with its reason; the full register, with what would settle each, is the
[open questions](./zulrah-open-questions.md). Change a policy only with evidence, and move the fact
into the facts spec when it is settled.

## General rule

Where the wiki gives a word, not a number ("several seconds", "much more frequently", "chosen at
random"), the simulator takes a plain value that fits the word, keeps it in one named constant, and
labels it POLICY beside the code. Where a gameval name exists for an id, the id is used only for the
thing the name describes.

## Decisions

- **Form changes**: Zulrah is one actor for the fight. It dives, is hidden underwater (the NPC
  `hidden` flag; the renderer skips it and rebuilds its model on a type change), and transforms into
  its next form at its next spot, so its HP and hits still in flight carry across.
- **Opening**: Zulrah waits underwater until the player's first action (moving, picking a target or
  lighting a prayer stand in for "continues the dialogue or performs an action"), rises over 4 ticks,
  and waits 12 more before its first barrage (a value from play, pending a video measurement).
- **Timings** are built from fixed pieces, never fitted to an overall pace: every turn (attack, tail
  stare, cloud barrage, snakeling orb) takes Zulrah's 3-tick attack speed, each phase has its listed
  turns, and every form change is dive 2 (SINKFAST), underwater 2, emerge 2 (EMERGEFAST) and a 3-tick
  pause before the first turn. The opening is a 4-tick rise and a 12-tick pause.
- **Tail**: slam 6 ticks after the stare starts, 3x3 area, 5-tick stun. Zulrah faces the locked tile
  until the slam. The stun (`playerStunned`) blocks moving and attacking only, as the wiki's stun
  status page describes, and shows the generic STUNNED graphic. Animations alternate TAIL_LEFT and
  TAIL_RIGHT.
- **Clouds**: 2 per barrage, 3-tick flight, 30-tick life, 1–5 typeless a tick; 8 fixed island sites
  that leave the arm tips clear. A 4-barrage phase fills all 8 in order, south base first and the
  arms last, so a player can run up an arm; other barrages land first on the site nearest the player.
- **Loadouts**: the wiki's five inventory setups slot for slot, plus a Twisted bow variant of Ranged
  Only, with the substitutions in the open questions.
- **Snakelings**: orb lands 3 ticks later, 1–3 tiles from the player; 50/50 style; first attack 3
  ticks after landing; magic reaches 7 tiles; 25% venom chance per attack.
- **Blue** attacks with magic 75% of the time; **rotations** are equally likely.
- **Projectiles**: 1045 ranged, 1044 cloud orb, 1046 magic, all on the generic magic-spell flight.
- **Venom immunity**: the engine keeps one poison/venom immunity timer, so each anti-venom grants its
  venom duration (45 s, 216 s, 378 s) for both.
- **Arena**: the island crosses into map square 35_48, so the engine accepts any tile inside the
  arena's bounds (`isInTileSpace`), not only the core square's 0–63.
  The renderer's terrain heights cover that square too (`composeTerrainHeights`), so actors on
  the arms stand on the ground.
