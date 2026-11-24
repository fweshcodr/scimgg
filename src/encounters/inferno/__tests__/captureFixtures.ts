/**
 * The committed Inferno replay ranges (`replayRange.ts` format), per private gameplay capture named
 * by `capture`. Each range file holds one replayed tick range of one capture stream.
 */
export interface CaptureFixtureEntry {
  /** File name of the capture the ranges were extracted from. */
  readonly capture: string;
  /** Repository-relative `.replay.txt` paths. */
  readonly ranges: readonly string[];
}

export const INFERNO_REPLAY_DIRECTORY = 'src/encounters/inferno/__tests__/fixtures/replay';

const ranges = (stem: string, names: readonly string[]) =>
  names.map((name) => `${INFERNO_REPLAY_DIRECTORY}/${stem}.${name}.replay.txt`);

export const INFERNO_CAPTURE_FIXTURES = {
  infernoWaves1To68: {
    capture: 'inferno-waves-1-68-packet-data.txt',
    ranges: ranges('inferno-waves-1-68', [
      's1.t470-1023',
      's1.t4817-5069',
      's1.t7299-7515',
      's1.t7521-7731',
      's1.t8029-8337',
      's1.t9024-9288',
      's1.t9665-10030',
      's2.t14-903',
    ]),
  },
  infernoWaves35To68: {
    capture: 'inferno-waves-(35ish)-to-68-packet-data.txt',
    ranges: ranges('inferno-waves-35-to-68', [
      's1.t837-913',
      's1.t2556-2681',
      's1.t2844-3038',
      's1.t3380-3595',
      's1.t4105-4315',
      's1.t4758-4845',
      's1.t4851-5180',
    ]),
  },
} as const satisfies Readonly<Record<string, CaptureFixtureEntry>>;

/**
 * The only varbits the ranges hold: the protection prayers (4116-4118) and the pillar damage
 * (5655-5657) that `captureAdapter.ts` reads. Account and profile state arrives as vars, so no other
 * varbit and no varp is kept; `captureFixtures.test.ts` enforces the allowlist.
 */
export const INFERNO_CAPTURE_VARBITS: ReadonlySet<number> = new Set([4116, 4117, 4118, 5655, 5656, 5657]);
