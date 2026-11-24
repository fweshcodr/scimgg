export interface LayoutConstraints {
  readonly width?: number;
  readonly height?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}

export interface LayoutSize {
  readonly width: number;
  readonly height: number;
}

export function fitLayoutSize(naturalW: number, naturalH: number, constraints: LayoutConstraints = {}): LayoutSize {
  if (naturalW <= 0 || naturalH <= 0) return { width: 0, height: 0 };
  const aspect = naturalH / naturalW;
  const { width, height, maxWidth, maxHeight } = constraints;

  let boxW: number;
  let boxH: number;
  if (width !== undefined && height !== undefined) {
    boxW = width;
    boxH = height;
  } else if (width !== undefined) {
    boxW = width;
    boxH = width * aspect;
  } else if (height !== undefined) {
    boxW = height / aspect;
    boxH = height;
  } else {
    boxW = naturalW;
    boxH = naturalH;
  }

  const shrink = Math.min(
    maxWidth !== undefined && boxW > 0 ? maxWidth / boxW : 1,
    maxHeight !== undefined && boxH > 0 ? maxHeight / boxH : 1,
    1,
  );
  return { width: boxW * shrink, height: boxH * shrink };
}
