import { describe, expect, it } from 'vitest';
import { osmPopoutPlacement } from '../../layout/osmClientLayout';
import { osmCssRect } from '../../layout/osmFrame';
import { defaultOsmFrame } from '../../test/helpers/osmFrame';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
/** An iPhone's home indicator in landscape. The full height is 503 rows, so only this takes it below. */
const HOME_INDICATOR = { ...NO_INSETS, bottom: 21 };

describe('pop-out geometry (group 728, mobile branch)', () => {
  it('sits in its native slot under the hotkeys: (0,4) from the bottom below 503 rows', () => {
    const frame = defaultOsmFrame({ width: 844, height: 390 }, HOME_INDICATOR);
    const rows = frame.size.height;
    expect(rows).toBeLessThan(503);
    expect(osmCssRect(frame, osmPopoutPlacement(rows))).toEqual(
      osmCssRect(frame, { x: 0, y: rows - 4 - 46, width: 58, height: 46 }),
    );
  });

  it('centers +204 from 503 rows up, still right under the hotkeys column', () => {
    const frame = defaultOsmFrame({ width: 1180, height: 820 }, NO_INSETS);
    const rows = frame.size.height;
    expect(rows).toBeGreaterThanOrEqual(503);
    const top = Math.trunc((rows - 46) / 2) + 204;
    expect(osmCssRect(frame, osmPopoutPlacement(rows))).toEqual(
      osmCssRect(frame, { x: 0, y: top, width: 58, height: 46 }),
    );
    // The expanded hotkeys column ends at centered+60+242, where the pop-out begins.
    expect(Math.trunc((rows - 242) / 2) + 60 + 242).toBe(top);
  });

  it('follows the safe area and the chrome scale', () => {
    const frame = defaultOsmFrame({ width: 844, height: 390 }, { ...NO_INSETS, left: 44 });
    const closed = osmCssRect(frame, osmPopoutPlacement(frame.size.height));
    expect(closed.x).toBe(44);
    expect(closed.width).toBe(Math.round(58 * frame.scale));
  });
});
