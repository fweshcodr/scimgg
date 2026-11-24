import { describe, expect, it } from 'vitest';
import { isNormalType, isRoofType, isWallDecorationType, isWallType, LocModelType } from '../LocModelType';

describe('LocModelType', () => {
  describe('enum values', () => {
    it('has correct values for wall types', () => {
      expect(LocModelType.WALL).toBe(0);
      expect(LocModelType.WALL_TRI_CORNER).toBe(1);
      expect(LocModelType.WALL_CORNER).toBe(2);
      expect(LocModelType.WALL_RECT_CORNER).toBe(3);
    });

    it('has correct values for normal objects', () => {
      expect(LocModelType.NORMAL).toBe(10);
      expect(LocModelType.NORMAL_DIAGONAL).toBe(11);
    });

    it('has correct values for floor decoration', () => {
      expect(LocModelType.FLOOR_DECORATION).toBe(22);
    });
  });

  describe('type checking functions', () => {
    it('isWallType correctly identifies wall types', () => {
      expect(isWallType(LocModelType.WALL)).toBe(true);
      expect(isWallType(LocModelType.WALL_CORNER)).toBe(true);
      expect(isWallType(LocModelType.NORMAL)).toBe(false);
      expect(isWallType(LocModelType.FLOOR_DECORATION)).toBe(false);
    });

    it('isWallDecorationType correctly identifies wall decorations', () => {
      expect(isWallDecorationType(LocModelType.WALL_DECORATION_INSIDE)).toBe(true);
      expect(isWallDecorationType(LocModelType.WALL_DECORATION_OUTSIDE)).toBe(true);
      expect(isWallDecorationType(LocModelType.WALL)).toBe(false);
      expect(isWallDecorationType(LocModelType.NORMAL)).toBe(false);
    });

    it('isNormalType correctly identifies normal objects', () => {
      expect(isNormalType(LocModelType.NORMAL)).toBe(true);
      expect(isNormalType(LocModelType.NORMAL_DIAGONAL)).toBe(true);
      expect(isNormalType(LocModelType.WALL)).toBe(false);
      expect(isNormalType(LocModelType.FLOOR_DECORATION)).toBe(false);
    });

    it('isRoofType correctly identifies roof types', () => {
      expect(isRoofType(LocModelType.ROOF_SLOPED)).toBe(true);
      expect(isRoofType(LocModelType.ROOF_FLAT)).toBe(true);
      expect(isRoofType(LocModelType.NORMAL)).toBe(false);
      expect(isRoofType(LocModelType.WALL)).toBe(false);
    });
  });
});
