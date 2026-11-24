import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { createQueue, type NpcMesh3DCommand } from '../../../render/core/commands';
import { FLOOR_EFFECT_DEPTH_BIAS } from '../../../render/effects/spotAnimRenderPolicy';
import { SceneObjectRenderer } from '../../../render/graphics/SceneObjectRenderer';
import type { FightStartCountdownPhase, SceneObjectFrameContext } from '../../../render/graphics/sceneObjectTypes';
import { LocModelType } from '../../../rs/config/loctype/LocModelType';
import { openTestCache } from '../../../test/helpers/cacheFixtures';
import { yamaSnapshot, zukSnapshot } from '../../../test/helpers/encounterSnapshot';
import {
  findProjectCacheZip,
  REAL_CACHE_TEST_TIMEOUT_MS,
  skipWithoutRealCache,
} from '../../../test/helpers/real-cache';
import type { Coordinate, SimulationState } from '../../../types/simulation';
import { encounterControlsForKind } from '../../modules';
import { YAMA_CONTRACTS } from '../contracts';
import { buildYamaControls } from '../controls';
import { YAMA_ENCOUNTER_RENDER_CONFIG } from '../renderConfig';
import { YamaEncounter } from '../YamaEncounter';
import {
  YAMA_FIRE_GLYPH_DEACTIVATE_LOC_ID,
  YAMA_FIRE_GLYPH_LOC_ID,
  YAMA_GLYPH_DEACTIVATE_TICKS,
  YAMA_GLYPH_HINT_OPACITY,
  YAMA_OPENER_COLOUR_GLYPH_TILES,
  YAMA_OTHER_COLOUR_GLYPH_TILES,
  YAMA_SHADOW_GLYPH_DEACTIVATE_LOC_ID,
  YAMA_SHADOW_GLYPH_LOC_ID,
  YamaSceneObjectController,
} from '../YamaSceneObjectController';

const BASE_STATE = new SimulationEngine({ encounter: new YamaEncounter(undefined, 1), combatSeed: 1 }).getState();

function stateWith(opener: 'magic' | 'range', hint = true): SimulationState {
  return {
    ...BASE_STATE,
    encounter: yamaSnapshot({ state: { firstRangeMageType: opener } }),
    mechanicsConfig: { ...BASE_STATE.mechanicsConfig, yamaStartGlyphs: hint },
  };
}

function frame(
  state: SimulationState,
  fightStartCountdown: FightStartCountdownPhase | undefined,
  interpolatedTick: number,
): SceneObjectFrameContext<SimulationState> {
  return {
    currentTick: Math.floor(interpolatedTick),
    interpolatedTick,
    state,
    terrainHeights: null,
    ...(fightStartCountdown ? { fightStartCountdown } : {}),
  };
}

const tileKey = ([x, y]: Coordinate) => `${x},${y}`;

/** locId by SW tile, for comparing placements without caring about list order. */
function placements(specs: ReturnType<YamaSceneObjectController['update']>): Record<string, number | undefined> {
  return Object.fromEntries(
    specs.map((spec) => [tileKey([spec.data?.localX ?? -1, spec.data?.localY ?? -1]), spec.data?.locId]),
  );
}

function expectedPlacements(openerLoc: number, otherLoc: number): Record<string, number> {
  return Object.fromEntries([
    ...YAMA_OPENER_COLOUR_GLYPH_TILES.map((tile) => [tileKey(tile), openerLoc]),
    ...YAMA_OTHER_COLOUR_GLYPH_TILES.map((tile) => [tileKey(tile), otherLoc]),
  ]);
}

describe('Yama start glyphs toggle', () => {
  it('is an off-by-default practice aid kept with the setup choices, on the base fight and every contract', () => {
    const toggle = buildYamaControls().mechanicsToggles.find(({ key }) => key === 'yamaStartGlyphs');
    expect(toggle).toEqual({
      key: 'yamaStartGlyphs',
      label: 'Show Glyphs at Start',
      group: 'aid',
      setup: true,
      // Each glyph's word on the game's hue for it, toned to the card's palette (see controls.ts).
      info: expect.arrayContaining([
        { text: 'purple', color: '#b58cd9' },
        { text: 'orange', color: '#dd8d4b' },
      ]),
    });
    for (const kind of new Set(YAMA_CONTRACTS.map((contract) => contract.encounterKind))) {
      const controls = encounterControlsForKind(kind);
      expect(controls?.defaultMechanicsConfig.yamaStartGlyphs, kind).toBe(false);
      expect(
        controls?.mechanicsToggles.some(({ key }) => key === 'yamaStartGlyphs'),
        kind,
      ).toBe(true);
    }
  });

  it('changes nothing in the simulation: a fight with it on matches one with it off, tick for tick', () => {
    const run = (hint: boolean) => {
      const engine = new SimulationEngine({
        encounter: new YamaEncounter(undefined, 1234),
        combatSeed: 5,
        startPos: [31, 37],
      });
      engine.setMechanicsConfig({ ...engine.getMechanicsConfig(), infiniteHealth: true, yamaStartGlyphs: hint });
      const ticks: unknown[] = [];
      for (let tick = 0; tick < 40; tick++) {
        engine.advanceTick([31, 37]);
        const { mechanicsConfig: _config, ...state } = engine.getState();
        ticks.push({ state, events: engine.getLastTickEvents() });
      }
      return ticks;
    };
    const on = run(true);
    expect(on).toEqual(run(false));
    // The run reached the fight, so the comparison covered Yama attacking.
    expect(JSON.stringify(on)).toContain('"lastAttackKind":"');
  });
});

describe('YamaSceneObjectController', () => {
  it('is registered as the Yama render config controller', () => {
    expect(YAMA_ENCOUNTER_RENDER_CONFIG.createSceneObjectController?.()).toBeInstanceOf(YamaSceneObjectController);
  });

  it.each([
    ['range', YAMA_SHADOW_GLYPH_LOC_ID, YAMA_FIRE_GLYPH_LOC_ID],
    ['magic', YAMA_FIRE_GLYPH_LOC_ID, YAMA_SHADOW_GLYPH_LOC_ID],
  ] as const)('holds the start glyphs for a %s opener: the opener color north and south', (opener, openerLoc, otherLoc) => {
    const controller = new YamaSceneObjectController();
    const specs = controller.update(frame(stateWith(opener), 'holding', 1));

    expect(specs).toHaveLength(5);
    expect(placements(specs)).toEqual(expectedPlacements(openerLoc, otherLoc));
    expect(new Set(specs.map((spec) => spec.id)).size).toBe(5);
    for (const spec of specs) {
      expect(spec.meshId).toBe(spec.id);
      expect(spec.lifecycle).toEqual({ kind: 'sync' });
      expect(spec.classification).toBe('groundDecal');
      expect(spec.style).toEqual({ depthBias: FLOOR_EFFECT_DEPTH_BIAS, opacity: YAMA_GLYPH_HINT_OPACITY });
      expect(spec.data).toMatchObject({ kind: 'loc', modelType: LocModelType.NORMAL, rotation: 2, seqId: -1 });
      expect(spec.data?.animationStartTick).toBeUndefined();
    }
    // The same spec objects every held frame, so the renderer never re-bakes them.
    expect(controller.update(frame(stateWith(opener), 'holding', 1.5))).toBe(specs);
  });

  it('shows nothing with the aid off, without a countdown, or outside Yama', () => {
    const controller = new YamaSceneObjectController();
    expect(controller.update(frame(stateWith('range', false), 'holding', 1))).toEqual([]);
    expect(controller.update(frame(stateWith('range'), undefined, 1))).toEqual([]);
    expect(controller.update(frame({ ...stateWith('range'), encounter: zukSnapshot() }, 'holding', 1))).toEqual([]);
  });

  it('plays the deactivate LOCs from GO and removes them when it ends', () => {
    const controller = new YamaSceneObjectController();
    const state = stateWith('range');
    const heldIds = controller.update(frame(state, 'holding', 1)).map((spec) => spec.id);

    const released = controller.update(frame(state, 'released', 1.25));
    expect(placements(released)).toEqual(
      expectedPlacements(YAMA_SHADOW_GLYPH_DEACTIVATE_LOC_ID, YAMA_FIRE_GLYPH_DEACTIVATE_LOC_ID),
    );
    for (const spec of released) {
      expect(spec.data?.animationStartTick).toBe(1.25);
      expect(spec.data?.seqId).toBe(-1);
      expect(spec.style?.opacity).toBe(YAMA_GLYPH_HINT_OPACITY);
    }
    // New ids: the glyphs are contoured, so they bake under their spec id, which must change with the loc.
    expect(released.some((spec) => heldIds.includes(spec.id))).toBe(false);

    // Stable specs mid-sequence, gone once the sequence ends.
    expect(controller.update(frame(state, 'released', 1.5))).toBe(released);
    expect(controller.update(frame(state, 'released', 1.25 + YAMA_GLYPH_DEACTIVATE_TICKS - 0.01))).toBe(released);
    expect(controller.update(frame(state, 'released', 1.25 + YAMA_GLYPH_DEACTIVATE_TICKS))).toEqual([]);
  });

  it('drops a deactivate at once when the countdown goes away, even on a paused clock', () => {
    // Replay and demo frames, canceled countdowns and the overlay finishing all withhold the phase.
    const controller = new YamaSceneObjectController();
    const state = stateWith('range');
    controller.update(frame(state, 'holding', 1));
    expect(controller.update(frame(state, 'released', 1.25))).toHaveLength(5);
    expect(controller.update(frame(state, undefined, 1.5))).toEqual([]);
    expect(controller.update(frame(state, undefined, 1.5))).toEqual([]);
  });

  it('does not deactivate twice while GO is still showing, and holds again on the next countdown', () => {
    const controller = new YamaSceneObjectController();
    controller.update(frame(stateWith('range'), 'holding', 1));
    controller.update(frame(stateWith('range'), 'released', 1));
    expect(controller.update(frame(stateWith('range'), 'released', 2.2))).toEqual([]);
    expect(controller.update(frame(stateWith('range'), 'released', 2.4))).toEqual([]);

    // A restart rolls a new opener; the next hold shows it.
    const restarted = controller.update(frame(stateWith('magic'), 'holding', 1));
    expect(placements(restarted)).toEqual(expectedPlacements(YAMA_FIRE_GLYPH_LOC_ID, YAMA_SHADOW_GLYPH_LOC_ID));
  });

  it('drops a deactivate the timeline moves back under, and never replays it when the tick comes round again', () => {
    const controller = new YamaSceneObjectController();
    controller.update(frame(stateWith('range'), 'holding', 6));
    expect(controller.update(frame(stateWith('range'), 'released', 6))).toHaveLength(5);

    // A reset with the countdown off: back to tick 0, then through the old release tick.
    expect(controller.update(frame(stateWith('range'), undefined, 0.5))).toEqual([]);
    expect(controller.update(frame(stateWith('range'), undefined, 6.2))).toEqual([]);
  });

  it('drops everything when the aid is switched off mid-countdown', () => {
    const controller = new YamaSceneObjectController();
    expect(controller.update(frame(stateWith('range'), 'holding', 1))).toHaveLength(5);
    expect(controller.update(frame(stateWith('range', false), 'holding', 1))).toEqual([]);
  });
});

const cachePath = findProjectCacheZip('pinned');

describe.skipIf(skipWithoutRealCache('pinned'))('YamaSceneObjectController on the real cache', () => {
  it(
    'places 3x3 contoured glyphs centered on their footprints, faded, and times the deactivate from its sequence',
    async () => {
      if (!cachePath) throw new Error('Expected the project cache');
      const { loader } = await openTestCache(cachePath);

      for (const locId of [YAMA_SHADOW_GLYPH_LOC_ID, YAMA_FIRE_GLYPH_LOC_ID]) {
        expect(loader.loadLocType(locId)).toMatchObject({ sizeX: 3, sizeY: 3, contouredGround: 0 });
      }
      for (const [locId, seqId] of [
        [YAMA_SHADOW_GLYPH_DEACTIVATE_LOC_ID, 12172],
        [YAMA_FIRE_GLYPH_DEACTIVATE_LOC_ID, 12170],
      ]) {
        const locType = loader.loadLocType(locId);
        expect(locType).toMatchObject({ sizeX: 3, sizeY: 3, seqId });
        const seq = loader.loadSeqType(seqId);
        const cycles = (seq?.frameLengths ?? []).reduce((total, length) => total + Math.max(1, length), 0);
        expect(cycles).toBe(YAMA_GLYPH_DEACTIVATE_TICKS * 30);
      }

      const renderer = new SceneObjectRenderer(loader);
      const controller = new YamaSceneObjectController();
      const state = stateWith('range');
      for (const [phase, tick] of [
        ['holding', 1],
        ['released', 1],
      ] as const) {
        const specs = controller.update(frame(state, phase, tick));
        const queue = createQueue();
        renderer.sync(specs, tick);
        renderer.render(queue, tick, tick);
        const commands = queue.commands as NpcMesh3DCommand[];
        expect(commands.length).toBeGreaterThanOrEqual(5);

        const centres = new Set(commands.map((command) => `${command.modelMatrix[12]},${command.modelMatrix[13]}`));
        expect(centres).toEqual(
          new Set(
            [...YAMA_OPENER_COLOUR_GLYPH_TILES, ...YAMA_OTHER_COLOUR_GLYPH_TILES].map(
              ([x, y]) => `${x + 1.5},${y + 1.5}`,
            ),
          ),
        );
        for (const command of commands) {
          // Every face is faded into the transparent pass, which reads depth without writing it.
          expect(command.meshId.endsWith('-transparent')).toBe(true);
          expect(command.depth).toBe('read');
          expect(command.blend).toBe('normal');
          expect(command.depthBias).toBe(FLOOR_EFFECT_DEPTH_BIAS);
          expect(Math.max(...(command.perVertexAlphas ?? []))).toBeLessThanOrEqual(YAMA_GLYPH_HINT_OPACITY);
        }
      }
    },
    REAL_CACHE_TEST_TIMEOUT_MS,
  );
});
