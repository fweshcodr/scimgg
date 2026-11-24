// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenuProvider } from '../components/ContextMenu';
import { getSlotIndexFromPoint, InventoryContent, inventorySlotOrigin } from '../components/GamePanel/InventoryContent';
import { TooltipProvider } from '../components/Tooltip';
import type { CacheInfo } from '../rs/cache/CacheInfo';
import { ObjType } from '../rs/config/objtype/ObjType';
import { createEmptyInventory, type Inventory } from '../types/inventory';

const MOCK_CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'test',
  revision: 1,
  timestamp: '2024-01-01T00:00:00Z',
  size: 0,
};

function renderWithProviders(element: ReactElement) {
  const Providers = ({ children }: { children: ReactNode }) => (
    <TooltipProvider>
      <ContextMenuProvider>{children}</ContextMenuProvider>
    </TooltipProvider>
  );
  return render(element, { wrapper: Providers });
}

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

function flushRaf(): void {
  const callbacks = Array.from(rafCallbacks.values());
  rafCallbacks.clear();
  callbacks.forEach((cb) => {
    cb(0);
  });
}

function setEventTimeStamp(event: Event, timeStamp: number): Event {
  Object.defineProperty(event, 'timeStamp', { value: timeStamp, configurable: true });
  return event;
}

function mouseEvent(type: string, init: MouseEventInit, timeStamp: number): MouseEvent {
  return setEventTimeStamp(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }), timeStamp) as MouseEvent;
}

describe('InventoryContent', () => {
  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        const id = nextRafId++;
        rafCallbacks.set(id, cb);
        return id;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        rafCallbacks.delete(id);
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('clears optimistic inventory when preview reset token changes', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: 1001 };

    const preview: Inventory = [...inventory];
    preview[0] = { id: 2002 };

    const onEquipFromInventory = vi.fn(() => preview);
    const { rerender } = renderWithProviders(
      <InventoryContent
        inventory={inventory}
        currentTick={10}
        previewResetToken={0}
        onEquipFromInventory={onEquipFromInventory}
      />,
    );

    const firstSlot = screen.getByRole('button', { name: 'Item 1001' }).closest('button');
    expect(firstSlot).not.toBeNull();
    fireEvent.mouseDown(firstSlot!, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 0, clientY: 0 });

    expect(screen.getByRole('button', { name: 'Item 2002' })).toBeDefined();

    rerender(
      <InventoryContent
        inventory={inventory}
        currentTick={10}
        previewResetToken={1}
        onEquipFromInventory={onEquipFromInventory}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Item 2002' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Item 1001' })).toBeDefined();
  });

  it('does not turn a quick physical click into a drag when move processing is delayed', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: 1001 };
    inventory[1] = { id: 1002 };
    const onEquipFromInventory = vi.fn();
    const onSwapSlots = vi.fn();

    renderWithProviders(
      <InventoryContent
        inventory={inventory}
        onEquipFromInventory={onEquipFromInventory}
        onSwapSlots={onSwapSlots}
        antiDragEnabled
        antiDragDelay={300}
      />,
    );

    const firstSlot = screen.getByRole('button', { name: 'Item 1001' }).closest('button');
    expect(firstSlot).not.toBeNull();

    fireEvent(firstSlot!, mouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20 }, 1000));
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    window.dispatchEvent(mouseEvent('mousemove', { clientX: 62, clientY: 20, buttons: 1 }, 1050));
    flushRaf();
    window.dispatchEvent(mouseEvent('mouseup', { clientX: 62, clientY: 20 }, 1060));

    expect(onSwapSlots).not.toHaveBeenCalled();
    expect(onEquipFromInventory).toHaveBeenCalledWith(0);
  });

  it('uses the mouse event modifier snapshot for ctrl-to-drag bypass', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: 1001 };
    inventory[1] = { id: 1002 };
    const onSwapSlots = vi.fn();

    renderWithProviders(
      <InventoryContent
        inventory={inventory}
        onSwapSlots={onSwapSlots}
        antiDragEnabled
        antiDragDelay={300}
        antiDragCtrlToDrag
      />,
    );

    const firstSlot = screen.getByRole('button', { name: 'Item 1001' }).closest('button');
    expect(firstSlot).not.toBeNull();

    fireEvent(firstSlot!, mouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, ctrlKey: true }, 1000));
    window.dispatchEvent(mouseEvent('mousemove', { clientX: 62, clientY: 20, buttons: 1, ctrlKey: true }, 1005));
    flushRaf();
    window.dispatchEvent(mouseEvent('mouseup', { clientX: 62, clientY: 20, ctrlKey: true }, 1010));

    expect(onSwapSlots).toHaveBeenCalledWith(0, 1);
  });

  it('drops on the slot under the pointer in a frame stretched by different factors per axis', () => {
    // Stretch to Window: the frame is laid out 765x503 and drawn 2x wide, 1.5x tall.
    const paint = { x: 2, y: 1.5 };
    const isFrame = (element: HTMLElement) => element.classList.contains('game-viewport-frame');
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return isFrame(this) ? 765 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return isFrame(this) ? 503 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return isFrame(this) ? new DOMRect(0, 0, 765 * paint.x, 503 * paint.y) : new DOMRect(0, 0, 0, 0);
    });
    const inventory = createEmptyInventory();
    inventory[0] = { id: 1001 };
    inventory[5] = { id: 1005 };
    const onSwapSlots = vi.fn();

    renderWithProviders(
      <div className="game-viewport-frame">
        <InventoryContent
          inventory={inventory}
          onSwapSlots={onSwapSlots}
          antiDragEnabled
          antiDragDelay={300}
          antiDragCtrlToDrag
        />
      </div>,
    );

    // On screen, a panel point sits at its layout position times the stretch on each axis.
    const client = (index: number) => ({
      clientX: (inventorySlotOrigin(index).x + 1) * paint.x,
      clientY: (inventorySlotOrigin(index).y + 1) * paint.y,
    });
    const firstSlot = screen.getByRole('button', { name: 'Item 1001' }).closest('button');
    fireEvent(firstSlot!, mouseEvent('mousedown', { button: 0, ...client(0), ctrlKey: true }, 1000));
    window.dispatchEvent(mouseEvent('mousemove', { ...client(5), buttons: 1, ctrlKey: true }, 1005));
    flushRaf();
    window.dispatchEvent(mouseEvent('mouseup', { ...client(5), ctrlKey: true }, 1010));

    expect(onSwapSlots).toHaveBeenCalledWith(0, 5);
  });

  it('records a yellow replay marker when a consumable left-click resolves to use item', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: 13441 };
    const onUseItem = vi.fn();
    const onReplayCursorClick = vi.fn();
    const replayMarkerProps = { onReplayCursorClick };

    renderWithProviders(<InventoryContent inventory={inventory} onUseItem={onUseItem} {...replayMarkerProps} />);

    const firstSlot = screen.getByRole('button', { name: 'Item 13441' }).closest('button');
    expect(firstSlot).not.toBeNull();
    fireEvent(firstSlot!, mouseEvent('mousedown', { button: 0, clientX: 42, clientY: 24 }, 4321));
    window.dispatchEvent(mouseEvent('mouseup', { clientX: 42, clientY: 24 }, 4321));

    expect(onUseItem).toHaveBeenCalledWith(0);
    expect(onReplayCursorClick).toHaveBeenCalledWith(42, 24, 'yellow', 4321);
  });

  // A cataloged wearable newer than the loaded cache (here the Necklace of rupture) gets its
  // Wear op from the catalog fallback, whose empty entries are null rather than undefined.
  it('equips on left-click when the Wear op comes from the catalog fallback', () => {
    const itemId = 33639;
    const inventory = createEmptyInventory();
    inventory[0] = { id: itemId };
    const onEquipFromInventory = vi.fn();
    const onUseItem = vi.fn();
    const objTypeLoader = {
      load: (id: number) => new ObjType(id, MOCK_CACHE_INFO),
      getCount: () => 1,
      clearCache: () => {},
    };

    renderWithProviders(
      <InventoryContent
        inventory={inventory}
        onEquipFromInventory={onEquipFromInventory}
        onUseItem={onUseItem}
        objTypeLoader={objTypeLoader}
      />,
    );

    const firstSlot = screen.getByRole('button', { name: `Item ${itemId}` }).closest('button');
    fireEvent(firstSlot!, mouseEvent('mousedown', { button: 0, clientX: 42, clientY: 24 }, 4321));
    window.dispatchEvent(mouseEvent('mouseup', { clientX: 42, clientY: 24 }, 4321));

    expect(onEquipFromInventory).toHaveBeenCalledWith(0);
    expect(onUseItem).not.toHaveBeenCalled();
  });

  // Ops as the cache carries them. The Enchanted lyre's first op is Play, so its left-click is
  // Play, not Equip, as in game; Equip stays on its right-click menu.
  it.each([
    [4151, [undefined, 'Wield'], true],
    [11832, [undefined, 'Wear'], true],
    [20220, [undefined, 'Equip'], true], // Holy blessing
    [4024, [undefined, 'Hold'], true], // Ninja monkey greegree
    [4084, [undefined, 'Ride'], true], // Sled
    [3691, ['Play', 'Equip'], false], // Enchanted lyre(1)
  ] as const)('left-click on %i with ops %j equips: %s', (itemId, ops, equips) => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: itemId };
    const onEquipFromInventory = vi.fn();
    const onUseItem = vi.fn();
    const objTypeLoader = {
      load: (id: number) => {
        const obj = new ObjType(id, MOCK_CACHE_INFO);
        obj.inventoryActions = [...ops, undefined, undefined, undefined];
        return obj;
      },
      getCount: () => 1,
      clearCache: () => {},
    };

    renderWithProviders(
      <InventoryContent
        inventory={inventory}
        onEquipFromInventory={onEquipFromInventory}
        onUseItem={onUseItem}
        objTypeLoader={objTypeLoader}
      />,
    );

    const firstSlot = screen.getByRole('button', { name: `Item ${itemId}` }).closest('button');
    fireEvent(firstSlot!, mouseEvent('mousedown', { button: 0, clientX: 42, clientY: 24 }, 4321));
    window.dispatchEvent(mouseEvent('mouseup', { clientX: 42, clientY: 24 }, 4321));

    expect(onEquipFromInventory).toHaveBeenCalledTimes(equips ? 1 : 0);
    expect(onUseItem).not.toHaveBeenCalled();
  });

  it('drops on shift + left-click instead of using the item', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: 13441 };
    const onUseItem = vi.fn();
    const onDropItem = vi.fn();

    renderWithProviders(<InventoryContent inventory={inventory} onUseItem={onUseItem} onDropItem={onDropItem} />);

    const firstSlot = screen.getByRole('button', { name: 'Item 13441' }).closest('button');
    fireEvent(firstSlot!, mouseEvent('mousedown', { button: 0, clientX: 42, clientY: 24, shiftKey: true }, 4321));
    window.dispatchEvent(mouseEvent('mouseup', { clientX: 42, clientY: 24, shiftKey: true }, 4321));

    expect(onDropItem).toHaveBeenCalledWith(0);
    expect(onUseItem).not.toHaveBeenCalled();
  });

  it('drops on shift + left-click even though the cache lists no Drop op', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: 13441 };
    const onUseItem = vi.fn();
    const onDropItem = vi.fn();
    const objTypeLoader = {
      load: (id: number) => {
        const obj = new ObjType(id, MOCK_CACHE_INFO);
        obj.name = 'Anglerfish';
        obj.inventoryActions = ['Eat', undefined, undefined, undefined, undefined];
        return obj;
      },
      getCount: () => 1,
      clearCache: () => {},
    };

    renderWithProviders(
      <InventoryContent
        inventory={inventory}
        onUseItem={onUseItem}
        onDropItem={onDropItem}
        objTypeLoader={objTypeLoader}
      />,
    );

    const firstSlot = screen.getByRole('button', { name: 'Item 13441' }).closest('button');
    fireEvent(firstSlot!, mouseEvent('mousedown', { button: 0, clientX: 42, clientY: 24, shiftKey: true }, 4321));
    window.dispatchEvent(mouseEvent('mouseup', { clientX: 42, clientY: 24, shiftKey: true }, 4321));

    expect(onDropItem).toHaveBeenCalledWith(0);
    expect(onUseItem).not.toHaveBeenCalled();
  });

  it('leaves shift to the drag modifier when anti-drag requires it', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: 13441 };
    const onUseItem = vi.fn();
    const onDropItem = vi.fn();

    renderWithProviders(
      <InventoryContent
        inventory={inventory}
        onUseItem={onUseItem}
        onDropItem={onDropItem}
        antiDragEnabled
        dragOnShiftOnly
      />,
    );

    const firstSlot = screen.getByRole('button', { name: 'Item 13441' }).closest('button');
    fireEvent(firstSlot!, mouseEvent('mousedown', { button: 0, clientX: 42, clientY: 24, shiftKey: true }, 4321));
    window.dispatchEvent(mouseEvent('mouseup', { clientX: 42, clientY: 24, shiftKey: true }, 4321));

    expect(onDropItem).not.toHaveBeenCalled();
    expect(onUseItem).toHaveBeenCalledWith(0);
  });
});

describe('inventory grid geometry', () => {
  // Origins are the client's slot origins plus the 7px panel inset; the drop
  // targets are the full 42x36 pitch cells centered on those 36x32 item boxes.
  const rect = (left = 0, top = 0) => ({ left, top }) as DOMRect;
  const at = (x: number, y: number) => getSlotIndexFromPoint(x, y, rect(), 1);

  it('places slot 0 on the cache origin and steps by the pitch', () => {
    expect(inventorySlotOrigin(0)).toEqual({ x: 23, y: 15 });
    expect(inventorySlotOrigin(3)).toEqual({ x: 23 + 3 * 42, y: 15 });
    expect(inventorySlotOrigin(4)).toEqual({ x: 23, y: 15 + 36 });
    expect(inventorySlotOrigin(27)).toEqual({ x: 23 + 3 * 42, y: 15 + 6 * 36 });
  });

  it('resolves a click on an item box to its own slot', () => {
    expect(at(inventorySlotOrigin(0).x + 1, inventorySlotOrigin(0).y + 1)).toBe(0);
    expect(at(inventorySlotOrigin(27).x + 1, inventorySlotOrigin(27).y + 1)).toBe(27);
  });

  it('resolves a drop in the gutter between two boxes to the nearer slot', () => {
    // 3px of slack sits left of slot 1's box; it must not fall through to nothing.
    const gutterX = inventorySlotOrigin(1).x - 2;
    expect(at(gutterX, inventorySlotOrigin(1).y + 1)).toBe(1);
  });

  it('rejects a point outside the grid rather than clamping into it', () => {
    expect(at(-50, 0)).toBeNull();
    expect(at(0, -50)).toBeNull();
    expect(at(10_000, 0)).toBeNull();
  });

  it('divides out the panel scale before indexing', () => {
    const origin = inventorySlotOrigin(5);
    expect(getSlotIndexFromPoint((origin.x + 1) * 2, (origin.y + 1) * 2, rect(), 2)).toBe(5);
  });
});
