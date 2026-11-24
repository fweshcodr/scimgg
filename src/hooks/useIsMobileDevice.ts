import { useEffect, useState, useSyncExternalStore } from 'react';
import { type DeviceMode, getDeviceMode, subscribeDeviceMode } from '../util/deviceMode';
import { DEVICE_DETECTION_QUERIES, isMobileDevice } from '../util/mobileDetection';

/**
 * Reactive version of {@link isMobileDevice}.
 *
 * Recomputes when pointer capability flips at runtime (e.g. a Bluetooth mouse
 * is connected) and when the Device setting changes. The user-agent and
 * touch-point signals are static.
 *
 * Use this hook for device identity: the Mobile layout and the mobile entry
 * flow. For other use cases:
 *  - `useIsTouchOnly` — input capability, for touch input handling
 *  - `useIsMobile`    — viewport width, for layout breakpoints
 */
export function useIsMobileDevice(): boolean {
  return useDeviceDetection(isMobileDeviceNow);
}

const isMobileDeviceNow = () => isMobileDevice();

/** The stored Device setting (Automatic, Mobile or Desktop). */
export function useDeviceMode(): DeviceMode {
  return useSyncExternalStore(subscribeDeviceMode, getDeviceMode, getDeviceMode);
}

/** Subscribes `detect` to the Device setting and the media queries the detection reads. */
export function useDeviceDetection(detect: () => boolean): boolean {
  const [value, setValue] = useState<boolean>(() => detect());

  useEffect(() => {
    const update = () => setValue(detect());
    // Sync once in case the initial read raced with a capability change.
    update();
    const unsubscribeMode = subscribeDeviceMode(update);
    const lists =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? DEVICE_DETECTION_QUERIES.map((query) => window.matchMedia(query))
        : [];
    for (const mql of lists) mql.addEventListener('change', update);
    return () => {
      unsubscribeMode();
      for (const mql of lists) mql.removeEventListener('change', update);
    };
  }, [detect]);

  return value;
}
