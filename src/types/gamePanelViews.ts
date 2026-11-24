/**
 * Here rather than beside the components that render them because the replay contract in
 * src/core/replayPresentation.ts records these, and core reaching into a component file
 * for a domain type is the import that later has to be untangled.
 */

export type EquipmentPanelView = 'equipment' | 'stats';

export type SettingsSubTab = 'audio' | 'keybinds';
