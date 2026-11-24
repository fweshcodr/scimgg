// @vitest-environment happy-dom

import { render } from '@testing-library/react';
import { createRef, type RefObject, useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PanelSnapRegistryProvider, type SnapEngagement, usePanelSnapRegistry } from '../PanelSnapRegistry';
import { usePassiveSnapTarget } from '../usePassiveSnapTarget';

type Registry = NonNullable<ReturnType<typeof usePanelSnapRegistry>>;

let capturedRegistry: Registry | null = null;

function RegistryProbe() {
  capturedRegistry = usePanelSnapRegistry();
  return null;
}

function PassiveTarget({
  id,
  targetRef,
  enabled = true,
}: {
  id: string;
  targetRef: RefObject<HTMLDivElement | null>;
  enabled?: boolean;
}) {
  usePassiveSnapTarget(id, targetRef, enabled);
  return <div ref={targetRef} data-testid={id} />;
}

function DetachedTarget({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  usePassiveSnapTarget(id, ref);
  return null;
}

function mockClientRect(
  element: HTMLElement | null,
  rect: { left: number; top: number; width: number; height: number },
): void {
  if (!element) throw new Error('target element did not mount');
  element.getBoundingClientRect = () => ({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
}

function renderWithTarget(options: { id?: string; enabled?: boolean } = {}) {
  const targetRef = createRef<HTMLDivElement>();
  const view = render(
    <PanelSnapRegistryProvider>
      <RegistryProbe />
      <PassiveTarget id={options.id ?? 'target'} targetRef={targetRef} enabled={options.enabled} />
    </PanelSnapRegistryProvider>,
  );
  const registry = capturedRegistry;
  if (!registry) throw new Error('registry provider did not mount');
  return { view, registry, targetRef };
}

afterEach(() => {
  capturedRegistry = null;
});

describe('usePassiveSnapTarget', () => {
  it('converts the client rect into frame-local coordinates via the frame origin', () => {
    const { registry, targetRef } = renderWithTarget();
    registry.registerFrameOrigin(() => ({ left: 100, top: 50 }));
    mockClientRect(targetRef.current, { left: 130, top: 70, width: 40, height: 20 });

    expect(registry.getSiblingRects('anything')).toEqual([{ id: 'target', left: 30, top: 20, right: 70, bottom: 40 }]);
  });

  it('publishes the live rect on every read, not a mount-time snapshot', () => {
    const { registry, targetRef } = renderWithTarget();
    registry.registerFrameOrigin(() => ({ left: 100, top: 50 }));
    mockClientRect(targetRef.current, { left: 130, top: 70, width: 40, height: 20 });
    expect(registry.getSiblingRects('x')[0]?.left).toBe(30);

    mockClientRect(targetRef.current, { left: 230, top: 170, width: 40, height: 20 });
    expect(registry.getSiblingRects('x')[0]).toMatchObject({ left: 130, top: 120, right: 170, bottom: 140 });
  });

  it('tracks a moving frame origin', () => {
    const { registry, targetRef } = renderWithTarget();
    let origin = { left: 100, top: 50 };
    registry.registerFrameOrigin(() => origin);
    mockClientRect(targetRef.current, { left: 130, top: 70, width: 40, height: 20 });
    expect(registry.getSiblingRects('x')[0]?.left).toBe(30);

    origin = { left: 200, top: 50 };
    expect(registry.getSiblingRects('x')[0]?.left).toBe(-70);
  });

  it('publishes nothing while disabled and re-registers when re-enabled', () => {
    const targetRef = createRef<HTMLDivElement>();
    const tree = (enabled: boolean) => (
      <PanelSnapRegistryProvider>
        <RegistryProbe />
        <PassiveTarget id="target" targetRef={targetRef} enabled={enabled} />
      </PanelSnapRegistryProvider>
    );
    const { rerender } = render(tree(false));
    const registry = capturedRegistry;
    if (!registry) throw new Error('registry provider did not mount');
    registry.registerFrameOrigin(() => ({ left: 0, top: 0 }));
    mockClientRect(targetRef.current, { left: 10, top: 10, width: 40, height: 20 });
    expect(registry.getSiblingRects('x')).toEqual([]);

    rerender(tree(true));
    expect(registry.getSiblingRects('x')).toHaveLength(1);

    rerender(tree(false));
    expect(registry.getSiblingRects('x')).toEqual([]);
  });

  it('unregisters on unmount', () => {
    const { view, registry, targetRef } = renderWithTarget();
    registry.registerFrameOrigin(() => ({ left: 0, top: 0 }));
    mockClientRect(targetRef.current, { left: 10, top: 10, width: 40, height: 20 });
    expect(registry.getSiblingRects('x')).toHaveLength(1);

    view.unmount();
    expect(registry.getSiblingRects('x')).toEqual([]);
  });

  it('publishes nothing when the element is not mounted', () => {
    render(
      <PanelSnapRegistryProvider>
        <RegistryProbe />
        <DetachedTarget id="ghost" />
      </PanelSnapRegistryProvider>,
    );
    const registry = capturedRegistry;
    if (!registry) throw new Error('registry provider did not mount');
    registry.registerFrameOrigin(() => ({ left: 0, top: 0 }));

    expect(registry.getSiblingRects('x')).toEqual([]);
  });

  it('publishes nothing for a zero-sized element', () => {
    const { registry, targetRef } = renderWithTarget();
    registry.registerFrameOrigin(() => ({ left: 0, top: 0 }));
    mockClientRect(targetRef.current, { left: 10, top: 10, width: 0, height: 20 });

    expect(registry.getSiblingRects('x')).toEqual([]);
  });

  it('publishes nothing without a frame origin', () => {
    const { registry, targetRef } = renderWithTarget();
    mockClientRect(targetRef.current, { left: 10, top: 10, width: 40, height: 20 });

    expect(registry.getFrameOrigin()).toBeNull();
    expect(registry.getSiblingRects('x')).toEqual([]);
  });

  it('clears the frame origin when its registration is released', () => {
    const { registry } = renderWithTarget();
    const unregister = registry.registerFrameOrigin(() => ({ left: 5, top: 6 }));
    expect(registry.getFrameOrigin()).toEqual({ left: 5, top: 6 });

    unregister();
    expect(registry.getFrameOrigin()).toBeNull();
  });

  it('keeps separate provider registries isolated', () => {
    const targetRef = createRef<HTMLDivElement>();
    let innerRegistry: Registry | null = null;
    function InnerProbe() {
      innerRegistry = usePanelSnapRegistry();
      return null;
    }
    render(
      <PanelSnapRegistryProvider>
        <RegistryProbe />
        <PanelSnapRegistryProvider>
          <InnerProbe />
          <PassiveTarget id="target" targetRef={targetRef} />
        </PanelSnapRegistryProvider>
      </PanelSnapRegistryProvider>,
    );
    const registry = capturedRegistry;
    if (!registry) throw new Error('registry provider did not mount');
    expect(innerRegistry).not.toBe(registry);

    registry.registerFrameOrigin(() => ({ left: 0, top: 0 }));
    mockClientRect(targetRef.current, { left: 10, top: 10, width: 40, height: 20 });
    expect(registry.getSiblingRects('x')).toEqual([]);
  });
});

describe('PanelSnapRegistry snap state', () => {
  it('does not notify subscribers when a drag frame repeats the unsnapped state', () => {
    const { registry } = renderWithTarget();
    let notified = 0;
    registry.subscribeSnapState(() => notified++);
    const before = registry.getSnapState();

    registry.setSnapState({ active: false, engagement: null });
    expect(notified).toBe(0);
    expect(registry.getSnapState()).toBe(before);

    const engagement: SnapEngagement = {
      targetId: 'target',
      contact: 'right-to-left',
      linePosition: 50,
      perpendicularStart: 0,
      perpendicularEnd: 10,
      state: 'engaged',
      movingRect: { left: 0, top: 0, right: 45, bottom: 10 },
      targetRect: { left: 55, top: 0, right: 100, bottom: 10 },
      gapChannel: { left: 45, top: 0, width: 10, height: 10 },
    };
    registry.setSnapState({ active: true, engagement });
    registry.setSnapState({ active: false, engagement: null });
    expect(notified).toBe(2);
  });
});
