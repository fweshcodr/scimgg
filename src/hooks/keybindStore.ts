import {
  DEFAULT_PLUGIN_KEYBINDS,
  PLUGIN_KEYBIND_ACTIONS,
  PLUGIN_KEYBINDS,
  type PluginKeybindAction,
  type PluginKeybindMap,
} from '../data/pluginKeybinds';
import { formatHotkey, isBindableKey, matchesKeyboardKey, parseHotkey } from '../util/hotkey';
import { loadSetting, saveSetting } from '../util/storage';

export type GamePanelTab = 'inventory' | 'combat' | 'skills' | 'spellbook' | 'prayer' | 'equipment' | 'settings';
export type KeybindMap = Record<GamePanelTab, string>;

export type CameraAction =
  | 'orbitRotateLeft'
  | 'orbitRotateRight'
  | 'orbitTiltUp'
  | 'orbitTiltDown'
  | 'freeformForward'
  | 'freeformBackward'
  | 'freeformLeft'
  | 'freeformRight'
  | 'freeformUp'
  | 'freeformDown'
  | 'toggleFreeform';

export type CameraKeybindMap = Record<CameraAction, string>;
export type UiKeybindMap = { closeOverlay: string };

export interface UnifiedKeybindStore {
  gamePanel: KeybindMap;
  camera: CameraKeybindMap;
  plugins: PluginKeybindMap;
  ui: UiKeybindMap;
}

export const UNIFIED_KEYBINDS_KEY = 'osrs-unified-keybinds';
export const KEYBINDS_UPDATED_EVENT = 'keybinds:updated';

export const DEFAULT_KEYBINDS: KeybindMap = {
  inventory: 'F3',
  combat: 'F1',
  skills: 'F2',
  equipment: 'F4',
  prayer: 'F5',
  spellbook: 'F6',
  settings: 'F11',
};

export const DEFAULT_UI_KEYBINDS: UiKeybindMap = {
  closeOverlay: 'Escape',
};

export const DEFAULT_CAMERA_KEYBINDS: CameraKeybindMap = {
  orbitRotateLeft: 'a',
  orbitRotateRight: 'd',
  orbitTiltUp: 'w',
  orbitTiltDown: 's',
  freeformForward: 'w',
  freeformBackward: 's',
  freeformLeft: 'a',
  freeformRight: 'd',
  freeformUp: ' ',
  freeformDown: 'Shift',
  toggleFreeform: 'F10',
};

export const ORBIT_ACTIONS: CameraAction[] = ['orbitRotateLeft', 'orbitRotateRight', 'orbitTiltUp', 'orbitTiltDown'];

export const FREEFORM_ACTIONS: CameraAction[] = [
  'freeformForward',
  'freeformBackward',
  'freeformLeft',
  'freeformRight',
  'freeformUp',
  'freeformDown',
];

export const CAMERA_ACTION_LABELS: Record<CameraAction, string> = {
  orbitRotateLeft: 'Rotate Left',
  orbitRotateRight: 'Rotate Right',
  orbitTiltUp: 'Tilt Up',
  orbitTiltDown: 'Tilt Down',
  freeformForward: 'Forward',
  freeformBackward: 'Backward',
  freeformLeft: 'Strafe Left',
  freeformRight: 'Strafe Right',
  freeformUp: 'Fly Up',
  freeformDown: 'Fly Down',
  toggleFreeform: 'Toggle Freeform',
};

function normalizeStore(
  raw?: {
    gamePanel?: Partial<KeybindMap>;
    camera?: Partial<CameraKeybindMap>;
    plugins?: Partial<PluginKeybindMap>;
    ui?: Partial<UiKeybindMap>;
  } | null,
): UnifiedKeybindStore {
  // Unknown UI values would count as bound keys in the unbound-key hint listener.
  const plugins = { ...DEFAULT_PLUGIN_KEYBINDS };
  for (const action of PLUGIN_KEYBIND_ACTIONS) {
    if (raw?.plugins && Object.hasOwn(raw.plugins, action)) plugins[action] = raw.plugins[action] as string;
  }
  const store = {
    gamePanel: { ...DEFAULT_KEYBINDS, ...(raw?.gamePanel ?? {}) },
    camera: { ...DEFAULT_CAMERA_KEYBINDS, ...(raw?.camera ?? {}) },
    plugins,
    ui: {
      closeOverlay:
        raw?.ui && Object.hasOwn(raw.ui, 'closeOverlay')
          ? (raw.ui.closeOverlay as string)
          : DEFAULT_UI_KEYBINDS.closeOverlay,
    },
  };
  for (const binding of KEYBINDING_DEFINITIONS) {
    if (!isValidKeybindingValue(binding, getKeybindingValue(store, binding))) {
      setKeybindingValue(store, { target: binding, value: '' });
    }
  }
  return store;
}

function persistStore(store: UnifiedKeybindStore): void {
  saveSetting(UNIFIED_KEYBINDS_KEY, store);
}

function notifyKeybindsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(KEYBINDS_UPDATED_EVENT));
  }
}

export function loadUnifiedKeybindStore(): UnifiedKeybindStore {
  const unified = loadSetting<Partial<UnifiedKeybindStore>>(UNIFIED_KEYBINDS_KEY);
  const normalized = normalizeStore(unified);
  if (
    !unified ||
    Object.keys(unified.plugins ?? {}).some((key) => !Object.hasOwn(DEFAULT_PLUGIN_KEYBINDS, key)) ||
    Object.keys(unified.ui ?? {}).some((key) => !Object.hasOwn(DEFAULT_UI_KEYBINDS, key)) ||
    KEYBINDING_DEFINITIONS.some(
      (binding) =>
        (unified[binding.domain] as Record<string, string> | undefined)?.[binding.action] !==
        getKeybindingValue(normalized, binding),
    )
  )
    persistStore(normalized);
  return normalized;
}

export type KeybindingTarget =
  | { readonly domain: 'gamePanel'; readonly action: GamePanelTab }
  | { readonly domain: 'camera'; readonly action: CameraAction }
  | { readonly domain: 'plugins'; readonly action: PluginKeybindAction }
  | { readonly domain: 'ui'; readonly action: keyof UiKeybindMap };

export type KeybindingDefinition = KeybindingTarget & {
  readonly label: string;
  readonly group: string;
  readonly defaultKey: string;
};

export interface KeybindingChange {
  readonly target: KeybindingTarget;
  readonly value: string;
}

export interface KeybindingConflict {
  readonly binding: KeybindingDefinition | null;
  readonly label: string;
  readonly value: string;
}

const PANEL_ACTIONS = [
  ['combat', 'Combat'],
  ['inventory', 'Inventory'],
  ['equipment', 'Equipment'],
  ['prayer', 'Prayer'],
  ['spellbook', 'Spells'],
  ['skills', 'Skills'],
  ['settings', 'Keybinds'],
] as const;

export const KEYBINDING_DEFINITIONS: readonly KeybindingDefinition[] = [
  { domain: 'ui', action: 'closeOverlay', label: 'Close or cancel', group: 'General', defaultKey: 'Escape' },
  ...PANEL_ACTIONS.map(([action, label]) => ({
    domain: 'gamePanel' as const,
    action,
    label,
    group: 'Panel',
    defaultKey: DEFAULT_KEYBINDS[action],
  })),
  ...[...ORBIT_ACTIONS, 'toggleFreeform' as const, ...FREEFORM_ACTIONS].map((action) => ({
    domain: 'camera' as const,
    action,
    label: CAMERA_ACTION_LABELS[action],
    group: FREEFORM_ACTIONS.includes(action) || action === 'toggleFreeform' ? 'Free Camera' : 'Camera',
    defaultKey: DEFAULT_CAMERA_KEYBINDS[action],
  })),
  ...PLUGIN_KEYBIND_ACTIONS.map((action) => ({ domain: 'plugins' as const, action, ...PLUGIN_KEYBINDS[action] })),
];

export function keybindingId(target: KeybindingTarget): string {
  return `${target.domain}.${target.action}`;
}

export function getKeybindingValue(store: UnifiedKeybindStore, target: KeybindingTarget): string {
  switch (target.domain) {
    case 'gamePanel':
      return store.gamePanel[target.action];
    case 'camera':
      return store.camera[target.action];
    case 'plugins':
      return store.plugins[target.action];
    case 'ui':
      return store.ui[target.action];
  }
}

function setKeybindingValue(store: UnifiedKeybindStore, { target, value }: KeybindingChange): void {
  switch (target.domain) {
    case 'gamePanel':
      store.gamePanel[target.action] = value;
      return;
    case 'camera':
      store.camera[target.action] = value;
      return;
    case 'plugins':
      store.plugins[target.action] = value;
      return;
    case 'ui':
      store.ui[target.action] = value;
      return;
  }
}

export function isChordBinding(target: KeybindingTarget): boolean {
  return target.domain === 'plugins';
}

function isValidKeybindingValue(target: KeybindingTarget, value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (value === '' || (isChordBinding(target) ? parseHotkey(value) !== null : isBindableKey(value)))
  );
}

function reservedShortcut(value: string): string | null {
  const hotkey = parseHotkey(value);
  if (!hotkey) return value ? 'Invalid shortcut' : null;
  if (hotkey.ctrl && hotkey.key === 'K') return 'Quick search';
  if ((hotkey.ctrl || hotkey.meta) && hotkey.key === 'R') return hotkey.shift ? 'Reload page' : 'Restart simulation';
  if (hotkey.ctrl && hotkey.shift && hotkey.key === 'F') return 'Toggle FPS';
  if ((hotkey.ctrl || hotkey.meta) && ['Q', 'W', 'T', 'N', 'L', 'Tab', 'Plus', '=', '-', '0'].includes(hotkey.key))
    return 'Browser shortcut';
  if (hotkey.alt && ['Tab', 'F4', 'ArrowLeft', 'ArrowRight'].includes(hotkey.key)) return 'Browser or system shortcut';
  return null;
}

function bindingsOverlap(a: KeybindingChange, b: KeybindingChange): boolean {
  if (!a.value || !b.value) return false;
  if (a.target.domain === 'camera' && b.target.domain === 'camera') {
    if (
      (ORBIT_ACTIONS.includes(a.target.action) && FREEFORM_ACTIONS.includes(b.target.action)) ||
      (FREEFORM_ACTIONS.includes(a.target.action) && ORBIT_ACTIONS.includes(b.target.action))
    )
      return false;
  }
  const aHotkey = isChordBinding(a.target) ? parseHotkey(a.value) : null;
  const bHotkey = isChordBinding(b.target) ? parseHotkey(b.value) : null;
  if (aHotkey && bHotkey) return formatHotkey(aHotkey) === formatHotkey(bHotkey);
  return matchesKeyboardKey(aHotkey?.key ?? a.value, bHotkey?.key ?? b.value);
}

export function getKeybindingConflicts(
  store: UnifiedKeybindStore,
  changes: readonly KeybindingChange[],
): KeybindingConflict[] {
  const changedIds = new Set(changes.map(({ target }) => keybindingId(target)));
  const conflicts: KeybindingConflict[] = [];
  for (const change of changes) {
    if (!isValidKeybindingValue(change.target, change.value)) {
      conflicts.push({ binding: null, label: 'Invalid shortcut', value: change.value });
      continue;
    }
    const reserved = isChordBinding(change.target) ? reservedShortcut(change.value) : null;
    if (reserved) conflicts.push({ binding: null, label: reserved, value: change.value });
    for (const binding of KEYBINDING_DEFINITIONS) {
      if (changedIds.has(keybindingId(binding))) continue;
      if (bindingsOverlap(change, { target: binding, value: getKeybindingValue(store, binding) })) {
        conflicts.push({ binding, label: `${binding.group}: ${binding.label}`, value: change.value });
      }
    }
  }
  return conflicts;
}

export function saveKeybindingChanges(
  changes: readonly KeybindingChange[],
  reassign = false,
): {
  readonly saved: boolean;
  readonly store: UnifiedKeybindStore;
  readonly conflicts: readonly KeybindingConflict[];
  readonly unbound: readonly KeybindingDefinition[];
} {
  const store = loadUnifiedKeybindStore();
  const conflicts = getKeybindingConflicts(store, changes);
  if (conflicts.some((conflict) => !conflict.binding) || (conflicts.length > 0 && !reassign)) {
    return { saved: false, store, conflicts, unbound: [] };
  }
  const unboundById = new Map<string, KeybindingDefinition>();
  for (const { binding } of conflicts) {
    if (binding && !unboundById.has(keybindingId(binding))) {
      setKeybindingValue(store, { target: binding, value: '' });
      unboundById.set(keybindingId(binding), binding);
    }
  }
  for (const change of changes) setKeybindingValue(store, change);
  persistStore(store);
  notifyKeybindsUpdated();
  return { saved: true, store, conflicts: [], unbound: [...unboundById.values()] };
}

export function getEffectivePluginKeybinds(store: UnifiedKeybindStore): PluginKeybindMap {
  const effective = { ...store.plugins };
  for (const action of PLUGIN_KEYBIND_ACTIONS) {
    if (
      getKeybindingConflicts(store, [{ target: { domain: 'plugins', action }, value: effective[action] }]).length > 0
    ) {
      effective[action] = '';
    }
  }
  return effective;
}
