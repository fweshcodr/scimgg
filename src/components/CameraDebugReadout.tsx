import type React from 'react';
import { useEffect, useState } from 'react';
import type { Projection3D } from '../render/projections/Projection3D';

// Yaw 0 looks north and yaw grows toward the west, as the client's compass does.
const DIRECTIONS = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE'];

function lookDirection(yaw: number): string {
  const normalized = ((yaw % 360) + 360) % 360;
  return DIRECTIONS[Math.round(normalized / 45) % 8];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The orbit camera in the units an encounter's `defaultCamera` takes, so a view framed by
 * hand can be copied straight into one. Polled per frame; it re-renders only on a change.
 */
export function formatCameraReadout(projection: Projection3D): string {
  const { yaw, pitch, fovScale } = projection.getCameraState();
  const heading = ((round1(yaw) % 360) + 360) % 360;
  return `yaw: ${heading} (${lookDirection(heading)}), pitch: ${round1(pitch)}, zoom: ${Math.round(fovScale)}`;
}

export const CameraDebugReadout: React.FC<{ projection: Projection3D }> = ({ projection }) => {
  const [text, setText] = useState(() => formatCameraReadout(projection));

  useEffect(() => {
    let frame = 0;
    const poll = () => {
      setText(formatCameraReadout(projection));
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [projection]);

  return (
    <div
      style={{
        padding: '3px 8px',
        background: 'rgba(0, 0, 0, 0.78)',
        border: '1px solid var(--hud-border)',
        borderRadius: 2,
        color: '#ffe066',
        font: '700 14px "RuneScape Bold 12", monospace, sans-serif',
        letterSpacing: '0.3px',
        textShadow: '1px 1px 0 #000',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {text}
    </div>
  );
};
