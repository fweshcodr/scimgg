import { describe, expect, it } from 'vitest';
import { NpcVisualTracker } from '../interpolation';

const CLIENT_CYCLE_MS = 20;
const DEFAULT_TURN_SPEED = 32;

describe('NpcVisualTracker', () => {
  describe('Accumulator-based stepping', () => {
    it('should not lose fractional cycles across multiple sub-cycle advances', () => {
      const tracker = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);
      tracker.setTarget(512);

      tracker.advance(10);
      tracker.advance(10);

      const state = tracker.advance(0);
      expect(state.facingAngle).toBe(32);
    });
  });

  describe('OSRS snap threshold (delta < turnSpeed)', () => {
    it('should NOT report isTurning for snap turns (delta < turnSpeed)', () => {
      const tracker = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);
      tracker.setTarget(16);
      const state = tracker.advance(CLIENT_CYCLE_MS);

      expect(state.facingAngle).toBe(16);
      expect(state.isTurning).toBe(false);
    });

    it('should snap at delta < turnSpeed but NOT at delta == turnSpeed', () => {
      const snap = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);
      snap.setTarget(31);
      const s1 = snap.advance(CLIENT_CYCLE_MS);
      expect(s1.facingAngle).toBe(31);
      expect(s1.isTurning).toBe(false);

      const noSnap = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);
      noSnap.setTarget(32);
      const s2 = noSnap.advance(CLIENT_CYCLE_MS);
      expect(s2.facingAngle).toBe(32);
      expect(s2.isTurning).toBe(true);
    });

    it('should report isTurning=true for multi-step turns (delta > turnSpeed)', () => {
      const tracker = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);
      tracker.setTarget(512);
      const state = tracker.advance(CLIENT_CYCLE_MS);

      expect(state.facingAngle).not.toBe(512);
      expect(state.isTurning).toBe(true);
      expect(state.turnDeltaSigned).not.toBe(0);
    });

    it('should report isTurning=false immediately when delta reaches 0', () => {
      const tracker = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);
      tracker.setTarget(16);
      tracker.advance(CLIENT_CYCLE_MS);

      const state = tracker.advance(CLIENT_CYCLE_MS);
      expect(state.isTurning).toBe(false);
      expect(state.turnDeltaSigned).toBe(0);
    });

    it('should report turnDeltaSigned=0 when no turn happened', () => {
      const tracker = new NpcVisualTracker(100, DEFAULT_TURN_SPEED);
      const state = tracker.advance(CLIENT_CYCLE_MS);

      expect(state.isTurning).toBe(false);
      expect(state.turnDeltaSigned).toBe(0);
    });
  });

  describe('turnDeltaSigned direction', () => {
    it('should report positive turnDeltaSigned for clockwise multi-step turn', () => {
      const tracker = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);
      tracker.setTarget(512);
      const state = tracker.advance(CLIENT_CYCLE_MS);

      expect(state.turnDeltaSigned).toBeGreaterThan(0);
    });

    it('should report negative turnDeltaSigned for counter-clockwise multi-step turn', () => {
      const tracker = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);
      tracker.setTarget(2048 - 512);
      const state = tracker.advance(CLIENT_CYCLE_MS);

      expect(state.turnDeltaSigned).toBeLessThan(0);
    });

    it('should preserve turnDeltaSigned sign through multi-step turn', () => {
      const tracker = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);
      tracker.setTarget(100);

      const s1 = tracker.advance(CLIENT_CYCLE_MS);
      expect(s1.isTurning).toBe(true);
      expect(s1.turnDeltaSigned).toBeGreaterThan(0);

      const s2 = tracker.advance(CLIENT_CYCLE_MS);
      expect(s2.isTurning).toBe(true);
      expect(s2.turnDeltaSigned).toBeGreaterThan(0);
    });
  });

  describe('Sustained turn counter (di > 25)', () => {
    it('should NOT report isTurning during first 25 ticks of sustained small rotations', () => {
      const tracker = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);

      for (let i = 1; i <= 25; i++) {
        tracker.setTarget(i);
        const state = tracker.advance(CLIENT_CYCLE_MS);
        expect(state.isTurning).toBe(false);
      }
    });

    it('should report isTurning=true after 25+ consecutive ticks of small rotations', () => {
      const tracker = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);

      for (let i = 1; i <= 25; i++) {
        tracker.setTarget(i);
        tracker.advance(CLIENT_CYCLE_MS);
      }

      tracker.setTarget(26);
      const state = tracker.advance(CLIENT_CYCLE_MS);
      expect(state.isTurning).toBe(true);
    });

    it('should reset consecutive counter when delta reaches 0', () => {
      const tracker = new NpcVisualTracker(0, DEFAULT_TURN_SPEED);

      for (let i = 1; i <= 20; i++) {
        tracker.setTarget(i);
        tracker.advance(CLIENT_CYCLE_MS);
      }

      tracker.advance(CLIENT_CYCLE_MS);

      for (let i = 1; i <= 25; i++) {
        tracker.setTarget(20 + i);
        const state = tracker.advance(CLIENT_CYCLE_MS);
        expect(state.isTurning).toBe(false);
      }

      tracker.setTarget(46);
      const state = tracker.advance(CLIENT_CYCLE_MS);
      expect(state.isTurning).toBe(true);
    });
  });
});
