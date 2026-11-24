import { describe, expect, it } from 'vitest';
import { isEquipInventoryAction } from '../equipInventoryActions';

describe('isEquipInventoryAction', () => {
  it.each(['Wear', 'Wield', 'Equip', 'Hold', 'Ride'])('treats the cache op %s as equipping', (op) => {
    expect(isEquipInventoryAction(op)).toBe(true);
  });

  it.each([
    'Chill', // Hand fan: not established as an equip op
    'Play',
    'Eat',
    'Use',
    'Drop',
    'Destroy',
    'wear', // cache labels are capitalized; a lowercased label is not one of them
    ' Wield',
    '',
    null,
    undefined,
  ])('does not treat %j as equipping', (op) => {
    expect(isEquipInventoryAction(op)).toBe(false);
  });
});
