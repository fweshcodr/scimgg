import type React from 'react';
import { useEffect, useState } from 'react';
import type { AudioEngine, SoundPlayEvent } from '../audio/AudioEngine';
import { SOUND_NAMES } from '../audio/soundNames';
import { THEME } from '../theme';

interface SoundDebugOverlayProps {
  audioEngine: AudioEngine;
  visible: boolean;
  controlsVisible: boolean;
}

const EVENT_MAX_AGE_MS = 4000;
const EDGE_INSET = 16;
const BOTTOM_LEFT_CLEARANCE = 64;
const SETTINGS_PANEL_WIDTH = 320;

function isRecentEvent(event: SoundPlayEvent): boolean {
  return Date.now() - event.timestamp < EVENT_MAX_AGE_MS;
}

export const SoundDebugOverlay: React.FC<SoundDebugOverlayProps> = ({ audioEngine, visible, controlsVisible }) => {
  const [events, setEvents] = useState<(SoundPlayEvent & { id: string })[]>([]);

  useEffect(() => {
    const cleanup = audioEngine.onSoundPlayed((event) => {
      setEvents((prev) => {
        if (prev.some((existing) => existing.eventId === event.eventId)) return prev;
        const newEvent = { ...event, id: `sound-${event.eventId}` };
        return [newEvent, ...prev].slice(0, 10);
      });
    });

    return cleanup;
  }, [audioEngine]);

  useEffect(() => {
    if (!visible) return;

    const syncFromHistory = () => {
      const history = audioEngine.getRecentSoundEvents(10).filter(isRecentEvent);
      if (history.length === 0) return;
      setEvents((prev) => {
        const recentPrev = prev.filter(isRecentEvent);
        const merged = new Map<number, SoundPlayEvent & { id: string }>();
        for (const event of history) {
          merged.set(event.eventId, { ...event, id: `sound-${event.eventId}` });
        }
        for (const event of recentPrev) {
          if (!merged.has(event.eventId)) {
            merged.set(event.eventId, event);
          }
        }
        return [...merged.values()].sort((a, b) => b.eventId - a.eventId).slice(0, 10);
      });
    };

    syncFromHistory();

    const historyInterval = setInterval(syncFromHistory, 250);

    const interval = setInterval(() => {
      const now = Date.now();
      setEvents((prev) => prev.filter((e) => now - e.timestamp < EVENT_MAX_AGE_MS));
    }, 100);

    return () => {
      clearInterval(interval);
      clearInterval(historyInterval);
    };
  }, [audioEngine, visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: BOTTOM_LEFT_CLEARANCE,
        left: controlsVisible ? SETTINGS_PANEL_WIDTH + EDGE_INSET : EDGE_INSET,
        right: 'auto',
        zIndex: 65,
        background: THEME.colors.surface,
        border: `1px solid ${THEME.colors.borderHighlight}`,
        borderRadius: 2,
        padding: '8px 12px',
        fontFamily: '"RuneScape Plain 11", monospace',
        fontSize: 13,
        color: THEME.colors.text,
        pointerEvents: 'none',
        minWidth: 220,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        textShadow: '1px 1px 0 #000',
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          color: THEME.colors.heading,
          fontFamily: '"RuneScape Bold 12", sans-serif',
          fontSize: 14,
          marginBottom: 4,
        }}
      >
        Sound Debug
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {events.map((event) => {
          const name = SOUND_NAMES[event.soundId] || `Unknown`;
          const age = Date.now() - event.timestamp;
          const opacity = age > 3000 ? 1 - (age - 3000) / 1000 : 1;

          return (
            <div
              key={event.id}
              style={{
                display: 'flex',
                gap: 6,
                opacity,
                transition: 'opacity 0.1s linear',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: THEME.colors.text }}>
                {name} <span style={{ color: THEME.colors.textMuted }}>({event.soundId}) —</span>
              </span>
              <span style={{ color: THEME.colors.accentText }}>{event.trigger}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
