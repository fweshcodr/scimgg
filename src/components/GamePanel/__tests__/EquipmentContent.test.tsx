// @vitest-environment happy-dom

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObjTypeLoader } from '../../../rs/config/objtype/ObjTypeLoader';
import { ContextMenuOverlay, ContextMenuProvider } from '../../ContextMenu';
import { TooltipOverlay, TooltipProvider } from '../../Tooltip';
import { EquipmentContent } from '../EquipmentContent';

function renderEquipmentContent(props: Partial<ComponentProps<typeof EquipmentContent>> = {}) {
  return render(
    <TooltipProvider>
      <ContextMenuProvider>
        <EquipmentContent view="equipment" onViewChange={() => {}} playerEquipment={{ weapon: 4151 }} {...props} />
        <TooltipOverlay />
        <ContextMenuOverlay />
      </ContextMenuProvider>
    </TooltipProvider>,
  );
}

/**
 * Slot sprites live in the panel's shared PixelSpriteLayer canvas, not inside the slot
 * element, so they are read back from the layer's dev-only placement data by position.
 */
function spriteSourcesInSlot(testId: string): string[] {
  const slot = screen.getByTestId(testId);
  const left = Number.parseFloat(slot.style.left);
  const top = Number.parseFloat(slot.style.top);
  const layer = document.querySelector('canvas[data-sprites]');
  const sprites = JSON.parse(layer?.getAttribute('data-sprites') ?? '[]') as {
    src: string;
    x: number;
    y: number;
  }[];
  return sprites
    .filter((sprite) => sprite.x >= left && sprite.x < left + 36 && sprite.y >= top && sprite.y < top + 36)
    .map((sprite) => sprite.src);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EquipmentContent', () => {
  it('falls back to unequip when equipment slot click is not consumed', () => {
    // Given: a worn weapon slot has both generic slot-click and unequip callbacks.
    const onEquipmentSlotClick = vi.fn<(slot: string) => boolean>(() => false);
    const onUnequipSlot = vi.fn<(slot: string) => void>();
    renderEquipmentContent({ onEquipmentSlotClick, onUnequipSlot });

    // When: the user presses primary mouse button on the worn weapon slot.
    fireEvent.mouseDown(screen.getByTestId('equipment-slot-weapon'), { button: 0 });

    // Then: the slot-click handler observes the click, then normal unequip proceeds.
    expect(onEquipmentSlotClick).toHaveBeenCalledWith('weapon');
    expect(onUnequipSlot).toHaveBeenCalledWith('weapon');
  });

  it('does not unequip when equipment slot click is consumed', () => {
    // Given: a worn weapon slot has a consuming slot-click handler.
    const onEquipmentSlotClick = vi.fn<(slot: string) => boolean>(() => true);
    const onUnequipSlot = vi.fn<(slot: string) => void>();
    renderEquipmentContent({ onEquipmentSlotClick, onUnequipSlot });

    // When: the user presses primary mouse button on the worn weapon slot.
    fireEvent.mouseDown(screen.getByTestId('equipment-slot-weapon'), { button: 0 });

    // Then: the grapple-style slot-click path consumes the primary click.
    expect(onEquipmentSlotClick).toHaveBeenCalledWith('weapon');
    expect(onUnequipSlot).not.toHaveBeenCalled();
  });

  it.each([false, true])('offers every slot to the encounter, including repeated clicks (empty: %s)', (empty) => {
    const onEquipmentSlotClick = vi.fn<(slot: string) => boolean>(() => true);
    const onUnequipSlot = vi.fn();
    const onUnequipAmmo = vi.fn();
    renderEquipmentContent({
      playerEquipment: empty ? {} : { weapon: 4151, cape: 28951 },
      inventory: [{ id: 28951, quantity: 1 }],
      equippedAmmo: empty ? null : { id: 28991 },
      quiverAmmo: empty ? null : { id: 28991 },
      onEquipmentSlotClick,
      onUnequipSlot,
      onUnequipAmmo,
    });
    const slots = [
      'head',
      'cape',
      'amulet',
      'ammo',
      'quiver-ammo',
      'weapon',
      'body',
      'shield',
      'legs',
      'hands',
      'boots',
      'ring',
    ];
    for (const slot of [...slots, ...slots]) {
      fireEvent.mouseDown(screen.getByTestId(`equipment-slot-${slot}`), { button: 0 });
    }
    expect(onEquipmentSlotClick.mock.calls).toEqual([...slots, ...slots].map((slot) => [slot]));
    expect(onUnequipSlot).not.toHaveBeenCalled();
    expect(onUnequipAmmo).not.toHaveBeenCalled();
  });

  it.each([
    'weapon',
    'ammo',
  ])('keeps context-menu Remove deliberate for %s even when primary clicks are consumed', (slot) => {
    const onEquipmentSlotClick = vi.fn(() => true);
    const onUnequipSlot = vi.fn();
    const onUnequipAmmo = vi.fn();
    const objTypeLoader = { load: () => ({ name: 'Item' }) } as unknown as ObjTypeLoader;
    renderEquipmentContent({
      equippedAmmo: { id: 28991 },
      objTypeLoader,
      onEquipmentSlotClick,
      onUnequipSlot,
      onUnequipAmmo,
    });
    fireEvent.mouseDown(screen.getByTestId(`equipment-slot-${slot}`), { button: 2, clientX: 10, clientY: 10 });
    const remove = screen.getByRole('menuitem', { name: /Remove/ });
    vi.spyOn(remove, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 20));
    fireEvent.mouseDown(remove, { button: 0, clientX: 10, clientY: 10 });
    expect(onEquipmentSlotClick).not.toHaveBeenCalled();
    if (slot === 'ammo') expect(onUnequipAmmo).toHaveBeenCalledOnce();
    else expect(onUnequipSlot).toHaveBeenCalledWith('weapon');
  });

  it('renders the live equipped ammo icon in the ammo slot', () => {
    // Given: the player has atlatl darts equipped as ammo.
    renderEquipmentContent({ equippedAmmo: { id: 28991 } });

    // When/Then: the ammo slot shows the item sprite.
    // Equipment sprites carry no accessible name, so query the layer by src.
    expect(spriteSourcesInSlot('equipment-slot-ammo').some((src) => src.includes('28991'))).toBe(true);
  });

  it('queues an ammo unequip (not a slot unequip) when the equipped ammo is clicked', () => {
    // Given: ammo is equipped and both ammo + generic unequip handlers are provided.
    const onUnequipAmmo = vi.fn<() => void>();
    const onUnequipSlot = vi.fn<(slot: string) => void>();
    renderEquipmentContent({
      equippedAmmo: { id: 28991 },
      onUnequipAmmo,
      onUnequipSlot,
    });

    // When: the user primary-clicks the ammo slot.
    fireEvent.mouseDown(screen.getByTestId('equipment-slot-ammo'), { button: 0 });

    // Then: it routes to the ammo unequip, never treating ammo as a PlayerEquipment slot.
    expect(onUnequipAmmo).toHaveBeenCalledTimes(1);
    expect(onUnequipSlot).not.toHaveBeenCalledWith('ammo');
  });

  it('shows a removable tooltip for equipped ammo', () => {
    // Given: ammunition is equipped in the normal removable ammo slot.
    renderEquipmentContent({ equippedAmmo: { id: 28991 } });

    // When: the user hovers the equipped ammo slot.
    fireEvent.mouseEnter(screen.getByTestId('equipment-slot-ammo'));

    // Then: the tooltip continues to advertise the existing removal action.
    expect(screen.getByText('Remove')).toBeInTheDocument();
    expect(screen.getByText('ammunition')).toBeInTheDocument();
  });

  it('does not fire an ammo unequip when the ammo slot is empty', () => {
    // Given: no ammo equipped.
    const onUnequipAmmo = vi.fn<() => void>();
    renderEquipmentContent({ equippedAmmo: null, onUnequipAmmo });

    // When: the user clicks the empty ammo slot.
    fireEvent.mouseDown(screen.getByTestId('equipment-slot-ammo'), { button: 0 });

    // Then: nothing is unequipped.
    expect(onUnequipAmmo).not.toHaveBeenCalled();
  });

  it('renders filled quiver ammo above normal ammo when a Dizana quiver is equipped', () => {
    // Given: a Dizana's quiver is worn with ammunition in its extra slot.
    renderEquipmentContent({
      playerEquipment: { cape: 28951 },
      quiverAmmo: { id: 28991 },
    });

    // When/Then: the read-only slot is fully opaque, positioned above ammo, and connected to it.
    const quiverAmmoSlot = screen.getByTestId('equipment-slot-quiver-ammo');
    expect(quiverAmmoSlot).toHaveStyle({ left: '136px', top: '9px', opacity: '1' });
    expect(spriteSourcesInSlot('equipment-slot-quiver-ammo').some((src) => src.includes('28991'))).toBe(true);
    // The connector is drawn into the panel's composed rivet raster rather than its own div,
    // so the raster's key is what records that the run was placed.
    const connectors = document.querySelector('canvas[data-composed^="equipment-connectors"]');
    expect(connectors?.getAttribute('data-composed')).toContain('quiver-ammo');
  });

  it('shows item information without a removal action for quiver ammo', () => {
    // Given: a Dizana's quiver is worn with ammunition in its read-only slot.
    renderEquipmentContent({
      playerEquipment: { cape: 28951 },
      quiverAmmo: { id: 28991 },
    });

    // When: the user hovers the quiver ammo slot.
    fireEvent.mouseEnter(screen.getByTestId('equipment-slot-quiver-ammo'));

    // Then: the tooltip identifies the ammunition without advertising removal.
    expect(screen.getByText('ammunition')).toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('renders the ammo placeholder when an equipped Dizana quiver has no quiver ammo', () => {
    // Given: a Dizana's quiver is worn but its extra ammo slot is empty.
    renderEquipmentContent({
      playerEquipment: { cape: 28947 },
      quiverAmmo: null,
    });

    // When/Then: the extra slot remains visible with the shared ammunition silhouette.
    const quiverAmmoSlot = screen.getByTestId('equipment-slot-quiver-ammo');
    expect(spriteSourcesInSlot('equipment-slot-quiver-ammo').some((src) => src.includes('slot_ammunition.png'))).toBe(
      true,
    );
    expect(quiverAmmoSlot).toHaveStyle({ opacity: '1' });
  });

  it('dims quiver ammo when a Dizana quiver is carried but not equipped', () => {
    // Given: the quiver is in inventory rather than the cape slot.
    renderEquipmentContent({
      playerEquipment: {},
      inventory: [{ id: 28955, quantity: 1 }],
      quiverAmmo: { id: 28991 },
    });

    // When/Then: the extra slot and its contents are present at inventory-only opacity.
    const quiverAmmoSlot = screen.getByTestId('equipment-slot-quiver-ammo');
    expect(quiverAmmoSlot).toHaveStyle({ opacity: '0.5' });
    expect(spriteSourcesInSlot('equipment-slot-quiver-ammo').some((src) => src.includes('28991'))).toBe(true);
  });

  it('suppresses stale quiver ammo when no Dizana quiver is equipped or carried', () => {
    // Given: quiver ammo remains in display state after the quiver itself is absent.
    renderEquipmentContent({
      playerEquipment: {},
      inventory: [{ id: 4151, quantity: 1 }],
      quiverAmmo: { id: 28991 },
    });

    // When/Then: neither the extra slot nor its connector is rendered.
    expect(screen.queryByTestId('equipment-slot-quiver-ammo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quiver-ammo-connector')).not.toBeInTheDocument();
  });
  it('marks stocked ammunition as unlimited', () => {
    // Given: ammo is equipped. Ammunition carries no stack count, so the sprite
    // alone reads much like the empty-slot silhouette.
    renderEquipmentContent({ equippedAmmo: { id: 28991 } });

    // When/Then: the slot states its endless supply outright.
    const ammoSlot = screen.getByTestId('equipment-slot-ammo');
    expect(within(ammoSlot).getByRole('img', { name: 'Unlimited' })).toBeInTheDocument();
  });

  it('leaves an empty ammo slot unmarked', () => {
    // Given: no ammunition is equipped.
    renderEquipmentContent({ equippedAmmo: null });

    // When/Then: nothing claims a supply that is not there.
    const ammoSlot = screen.getByTestId('equipment-slot-ammo');
    expect(within(ammoSlot).queryByRole('img', { name: 'Unlimited' })).toBeNull();
  });

  it('marks quiver ammunition as unlimited as well', () => {
    // Given: a Dizana's quiver is worn with ammunition in its extra slot.
    renderEquipmentContent({ playerEquipment: { cape: 28951 }, quiverAmmo: { id: 28991 } });

    // When/Then: the read-only slot reads as stocked, not as empty.
    const quiverAmmoSlot = screen.getByTestId('equipment-slot-quiver-ammo');
    expect(within(quiverAmmoSlot).getByRole('img', { name: 'Unlimited' })).toBeInTheDocument();
  });

  it('says the equipped ammunition is unlimited in its tooltip', () => {
    // Given: ammunition is equipped.
    renderEquipmentContent({ equippedAmmo: { id: 28991 } });

    // When: the user hovers the ammo slot.
    fireEvent.mouseEnter(screen.getByTestId('equipment-slot-ammo'));

    // Then: the tooltip keeps the removal action and adds the supply state.
    expect(screen.getByText('Remove')).toBeInTheDocument();
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });

  it.each([
    // Worn plus carried, truncated toward zero like the in-game stats screen.
    [{ body: 1127 }, [{ id: 385 }], '10 kg'],
    // Boots of lightness weigh their worn form (-4.535 kg) while equipped.
    [{ boots: 88 }, [], '-4 kg'],
    [{}, [], '0 kg'],
  ])('shows total weight %o + %o as %s in Equipment Stats', (playerEquipment, inventory, text) => {
    const weights = new Map([
      [1127, 9979],
      [385, 650],
      [88, 340],
      [89, -4535],
    ]);
    const objTypeLoader = {
      load: (id: number) => ({ weight: weights.get(id) ?? 0, stackable: false }),
      getCount: () => weights.size,
      clearCache() {},
    } as unknown as ObjTypeLoader;
    renderEquipmentContent({ view: 'stats', playerEquipment, inventory, objTypeLoader });

    const row = screen.getByText('Weight').parentElement;
    expect(row).toHaveTextContent(text);
  });
});
