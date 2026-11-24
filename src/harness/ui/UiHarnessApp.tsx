import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import WebGL2Gate from '../../App';
import { ALL_ENCOUNTER_KINDS } from '../../encounters/registry';
import type { GamePanelTab } from '../../hooks/keybindStore';
import type { DevHarnessBoot, DevHarnessSource } from '../devHarnessTypes';
import { applyHarnessOptions, createHarnessControls, type HarnessControls } from './harnessControls';
import { resolveHarnessModifierFixture } from './harnessModifierFixtures';
import { GAME_PANEL_TABS, type HarnessOptions, opensTerminalFixture, surfaceRequests } from './harnessOptions';
import { parseSurfaceList } from './harnessSurfaces';
import { RenderStatusPreview } from './RenderStatusPreview';
import { ReplayChaptersPreview } from './ReplayChaptersPreview';
import './uiHarness.css';

declare global {
  interface Window {
    /** Playwright control surface. Present once `document.body.dataset.harnessReady` is `'true'`. */
    uiHarness?: HarnessControls & { options: HarnessOptions };
  }
}

/**
 * Harness shell: the real `<App/>` (behind its real WebGL2 gate) in harness mode, plus a small toolbar for
 * driving it by hand. Pass `?chrome=0` to drop the toolbar for clean
 * screenshots. The app itself is untouched — App exposes its live callbacks
 * through the `devHarness` seam and this file adapts them for Playwright.
 */
export function UiHarnessApp({ options }: { options: HarnessOptions }) {
  const controlsRef = useRef<HarnessControls | null>(null);
  const initialSetupRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState('booting…');
  const [encounter, setEncounter] = useState(options.encounter);
  const [gamePanelTab, setGamePanelTab] = useState<GamePanelTab>(options.tab);
  const [autoAdvance, setAutoAdvance] = useState(opensTerminalFixture(options) ? false : options.autoAdvance);
  useEffect(() => {
    // Only real input cancels: the boot's own surface routes press launchers and hold Alt with
    // script-dispatched (untrusted) events, which must not abort the setup that sent them.
    const cancel = (event?: Event) => {
      if (!event || event.isTrusted) initialSetupRef.current?.abort();
    };
    window.addEventListener('click', cancel, true);
    window.addEventListener('keydown', cancel, true);
    return () => {
      cancel();
      window.removeEventListener('click', cancel, true);
      window.removeEventListener('keydown', cancel, true);
    };
  }, []);

  // The surface list is checked here, before either boot path can report ready: the WebGL2 gate
  // replaces the app, so no bridge (and no applyHarnessOptions) ever runs behind it.
  const listError = useMemo(() => {
    try {
      parseSurfaceList(surfaceRequests(options));
      resolveHarnessModifierFixture(options);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [options]);

  const devHarness = useMemo<DevHarnessBoot>(
    () => ({
      fixedAddress: true,
      onReady: (sourceRef: { readonly current: DevHarnessSource | null }) => {
        initialSetupRef.current?.abort();
        const setup = new AbortController();
        initialSetupRef.current = setup;
        const controls = createHarnessControls(sourceRef, { preset: options.preset, onAction: () => setup.abort() });
        controlsRef.current = controls;
        window.uiHarness = Object.assign(controls, { options });
        // A bad list was reported already; the control API stays usable, the list is not applied.
        if (listError) return;
        // Boot owns its own adapter; user API/DOM actions invalidate that one pending setup.
        applyHarnessOptions(
          createHarnessControls(sourceRef, { modifierSelection: resolveHarnessModifierFixture(options) }),
          options,
          setup.signal,
        )
          // The status is committed before the flag, so whoever waits on the flag reads the outcome.
          .then(() => {
            if (setup.signal.aborted) return;
            flushSync(() => setStatus(`ready · tick ${controls.getState().currentTick}`));
            document.body.dataset.harnessReady = 'true';
          })
          .catch((error: unknown) => {
            if (setup.signal.aborted) return;
            flushSync(() => setStatus(`failed: ${error instanceof Error ? error.message : String(error)}`));
            document.body.dataset.harnessError = 'true';
          });
      },
    }),
    [options, listError],
  );

  // A bad list fails the boot at once, gated or not. The gate replaces the whole app, so nothing
  // hands the harness a bridge: a valid gated page is ready (with no control API) once it is up.
  const gated = options.open.includes('webgl2-gate');
  useEffect(() => {
    if (listError) {
      setStatus(`failed: ${listError}`);
      document.body.dataset.harnessError = 'true';
      return;
    }
    if (!gated) return;
    setStatus('ready · WebGL2 gate (no control API)');
    document.body.dataset.harnessReady = 'true';
  }, [gated, listError]);

  const refreshTick = useCallback(() => {
    setStatus(`ready · tick ${controlsRef.current?.getState().currentTick ?? 0}`);
  }, []);

  const reportFailure = useCallback((error: unknown) => {
    setStatus(`failed: ${error instanceof Error ? error.message : String(error)}`);
  }, []);

  return (
    <>
      {options.chrome && (
        <div className="harness-toolbar" data-testid="harness-toolbar">
          <span className="harness-toolbar__brand">UI harness</span>
          <label>
            Encounter
            <select
              value={encounter}
              onChange={(e) => {
                setEncounter(e.target.value);
                controlsRef.current?.enterEncounter(e.target.value).then(refreshTick).catch(reportFailure);
              }}
            >
              {ALL_ENCOUNTER_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tab
            <select
              value={gamePanelTab}
              onChange={(e) => {
                const tab = e.target.value as GamePanelTab;
                setGamePanelTab(tab);
                controlsRef.current?.setGamePanelTab(tab);
              }}
            >
              {GAME_PANEL_TABS.map((tab) => (
                <option key={tab} value={tab}>
                  {tab}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              controlsRef.current?.tick(1);
              refreshTick();
            }}
          >
            Tick +1
          </button>
          <button
            type="button"
            onClick={() => {
              controlsRef.current?.tick(10);
              refreshTick();
            }}
          >
            +10
          </button>
          <button
            type="button"
            onClick={() => {
              controlsRef.current?.reset();
              refreshTick();
            }}
          >
            Reset
          </button>
          <label className="harness-toolbar__check">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => {
                setAutoAdvance(e.target.checked);
                controlsRef.current?.setAutoAdvance(e.target.checked);
              }}
            />
            Auto
          </label>
          <span className="harness-toolbar__status" data-testid="harness-status">
            {status}
          </span>
        </div>
      )}

      <WebGL2Gate devHarness={devHarness} />

      {/* Mounted once the app is up, so Grid's container exists to portal into. */}
      {options.renderStatus && status.startsWith('ready') && (
        <RenderStatusPreview status={options.renderStatus} heldActivity={options.renderStatusHeld} />
      )}
      {options.replayChapters && status.startsWith('ready') && (
        <ReplayChaptersPreview
          fixture={options.replayChapters}
          compact={options.replayChaptersCompact}
          mobile={options.replayChaptersMobile}
        />
      )}
    </>
  );
}
