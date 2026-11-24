import { describe, expect, it } from 'vitest';
import { chebyshevDistance, coordToStr, isValidCoordinate, strToCoord } from '../core/coordinates';

describe('Coordinate System', () => {
  describe('strToCoord', () => {
    it('converts "0,0" to [0, 0]', () => {
      expect(strToCoord('0,0')).toEqual([0, 0]);
    });

    it('converts "32,30" to [32, 30] (Yama position)', () => {
      expect(strToCoord('32,30')).toEqual([32, 30]);
    });

    it('converts "34,26" to [34, 26] (Player start)', () => {
      expect(strToCoord('34,26')).toEqual([34, 26]);
    });

    it('converts "63,63" to [63, 63] (max corner)', () => {
      expect(strToCoord('63,63')).toEqual([63, 63]);
    });
  });

  describe('coordToStr', () => {
    it('converts [0, 0] to "0,0"', () => {
      expect(coordToStr([0, 0])).toBe('0,0');
    });

    it('converts [32, 30] to "32,30"', () => {
      expect(coordToStr([32, 30])).toBe('32,30');
    });

    it('converts [34, 26] to "34,26"', () => {
      expect(coordToStr([34, 26])).toBe('34,26');
    });
  });

  describe('chebyshevDistance', () => {
    it('calculates distance 0 for same position', () => {
      expect(chebyshevDistance([10, 10], [10, 10])).toBe(0);
    });

    it('calculates distance 3 for diagonal', () => {
      expect(chebyshevDistance([10, 10], [13, 13])).toBe(3);
    });

    it('calculates distance correctly for cardinal direction', () => {
      expect(chebyshevDistance([10, 10], [15, 10])).toBe(5);
    });
  });

  describe('isValidCoordinate', () => {
    it('accepts valid coordinates', () => {
      expect(isValidCoordinate([0, 0])).toBe(true);
      expect(isValidCoordinate([32, 30])).toBe(true);
      expect(isValidCoordinate([63, 63])).toBe(true);
    });

    it('rejects out of bounds coordinates', () => {
      expect(isValidCoordinate([-1, 10])).toBe(false);
      expect(isValidCoordinate([64, 10])).toBe(false);
      expect(isValidCoordinate([10, -1])).toBe(false);
      expect(isValidCoordinate([10, 64])).toBe(false);
    });
  });
});
