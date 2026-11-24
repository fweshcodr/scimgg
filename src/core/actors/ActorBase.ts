import type { Coordinate } from '../../types/simulation';
import type { ActorId, ActorKind, ActorVitals } from './types';

export interface ActorOutline {
  /** Packed HSL color (from packHsl) */
  color: number;
  /** 'full' = complete border, 'corner' = L-shaped corner marks */
  style: 'full' | 'corner';
  /** Line width in world units (default ~0.03) */
  lineWidth?: number;
}

export interface ActorBase {
  id: ActorId;
  kind: ActorKind;
  alive: boolean;
  position: Coordinate;
  previousPosition: Coordinate;
  facing: number;
  size: number;
  /** Inert moving effects can occupy tiles without blocking NPC pathing. Defaults to true. */
  blocksNpcMovement?: boolean;
  vitals: ActorVitals;
  outline?: ActorOutline;
}
