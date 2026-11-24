import { isStorageNamespaced, loadSetting, saveSetting } from './storage';

/**
 * The user's answer to "is this a phone or tablet", for when detection gets it wrong. Kept out
 * of the settings blob on purpose: it describes this device, not the player's preferences.
 */
export type DeviceMode = 'auto' | 'mobile' | 'desktop';

const DEVICE_MODES: readonly DeviceMode[] = ['auto', 'mobile', 'desktop'];

export const DEVICE_MODE_STORAGE_KEY = 'osrs-yama-device-mode';

function parseDeviceMode(value: unknown): DeviceMode {
  return DEVICE_MODES.includes(value as DeviceMode) ? (value as DeviceMode) : 'auto';
}

let mode: DeviceMode | null = null;
const listeners = new Set<() => void>();

export function getDeviceMode(): DeviceMode {
  mode ??= parseDeviceMode(loadSetting<unknown>(DEVICE_MODE_STORAGE_KEY));
  return mode;
}

export function setDeviceMode(next: DeviceMode): void {
  saveSetting(DEVICE_MODE_STORAGE_KEY, next);
  applyDeviceMode(next);
}

function applyDeviceMode(next: DeviceMode): void {
  if (mode === next) return;
  mode = next;
  for (const listener of listeners) listener();
}

/** Subscribes to changes from this tab and, outside the UI harness, from other tabs. */
export function subscribeDeviceMode(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== DEVICE_MODE_STORAGE_KEY) return;
    applyDeviceMode(parseDeviceMode(event.newValue === null ? null : safeParse(event.newValue)));
  };
  const crossTab = typeof window !== 'undefined' && !isStorageNamespaced();
  if (crossTab) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (crossTab) window.removeEventListener('storage', onStorage);
  };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Test hook: forget the cached mode so the next read goes back to storage. */
export function resetDeviceModeForTests(): void {
  mode = null;
  listeners.clear();
}
