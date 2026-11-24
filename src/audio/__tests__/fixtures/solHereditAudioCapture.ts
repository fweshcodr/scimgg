/**
 * Facts extracted from private gameplay captures (colosseum-sol-heredit-packet-data.txt, colosseum-sol-heredit-solar-flare-doom-volatility-packet-data.txt).
 * Sol Heredit sand-lightning and beam-warning sounds, per capture tick. `sounds` are
 * `[synth_sound id, delay in client cycles]` in capture order; `fireTick` is the next tick that
 * fires a crystal beam (map_anim 2693-2696) after a warning, or null when none follows.
 */
/** Ticks with a `vfx_colosseum_sunfire_lightning_01_beam_01` map_anim and their 8053/10046 sounds. */
export const SOL_LIGHTNING_SOUND_TICKS: Readonly<
  Record<string, readonly { readonly tick: number; readonly sounds: readonly (readonly [number, number])[] }[]>
> = {
  'colosseum-sol-heredit-packet-data.txt': [
    {
      tick: 4023,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 4064,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 4106,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 4161,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 4200,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 4207,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 4210,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 4213,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 4216,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 4219,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
  ],
  'colosseum-sol-heredit-solar-flare-doom-volatility-packet-data.txt': [
    {
      tick: 8293,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 8334,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 8403,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 8460,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 8502,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
    {
      tick: 8510,
      sounds: [
        [8053, 30],
        [10046, 90],
      ],
    },
  ],
};

/** Ticks with an 8253 warning synth_sound and their 8253/8213 sounds. */
export const SOL_BEAM_WARNING_SOUND_TICKS: Readonly<
  Record<
    string,
    readonly {
      readonly tick: number;
      readonly fireTick: number | null;
      readonly sounds: readonly (readonly [number, number])[];
    }[]
  >
> = {
  'colosseum-sol-heredit-packet-data.txt': [
    {
      tick: 4029,
      fireTick: 4036,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 4070,
      fireTick: 4077,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 4112,
      fireTick: 4119,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 4148,
      fireTick: 4155,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 4184,
      fireTick: 4191,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 4206,
      fireTick: 4212,
      sounds: [
        [8253, 75],
        [8213, 180],
      ],
    },
    {
      tick: 4218,
      fireTick: null,
      sounds: [
        [8253, 75],
        [8213, 180],
      ],
    },
  ],
  'colosseum-sol-heredit-solar-flare-doom-volatility-packet-data.txt': [
    {
      tick: 8299,
      fireTick: 8306,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 8340,
      fireTick: 8347,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 8380,
      fireTick: 8387,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 8415,
      fireTick: 8422,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 8448,
      fireTick: 8455,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 8478,
      fireTick: 8485,
      sounds: [
        [8253, 75],
        [8213, 210],
      ],
    },
    {
      tick: 8508,
      fireTick: null,
      sounds: [
        [8253, 75],
        [8213, 180],
      ],
    },
  ],
};
