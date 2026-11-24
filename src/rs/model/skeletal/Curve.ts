import type { ByteBuffer } from '../../io/ByteBuffer';
import { interpolateCurve } from './CurveInterp';
import { type CurveInterpType, getInterpTypeForId } from './CurveInterpType';

export class Curve {
  type!: number;
  startInterpType!: CurveInterpType;
  endInterpType!: CurveInterpType;
  hasWeightedTangents!: boolean;

  points?: CurvePoint[];

  startTick!: number;
  endTick!: number;

  values!: Float32Array;
  minValue!: number;
  maxValue!: number;

  isSinglePoint: boolean = false;

  pointIndex: number = 0;
  coefficientsNeedUpdate: boolean = true;

  isUniformXParameterization: boolean = false;
  segmentX0: number = 0;
  segmentX1: number = 0;
  xCoeff0: number = 0;
  xCoeff1: number = 0;
  xCoeff2: number = 0;
  xCoeff3: number = 0;
  yCoeff0: number = 0;
  yCoeff1: number = 0;
  yCoeff2: number = 0;
  yCoeff3: number = 0;

  constructor(readonly id: number) {}

  decode(buffer: ByteBuffer, _version: number): void {
    const count = buffer.readUnsignedShort();
    this.type = buffer.readUnsignedByte();

    this.startInterpType = getInterpTypeForId(buffer.readUnsignedByte());
    this.endInterpType = getInterpTypeForId(buffer.readUnsignedByte());
    this.hasWeightedTangents = buffer.readUnsignedByte() !== 0;

    this.points = new Array(count);

    let lastPoint: CurvePoint | undefined;
    for (let i = 0; i < count; i++) {
      const point = new CurvePoint();
      point.decode(buffer, _version);
      this.points[i] = point;
      if (lastPoint) {
        lastPoint.next = point;
      }

      lastPoint = point;
    }
  }

  load(): void {
    if (!this.points) {
      return;
    }

    this.startTick = this.points[0].tick;
    this.endTick = this.points[this.points.length - 1].tick;
    this.values = new Float32Array(this.getTickDuration() + 1);

    for (let t = this.startTick; t <= this.endTick; t++) {
      this.values[t - this.startTick] = interpolateCurve(this, t);
    }

    this.points = undefined;
    this.minValue = interpolateCurve(this, this.startTick - 1);
    this.maxValue = interpolateCurve(this, this.endTick + 1);
  }

  getValue(t: number): number {
    if (t < this.startTick) {
      return this.minValue;
    } else if (t > this.endTick) {
      return this.maxValue;
    } else {
      const index = Math.floor(t - this.startTick);
      return this.values[index];
    }
  }

  getPointIndex(t: number): number {
    if (!this.points) {
      return this.pointIndex;
    }

    if (
      this.pointIndex < 0 ||
      this.points[this.pointIndex].tick > t ||
      (this.points[this.pointIndex].next && this.points[this.pointIndex].next!.tick <= t)
    ) {
      if (t >= this.startTick && t <= this.endTick) {
        const pointCount = this.points.length;
        let newPointIndex = this.pointIndex;
        if (pointCount > 0) {
          let startPointIndex = 0;
          let endPointIndex = pointCount - 1;

          do {
            const midPointIndex = (startPointIndex + endPointIndex) >> 1;
            if (t < this.points[midPointIndex].tick) {
              if (t > this.points[midPointIndex - 1].tick) {
                newPointIndex = midPointIndex - 1;
                break;
              }

              endPointIndex = midPointIndex - 1;
            } else {
              if (t <= this.points[midPointIndex].tick) {
                newPointIndex = midPointIndex;
                break;
              }

              if (t < this.points[midPointIndex + 1].tick) {
                newPointIndex = midPointIndex;
                break;
              }

              startPointIndex = midPointIndex + 1;
            }
          } while (startPointIndex <= endPointIndex);
        }

        if (this.pointIndex !== newPointIndex) {
          this.pointIndex = newPointIndex;
          this.coefficientsNeedUpdate = true;
        }

        return this.pointIndex;
      } else {
        return -1;
      }
    } else {
      return this.pointIndex;
    }
  }

  getCurvePoint(t: number): CurvePoint | undefined {
    if (!this.points) {
      return undefined;
    }
    const index = this.getPointIndex(t);
    if (index < 0 || index >= this.points.length) {
      return undefined;
    }
    return this.points[index];
  }

  getPointCount(): number {
    if (this.points) {
      return this.points.length;
    }
    return 0;
  }

  getTickDuration(): number {
    return this.endTick - this.startTick;
  }
}

export class CurvePoint {
  tick!: number;
  value!: number;
  inTangentDx!: number;
  inTangentDy!: number;
  outTangentDx!: number;
  outTangentDy!: number;

  next?: CurvePoint;

  decode(buffer: ByteBuffer, _version: number): void {
    this.tick = buffer.readShort();
    this.value = buffer.readFloat();
    this.inTangentDx = buffer.readFloat();
    this.inTangentDy = buffer.readFloat();
    this.outTangentDx = buffer.readFloat();
    this.outTangentDy = buffer.readFloat();
  }
}
