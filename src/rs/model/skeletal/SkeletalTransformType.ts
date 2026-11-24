export enum SkeletalTransformType {
  NONE = 0,
  BONE = 1,
  VEC3 = 2,
  VEC6 = 3,
  ALPHA = 4,
  VEC3_ALT = 5,
}

export function getTransformTypeForId(id: number): SkeletalTransformType {
  if (id < 0 || id > SkeletalTransformType.VEC3_ALT) {
    return SkeletalTransformType.NONE;
  }
  return id;
}

const CURVE_COUNTS = [0, 9, 3, 6, 1, 3];

export function getCurveCount(type: SkeletalTransformType): number {
  return CURVE_COUNTS[type];
}
