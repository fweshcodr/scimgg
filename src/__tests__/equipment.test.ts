import { beforeEach, describe, expect, it } from 'vitest';
import type { PendingInputOp } from '../core/inputOps';
import { type EngineAction, SimulationEngine } from '../core/SimulationEngine';
import { EQUIPMENT_PRESETS } from '../data/playerPresets';
import { YamaEncounter } from '../encounters/yamaP3/YamaEncounter';
import type { CacheInfo } from '../rs/cache/CacheInfo';
import { ObjType } from '../rs/config/objtype/ObjType';
import type { ObjTypeLoader } from '../rs/config/objtype/ObjTypeLoader';
import type { PlayerEquipment } from '../rs/model/PlayerModelLoader';
import type { CombatSupplies, SupplyItem } from '../types/encounterLoadout';
import { createEmptyInventory, type Inventory } from '../types/inventory';
import { DEFAULT_PLAYER_CONFIG } from '../types/player';
import { createDefaultStats } from '../types/playerState';

// OSRS wearPos: 0=head,1=cape,2=amulet,3=weapon,4=body,5=shield,7=legs,9=hands,10=boots,12=ring
const WEAR_POS: Record<keyof PlayerEquipment, number> = {
  head: 0,
  cape: 1,
  amulet: 2,
  weapon: 3,
  body: 4,
  shield: 5,
  legs: 7,
  hands: 9,
  boots: 10,
  ring: 12,
};

const ALL_SLOTS = Object.keys(WEAR_POS) as (keyof PlayerEquipment)[];

const MOCK_CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'test',
  revision: 1,
  timestamp: '2024-01-01T00:00:00Z',
  size: 0,
};

function createMockObjTypeLoader(
  items: Record<number, { wearPos1: number; wearPos2?: number; inventoryAction?: string }>,
): ObjTypeLoader {
  return {
    load(id: number): ObjType {
      const def = items[id];
      if (!def) throw new Error(`Unknown item ${id}`);

      const obj = new ObjType(id, MOCK_CACHE_INFO);
      obj.wearPos1 = def.wearPos1;
      if (def.wearPos2 !== undefined) obj.wearPos2 = def.wearPos2;
      obj.maleModel0 = 1;
      obj.inventoryActions = [def.inventoryAction ?? 'Wield', undefined, undefined, undefined, undefined];
      return obj;
    },
    getCount() {
      return Object.keys(items).length;
    },
    clearCache() {},
  };
}

function tick(engine: SimulationEngine): void {
  engine.advanceTick(engine.getState().playerPosition);
}

function suppliesWithEquippedAmmo(equippedAmmo: SupplyItem | null): CombatSupplies {
  return {
    equippedAmmo,
    quiverAmmo: { id: 9242 },
    runePouch: { kind: 'standard', slots: [{ id: 555 }, null, null] },
    blowpipe: { id: 11230 },
    selectedSpell: 'Fire Surge',
    spellbook: 'arceuus' as const,
  };
}

const TEST_ITEMS: Record<keyof PlayerEquipment, number> = {
  head: 50001,
  cape: 50002,
  amulet: 50003,
  weapon: 50004,
  body: 50005,
  shield: 50006,
  legs: 50007,
  hands: 50008,
  boots: 50009,
  ring: 50010,
};

function buildMockItems(): Record<number, { wearPos1: number; wearPos2?: number; inventoryAction?: string }> {
  const items: Record<number, { wearPos1: number; wearPos2?: number; inventoryAction?: string }> = {};
  for (const slot of ALL_SLOTS) {
    items[TEST_ITEMS[slot]] = { wearPos1: WEAR_POS[slot], inventoryAction: 'Wield' };
  }
  return items;
}

describe('Equipment system', () => {
  let engine: SimulationEngine;
  let mockLoader: ObjTypeLoader;

  beforeEach(() => {
    mockLoader = createMockObjTypeLoader(buildMockItems());
    engine = new SimulationEngine({ encounter: new YamaEncounter() });
    engine.setObjTypeLoader(mockLoader);
    engine.setMechanicsConfig({
      yamaMageRange: false,
      yamaMelee: false,
      waves: false,
      fireballs: false,
      infiniteHealth: true,
    });
  });

  describe('special attack equipment ordering', () => {
    beforeEach(() => {
      engine.setObjTypeLoader(
        createMockObjTypeLoader({
          ...buildMockItems(),
          4151: { wearPos1: WEAR_POS.weapon },
          11791: { wearPos1: WEAR_POS.weapon },
          11802: { wearPos1: WEAR_POS.weapon, wearPos2: WEAR_POS.shield },
          11804: { wearPos1: WEAR_POS.weapon, wearPos2: WEAR_POS.shield },
        }),
      );
      engine.setEquipment({ weapon: 11802 });
      engine.queueSpecialAttackToggle();
      tick(engine);
    });

    it('clears armed special when a different special weapon is set', () => {
      engine.setEquipment({ weapon: 11804 });

      expect(engine.getState().isSpecialAttackActive).toBe(false);
    });

    it.each([100, 99])('never predicts an armed instant special at %i energy', (energy) => {
      engine.setEquipment({ weapon: 11791 });
      const player = engine['worldState'].getPlayer();
      if (!player) throw new Error('Expected player');
      player.specialAttack = { ...player.specialAttack, energy };
      engine.queueSpecialAttackToggle();
      expect(engine.projectSpecialAttackState()).toBe(false);
      expect(engine.getState().pendingSpecialAttackActive).toBe(false);
      expect(player.specialAttack.energy).toBe(energy);
      tick(engine);
      expect(player.isSpecialAttackActive).toBe(false);
      expect(player.specialAttack.energy).toBe(energy === 100 ? 0 : 99);
    });

    it.each([true, false])('projects surge use in FIFO order after instant special=%s', (instantFirst) => {
      engine.setEquipment({ weapon: 11791, shield: TEST_ITEMS.shield });
      engine.setMechanicsConfig({ vialSmasher: true });
      const inventory = Array.from({ length: 28 }, () => ({ id: TEST_ITEMS.head }));
      inventory[0] = { id: 11804 };
      inventory[1] = { id: 30884 }; // Surge potion(1): accepted dose frees a shield slot.
      engine.setInventory(inventory);
      const player = engine['worldState'].getPlayer();
      if (!player) throw new Error('Expected player');
      player.specialAttack = { ...player.specialAttack, energy: 100 };
      if (instantFirst) engine.queueSpecialAttackToggle();
      engine.queueItemAction(1);
      if (!instantFirst) engine.queueSpecialAttackToggle();
      engine.queueEquipFromInventory(0, 11804, 'weapon');
      engine.queueSpecialAttackToggle();
      // Only a dose after activation succeeds, freeing room for the shield when the godsword equips.
      expect(engine.projectSpecialAttackState()).toBe(instantFirst);
      expect(player.specialAttack.energy).toBe(100);
      tick(engine);
      expect(player.isSpecialAttackActive).toBe(instantFirst);
      expect(player.specialAttack.energy).toBe(instantFirst ? 25 : 0);
      expect(player.equipment.weapon).toBe(instantFirst ? 11804 : 11791);
    });

    it.each([
      { equipment: {}, active: false },
      { equipment: { weapon: TEST_ITEMS.weapon }, active: false },
      { equipment: { weapon: 11802, head: TEST_ITEMS.head }, active: true },
    ])('sets armed state to $active when equipment becomes $equipment', ({ equipment, active }) => {
      engine.setEquipment(equipment);

      expect(engine.getState().isSpecialAttackActive).toBe(active);
    });

    it.each([
      {
        label: 'weapon switch',
        actions: [{ type: 'equipFromInventory', inventoryIndex: 0, itemId: 11804, slot: 'weapon' }],
        active: false,
      },
      {
        label: 'equip then toggle',
        actions: [
          { type: 'equipFromInventory', inventoryIndex: 0, itemId: 11804, slot: 'weapon' },
          { type: 'specialAttackToggle' },
        ],
        active: true,
      },
      {
        label: 'toggle then equip',
        actions: [
          { type: 'specialAttackToggle' },
          { type: 'equipFromInventory', inventoryIndex: 0, itemId: 11804, slot: 'weapon' },
        ],
        active: false,
      },
      { label: 'weapon removal', actions: [{ type: 'unequip', slot: 'weapon' }], active: false },
      {
        label: 'toggle after removal',
        actions: [{ type: 'unequip', slot: 'weapon' }, { type: 'specialAttackToggle' }],
        active: false,
      },
      {
        label: 'shield removes two-hander',
        actions: [{ type: 'equipFromInventory', inventoryIndex: 1, itemId: TEST_ITEMS.shield, slot: 'shield' }],
        active: false,
      },
      {
        label: 'missing equip item',
        actions: [{ type: 'equipFromInventory', inventoryIndex: 0, itemId: 123456, slot: 'weapon' }],
        active: true,
      },
      {
        label: 'nonweapon equip',
        actions: [{ type: 'equipFromInventory', inventoryIndex: 2, itemId: TEST_ITEMS.head, slot: 'head' }],
        active: true,
      },
      {
        label: 'same weapon ID',
        actions: [{ type: 'equipFromInventory', inventoryIndex: 3, itemId: 11802, slot: 'weapon' }],
        active: true,
      },
      {
        label: 'non-special weapon then toggle',
        actions: [
          { type: 'equipFromInventory', inventoryIndex: 4, itemId: TEST_ITEMS.weapon, slot: 'weapon' },
          { type: 'specialAttackToggle' },
        ],
        active: false,
      },
    ] satisfies readonly {
      readonly label: string;
      readonly actions: readonly EngineAction[];
      readonly active: boolean;
    }[])('resolves armed state after $label in FIFO order', ({ actions, active }) => {
      const inventory = createEmptyInventory();
      inventory[0] = { id: 11804 };
      inventory[1] = { id: TEST_ITEMS.shield };
      inventory[2] = { id: TEST_ITEMS.head };
      inventory[3] = { id: 11802 };
      inventory[4] = { id: TEST_ITEMS.weapon };
      engine.setInventory(inventory);

      for (const action of actions) engine.applyAction(action);
      tick(engine);

      expect(engine.getState().isSpecialAttackActive).toBe(active);
    });

    it('preserves armed special when a full inventory prevents weapon removal', () => {
      engine.setInventory(Array.from({ length: 28 }, () => ({ id: TEST_ITEMS.head })));

      engine.queueUnequip('weapon');
      tick(engine);

      expect(engine.getState().isSpecialAttackActive).toBe(true);
    });

    it('rejects a toggle when the equipped weapon has no special', () => {
      engine.setEquipment({ weapon: TEST_ITEMS.weapon });

      engine.queueSpecialAttackToggle();
      tick(engine);

      expect(engine.getState().isSpecialAttackActive).toBe(false);
    });

    it.each([
      {
        label: 'equip then toggle',
        ops: [{ type: 'equip', inventoryIndex: 0, itemId: 11804, slot: 'weapon' }, { type: 'special_attack_toggle' }],
        active: true,
      },
      {
        label: 'toggle then equip',
        ops: [{ type: 'special_attack_toggle' }, { type: 'equip', inventoryIndex: 0, itemId: 11804, slot: 'weapon' }],
        active: false,
      },
      {
        label: 'weapon switch without toggle',
        ops: [{ type: 'equip', inventoryIndex: 0, itemId: 11804, slot: 'weapon' }],
        active: false,
      },
      {
        label: 'weapon removal then toggle',
        ops: [{ type: 'unequip', slot: 'weapon' }, { type: 'special_attack_toggle' }],
        active: false,
      },
      {
        label: 'shield displacing two-hander',
        ops: [{ type: 'equip', inventoryIndex: 1, itemId: TEST_ITEMS.shield, slot: 'shield' }],
        active: false,
      },
      {
        label: 'missing item',
        ops: [{ type: 'equip', inventoryIndex: 0, itemId: 123456, slot: 'weapon' }],
        active: true,
      },
      {
        label: 'nonweapon change',
        ops: [{ type: 'equip', inventoryIndex: 2, itemId: TEST_ITEMS.head, slot: 'head' }],
        active: true,
      },
      {
        label: 'same weapon ID',
        ops: [{ type: 'equip', inventoryIndex: 3, itemId: 11802, slot: 'weapon' }],
        active: true,
      },
      {
        label: 'non-special weapon then toggle',
        ops: [
          { type: 'equip', inventoryIndex: 4, itemId: TEST_ITEMS.weapon, slot: 'weapon' },
          { type: 'special_attack_toggle' },
        ],
        active: false,
      },
      {
        label: 'moved inventory item',
        ops: [{ type: 'equip', inventoryIndex: 27, itemId: 11804, slot: 'weapon' }, { type: 'special_attack_toggle' }],
        active: true,
      },
      {
        label: 'switch away and back',
        ops: [
          { type: 'equip', inventoryIndex: 0, itemId: 11804, slot: 'weapon' },
          { type: 'special_attack_toggle' },
          { type: 'equip', inventoryIndex: 0, itemId: 11802, slot: 'weapon' },
        ],
        active: false,
      },
    ] satisfies readonly {
      readonly label: string;
      readonly ops: readonly PendingInputOp[];
      readonly active: boolean;
    }[])('projects pending and additional $label without mutating committed state', ({ ops, active }) => {
      const inventory = createEmptyInventory();
      inventory[0] = { id: 11804 };
      inventory[1] = { id: TEST_ITEMS.shield };
      inventory[2] = { id: TEST_ITEMS.head };
      inventory[3] = { id: 11802 };
      inventory[4] = { id: TEST_ITEMS.weapon };
      engine.setInventory(inventory);
      const first = ops[0];
      if (!first) throw new TypeError('Expected a queued operation');
      engine['queueInput'](first);
      const before = engine.getState();

      const projected = engine.projectSpecialAttackState(ops.slice(1));

      expect(projected).toBe(active);
      expect(engine.getState()).toEqual(before);
    });

    it('publishes ordered pending state separately when an armed weapon switch is queued', () => {
      const inventory = createEmptyInventory();
      inventory[0] = { id: 11804 };
      engine.setInventory(inventory);
      engine.queueEquipFromInventory(0, 11804, 'weapon');

      const state = engine.getState();

      expect(state.isSpecialAttackActive).toBe(true);
      expect(state.pendingSpecialAttackActive).toBe(false);
    });

    it('projects a rejected two-handed equip when the shield cannot fit in inventory', () => {
      engine.setEquipment({ weapon: 4151, shield: TEST_ITEMS.shield });
      engine.queueSpecialAttackToggle();
      tick(engine);
      const inventory = Array.from({ length: 28 }, () => ({ id: TEST_ITEMS.head }));
      inventory[0] = { id: 11804 };
      engine.setInventory(inventory);
      engine.queueEquipFromInventory(0, 11804, 'weapon');

      const projected = engine.projectSpecialAttackState();
      tick(engine);

      expect(projected).toBe(true);
      expect(engine.getState().isSpecialAttackActive).toBe(true);
    });

    it('projects a rejected weapon removal when the inventory is full', () => {
      engine.setInventory(Array.from({ length: 28 }, () => ({ id: TEST_ITEMS.head })));
      engine.queueUnequip('weapon');

      const projected = engine.projectSpecialAttackState();

      expect(projected).toBe(true);
    });

    it.each([undefined, TEST_ITEMS.weapon])('arms the new special weapon when the previous weapon is %s', (weapon) => {
      engine.setEquipment(weapon === undefined ? {} : { weapon });
      const inventory = createEmptyInventory();
      inventory[0] = { id: 11804 };
      engine.setInventory(inventory);
      engine.queueEquipFromInventory(0, 11804, 'weapon');
      engine.queueSpecialAttackToggle();

      const projected = engine.projectSpecialAttackState();
      tick(engine);

      expect(projected).toBe(true);
      expect(engine.getState().isSpecialAttackActive).toBe(true);
    });

    it('clears a newly armed special when a switch follows the toggle', () => {
      engine.queueSpecialAttackToggle();
      tick(engine);
      const inventory = createEmptyInventory();
      inventory[0] = { id: 11804 };
      engine.setInventory(inventory);
      engine.queueSpecialAttackToggle();
      engine.queueEquipFromInventory(0, 11804, 'weapon');

      const projected = engine.projectSpecialAttackState();
      tick(engine);

      expect(projected).toBe(false);
      expect(engine.getState().isSpecialAttackActive).toBe(false);
    });

    it('projects successful weapon removal when ammo equip first frees an inventory slot', () => {
      engine.setCombatSupplies(suppliesWithEquippedAmmo(null));
      const inventory = Array.from({ length: 28 }, () => ({ id: TEST_ITEMS.head }));
      inventory[0] = { id: 11212 };
      engine.setInventory(inventory);
      engine.queueEquipAmmoFromInventory(0, 11212);
      engine.queueUnequip('weapon');

      const projected = engine.projectSpecialAttackState();
      tick(engine);

      expect(projected).toBe(false);
      expect(engine.getState().isSpecialAttackActive).toBe(false);
    });

    it('projects failed weapon removal when ammo removal first fills the last inventory slot', () => {
      engine.setCombatSupplies(suppliesWithEquippedAmmo({ id: 11212 }));
      const inventory: Inventory = Array.from({ length: 28 }, () => ({ id: TEST_ITEMS.head }));
      inventory[0] = null;
      engine.setInventory(inventory);
      engine.queueUnequipAmmo();
      engine.queueUnequip('weapon');

      const projected = engine.projectSpecialAttackState();
      tick(engine);

      expect(projected).toBe(true);
      expect(engine.getState().isSpecialAttackActive).toBe(true);
    });

    it.each(['eat', 'drop'] as const)('projects the slot freed by %s before a two-handed equip', (operation) => {
      engine.setEquipment({ weapon: 4151, shield: TEST_ITEMS.shield });
      engine.queueSpecialAttackToggle();
      tick(engine);
      const inventory = Array.from({ length: 28 }, () => ({ id: TEST_ITEMS.head }));
      inventory[0] = { id: 11804 };
      inventory[1] = { id: 13441 };
      engine.setInventory(inventory);
      if (operation === 'eat') engine.queueItemAction(1);
      else engine.queueDropItem(1);
      engine.queueEquipFromInventory(0, 11804, 'weapon');

      expect(engine.projectSpecialAttackState()).toBe(false);
      tick(engine);
      expect(engine.getState().isSpecialAttackActive).toBe(false);
      expect(engine.getState().playerEquipment.weapon).toBe(11804);
    });

    it('does not predict an inventory slot freed by food blocked by a potion cooldown', () => {
      engine.setEquipment({ weapon: 4151, shield: TEST_ITEMS.shield });
      engine.queueSpecialAttackToggle();
      tick(engine);
      const inventory = Array.from({ length: 28 }, () => ({ id: TEST_ITEMS.head }));
      inventory[0] = { id: 11804 };
      inventory[1] = { id: 13441 };
      inventory[2] = { id: 3024 };
      engine.setInventory(inventory);
      engine.queueItemAction(2);
      engine.queueItemAction(1);
      engine.queueEquipFromInventory(0, 11804, 'weapon');

      expect(engine.projectSpecialAttackState()).toBe(true);
      tick(engine);
      expect(engine.getState().isSpecialAttackActive).toBe(true);
    });
  });

  describe('default equipment preset', () => {
    it('yama_p3 melee preset has items in all expected slots', () => {
      const preset = EQUIPMENT_PRESETS.yama_p3?.melee;
      expect(preset).toBeDefined();

      const expectedSlots: (keyof PlayerEquipment)[] = [
        'head',
        'cape',
        'amulet',
        'weapon',
        'body',
        'shield',
        'legs',
        'hands',
        'boots',
        'ring',
      ];

      for (const slot of expectedSlots) {
        expect(preset.equipment[slot]).toBeDefined();
        expect(typeof preset.equipment[slot]).toBe('number');
      }
    });

    it('DEFAULT_PLAYER_CONFIG starts with empty equipment', () => {
      expect(DEFAULT_PLAYER_CONFIG.equipment).toEqual({});
    });

    it('DEFAULT_PLAYER_CONFIG starts with all combat stats at 99', () => {
      expect(DEFAULT_PLAYER_CONFIG.stats).toEqual(createDefaultStats());
    });

    it('yama_p3 max-mage preset includes Magus ring (28313)', () => {
      expect(EQUIPMENT_PRESETS.yama_p3?.['max-mage']?.equipment.ring).toBe(28313);
    });

    it('contract variants use encounter-specific preset buckets', () => {
      expect(EQUIPMENT_PRESETS.yama_p3_forfeit_breath?.mage.equipment.ring).toBe(24736);
      expect(EQUIPMENT_PRESETS.yama_p3_glyphic?.melee.equipment.weapon).toBe(24417);
      expect(EQUIPMENT_PRESETS.yama_p3_sensory?.mage.inventory[3]?.id).toBe(29591);
      expect(EQUIPMENT_PRESETS.yama_p3_divine?.mage.inventory[2]?.id).toBe(10925);
      expect(EQUIPMENT_PRESETS.yama_p3_bloodied?.mage.inventory[22]?.id).toBe(22081);
    });
  });

  describe('getItemEquipSlot', () => {
    it.each(ALL_SLOTS)('maps item with wearPos %s correctly', (slot) => {
      const itemId = TEST_ITEMS[slot];
      const result = engine.getItemEquipSlot(itemId);
      expect(result).toBe(slot);
    });

    it('returns null for unknown item', () => {
      expect(engine.getItemEquipSlot(99999)).toBeNull();
    });

    it('returns null when no ObjTypeLoader is set', () => {
      const bareEngine = new SimulationEngine({ encounter: new YamaEncounter() });
      expect(bareEngine.getItemEquipSlot(TEST_ITEMS.head)).toBeNull();
    });
  });

  describe('isAmmoItem', () => {
    it('returns false for a missing item definition', () => {
      expect(engine.isAmmoItem(99999)).toBe(false);
    });

    it('propagates unexpected loader failures', () => {
      const loaderFailure = new TypeError('cache decode failed');
      const failingLoader: ObjTypeLoader = {
        load() {
          throw loaderFailure;
        },
        getCount: () => 1,
        clearCache() {},
      };
      engine.setObjTypeLoader(failingLoader);

      expect(() => engine.isAmmoItem(TEST_ITEMS.head)).toThrow(loaderFailure);
    });
  });

  describe('equip from inventory', () => {
    it.each(ALL_SLOTS)('equips item into %s slot from inventory', (slot) => {
      const itemId = TEST_ITEMS[slot];

      const inv = createEmptyInventory();
      inv[0] = { id: itemId };
      engine.setInventory(inv);

      engine.queueEquipFromInventory(0, itemId, slot);
      tick(engine);

      const state = engine.getState();
      expect(state.playerEquipment[slot]).toBe(itemId);
      expect(state.inventory[0]).toBeNull();
    });

    it('swaps existing item back to inventory when equipping same slot', () => {
      const oldItemId = TEST_ITEMS.head;
      const newItemId = TEST_ITEMS.head + 100;

      const items = buildMockItems();
      items[newItemId] = { wearPos1: WEAR_POS.head, inventoryAction: 'Wield' };
      const loader = createMockObjTypeLoader(items);
      engine.setObjTypeLoader(loader);

      engine.setEquipment({ head: oldItemId });

      const inv = createEmptyInventory();
      inv[0] = { id: newItemId };
      engine.setInventory(inv);

      engine.queueEquipFromInventory(0, newItemId, 'head');
      tick(engine);

      const state = engine.getState();
      expect(state.playerEquipment.head).toBe(newItemId);
      expect(state.inventory[0]).toEqual({ id: oldItemId });
    });

    it('resolves queued same-tick equips by expected item id after earlier inventory swaps', () => {
      const oldItemId = TEST_ITEMS.head;
      const newItemId = TEST_ITEMS.head + 100;
      const items = buildMockItems();
      items[newItemId] = { wearPos1: WEAR_POS.head, inventoryAction: 'Wield' };
      engine.setObjTypeLoader(createMockObjTypeLoader(items));
      engine.setEquipment({ head: oldItemId });
      const inv = createEmptyInventory();
      inv[0] = { id: newItemId };
      engine.setInventory(inv);

      engine.queueEquipFromInventory(0, newItemId, 'head');
      engine.queueEquipFromInventory(0, oldItemId, 'head');
      tick(engine);

      const state = engine.getState();
      expect(state.playerEquipment.head).toBe(oldItemId);
      expect(state.inventory[0]).toEqual({ id: newItemId });
    });

    it('does nothing when inventory slot is empty', () => {
      engine.setEquipment({});
      const inv = createEmptyInventory();
      engine.setInventory(inv);

      engine.queueEquipFromInventory(0, TEST_ITEMS.ring, 'ring');
      tick(engine);

      const state = engine.getState();
      expect(state.playerEquipment.ring).toBeUndefined();
    });
  });

  describe('equipped ammo transactions', () => {
    it('empties the source slot when the inventory ammo matches what is already worn', () => {
      engine.setCombatSupplies(suppliesWithEquippedAmmo({ id: 11212 }));
      const inventory = createEmptyInventory();
      inventory[4] = { id: 11212, quantity: 7 };
      engine.setInventory(inventory);

      engine.queueEquipAmmoFromInventory(4, 11212);
      tick(engine);

      expect(engine.getCombatSupplies()).toEqual(suppliesWithEquippedAmmo({ id: 11212 }));
      expect(engine.getState().inventory[4]).toBeNull();
    });

    it('swaps different equipped ammo into the source inventory slot', () => {
      engine.setCombatSupplies(suppliesWithEquippedAmmo({ id: 28991 }));
      const inventory = createEmptyInventory();
      inventory[6] = { id: 9242, quantity: 807 };
      engine.setInventory(inventory);

      engine.queueEquipAmmoFromInventory(6, 9242);
      tick(engine);

      expect(engine.getCombatSupplies()).toEqual(suppliesWithEquippedAmmo({ id: 9242 }));
      expect(engine.getState().inventory[6]).toEqual({ id: 28991 });
    });

    it('unequips the worn ammo into the first empty inventory slot', () => {
      engine.setCombatSupplies(suppliesWithEquippedAmmo({ id: 28991 }));
      const inventory = createEmptyInventory();
      inventory[0] = { id: 1 };
      engine.setInventory(inventory);

      engine.queueUnequipAmmo();
      tick(engine);

      expect(engine.getCombatSupplies()).toEqual(suppliesWithEquippedAmmo(null));
      expect(engine.getState().inventory[1]).toEqual({ id: 28991 });
    });

    it('does not unequip ammo when the inventory is full', () => {
      const supplies = suppliesWithEquippedAmmo({ id: 11212 });
      engine.setCombatSupplies(supplies);
      engine.setInventory(Array.from({ length: 28 }, () => ({ id: 1 })));

      engine.queueUnequipAmmo();
      tick(engine);

      expect(engine.getCombatSupplies()).toEqual(supplies);
      expect(engine.getState().inventory).toEqual(Array.from({ length: 28 }, () => ({ id: 1 })));
    });

    it('cancels an existing attack before auto-attack when ammo is equipped', () => {
      engine.setEquipment({ weapon: 20997 });
      engine.setCombatSupplies(suppliesWithEquippedAmmo(null));
      const inventory = createEmptyInventory();
      inventory[0] = { id: 11212, quantity: 3 };
      engine.setInventory(inventory);
      engine.setAttackTarget('yama');

      engine.queueEquipAmmoFromInventory(0, 11212);
      tick(engine);

      expect(engine.getAttackTarget()).toBeNull();
      expect(engine.getCombatSupplies().equippedAmmo).toEqual({ id: 11212 });
    });

    it('lets a later same-tick attack click restore interaction after ammo equips', () => {
      const attackEngine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: [31, 27] });
      attackEngine.setMechanicsConfig({
        yamaMageRange: false,
        yamaMelee: false,
        waves: false,
        fireballs: false,
        voidFlares: false,
        infiniteHealth: true,
      });
      attackEngine.setEquipment({ weapon: 20997 });
      attackEngine.setCombatSupplies(suppliesWithEquippedAmmo(null));
      const inventory = createEmptyInventory();
      inventory[0] = { id: 11212, quantity: 3 };
      attackEngine.setInventory(inventory);

      attackEngine.queueEquipAmmoFromInventory(0, 11212);
      attackEngine.applyAction({ type: 'attackTarget', targetId: 'yama' });
      tick(attackEngine);

      expect(attackEngine.getAttackTarget()).toBe('yama');
      expect(attackEngine.getCombatSupplies().equippedAmmo).toEqual({ id: 11212 });
      expect(attackEngine.getState().inventory[0]).toBeNull();
    });
  });

  describe('instant inventory previews', () => {
    it('previews an equip inventory swap without changing equipment before the tick', () => {
      const oldItemId = TEST_ITEMS.head;
      const newItemId = TEST_ITEMS.head + 100;
      const items = buildMockItems();
      items[newItemId] = { wearPos1: WEAR_POS.head, inventoryAction: 'Wield' };
      engine.setObjTypeLoader(createMockObjTypeLoader(items));
      engine.setEquipment({ head: oldItemId });
      const inv = createEmptyInventory();
      inv[0] = { id: newItemId };
      engine.setInventory(inv);

      const preview = engine.previewInventoryAfterEquipFromInventory(0, 'head');

      expect(preview?.[0]).toEqual({ id: oldItemId });
      expect(engine.getState().inventory[0]).toEqual({ id: newItemId });
      expect(engine.getState().playerEquipment.head).toBe(oldItemId);
    });

    it('previews two-handed weapon equip by returning the shield to inventory', () => {
      const twoHandedWeapon = TEST_ITEMS.weapon + 100;
      const equippedWeapon = TEST_ITEMS.weapon;
      const equippedShield = TEST_ITEMS.shield;
      const items = buildMockItems();
      items[twoHandedWeapon] = { wearPos1: WEAR_POS.weapon, wearPos2: WEAR_POS.shield, inventoryAction: 'Wield' };
      engine.setObjTypeLoader(createMockObjTypeLoader(items));
      engine.setEquipment({ weapon: equippedWeapon, shield: equippedShield });
      const inv = createEmptyInventory();
      inv[0] = { id: twoHandedWeapon };
      engine.setInventory(inv);

      const preview = engine.previewInventoryAfterEquipFromInventory(0, 'weapon');

      expect(preview?.[0]).toEqual({ id: equippedWeapon });
      expect(preview?.some((slot) => slot?.id === equippedShield)).toBe(true);
      expect(engine.getState().playerEquipment.weapon).toBe(equippedWeapon);
      expect(engine.getState().playerEquipment.shield).toBe(equippedShield);
    });

    it('lets the Zuk Atlatl preset stow its crossbow and shield when wielding the two-handed Atlatl', () => {
      const preset = EQUIPMENT_PRESETS.zuk.atlatl_eclipse;
      const items = buildMockItems();
      items[29000] = { wearPos1: WEAR_POS.weapon, wearPos2: WEAR_POS.shield, inventoryAction: 'Wield' };
      items[9185] = { wearPos1: WEAR_POS.weapon, inventoryAction: 'Wield' };
      engine.setObjTypeLoader(createMockObjTypeLoader(items));

      const atlatlSlot = preset.inventory.findIndex((slot) => slot?.id === 29000);
      const freeSlot = preset.inventory.indexOf(null);

      const preview = engine.previewEquipFromInventoryState(preset.inventory, preset.equipment, atlatlSlot, 'weapon');

      expect(preview?.equipment.weapon).toBe(29000);
      expect(preview?.equipment.shield).toBeUndefined();
      // The preset opens on the one-handed Rune crossbow, so equipping the atlatl has to stow
      // BOTH it and the Crystal shield — the swap the preset's free slot exists for.
      expect(preview?.inventory[atlatlSlot]).toEqual({ id: 9185 });
      expect(preview?.inventory[freeSlot]).toEqual({ id: 23991 });
    });

    it('lets the Zuk Mage Tank preset click its tank switch and back in the same zig-zag', () => {
      const preset = EQUIPMENT_PRESETS.zuk.mage_tank;
      const items = buildMockItems();
      const wear: Record<number, keyof PlayerEquipment> = {
        27275: 'weapon', // Tumeken's shadow (two-handed)
        21018: 'head',
        21021: 'body',
        21024: 'legs',
        31113: 'weapon', // Eye of Ayak
        11832: 'body',
        4759: 'legs',
        22326: 'head',
        27251: 'shield',
      };
      for (const [id, slot] of Object.entries(wear)) items[Number(id)] = { wearPos1: WEAR_POS[slot] };
      items[27275] = { wearPos1: WEAR_POS.weapon, wearPos2: WEAR_POS.shield };
      engine.setObjTypeLoader(createMockObjTypeLoader(items));

      const clickZigZag = (state: { inventory: Inventory; equipment: PlayerEquipment }, stops: readonly number[]) =>
        stops.reduce((current, slot) => {
          const id = current.inventory[slot]?.id;
          if (id === undefined) return current;
          const next = engine.previewEquipFromInventoryState(current.inventory, current.equipment, slot, wear[id]!);
          expect(next, `click slot ${slot + 1}`).not.toBeNull();
          return next!;
        }, state);

      const tank = clickZigZag({ inventory: preset.inventory, equipment: preset.equipment }, [0, 4, 1, 5, 2]);
      expect(tank.equipment).toMatchObject({ weapon: 31113, body: 11832, legs: 4759, head: 22326, shield: 27251 });

      // Back again: the Shadow drops the ward into slot 3, the last stop, so the four return
      // clicks restore the mage set and the ward stays in the inventory.
      const mage = clickZigZag(tank, [0, 4, 1, 5]);
      expect(mage.equipment).toEqual(preset.equipment);
      expect(mage.inventory).toEqual(preset.inventory);
    });

    it('previews unequip into the first empty inventory slot without changing equipment', () => {
      const itemId = TEST_ITEMS.ring;
      engine.setEquipment({ ring: itemId });
      engine.setInventory(createEmptyInventory());

      const preview = engine.previewInventoryAfterUnequip('ring');

      expect(preview?.[0]).toEqual({ id: itemId });
      expect(engine.getState().inventory[0]).toBeNull();
      expect(engine.getState().playerEquipment.ring).toBe(itemId);
    });

    it('chains multiple pre-tick equip previews from the previous visual inventory', () => {
      const oldHead = TEST_ITEMS.head;
      const oldCape = TEST_ITEMS.cape;
      const newHead = TEST_ITEMS.head + 100;
      const newCape = TEST_ITEMS.cape + 100;
      const items = buildMockItems();
      items[newHead] = { wearPos1: WEAR_POS.head, inventoryAction: 'Wield' };
      items[newCape] = { wearPos1: WEAR_POS.cape, inventoryAction: 'Wield' };
      engine.setObjTypeLoader(createMockObjTypeLoader(items));
      engine.setEquipment({ head: oldHead, cape: oldCape });
      const inv = createEmptyInventory();
      inv[0] = { id: newHead };
      inv[1] = { id: newCape };
      engine.setInventory(inv);

      const firstPreview = engine.previewEquipFromInventoryState(inv, { head: oldHead, cape: oldCape }, 0, 'head');
      expect(firstPreview).not.toBeNull();
      if (!firstPreview) throw new Error('Expected first equip preview');
      const secondPreview = engine.previewEquipFromInventoryState(
        firstPreview.inventory,
        firstPreview.equipment,
        1,
        'cape',
      );

      expect(secondPreview?.inventory[0]).toEqual({ id: oldHead });
      expect(secondPreview?.inventory[1]).toEqual({ id: oldCape });
      expect(secondPreview?.equipment.head).toBe(newHead);
      expect(secondPreview?.equipment.cape).toBe(newCape);
      expect(engine.getState().inventory[0]).toEqual({ id: newHead });
      expect(engine.getState().inventory[1]).toEqual({ id: newCape });
      expect(engine.getState().playerEquipment.head).toBe(oldHead);
      expect(engine.getState().playerEquipment.cape).toBe(oldCape);
    });
  });

  describe('unequip slot', () => {
    it.each(ALL_SLOTS)('unequips %s slot to inventory', (slot) => {
      const itemId = TEST_ITEMS[slot];

      const equipment: PlayerEquipment = { [slot]: itemId };
      engine.setEquipment(equipment);
      engine.setInventory(createEmptyInventory());

      engine.queueUnequip(slot);
      tick(engine);

      const state = engine.getState();
      expect(state.playerEquipment[slot]).toBeUndefined();

      const invItem = state.inventory.find((s) => s?.id === itemId);
      expect(invItem).toBeDefined();
    });

    it('does nothing when slot is already empty', () => {
      engine.setEquipment({});
      engine.setInventory(createEmptyInventory());

      engine.queueUnequip('ring');
      tick(engine);

      const state = engine.getState();
      expect(state.playerEquipment.ring).toBeUndefined();
      expect(state.inventory.every((s) => s === null)).toBe(true);
    });

    it('does not unequip when inventory is full', () => {
      const itemId = TEST_ITEMS.ring;
      engine.setEquipment({ ring: itemId });

      const fullInv: Inventory = Array.from({ length: 28 }, () => ({ id: 1 }));
      engine.setInventory(fullInv);

      engine.queueUnequip('ring');
      tick(engine);

      const state = engine.getState();
      expect(state.playerEquipment.ring).toBe(itemId);
    });
  });

  describe('equip then unequip round-trip', () => {
    it.each(ALL_SLOTS)('round-trips %s slot correctly', (slot) => {
      const itemId = TEST_ITEMS[slot];

      const inv = createEmptyInventory();
      inv[0] = { id: itemId };
      engine.setInventory(inv);

      engine.queueEquipFromInventory(0, itemId, slot);
      tick(engine);

      let state = engine.getState();
      expect(state.playerEquipment[slot]).toBe(itemId);
      expect(state.inventory[0]).toBeNull();

      engine.queueUnequip(slot);
      tick(engine);

      state = engine.getState();
      expect(state.playerEquipment[slot]).toBeUndefined();
      const invItem = state.inventory.find((s) => s?.id === itemId);
      expect(invItem).toBeDefined();
    });
  });

  describe('multiple slots', () => {
    it('can have all slots equipped at once', () => {
      const equipment: PlayerEquipment = {};
      for (const slot of ALL_SLOTS) {
        equipment[slot] = TEST_ITEMS[slot];
      }
      engine.setEquipment(equipment);

      const state = engine.getState();
      for (const slot of ALL_SLOTS) {
        expect(state.playerEquipment[slot]).toBe(TEST_ITEMS[slot]);
      }
    });

    it('unequipping one slot does not affect others', () => {
      const equipment: PlayerEquipment = {};
      for (const slot of ALL_SLOTS) {
        equipment[slot] = TEST_ITEMS[slot];
      }
      engine.setEquipment(equipment);
      engine.setInventory(createEmptyInventory());

      engine.queueUnequip('ring');
      tick(engine);

      const state = engine.getState();
      expect(state.playerEquipment.ring).toBeUndefined();

      for (const slot of ALL_SLOTS) {
        if (slot !== 'ring') {
          expect(state.playerEquipment[slot]).toBe(TEST_ITEMS[slot]);
        }
      }
    });
  });
});
