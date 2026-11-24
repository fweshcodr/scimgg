import type React from 'react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ReplayControls } from '../../components/ReplayControls';
import { TooltipOverlay, TooltipProvider } from '../../components/Tooltip';
import { type ReplayChapterFixture, replayChapterFixture } from './replayChapterFixture';

/**
 * The Mobile Tools window's Replay page, as the harness measures it on a 740x420 viewport: the
 * native left slot, 169x235 including its 44px tab row. The preview reproduces the window, body,
 * pane and transport chain at that size, without the tab row, so MobileToolWindow.css lays the bar
 * out exactly as it does in the app. It is fixed on the window itself (`.osm-tools` is
 * `display: contents`, as in the app), clear of the app's own chrome.
 */
const WINDOW_STYLE = {
  position: 'fixed',
  left: 40,
  top: 160,
  width: 169,
  height: 191,
  zIndex: 60,
} as React.CSSProperties;

/**
 * Dev-only preview of the replay transport over a synthetic chaptered recording
 * (`?replayChapters=full|practice`, `?replayChaptersCompact=1`, `?replayChaptersMobile=1`).
 *
 * Like `RenderStatusPreview`, this mounts the component rather than reaching a state the player
 * can reach: the real chapters come from an Inferno recording, which needs the OSRS cache and a
 * long fight the harness mounts no renderer for. For the floating bar the DOM around it is the one
 * `Grid` renders (the dock, then the zoom wrapper), so it is laid out and painted exactly as it is
 * in the app. The Mobile form reproduces the tool window's chain and measurements instead, which
 * is a close copy rather than the window itself: confirm band geometry in the real app.
 *
 * It brings its own `TooltipProvider` and overlay because the portal leaves `Grid`'s React tree,
 * where the app's live one is, and the rail's wave tooltip is part of what this previews.
 */
export function ReplayChaptersPreview({
  fixture,
  compact,
  mobile,
}: {
  readonly fixture: ReplayChapterFixture;
  readonly compact: boolean;
  readonly mobile: boolean;
}) {
  const data = replayChapterFixture(fixture);
  const [frameIndex, setFrameIndex] = useState(
    () => data?.chapters.chapters[Math.floor((data?.chapters.chapters.length ?? 0) / 2)]?.startFrame ?? 0,
  );
  if (!data) return null;
  const controls = (
    <ReplayControls
      compact={compact || mobile}
      moreMenu={mobile}
      chapters={data.chapters}
      replayFrameIndex={frameIndex + 6}
      totalFrames={data.totalFrames}
      isPlaying={false}
      replayCursorVisible={false}
      onSeek={(frame) => setFrameIndex(frame - 6)}
      onPreviewSeek={(frame) => setFrameIndex(frame - 6)}
      onStepBack={() => setFrameIndex((frame) => Math.max(-6, frame - 1))}
      onStepForward={() => setFrameIndex((frame) => Math.min(data.totalFrames - 7, frame + 1))}
      onJumpToStart={() => setFrameIndex(-6)}
      onJumpToEnd={() => setFrameIndex(data.totalFrames - 7)}
      onPlayPause={() => {}}
      onExitReplay={() => {}}
      onTakeOver={() => {}}
      onReplayCursorVisibleChange={() => {}}
    />
  );
  return createPortal(
    <TooltipProvider>
      {mobile ? (
        <div className="osm-tools">
          <div className="osm-tools__window osm-tools__window--replay" style={WINDOW_STYLE}>
            <div className="osm-tools__body">
              <div className="osm-tools__pane osm-tools__pane--replay">
                <div className="osm-tools__transport">{controls}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="replay-transport-dock">
          <div>{controls}</div>
        </div>
      )}
      <TooltipOverlay />
    </TooltipProvider>,
    document.body,
  );
}
