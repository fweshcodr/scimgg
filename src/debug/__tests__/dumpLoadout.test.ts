import { describe, expect, it } from 'vitest';
import type { Inventory } from '../../types/inventory';
import { formatLoadout } from '../dumpLoadout';

const NAMES: Record<number, string> = {
  21018: 'Ancestral hat',
  29594: 'Purging staff',
  27275: "Tumeken's shadow",
  13441: 'Anglerfish',
};
const resolve = (id: number): string => NAMES[id] ?? '';

function inv(...slots: Inventory): Inventory {
  return [...slots, ...new Array(28 - slots.length).fill(null)];
}

describe('formatLoadout', () => {
  it('renders equipment slots in fixed order, marking empty slots', () => {
    const out = formatLoadout(inv(), { head: 21018, weapon: 29594 }, resolve);
    expect(out).toContain('head   : Ancestral hat (21018)');
    expect(out).toContain('weapon : Purging staff (29594)');
    expect(out).toContain('cape   : (empty)');
    expect(out).toContain('ring   : (empty)');
  });

  it('emits a paste-ready block: interior null kept, trailing trimmed, no quantity, name comment', () => {
    const out = formatLoadout(inv({ id: 27275 }, null, { id: 13441, quantity: 5 }), {}, resolve);
    expect(out).toContain('parseInventoryFromSetup([');
    expect(out).toContain('{ id: 27275 }, null, { id: 13441 },');
    expect(out).toContain("// Tumeken's shadow, (empty), Anglerfish");
    // trailing nulls must not appear as extra rows
    expect(out).not.toContain('null, null, null, null,');
  });

  it('falls back to `Item <id>` for ids the resolver cannot name', () => {
    const out = formatLoadout(inv({ id: 999 }), {}, resolve);
    expect(out).toContain('{ id: 999 }, // Item 999');
  });

  it('handles a completely empty inventory with an empty setup block', () => {
    const out = formatLoadout(inv(), {}, resolve);
    expect(out).toContain('Inventory grid (4 wide x 7 tall):');
    // no item tokens, just the open/close of the setup array
    expect(out).toContain('parseInventoryFromSetup([\n      ]),');
  });

  it('wraps the inventory grid into rows of 4', () => {
    const out = formatLoadout(
      inv({ id: 13441 }, { id: 13441 }, { id: 13441 }, { id: 13441 }, { id: 27275 }),
      {},
      resolve,
    );
    const gridSection = out.split('Inventory grid')[1].split('Preset source')[0];
    const rows = gridSection
      .trim()
      .split('\n')
      .filter((l) => l.startsWith('['));
    expect(rows).toHaveLength(7); // 28 slots / 4 cols
    expect(rows[0].match(/\[/g)).toHaveLength(4);
  });
});
