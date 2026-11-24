import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOL_BEAM_PREPARED_EVENT } from '../../encounters/solHeredit/constants';
import { COLOSSEUM_SPOTANIMS } from '../../npcs/colosseum/constants';
import type { ColosseumVisualEvent } from '../../npcs/colosseum/visualEvents';
import { AudioEngine } from '../AudioEngine';
import { EventAudioPlayer } from '../EventAudioPlayer';
import { solHereditAudioRules } from '../solHereditAudioRules';
import { SOL_BEAM_WARNING_SOUND_TICKS, SOL_LIGHTNING_SOUND_TICKS } from './fixtures/solHereditAudioCapture';

afterEach(() => vi.restoreAllMocks());

describe('Sol sand audio capture conformance', () => {
  it.each([
    'colosseum-sol-heredit-packet-data.txt',
    'colosseum-sol-heredit-solar-flare-doom-volatility-packet-data.txt',
  ])('plays the captured lightning sounds at their printed delays in %s', (filename) => {
    const batches = SOL_LIGHTNING_SOUND_TICKS[filename] ?? [];
    expect(batches.length).toBeGreaterThanOrEqual(5);
    const audio = new AudioEngine();
    const played = vi.spyOn(audio, 'play').mockImplementation(() => undefined);
    const player = new EventAudioPlayer(audio, { name: 'solHeredit', rules: solHereditAudioRules });

    for (const [eventId, { tick, sounds }] of batches.entries()) {
      played.mockClear();
      expect(sounds).toHaveLength(2);
      const event: ColosseumVisualEvent = {
        type: 'colosseum_visual',
        eventId,
        tick,
        animations: [],
        graphics: [
          { spotAnimId: COLOSSEUM_SPOTANIMS.sunfireLightning, position: [33, 35], delayCycles: 30 },
          { spotAnimId: COLOSSEUM_SPOTANIMS.sunfireLightning, position: [34, 35], delayCycles: 30 },
        ],
      };

      player.onEvents([event], [33, 35]);

      expect(played.mock.calls.map(([id, options]) => [id, options?.delayMs])).toEqual(
        sounds.map(([id, delay]) => [id, delay * 20]),
      );
    }
  });
});

describe('Sol beam warning audio capture conformance', () => {
  it.each([
    'colosseum-sol-heredit-packet-data.txt',
    'colosseum-sol-heredit-solar-flare-doom-volatility-packet-data.txt',
  ])('plays every fired warning pair at its printed delays in %s', (filename) => {
    const preparations = SOL_BEAM_WARNING_SOUND_TICKS[filename] ?? [];
    const audio = new AudioEngine();
    const played = vi.spyOn(audio, 'play').mockImplementation(() => undefined);
    const player = new EventAudioPlayer(audio, { name: 'solHeredit', rules: solHereditAudioRules });

    let fired = 0;
    for (const [eventId, { tick, fireTick, sounds }] of preparations.entries()) {
      // Terminal warnings precede a charge that Sol's death interrupts.
      if (fireTick === null || fireTick - tick > 7) continue;
      fired++;
      played.mockClear();
      player.onEvents([{ type: SOL_BEAM_PREPARED_EVENT, eventId, tick, fireInTicks: fireTick - tick }], [33, 35]);
      expect(played.mock.calls.map(([id, options]) => [id, options?.delayMs])).toEqual(
        sounds.map(([id, delay]) => [id, delay * 20]),
      );
    }
    expect(fired).toBe(6);
  });
});

it('preserves separate beam impact sounds even when their endpoints share a row', () => {
  const audio = new AudioEngine();
  const played = vi.spyOn(audio, 'play').mockImplementation(() => undefined);
  const player = new EventAudioPlayer(audio, { name: 'solHeredit', rules: solHereditAudioRules });
  const event: ColosseumVisualEvent = {
    type: 'colosseum_visual',
    eventId: 1,
    tick: 10,
    animations: [],
    graphics: [
      { spotAnimId: 2697, position: [25, 32], delayCycles: 39, height: 128 },
      { spotAnimId: 2697, position: [40, 32], delayCycles: 39, height: 128 },
      { spotAnimId: 2697, position: [30, 32], delayCycles: 39, height: 128 },
    ],
  };

  player.onEvents([event], [33, 32]);

  expect(played.mock.calls.map(([id]) => id)).toEqual([8230, 8230, 8230]);
  // The capture's sound_area is emitted without delay, separately from delayed map_anim.
  expect(played.mock.calls.map(([, options]) => options?.delayMs)).toEqual([undefined, undefined, undefined]);
});
