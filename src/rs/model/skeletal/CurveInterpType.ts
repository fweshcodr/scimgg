export enum CurveInterpType {
  CLAMP = 0,
  LINEAR = 1,
  CYCLE = 2,
  CYCLE_OFFSET = 3,
  OSCILLATE = 4,
}

export function getInterpTypeForId(id: number): CurveInterpType {
  if (id < 0 || id > CurveInterpType.OSCILLATE) {
    return CurveInterpType.CLAMP;
  }
  return id;
}
