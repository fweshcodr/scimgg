export enum CurveType {
  NONE = 0,
  BONE_ROT_X = 1,
  BONE_ROT_Y = 2,
  BONE_ROT_Z = 3,
  BONE_TRANS_X = 4,
  BONE_TRANS_Y = 5,
  BONE_TRANS_Z = 6,
  BONE_SCALE_X = 7,
  BONE_SCALE_Y = 8,
  BONE_SCALE_Z = 9,
  VEC3_A_X = 10,
  VEC3_A_Y = 11,
  VEC3_A_Z = 12,
  VEC3_B_X = 13,
  VEC3_B_Y = 14,
  VEC3_B_Z = 15,
  SCALAR = 16,
}

export function getCurveTypeForId(id: number): CurveType {
  if (id < 0 || id > CurveType.SCALAR) {
    return CurveType.NONE;
  }
  return id;
}

const CURVE_INDICES = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 2, 3, 4, 5, 0];

export function getCurveIndex(type: CurveType): number {
  return CURVE_INDICES[type];
}
