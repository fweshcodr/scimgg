import { type Dispatch, memo, type SetStateAction, useEffect, useRef, useState } from 'react';
import { useIsMobileDevice } from '../hooks/useIsMobileDevice';
import { useIsTouchOnly } from '../hooks/useIsTouchOnly';
import { PERSISTED_SETTINGS_DEFAULTS, type PersistedSettings } from '../hooks/usePersistedSettings';
import { setMobileLayoutEditing } from '../layout/mobileLayoutEdit';
import { hasTouchscreen } from '../util/mobileDetection';
import { type PerfFlagKey, perfFlags } from '../util/PerfFlags';
import { CollapsibleSection } from './CollapsibleSection';
import {
  DisplayControls,
  type DisplayControlsProps,
  InterfaceControls,
  type InterfaceControlsProps,
  SimulationControls,
  type SimulationControlsProps,
} from './Controls';
import { type InfoboxAppearanceProps, InfoboxAppearanceSettings } from './InfoboxAppearanceSettings';
import { LobbyEffectsControls } from './LobbyEffectsControls';
import { LauncherIcon } from './launcher/launcherIcons';
import { EDIT_LAYOUT_HELP } from './MobileLayoutEditBar';
import {
  SidebarSearchBar,
  SidebarSearchResults,
  SidebarSearchToggle,
  searchLayoutOf,
  useSearchIds,
  useSidebarSearch,
} from './SidebarSearch';
import { useRevealInScroller } from './settingsReveal';
import { TouchControls, type TouchControlsProps, useHotkeyCustomization } from './TouchControls';
import { HoverHintButton } from './ui/HoverHintControl';
import { InfoHint } from './ui/InfoHint';
import { OsrsButton } from './ui/OsrsButton';
import { OsrsCheckbox } from './ui/OsrsCheckbox';
import { SettingLinkRow } from './ui/RevealLinks';
import { SettingRow } from './ui/SettingRow';
import './SettingsSidebar.css';
import { GAMEPANEL_KEYBINDS_ID, KEYBOARD_SHORTCUTS_REFERENCE_ID, settingsSearchId } from '../settingsSearch/ids';
import { CloseButton } from './ui/CloseButton';
import { sheet } from './ui/mobileSheet';

interface DebugSectionProps {
  activeEncounterKind: string;
  encounterDebugFlags: Record<string, boolean | number>;
  onEncounterDebugFlagsChange: Dispatch<SetStateAction<Record<string, boolean | number>>>;
  onReturnToLobby: () => void;
  logLevel: PersistedSettings['logLevel'];
  onLogLevelChange: (logLevel: PersistedSettings['logLevel']) => void;
  onOpenCacheExplorer: () => void;
  onStartBasicTutorial: () => void;
  onStartAdvancedTutorial: () => void;
}

/** The Mobile layout locks its overlays; this enters the mode that frees the plugin ones. */
function EditLayoutEntry({ onClose }: { onClose: () => void }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 10 }} data-search-id={settingsSearchId('Mobile', 'Edit layout')}>
      <span ref={labelRef} className="settings-inline-label info-hint-region">
        Overlay positions
        <InfoHint label="Overlay positions" text={EDIT_LAYOUT_HELP} hoverRegionRef={labelRef} />
      </span>
      <OsrsButton
        fullWidth
        onClick={() => {
          setMobileLayoutEditing(true);
          onClose();
        }}
      >
        Edit layout
      </OsrsButton>
    </div>
  );
}

const MOBILE_PREFERENCES_HELP =
  'Settings on this device are stored separately from your desktop preferences. Changes here only affect mobile.';

/**
 * Says why these settings differ from desktop's; the `?` explains it where touch can reach it.
 * Short enough to share the title's row, so the header stays one row on a phone held sideways.
 */
function MobilePreferencesBadge() {
  const badgeRef = useRef<HTMLSpanElement>(null);
  return (
    <span ref={badgeRef} className="panel-mode-badge info-hint-region">
      This device
      <InfoHint label="Mobile preferences" text={MOBILE_PREFERENCES_HELP} hoverRegionRef={badgeRef} />
    </span>
  );
}

interface SettingsSidebarProps {
  visible: boolean;
  onClose: () => void;
  onOpenShortcuts: () => void;
  onOpenCredits: () => void;
  simulationControls: SimulationControlsProps;
  displayControls: DisplayControlsProps & InterfaceControlsProps;
  debugSection: DebugSectionProps;
  /** Touch settings and the Mobile layout's hotkeys; see TouchControls. */
  touchControls: Omit<TouchControlsProps, 'mobileLayout' | 'showHaptics'>;
  /** Infobox appearance's editor, a group in Interface. */
  infoboxAppearance: InfoboxAppearanceProps;
}

function SettingsSidebarContent({
  visible,
  onClose,
  onOpenShortcuts,
  onOpenCredits,
  simulationControls,
  displayControls,
  debugSection,
  touchControls,
  infoboxAppearance,
}: SettingsSidebarProps) {
  const isMobile = useIsMobileDevice();
  const isTouchOnly = useIsTouchOnly();
  const { request: hotkeysRequest } = useHotkeyCustomization();
  const hotkeysSectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!visible || hotkeysRequest === 0) return;
    // Brings slot 1's picker into view, not the section's first select (Interface scaling comes
    // before it).
    const select = hotkeysSectionRef.current?.querySelector<HTMLSelectElement>('.touch-controls__slot select');
    select?.scrollIntoView?.({ block: 'center' });
  }, [visible, hotkeysRequest]);
  const contentRef = useRef<HTMLDivElement>(null);
  // Sections expand themselves (CollapsibleSection's searchId); this scrolls to the target.
  useRevealInScroller('settings', contentRef);
  const search = useSidebarSearch('settings', visible);
  const { fieldId, resultsId } = useSearchIds();
  const { clientLayoutMode } = displayControls;

  return (
    <>
      {/* Text-free sibling carrying the panel's cast shadow. Keeping the shadow off
          .controls-overlay is what lets Chrome treat that panel as a provably-opaque
          layer, which is a precondition for subpixel/bilevel text AA on everything
          inside it — see the note in SettingsSidebar.css. */}
      <div className={`controls-overlay-shadow ${visible ? 'open' : ''}`} aria-hidden="true" />
      <aside
        className={`controls-overlay ${visible ? 'open' : ''}`}
        {...sheet.drawer}
        inert={!visible ? true : undefined}
      >
        {/* One row: the title (the name of the sidebar, as Plugins has), the device badge on a
            phone, and the actions. Branding and credits live in the footer. */}
        <div className="panel-header">
          <div className="panel-title-row">
            <h2 className="panel-title">Settings</h2>
            {isMobile && <MobilePreferencesBadge />}
          </div>
          <div className="panel-header-icons">
            <SidebarSearchToggle search={search} fieldId={fieldId} />
            {/* Keyboard shortcuts mean nothing without a keyboard. */}
            {!isTouchOnly && (
              <HoverHintButton
                type="button"
                className="panel-header-action"
                onClick={onOpenShortcuts}
                data-search-id={KEYBOARD_SHORTCUTS_REFERENCE_ID}
                aria-label="Keyboard shortcuts"
              >
                <LauncherIcon glyph="keyboard" />
              </HoverHintButton>
            )}
            {/* Dismissing the sidebar is not one of its actions, so it stands apart from them; and
                an X in a header needs no hint. */}
            <span className="panel-header-divider" aria-hidden="true" />
            <CloseButton
              className="panel-close-button"
              {...sheet.close}
              onClick={onClose}
              aria-label="Close Settings"
            />
          </div>
        </div>

        <SidebarSearchBar search={search} fieldId={fieldId} resultsId={resultsId} />

        <div className="drawer-search-body">
          {/* Covered, not unmounted, while searching: clearing returns to the same place. */}
          <div className="controls-content" ref={contentRef} inert={search.active ? true : undefined}>
            <div className="settings-zone-divider" aria-hidden="true">
              <span className="settings-zone-label">Game</span>
            </div>

            <div className="settings-zone">
              <CollapsibleSection title="Simulation" defaultExpanded={false} searchId={settingsSearchId('Simulation')}>
                <SimulationControls {...simulationControls} />
              </CollapsibleSection>

              <CollapsibleSection
                title="Graphics & Performance"
                defaultExpanded={false}
                searchId={settingsSearchId('Graphics & Performance')}
              >
                <DisplayControls {...displayControls} />
              </CollapsibleSection>

              <div data-tutorial="interface-section">
                <CollapsibleSection title="Interface" defaultExpanded={false} searchId={settingsSearchId('Interface')}>
                  <InterfaceControls
                    {...displayControls}
                    keybinds={
                      <div className="control-group">
                        <SettingLinkRow
                          label="Keybinds"
                          hint="Change game-panel and camera keys in the game panel."
                          target={GAMEPANEL_KEYBINDS_ID}
                          // Search lists the editor this leads to (gamepanel.keybinds), not the link.
                          searchId={null}
                          blockedReason={() => (isTouchOnly ? 'Needs a keyboard.' : null)}
                        />
                      </div>
                    }
                    appearance={<InfoboxAppearanceSettings {...infoboxAppearance} />}
                  />
                </CollapsibleSection>
              </div>

              {(isTouchOnly || clientLayoutMode === 'mobile' || hasTouchscreen()) && (
                <div ref={hotkeysSectionRef}>
                  <CollapsibleSection
                    key={hotkeysRequest}
                    title={clientLayoutMode === 'mobile' ? 'Mobile' : 'Touch'}
                    defaultExpanded={hotkeysRequest > 0}
                    searchId={settingsSearchId('Mobile')}
                  >
                    <TouchControls
                      {...touchControls}
                      mobileLayout={clientLayoutMode === 'mobile'}
                      showHaptics={isTouchOnly || clientLayoutMode === 'mobile'}
                    />
                    {clientLayoutMode === 'mobile' && <EditLayoutEntry onClose={onClose} />}
                  </CollapsibleSection>
                </div>
              )}
            </div>

            {import.meta.env.DEV && (
              <>
                <div className="settings-zone-divider" aria-hidden="true">
                  <span className="settings-zone-label">Developer</span>
                </div>

                <div className="settings-zone">
                  <CollapsibleSection
                    // Development-only: not searchable.
                    searchId={null}
                    title="Debug"
                    defaultExpanded={false}
                  >
                    {debugSection.activeEncounterKind !== 'lobby' && (
                      <OsrsButton fullWidth onClick={debugSection.onReturnToLobby}>
                        Return to Lobby
                      </OsrsButton>
                    )}
                    {debugSection.activeEncounterKind === 'lobby' && (
                      <LobbyEffectsControls
                        flags={debugSection.encounterDebugFlags}
                        onChange={debugSection.onEncounterDebugFlagsChange}
                      />
                    )}
                    <div className="control-group">
                      <div className="group-title">Log Level</div>
                      <SettingRow
                        // Development-only (Debug section): not searchable.
                        searchId={null}
                        isModified={debugSection.logLevel !== PERSISTED_SETTINGS_DEFAULTS.logLevel}
                        onReset={() => debugSection.onLogLevelChange(PERSISTED_SETTINGS_DEFAULTS.logLevel)}
                      >
                        <select
                          value={debugSection.logLevel}
                          onChange={(e) =>
                            debugSection.onLogLevelChange(e.target.value as PersistedSettings['logLevel'])
                          }
                          className="select-input"
                        >
                          <option value="none">None</option>
                          <option value="error">Error</option>
                          <option value="warn">Warn (default)</option>
                          <option value="info">Info</option>
                          <option value="debug">Debug</option>
                          <option value="trace">Trace</option>
                        </select>
                      </SettingRow>
                    </div>
                    <OsrsButton fullWidth onClick={debugSection.onOpenCacheExplorer}>
                      Cache Explorer
                    </OsrsButton>
                    {isDebugUrlParam() && (
                      <>
                        <OsrsButton fullWidth onClick={debugSection.onStartBasicTutorial}>
                          Basic Tutorial
                        </OsrsButton>
                        <OsrsButton fullWidth onClick={debugSection.onStartAdvancedTutorial}>
                          Advanced Tutorial
                        </OsrsButton>
                      </>
                    )}
                    <div className="control-group control-group--no-border">
                      <div className="group-title">Performance</div>
                      <PerfToggle flagKey="skipTransparentSort" label="Skip Transparent Sort" defaultValue={true} />
                    </div>
                  </CollapsibleSection>
                </div>
              </>
            )}

            <div className="settings-zone-divider settings-zone-divider--footer" aria-hidden="true">
              <span className="settings-zone-label">Legal</span>
            </div>

            <footer className="settings-legal">
              <p className="settings-legal__lede">Not affiliated with Jagex</p>
              <p className="settings-legal__body">
                Scim.GG is an unofficial, fan-made project. It is not endorsed by or affiliated with Jagex Limited.
              </p>
              <p className="settings-legal__fine">
                Jagex, RuneScape, and Old School RuneScape are registered and/or unregistered trademarks of Jagex
                Limited. All game assets remain its property, all rights reserved.
              </p>
              <div className="settings-legal__actions">
                <button type="button" className="settings-credits-link" onClick={onOpenCredits}>
                  Credits
                </button>
              </div>
            </footer>
          </div>
          {search.active && (
            <SidebarSearchResults search={search} id={resultsId} layout={searchLayoutOf(clientLayoutMode)} />
          )}
        </div>
      </aside>
    </>
  );
}

// Preserve the shell, section expansion, form drafts and scroll position. A closed
// drawer needs no parent-driven work; reopening synchronously adopts all new props.
export const SettingsSidebar = memo(SettingsSidebarContent, (previous, next) => !previous.visible && !next.visible);

function PerfToggle({ flagKey, label, defaultValue }: { flagKey: PerfFlagKey; label: string; defaultValue?: boolean }) {
  const [enabled, setEnabled] = useState(perfFlags[flagKey]);
  useEffect(() => {
    return perfFlags.subscribe(() => {
      setEnabled(perfFlags[flagKey]);
    });
  }, [flagKey]);
  const isModified = defaultValue != null && enabled !== defaultValue;
  return (
    <SettingRow
      // Development-only (Debug section): not searchable.
      searchId={null}
      isModified={isModified}
      onReset={() => {
        if (defaultValue != null) {
          perfFlags[flagKey] = defaultValue;
          setEnabled(defaultValue);
        }
      }}
    >
      <OsrsCheckbox
        checked={enabled}
        label={label}
        onChange={() => {
          perfFlags[flagKey] = !perfFlags[flagKey];
          setEnabled(perfFlags[flagKey]);
        }}
      />
    </SettingRow>
  );
}

// Lazy URL-param check so the debug-only tutorial buttons stay out of normal
// builds. Evaluated each render (cheap) so it picks up the param on hot reload.
function isDebugUrlParam(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('debug');
}
