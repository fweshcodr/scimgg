import type React from 'react';
import { useEffect, useState } from 'react';
import type { RenderStatus } from '../render/core/renderer';
import { BrowserSuggestions } from './BrowserSuggestions';
import { NO_WEBGL2_BODY, NO_WEBGL2_TITLE, noWebgl2Note, noWebgl2Steps } from './noWebgl2Guidance';
import { OsrsButton } from './ui/OsrsButton';
import { SystemNotice } from './ui/SystemNotice';
import './ViewportStatusOverlay.css';

/**
 * How long a lost or restoring context has to last before the player is told anything. A GPU
 * handing the context straight back is common on iPad and takes well under this, so a shorter
 * wait would flash a notice over a view that is already back.
 */
export const VIEWPORT_STATUS_RECOVERING_DELAY_MS = 700;

interface ViewportStatusOverlayProps {
  status: RenderStatus;
  /**
   * The visible scene rectangle, so the notice sits in the UI area the player can see rather than
   * over the camera-shifted canvas. Omit it (the harness preview) to fill the containing block.
   */
  rect?: React.CSSProperties;
  /**
   * A box taller than it is wide, measured from that rectangle rather than guessed from the device
   * or a media query. A centered card wastes a tall viewport and lands on the Mobile side panel, so
   * a portrait box gets a banner along its top edge instead.
   */
  portrait?: boolean;
  /**
   * The Mobile layout, whose restart and full-screen stones are fixed in the top-left corner above
   * every layer in the frame. A portrait banner starts after that column instead of under it.
   * Passed rather than sniffed with `:has(.osm-menu)`, which iOS 15 does not support.
   */
  cornerOccupied?: boolean;
  /**
   * What App's graphics hold has paused while the view cannot draw: a fight in progress, the replay
   * being viewed, or nothing (the lobby, loading, a finished fight). Omitted by the harness preview.
   */
  heldActivity?: 'fight' | 'replay' | null;
  /** Overridden by the harness preview and by tests, which show the recovering state at once. */
  recoveringDelayMs?: number;
  /** Injected by tests. Production reloads the page, which is the only way back from a failure. */
  onReload?: () => void;
}

const reloadPage = () => window.location.reload();

const HELD_NOTE = {
  fight: 'The fight is paused.',
  replay: 'Replay playback is paused.',
} as const;

/** `data-render-status`, so a test or a screenshot run can name the state it is looking at. */
function statusName(status: RenderStatus): string {
  return status.kind === 'failed' ? `failed-${status.reason}` : status.kind;
}

/**
 * What the player sees when the 3D view cannot draw: the renderer's own status, reported by
 * RenderViewport3D through `onRenderStatusChange` and held by App, which holds the fight or replay
 * from the first report (the delay below is display-only).
 *
 * All three states are the shared {@link SystemNotice}, so this reads as the same family as the
 * hardware acceleration warning and the browser support screen:
 *
 * - `lost` / `restoring`: a `progress` strip, after a delay, because most context losses are over
 *   in a frame or two and the rest of the interface keeps running.
 * - `failed` for a restore, timeout or render-loop give-up: `blocked`, with the reload that is the
 *   only way back.
 * - `failed` for an unsupported context: `blocked`, with what to try instead, since no reload of
 *   this page will produce a context the browser does not offer.
 */
export const ViewportStatusOverlay: React.FC<ViewportStatusOverlayProps> = ({
  status,
  rect,
  portrait = false,
  cornerOccupied = false,
  heldActivity = null,
  recoveringDelayMs = VIEWPORT_STATUS_RECOVERING_DELAY_MS,
  onReload = reloadPage,
}) => {
  const recovering = status.kind === 'lost' || status.kind === 'restoring';
  const [recoveringShown, setRecoveringShown] = useState(false);

  // One timer for the whole episode: `lost` → `restoring` is the same trouble continuing, so the
  // wait is not restarted and the strip does not appear a step later than it should.
  useEffect(() => {
    if (!recovering) {
      setRecoveringShown(false);
      return;
    }
    const timer = window.setTimeout(() => setRecoveringShown(true), recoveringDelayMs);
    return () => window.clearTimeout(timer);
  }, [recovering, recoveringDelayMs]);

  if (status.kind === 'ok') return null;
  if (recovering && !recoveringShown) return null;

  const unsupported = status.kind === 'failed' && status.reason === 'unsupported';
  const heldNote = heldActivity ? HELD_NOTE[heldActivity] : null;
  const layout = portrait ? 'banner' : 'card';

  return (
    <div
      className={[
        'viewport-status',
        portrait && 'viewport-status--portrait',
        portrait && cornerOccupied && 'viewport-status--corner',
      ]
        .filter(Boolean)
        .join(' ')}
      style={rect}
      data-render-status={statusName(status)}
      data-portrait={portrait || undefined}
    >
      {recovering ? (
        <SystemNotice tone="progress" layout="strip" role="status" title="Restoring the 3D view" />
      ) : unsupported ? (
        <SystemNotice
          tone="blocked"
          layout={layout}
          role="alert"
          className="viewport-status__notice"
          title={NO_WEBGL2_TITLE}
          body={NO_WEBGL2_BODY}
          detail={heldNote}
          steps={noWebgl2Steps()}
          links={<BrowserSuggestions />}
          note={noWebgl2Note()}
        />
      ) : (
        <SystemNotice
          tone="blocked"
          layout={layout}
          role="alert"
          className="viewport-status__notice"
          title="The 3D view stopped"
          body="It may still come back on its own. Reloading the page usually fixes it."
          detail={heldNote}
          action={
            <OsrsButton variant="primary" className="viewport-status__reload" onClick={onReload}>
              Reload page
            </OsrsButton>
          }
        />
      )}
    </div>
  );
};
