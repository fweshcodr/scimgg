import { getEquipmentCombatBaseId } from '../../data/equipmentCombatFamilies';

export function getPoweredStaffBaseMaxHit(weaponId: number | undefined, magicLevel: number): number | undefined {
  switch (weaponId === undefined ? undefined : getEquipmentCombatBaseId(weaponId)) {
    case 11905:
    case 11907:
    case 22288:
      return Math.max(1, Math.floor(magicLevel / 3) - 5);
    case 12899:
    case 22292:
      return Math.max(1, Math.floor(magicLevel / 3) - 2);
    case 22323:
      return Math.max(6, Math.floor(magicLevel / 3));
    case 27275:
    case 28547:
      return Math.max(1, Math.floor(magicLevel / 3) + 1);
    case 28585:
      return Math.floor((8 * magicLevel + 963) / 37);
    case 22555:
      return Math.floor(magicLevel / 3) - 8;
    case 27665:
      return Math.floor(magicLevel / 3) - 6;
    case 28796:
      return Math.floor(magicLevel / 3) + 5;
    case 23898:
      return 23;
    case 23899:
      return 31;
    case 23900:
      return 39;
    case 31113:
      return Math.max(1, Math.floor(magicLevel / 3) - 6);
    default:
      return undefined;
  }
}
