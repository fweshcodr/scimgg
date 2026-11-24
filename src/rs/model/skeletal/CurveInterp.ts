import { vec2 } from 'gl-matrix';

import { FloatUtil } from '../../util/FloatUtil';
import type { Curve } from './Curve';
import { CurveInterpType } from './CurveInterpType';

const MACHINE_EPSILON = 1.1920929e-7;
const DOUBLE_EPSILON = 2 * MACHINE_EPSILON;

export function interpolateCurve(curve: Curve, t: number): number {
  if (!curve || !curve.points || curve.points.length === 0) {
    return 0;
  }
  if (t < curve.startTick) {
    if (curve.startInterpType === CurveInterpType.CLAMP) {
      return curve.points[0].value;
    } else {
      return extrapolateCurve(curve, t, true);
    }
  } else if (t > curve.endTick) {
    if (curve.endInterpType === CurveInterpType.CLAMP) {
      return curve.points[curve.points.length - 1].value;
    } else {
      return extrapolateCurve(curve, t, false);
    }
  } else if (curve.isSinglePoint) {
    return curve.points[0].value;
  }
  const point = curve.getCurvePoint(t);
  if (!point) {
    return 0;
  }
  let useConstantValue = false;
  let useStepInterpolation = false;

  if (point.outTangentDx === 0 && point.outTangentDy === 0) {
    useConstantValue = true;
  } else if (point.outTangentDx === FloatUtil.MAX_VALUE && point.outTangentDy === FloatUtil.MAX_VALUE) {
    useStepInterpolation = true;
  } else if (!point.next) {
    useConstantValue = true;
  } else if (curve.coefficientsNeedUpdate) {
    const x0 = point.tick;
    const y0 = point.value;
    const handleX1 = point.outTangentDx * 0.33333334 + x0;
    const handleY1 = point.outTangentDy * 0.33333334 + y0;
    const x3 = point.next.tick;
    const y3 = point.next.value;
    const handleX2 = x3 - point.next.inTangentDx * 0.33333334;
    const handleY2 = y3 - point.next.inTangentDy * 0.33333334;
    if (curve.hasWeightedTangents) {
      let clampedHandleY1 = handleY1;
      let clampedHandleY2 = handleY2;
      const segmentWidth = x3 - x0;
      if (segmentWidth !== 0.0) {
        const normalizedHandleX1 = (handleX1 - x0) / segmentWidth;
        const normalizedHandleX2 = (handleX2 - x0) / segmentWidth;
        const handlePositions = vec2.fromValues(normalizedHandleX1, normalizedHandleX2);
        curve.isUniformXParameterization = handlePositions[0] === 0.33333334 && handlePositions[1] === 0.6666667;
        const originalHandleX1 = handlePositions[0];
        const originalHandleX2 = handlePositions[1];
        if (handlePositions[0] < 0.0) {
          handlePositions[0] = 0.0;
        }

        if (handlePositions[1] > 1.0) {
          handlePositions[1] = 1.0;
        }

        if (handlePositions[0] > 1.0 || handlePositions[1] < -1.0) {
          clampBezierHandlesForMonotoneX(handlePositions);
        }

        if (handlePositions[0] !== originalHandleX1) {
          if (0.0 !== originalHandleX1) {
            clampedHandleY1 = ((handleY1 - y0) * handlePositions[0]) / originalHandleX1 + y0;
          }
        }

        if (originalHandleX2 !== handlePositions[1]) {
          if (1.0 !== originalHandleX2) {
            clampedHandleY2 = y3 - ((1.0 - handlePositions[1]) * (y3 - handleY2)) / (1.0 - originalHandleX2);
          }
        }

        curve.segmentX0 = x0;
        curve.segmentX1 = x3;
        const p1 = handlePositions[0];
        const p2 = handlePositions[1];
        let d01 = p1 - 0.0;
        let d12 = p2 - p1;
        let d23 = 1.0 - p2;
        let d012 = d12 - d01;
        curve.xCoeff3 = d23 - d12 - d012;
        curve.xCoeff2 = d012 + d012 + d012;
        curve.xCoeff1 = d01 + d01 + d01;
        curve.xCoeff0 = 0.0;
        d01 = clampedHandleY1 - y0;
        d12 = clampedHandleY2 - clampedHandleY1;
        d23 = y3 - clampedHandleY2;
        d012 = d12 - d01;
        curve.yCoeff3 = d23 - d12 - d012;
        curve.yCoeff2 = d012 + d012 + d012;
        curve.yCoeff1 = d01 + d01 + d01;
        curve.yCoeff0 = y0;
      }
    } else {
      curve.segmentX0 = x0;
      const segmentWidth = x3 - x0;
      const segmentHeight = y3 - y0;
      let dx1 = handleX1 - x0;
      let slope1 = 0.0;
      let slope2 = 0.0;
      if (dx1 !== 0.0) {
        slope1 = (handleY1 - y0) / dx1;
      }

      dx1 = x3 - handleX2;
      if (dx1 !== 0.0) {
        slope2 = (y3 - handleY2) / dx1;
      }

      const invWidthSquared = 1.0 / (segmentWidth * segmentWidth);
      const scaledSlope1 = slope1 * segmentWidth;
      const scaledSlope2 = slope2 * segmentWidth;
      curve.xCoeff0 = (invWidthSquared * (scaledSlope1 + scaledSlope2 - segmentHeight - segmentHeight)) / segmentWidth;
      curve.xCoeff1 =
        invWidthSquared * (segmentHeight + segmentHeight + segmentHeight - scaledSlope1 - scaledSlope1 - scaledSlope2);
      curve.xCoeff2 = slope1;
      curve.xCoeff3 = y0;
    }

    curve.coefficientsNeedUpdate = false;
  }

  if (useConstantValue) {
    return point.value;
  } else if (useStepInterpolation) {
    if (point.tick !== t && point.next) {
      return point.next.value;
    } else {
      return point.value;
    }
  } else if (curve.hasWeightedTangents) {
    return evaluateBezierYAtX(curve, t);
  } else {
    const dx = t - curve.segmentX0;
    const result = curve.xCoeff3 + dx * ((dx * curve.xCoeff0 + curve.xCoeff1) * dx + curve.xCoeff2);

    return result;
  }
}

export function extrapolateCurve(curve: Curve, t: number, isStart: boolean): number {
  if (!curve || !curve.points || curve.points.length === 0) {
    return 0;
  }
  const firstTick = curve.points[0].tick;
  const lastTick = curve.points[curve.points.length - 1].tick;
  const tickRange = lastTick - firstTick;
  if (tickRange === 0.0) {
    return curve.points[0].value;
  }

  let normalizedOffset: number;
  if (t > lastTick) {
    normalizedOffset = (t - lastTick) / tickRange;
  } else {
    normalizedOffset = (t - firstTick) / tickRange;
  }

  let cycleCount = normalizedOffset | 0;
  let fractionalOffset = Math.abs(normalizedOffset - cycleCount);
  let mappedTick = fractionalOffset * tickRange;
  cycleCount = Math.abs(1.0 + cycleCount);
  const halfCycleCount = cycleCount / 2.0;
  const wholeCycles = halfCycleCount | 0;
  fractionalOffset = halfCycleCount - wholeCycles;
  if (isStart) {
    if (curve.startInterpType === CurveInterpType.OSCILLATE) {
      if (fractionalOffset !== 0.0) {
        mappedTick += firstTick;
      } else {
        mappedTick = lastTick - mappedTick;
      }
    } else if (
      curve.startInterpType === CurveInterpType.CYCLE ||
      curve.startInterpType === CurveInterpType.CYCLE_OFFSET
    ) {
      mappedTick = lastTick - mappedTick;
    } else if (curve.startInterpType === CurveInterpType.LINEAR) {
      mappedTick = firstTick - t;
      const tangentDx = curve.points[0].inTangentDx;
      const tangentDy = curve.points[0].inTangentDy;
      let output = curve.points[0].value;
      if (tangentDx !== 0.0) {
        output -= (mappedTick * tangentDy) / tangentDx;
      }
      return output;
    }
  } else {
    if (curve.endInterpType === CurveInterpType.OSCILLATE) {
      if (fractionalOffset !== 0.0) {
        mappedTick = lastTick - mappedTick;
      } else {
        mappedTick += firstTick;
      }
    } else if (curve.endInterpType === CurveInterpType.CYCLE || curve.endInterpType === CurveInterpType.CYCLE_OFFSET) {
      mappedTick += firstTick;
    } else if (curve.endInterpType === CurveInterpType.LINEAR) {
      mappedTick = t - lastTick;
      const tangentDx = curve.points[curve.getPointCount() - 1].outTangentDx;
      const tangentDy = curve.points[curve.getPointCount() - 1].outTangentDy;
      let output = curve.points[curve.getPointCount() - 1].value;
      if (tangentDx !== 0.0) {
        output += (tangentDy * mappedTick) / tangentDx;
      }
      return output;
    }
  }
  let output = interpolateCurve(curve, mappedTick);
  if (isStart && curve.startInterpType === CurveInterpType.CYCLE_OFFSET) {
    const valueDelta = curve.points[curve.points.length - 1].value - curve.points[0].value;
    output = output - valueDelta * cycleCount;
  } else if (!isStart && curve.endInterpType === CurveInterpType.CYCLE_OFFSET) {
    const valueDelta = curve.points[curve.points.length - 1].value - curve.points[0].value;
    output = output + valueDelta * cycleCount;
  }
  return output;
}

function clampBezierHandlesForMonotoneX(handlePositions: vec2): void {
  handlePositions[1] = 1.0 - handlePositions[1];
  if (handlePositions[0] < 0.0) {
    handlePositions[0] = 0.0;
  }

  if (handlePositions[1] < 0.0) {
    handlePositions[1] = 0.0;
  }

  if (handlePositions[0] > 1.0 || handlePositions[1] > 1.0) {
    const discriminant =
      1.0 +
      handlePositions[0] * (handlePositions[0] - 2.0 + handlePositions[1]) +
      (handlePositions[1] - 2.0) * handlePositions[1];
    if (discriminant + MACHINE_EPSILON > 0.0) {
      if (MACHINE_EPSILON + handlePositions[0] < 1.3333334) {
        const b = handlePositions[0] - 2.0;
        const c = handlePositions[0] - 1.0;
        const sqrtDiscriminant = Math.sqrt(b * b - 4.0 * c * c);
        const root1 = 0.5 * (sqrtDiscriminant + -b);
        if (handlePositions[1] + MACHINE_EPSILON > root1) {
          handlePositions[1] = root1 - MACHINE_EPSILON;
        } else {
          const root2 = (-b - sqrtDiscriminant) * 0.5;
          if (handlePositions[1] < root2 + MACHINE_EPSILON) {
            handlePositions[1] = root2 + MACHINE_EPSILON;
          }
        }
      } else {
        handlePositions[0] = 1.3333334 - MACHINE_EPSILON;
        handlePositions[1] = 0.33333334 - MACHINE_EPSILON;
      }
    }
  }

  handlePositions[1] = 1.0 - handlePositions[1];
}

const rootFinderCoefficients = new Float32Array(4);
const rootFinderOutput = new Float32Array(5);

function evaluateBezierYAtX(curve: Curve, t: number): number {
  if (!curve) {
    return 0;
  }
  let normalizedX: number;
  if (curve.segmentX0 === t) {
    normalizedX = 0.0;
  } else if (t === curve.segmentX1) {
    normalizedX = 1.0;
  } else {
    normalizedX = (t - curve.segmentX0) / (curve.segmentX1 - curve.segmentX0);
  }

  let bezierParam: number;
  if (curve.isUniformXParameterization) {
    bezierParam = normalizedX;
  } else {
    rootFinderCoefficients[3] = curve.xCoeff3;
    rootFinderCoefficients[2] = curve.xCoeff2;
    rootFinderCoefficients[1] = curve.xCoeff1;
    rootFinderCoefficients[0] = curve.xCoeff0 - normalizedX;
    rootFinderOutput[0] = 0.0;
    rootFinderOutput[1] = 0.0;
    rootFinderOutput[2] = 0.0;
    rootFinderOutput[3] = 0.0;
    rootFinderOutput[4] = 0.0;
    const rootCount = findRealRootsInInterval(rootFinderCoefficients, 3, 0.0, true, 1.0, true, rootFinderOutput);
    if (rootCount === 1) {
      bezierParam = rootFinderOutput[0];
    } else {
      bezierParam = 0.0;
    }
  }

  return bezierParam * (curve.yCoeff1 + bezierParam * (bezierParam * curve.yCoeff3 + curve.yCoeff2)) + curve.yCoeff0;
}

function evaluatePolynomialHorner(coefficients: Float32Array, degree: number, x: number): number {
  let result = coefficients[degree];

  for (let i = degree - 1; i >= 0; i--) {
    result = result * x + coefficients[i];
  }

  return result;
}

function findRealRootsInInterval(
  coefficients: Float32Array,
  degree: number,
  rangeStart: number,
  includeStart: boolean,
  rangeEnd: number,
  includeEnd: boolean,
  rootsOut: Float32Array,
): number {
  let coefficientSum = 0.0;

  for (let i = 0; i < degree + 1; i++) {
    coefficientSum += Math.abs(coefficients[i]);
  }

  const tolerance = (Math.abs(rangeStart) + Math.abs(rangeEnd)) * (degree + 1) * MACHINE_EPSILON;
  if (coefficientSum <= tolerance) {
    return -1;
  }
  const normalizedCoeff = new Float32Array(degree + 1);

  for (let i = 0; i < degree + 1; i++) {
    normalizedCoeff[i] = (1.0 / coefficientSum) * coefficients[i];
  }

  while (Math.abs(normalizedCoeff[degree]) < tolerance) {
    degree--;
  }

  let rootCount = 0;
  if (degree === 0) {
    return rootCount;
  } else if (degree === 1) {
    rootsOut[0] = -normalizedCoeff[0] / normalizedCoeff[1];
    const inRangeStart = includeStart ? rangeStart < rootsOut[0] + tolerance : rangeStart < rootsOut[0] - tolerance;
    const inRangeEnd = includeEnd ? rangeEnd > rootsOut[0] - tolerance : rangeEnd > rootsOut[0] + tolerance;
    rootCount = inRangeStart && inRangeEnd ? 1 : 0;
    if (rootCount > 0) {
      if (includeStart && rootsOut[0] < rangeStart) {
        rootsOut[0] = rangeStart;
      } else if (includeEnd && rootsOut[0] > rangeEnd) {
        rootsOut[0] = rangeEnd;
      }
    }

    return rootCount;
  } else {
    const derivativeCoeff = new Float32Array(degree + 1);

    for (let i = 1; i <= degree; i++) {
      derivativeCoeff[i - 1] = i * normalizedCoeff[i];
    }

    const criticalPoints = new Float32Array(degree + 1);
    const criticalPointCount = findRealRootsInInterval(
      derivativeCoeff,
      degree - 1,
      rangeStart,
      false,
      rangeEnd,
      false,
      criticalPoints,
    );
    if (criticalPointCount === -1) {
      return 0;
    }

    let bracketSearchActive = false;
    let prevFunctionValue = 0.0;
    let functionValueAtBracketEnd = 0.0;
    let bracketEnd = 0.0;

    for (let segment = 0; segment <= criticalPointCount; segment++) {
      if (rootCount > degree) {
        return rootCount;
      }

      let bracketStart: number;
      if (segment === 0) {
        bracketStart = rangeStart;
        functionValueAtBracketEnd = evaluatePolynomialHorner(normalizedCoeff, degree, rangeStart);
        if (Math.abs(functionValueAtBracketEnd) <= tolerance && includeStart) {
          rootsOut[rootCount++] = rangeStart;
        }
      } else {
        bracketStart = bracketEnd;
        functionValueAtBracketEnd = prevFunctionValue;
      }

      if (criticalPointCount === segment) {
        bracketEnd = rangeEnd;
        bracketSearchActive = false;
      } else {
        bracketEnd = criticalPoints[segment];
      }

      prevFunctionValue = evaluatePolynomialHorner(normalizedCoeff, degree, bracketEnd);
      if (bracketSearchActive) {
        bracketSearchActive = false;
      } else if (Math.abs(prevFunctionValue) < tolerance) {
        if (criticalPointCount !== segment || includeEnd) {
          rootsOut[rootCount++] = bracketEnd;
          bracketSearchActive = true;
        }
      } else if (
        (functionValueAtBracketEnd < 0.0 && prevFunctionValue > 0.0) ||
        (functionValueAtBracketEnd > 0.0 && prevFunctionValue < 0.0)
      ) {
        const rootIndex = rootCount++;
        let a = bracketStart;
        let b = bracketEnd;
        let fa = evaluatePolynomialHorner(normalizedCoeff, degree, bracketStart);
        let root: number;
        if (Math.abs(fa) < MACHINE_EPSILON) {
          root = bracketStart;
        } else {
          let fb = evaluatePolynomialHorner(normalizedCoeff, degree, bracketEnd);
          if (Math.abs(fb) < MACHINE_EPSILON) {
            root = bracketEnd;
          } else {
            let c = 0.0;
            const fc = 0.0;
            let d = 0.0;
            let e = 0.0;
            let needsReset = true;
            let continueIteration = false;

            do {
              continueIteration = false;
              if (needsReset) {
                c = a;
                e = fc;
                d = b - a;
                e = d;
                needsReset = false;
              }

              if (Math.abs(e) < Math.abs(fb)) {
                a = b;
                b = c;
                c = a;
                fa = fb;
                fb = e;
                e = fa;
              }

              const absoluteTolerance = DOUBLE_EPSILON * Math.abs(b) + 0.0;
              const midpoint = 0.5 * (c - b);
              const shouldContinue = Math.abs(midpoint) > absoluteTolerance && fb !== 0.0;
              if (shouldContinue) {
                if (Math.abs(d) < absoluteTolerance || Math.abs(fa) <= Math.abs(fb)) {
                  d = midpoint;
                  e = midpoint;
                } else {
                  let ratio = fb / fa;
                  let p: number;
                  let q: number;
                  if (a === c) {
                    p = midpoint * 2.0 * ratio;
                    q = 1.0 - ratio;
                  } else {
                    q = fa / e;
                    const r = fb / e;
                    p = ratio * (midpoint * 2.0 * q * (q - r) - (r - 1.0) * (b - a));
                    q = (r - 1.0) * (q - 1.0) * (ratio - 1.0);
                  }

                  if (p > 0.0) {
                    q = -q;
                  } else {
                    p = -p;
                  }

                  ratio = d;
                  d = e;
                  if (2.0 * p < 3.0 * midpoint * q - Math.abs(q * absoluteTolerance) && p < Math.abs(q * ratio * 0.5)) {
                    e = p / q;
                  } else {
                    e = midpoint;
                    d = midpoint;
                  }
                }

                a = b;
                fa = fb;
                if (Math.abs(e) > absoluteTolerance) {
                  b += e;
                } else if (midpoint > 0.0) {
                  b += absoluteTolerance;
                } else {
                  b -= absoluteTolerance;
                }

                fb = evaluatePolynomialHorner(normalizedCoeff, degree, b);
                if (fb * (e / Math.abs(e)) > 0.0) {
                  needsReset = true;
                  continueIteration = true;
                } else {
                  continueIteration = true;
                }
              }
            } while (continueIteration);

            root = b;
          }
        }

        rootsOut[rootIndex] = root;
        if (rootCount > 1 && rootsOut[rootCount - 2] >= rootsOut[rootCount - 1] - tolerance) {
          rootsOut[rootCount - 2] = 0.5 * (rootsOut[rootCount - 2] + rootsOut[rootCount - 1]);
          rootCount--;
        }
      }
    }

    return rootCount;
  }
}
