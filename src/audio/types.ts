import type { AudioChannel } from './AudioEngine';

export interface SoundPlayOptions {
  volume?: number; // multiplier 0-1, default 1.0
  channel?: AudioChannel; // 'sfx' (default) or 'area' for positional/environment sounds
  delayMs?: number;
}
