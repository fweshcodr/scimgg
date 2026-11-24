import type React from 'react';
import { useSyncExternalStore } from 'react';
import { modifierMaskAt, mouseButtonMaskAt, type ReplayModifierSample } from '../core/ReplayRecorder';
import type { ReplayFrameStore } from '../core/replayFrameStore';
import {
  type ModifierName,
  type MouseButtonName,
  type MouseButtonState,
  modifierStateFromMask,
  mouseButtonStateFromMask,
  useModifiers,
  useMouseButtons,
} from '../input/keyState';
import { THEME } from '../theme';
import { withAlpha } from '../util/colorUtils';

interface ModifierKeysOverlayProps {
  isReplaying: boolean;
  /** Recorded change log for the run on screen. */
  modifierTrack: readonly ReplayModifierSample[];
  replayFrameStore: ReplayFrameStore;
}

const ROWS: readonly { readonly label: string; readonly key: ModifierName }[] = [
  { label: 'Shift', key: 'shift' },
  { label: 'Ctrl', key: 'ctrl' },
  { label: 'Alt', key: 'alt' },
  { label: 'Meta', key: 'meta' },
];

const IDLE_STROKE = withAlpha(THEME.colors.primary, 0.35);

/** Each button's outer edge repeats the shell's own arc; flattening them into rects leaves a
 * lit button floating inside the outline it is supposed to fill. */
const MOUSE_BUTTON_PATH: Readonly<Record<MouseButtonName, string>> = {
  left: 'M10 1.6C5.3 1.6 1.6 5.4 1.6 10v2.6H10z',
  right: 'M10 1.6c4.7 0 8.4 3.8 8.4 8.4v2.6H10z',
  middle: 'M10 4.4a1.4 1.4 0 0 1 1.4 1.4v3.4a1.4 1.4 0 0 1-2.8 0V5.8A1.4 1.4 0 0 1 10 4.4z',
};

const MouseGlyph: React.FC<MouseButtonState> = (held) => (
  <svg width={17} height={25} viewBox="0 0 20 30" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
    {(Object.keys(MOUSE_BUTTON_PATH) as MouseButtonName[]).map((button) => (
      <path
        key={button}
        d={MOUSE_BUTTON_PATH[button]}
        // Same reason the pills carry them: a screenshot cannot tell a lit shape from an
        // unlit one, and this is the surface a stuck button is read off.
        data-mouse-button={button}
        data-held={held[button] || undefined}
        fill={held[button] ? THEME.colors.success : 'none'}
        stroke={held[button] ? THEME.colors.success : IDLE_STROKE}
        strokeWidth={1.2}
      />
    ))}
    <rect x={1.6} y={1.6} width={16.8} height={26.8} rx={8.4} fill="none" stroke={IDLE_STROKE} strokeWidth={1.2} />
    <path d="M1.6 12.6h16.8" fill="none" stroke={IDLE_STROKE} strokeWidth={1.2} />
  </svg>
);

/** Mounted only while the setting is on: it subscribes to the replay frame store, which
 * advances every animation frame during playback. */
export const ModifierKeysOverlay: React.FC<ModifierKeysOverlayProps> = ({
  isReplaying,
  modifierTrack,
  replayFrameStore,
}) => {
  const live = useModifiers();
  const mouse = useMouseButtons();
  // Subscribing to the frame store rather than taking the playhead as a prop keeps
  // the per-frame update on this component alone; threading it from useReplay would
  // re-render App and the whole simulator tree at display refresh rate.
  const playheadMs = useSyncExternalStore(
    replayFrameStore.subscribe,
    () =>
      isReplaying && !replayFrameStore.isTrackAvailable('modifierSamples')
        ? null
        : replayFrameStore.getSnapshot().playheadMs,
    () => 0,
  );
  if (playheadMs === null) return null;

  const state = isReplaying ? modifierStateFromMask(modifierMaskAt(modifierTrack, playheadMs)) : live;
  // Never the viewer's own `mouse` while replaying: that would draw their hand onto someone
  // else's fight.
  const mouseState = isReplaying ? mouseButtonStateFromMask(mouseButtonMaskAt(modifierTrack, playheadMs)) : mouse;

  return (
    <div
      style={{
        position: 'absolute',
        // Clear of the nav column on the left and of the minimap, orbs and Plugins
        // button on the right; the top strip between them is the only region no
        // gameplay chrome claims.
        top: 8,
        left: 152,
        zIndex: 1000,
        background: THEME.colors.surface,
        border: `1px solid ${THEME.colors.borderHighlight}`,
        borderRadius: 2,
        padding: '6px 10px',
        fontFamily: '"RuneScape Plain 11", monospace',
        fontSize: 13,
        color: THEME.colors.text,
        pointerEvents: 'none',
        textShadow: '1px 1px 0 #000',
        lineHeight: 1.4,
      }}
    >
      <div
        style={{
          color: THEME.colors.heading,
          fontFamily: '"RuneScape Bold 12", sans-serif',
          fontSize: 14,
          marginBottom: 2,
        }}
      >
        {isReplaying ? 'Input (replay)' : 'Input'}
      </div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <MouseGlyph {...mouseState} />
        <div style={{ display: 'flex', gap: 4 }}>
          {ROWS.map(({ label, key }) => {
            const held = state[key];
            return (
              <span
                key={key}
                // Attributes, not just color: a screenshot cannot tell a lit pill from
                // an unlit one reliably, and this is the surface a stuck key is read off.
                data-modifier={key}
                data-held={held || undefined}
                style={{
                  padding: '1px 5px',
                  borderRadius: 2,
                  border: `1px solid ${held ? THEME.colors.success : IDLE_STROKE}`,
                  color: held ? THEME.colors.success : withAlpha(THEME.colors.text, 0.45),
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
