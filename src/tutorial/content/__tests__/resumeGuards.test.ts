import { describe, expect, it } from 'vitest';
import { TUTORIAL_REGISTRY } from '../registry';

/** fallbackStep indexes the original pre-filter array; inserting or removing steps shifts it. */
describe('tutorial resumeGuards — fallbackStep stays in range', () => {
  for (const tutorial of TUTORIAL_REGISTRY) {
    const guarded = tutorial.steps.filter((s) => s.kind === 'spotlight' && s.resumeGuard);
    if (guarded.length === 0) continue;

    it(`${tutorial.id}: every resumeGuard.fallbackStep points to a real step`, () => {
      tutorial.steps.forEach((step, idx) => {
        if (step.kind !== 'spotlight' || !step.resumeGuard) return;
        const { fallbackStep } = step.resumeGuard;
        const where = `${tutorial.id} step ${idx} ("${step.popover.title}") resumeGuard.fallbackStep=${fallbackStep}`;
        expect(Number.isInteger(fallbackStep), `${where} is not an integer`).toBe(true);
        expect(fallbackStep, `${where} is negative`).toBeGreaterThanOrEqual(0);
        expect(fallbackStep, `${where} exceeds last index ${tutorial.steps.length - 1}`).toBeLessThan(
          tutorial.steps.length,
        );
      });
    });
  }
});
