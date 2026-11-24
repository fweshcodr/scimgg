import { describe, expect, it } from 'vitest';
import type { CheckpointStep, DemoStep, InfoStep, WaitForEventStep } from '../../types';
import { buildGuidedDrill, type GuidedDrillConfig } from '../guidedDrill';

const BASE: GuidedDrillConfig = {
  encounterKind: 'yama_p3',
  mechanics: { yamaMageRange: true, infiniteHealth: true },
  explain: { title: 'Explain', body: 'explain body' },
  ready: { title: 'Ready', body: 'ready body' },
  practice: { title: 'Practice', body: 'practice body', eventName: 'some_event', count: 3 },
};

describe('buildGuidedDrill', () => {
  it('emits explain -> ready -> practice when no demo is given', () => {
    const steps = buildGuidedDrill(BASE);
    expect(steps.map((s) => s.kind)).toEqual(['info', 'checkpoint', 'wait-for-event']);
  });

  it('inserts the demo between explain and ready when given', () => {
    const steps = buildGuidedDrill({
      ...BASE,
      demo: {
        title: 'Watch',
        body: 'watch body',
        scriptedActions: [{ tickOffset: 0, annotation: 'go' }],
      },
    });
    expect(steps.map((s) => s.kind)).toEqual(['info', 'demo', 'checkpoint', 'wait-for-event']);
  });

  describe('explain rung', () => {
    it('is an info step carrying optional video/image/highlight', () => {
      const [explain] = buildGuidedDrill({
        ...BASE,
        explain: {
          title: 'Explain',
          body: 'b',
          videoUrl: '/v.mp4',
          highlight: { type: 'npc', actorId: 'yama' },
        },
      }) as [InfoStep, ...unknown[]];
      expect(explain.kind).toBe('info');
      expect(explain.videoUrl).toBe('/v.mp4');
      expect(explain.highlight).toEqual({ type: 'npc', actorId: 'yama' });
    });
  });

  describe('ready rung (the anti-"thrown in" fix)', () => {
    it('is a checkpoint that never auto-advances', () => {
      const steps = buildGuidedDrill(BASE);
      const ready = steps.find((s) => s.kind === 'checkpoint') as CheckpointStep;
      expect(ready.autoAdvance).toBe(false);
    });

    it('seeds the practice state with encounter commands', () => {
      const steps = buildGuidedDrill({
        ...BASE,
        activatePresetId: 'lane_preset',
        openingCommandId: 'yama-opening-magic',
      });
      const ready = steps.find((s) => s.kind === 'checkpoint') as CheckpointStep;
      expect(ready.seed.encounterKind).toBe('yama_p3');
      expect(ready.seed.mechanics).toEqual(BASE.mechanics);
      expect(ready.seed.activatePresetId).toBe('lane_preset');
      expect(ready.seed.encounterCommandIds).toEqual(['yama-opening-magic']);
    });

    it('omits preset and encounter commands from the seed when not configured', () => {
      const steps = buildGuidedDrill(BASE);
      const ready = steps.find((s) => s.kind === 'checkpoint') as CheckpointStep;
      expect(ready.seed.activatePresetId).toBeUndefined();
      expect(ready.seed.encounterCommandIds).toBeUndefined();
    });

    it('threads a custom continueLabel onto the checkpoint (e.g. "Start")', () => {
      const steps = buildGuidedDrill({ ...BASE, ready: { title: 'Ready', body: 'b', continueLabel: 'Start' } });
      const ready = steps.find((s) => s.kind === 'checkpoint') as CheckpointStep;
      expect(ready.continueLabel).toBe('Start');
    });
  });

  describe('demo rung', () => {
    const steps = buildGuidedDrill({
      ...BASE,
      activatePresetId: 'lane_preset',
      openingCommandId: 'yama-opening-range',
      demo: {
        title: 'Watch',
        body: 'watch body',
        scriptedActions: [{ tickOffset: 0, annotation: 'go' }],
        stopAtTickOffset: 20,
      },
    });
    const demo = steps.find((s) => s.kind === 'demo') as DemoStep;

    it('owns a full setup (reset + mechanics + style + preset) and disables resetBefore', () => {
      expect(demo.resetBefore).toBe(false);
      const types = demo.setup?.map((a) => a.type);
      expect(types).toEqual(['reset', 'set-mechanics', 'encounter-command', 'activate-tile-preset']);
    });

    it('threads the opening command and stopAtTickOffset through', () => {
      const opening = demo.setup?.find((action) => action.type === 'encounter-command');
      expect(opening?.type === 'encounter-command' && opening.commandId).toBe('yama-opening-range');
      expect(demo.stopAtTickOffset).toBe(20);
    });

    it('appends fast-forward-ticks LAST in setup when fastForwardToTick is set', () => {
      const ffSteps = buildGuidedDrill({
        ...BASE,
        openingCommandId: 'yama-opening-magic',
        activatePresetId: 'lane_preset',
        demo: { title: 'Watch', body: 'b', fastForwardToTick: 8 },
      });
      const ffDemo = ffSteps.find((s) => s.kind === 'demo') as DemoStep;
      expect(ffDemo.setup?.map((a) => a.type)).toEqual([
        'reset',
        'set-mechanics',
        'encounter-command',
        'activate-tile-preset',
        'fast-forward-ticks',
      ]);
      const ff = ffDemo.setup?.find((a) => a.type === 'fast-forward-ticks');
      expect(ff?.type === 'fast-forward-ticks' && ff.toTick).toBe(8);
    });

    it('omits fast-forward-ticks when fastForwardToTick is unset', () => {
      const plainSteps = buildGuidedDrill({ ...BASE, demo: { title: 'Watch', body: 'b' } });
      const plainDemo = plainSteps.find((s) => s.kind === 'demo') as DemoStep;
      expect(plainDemo.setup?.some((a) => a.type === 'fast-forward-ticks')).toBe(false);
    });

    it('passes a cursor track through and defaults scriptedActions to []', () => {
      const cursorSteps = buildGuidedDrill({
        ...BASE,
        demo: {
          title: 'Watch',
          body: 'b',
          cursor: { cues: [{ time: { kind: 'tick', tick: 1 }, target: { kind: 'panel-tab', tab: 'prayer' } }] },
        },
      });
      const d = cursorSteps.find((s) => s.kind === 'demo') as DemoStep;
      expect(d.cursor?.cues).toHaveLength(1);
      expect(d.scriptedActions).toEqual([]);
    });
  });

  describe('practice rung', () => {
    it('maps event/count/fail/success and attaches extraSetup as the step setup', () => {
      const steps = buildGuidedDrill({
        ...BASE,
        practice: {
          title: 'Practice',
          body: 'b',
          eventName: 'voidflare_destroyed',
          count: 2,
          failEventName: 'voidflare_exploded',
          failPrompt: 'boom',
          successMessage: 'nice',
          extraSetup: [{ type: 'encounter-command', commandId: 'yama-spawn-void-flare' }],
        },
      });
      const practice = steps.find((s) => s.kind === 'wait-for-event') as WaitForEventStep;
      expect(practice.eventName).toBe('voidflare_destroyed');
      expect(practice.count).toBe(2);
      expect(practice.failEventName).toBe('voidflare_exploded');
      expect(practice.failPrompt).toBe('boom');
      expect(practice.successMessage).toBe('nice');
      expect(practice.setup).toEqual([{ type: 'encounter-command', commandId: 'yama-spawn-void-flare' }]);
    });

    it('leaves setup undefined when no extraSetup is given (rides on the checkpoint seed)', () => {
      const steps = buildGuidedDrill(BASE);
      const practice = steps.find((s) => s.kind === 'wait-for-event') as WaitForEventStep;
      expect(practice.setup).toBeUndefined();
    });

    it('threads matcher/failMatcher/failResetsProgress onto the wait step', () => {
      const matcher = () => true;
      const failMatcher = () => false;
      const steps = buildGuidedDrill({
        ...BASE,
        practice: {
          title: 'Practice',
          body: 'b',
          eventName: 'hit_applied',
          matcher,
          count: 2,
          failEventName: 'hit_applied',
          failMatcher,
          failResetsProgress: true,
        },
      });
      const practice = steps.find((s) => s.kind === 'wait-for-event') as WaitForEventStep;
      expect(practice.matcher).toBe(matcher);
      expect(practice.failMatcher).toBe(failMatcher);
      expect(practice.failResetsProgress).toBe(true);
    });
  });
});
