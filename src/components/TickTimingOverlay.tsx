import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { THEME } from '../theme';
import { withAlpha } from '../util/colorUtils';
import type { TickTimingMonitor, TickTimingStats } from '../util/TickTimingMonitor';

interface TickTimingOverlayProps {
  monitor: TickTimingMonitor;
  visible: boolean;
}

function deviationColor(devMs: number): string {
  const abs = Math.abs(devMs);
  if (abs <= 2) return THEME.colors.success;
  if (abs <= 8) return THEME.colors.warning;
  if (abs <= 16) return THEME.colors.primaryHover;
  return THEME.colors.danger;
}

function Sparkline({ deltas, expectedMs }: { deltas: readonly number[]; expectedMs: number }) {
  if (deltas.length < 2) return null;

  const w = 200;
  const h = 32;
  const padding = 2;
  const tolerance = 16;

  const minY = expectedMs - tolerance;
  const maxY = expectedMs + tolerance;
  const rangeY = maxY - minY;

  const stepX = (w - padding * 2) / (deltas.length - 1);

  let path = '';
  for (let i = 0; i < deltas.length; i++) {
    const x = padding + i * stepX;
    const clamped = Math.max(minY, Math.min(maxY, deltas[i]));
    const y = h - padding - ((clamped - minY) / rangeY) * (h - padding * 2);
    path += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
  }

  const centerY = h - padding - ((expectedMs - minY) / rangeY) * (h - padding * 2);

  return (
    <svg width={w} height={h} style={{ display: 'block' }} role="img" aria-label="Tick timing sparkline">
      <title>Tick timing sparkline</title>
      <line
        x1={padding}
        y1={centerY}
        x2={w - padding}
        y2={centerY}
        stroke={withAlpha(THEME.colors.primary, 0.3)}
        strokeWidth="1"
        strokeDasharray="3,3"
      />
      <path d={path} fill="none" stroke={THEME.colors.success} strokeWidth="1.5" />
    </svg>
  );
}

function formatMs(ms: number, decimals = 1): string {
  return ms.toFixed(decimals);
}

function formatDeviation(ms: number): string {
  const sign = ms >= 0 ? '+' : '';
  return `${sign}${ms.toFixed(1)}`;
}

function StatsRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: THEME.colors.accentText }}>{label}</span>
      <span style={{ color: color ?? THEME.colors.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export const TickTimingOverlay: React.FC<TickTimingOverlayProps> = ({ monitor, visible }) => {
  const [stats, setStats] = useState<TickTimingStats | null>(null);
  const rafRef = useRef<number>(0);

  const update = useCallback(() => {
    setStats(monitor.getStats());
    rafRef.current = requestAnimationFrame(update);
  }, [monitor]);

  useEffect(() => {
    if (!visible) return;
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, update]);

  if (!visible || !stats || stats.sampleCount === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 1000,
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
        Tick Timing
      </div>

      <StatsRow label="Expected" value={`${formatMs(stats.expectedMs, 0)}ms`} />
      <StatsRow
        label="Last"
        value={`${formatMs(stats.lastMs)}ms (${formatDeviation(stats.lastDeviationMs)})`}
        color={deviationColor(stats.lastDeviationMs)}
      />
      <StatsRow
        label="Avg"
        value={`${formatMs(stats.avgMs)}ms`}
        color={deviationColor(stats.avgMs - stats.expectedMs)}
      />
      <StatsRow label="Min / Max" value={`${formatMs(stats.minMs)} / ${formatMs(stats.maxMs)}ms`} />
      <StatsRow
        label="Stddev"
        value={`${formatMs(stats.stddevMs)}ms`}
        color={
          stats.stddevMs > 8 ? THEME.colors.danger : stats.stddevMs > 4 ? THEME.colors.warning : THEME.colors.success
        }
      />
      <StatsRow
        label="Max Jitter"
        value={`${formatMs(stats.maxJitterMs)}ms`}
        color={deviationColor(stats.maxJitterMs)}
      />
      <StatsRow label="Samples" value={`${stats.sampleCount}`} />

      <div style={{ marginTop: 4 }}>
        <Sparkline deltas={stats.recentDeltas} expectedMs={stats.expectedMs} />
      </div>
    </div>
  );
};
