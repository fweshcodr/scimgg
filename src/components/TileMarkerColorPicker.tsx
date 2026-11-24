import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ESC_PRIORITY, useEscapeLayer } from '../hooks/useEscapeLayer';
import { useRafDrag } from '../hooks/useRafDrag';
import { isTouchPointer } from '../input/touchHold';
import { MARKER_COLOR_PRESETS } from '../types/tileMarkers';
import { getGameViewportBounds } from '../util/viewportBounds';
import './TileMarkerColorPicker.css';
import './ui/OsrsButton.css';
import { sheet } from './ui/mobileSheet';

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return null;
  }

  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  return `#${hex.toUpperCase()}`;
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hueToHex(h: number): string {
  return hsvToHex(h, 1, 1);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const FALLBACK_MARKER_COLOR = normalizeHexColor(MARKER_COLOR_PRESETS[0]?.color ?? '') ?? '#FFFFFF';

interface TileMarkerColorPickerProps {
  isOpen: boolean;
  anchor: { x: number; y: number } | null;
  initialColor: string;
  initialOpacity: number;
  initialFillOpacity?: number;
  onApply: (color: string, opacity: number, fillOpacity: number) => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  showOpacity?: boolean;
  showFill?: boolean;
}

export const TileMarkerColorPicker: React.FC<TileMarkerColorPickerProps> = ({
  isOpen,
  anchor,
  initialColor,
  initialOpacity,
  initialFillOpacity = 0,
  onApply,
  onCancel,
  title = 'Color',
  subtitle,
  showOpacity = true,
  showFill = false,
}) => {
  const initialPickerColor = normalizeHexColor(initialColor) ?? FALLBACK_MARKER_COLOR;
  const [color, setColor] = useState(initialPickerColor);
  const [hexInputValue, setHexInputValue] = useState(initialPickerColor);
  const [hsv, setHsv] = useState(() => hexToHsv(initialPickerColor));
  const hsvRef = useRef(hsv);
  const [opacity, setOpacity] = useState(initialOpacity);
  const [fillOpacity, setFillOpacity] = useState(initialFillOpacity);
  const panelRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLButtonElement>(null);
  const hueRef = useRef<HTMLButtonElement>(null);
  const dragModeRef = useRef<null | 'sv' | 'hue'>(null);

  const commitHsv = (next: { h: number; s: number; v: number }) => {
    const nextHsv = {
      h: clampNumber(next.h, 0, 360),
      s: clampNumber(next.s, 0, 1),
      v: clampNumber(next.v, 0, 1),
    };
    const nextHex = hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v);
    hsvRef.current = nextHsv;
    setHsv(nextHsv);
    setColor(nextHex);
    setHexInputValue(nextHex);
  };

  const updateSvFromClientPoint = (clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    const y = clampNumber((clientY - rect.top) / rect.height, 0, 1);
    const nextS = x;
    const nextV = 1 - y;
    commitHsv({ h: hsvRef.current.h, s: nextS, v: nextV });
  };

  const updateHueFromClientPoint = (clientY: number) => {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return;

    const y = clampNumber((clientY - rect.top) / rect.height, 0, 1);
    const nextH = y * 360;
    commitHsv({ h: nextH, s: hsvRef.current.s, v: hsvRef.current.v });
  };

  const updateFromClientPoint = (mode: 'sv' | 'hue', clientX: number, clientY: number) => {
    if (mode === 'sv') {
      updateSvFromClientPoint(clientX, clientY);
    } else {
      updateHueFromClientPoint(clientY);
    }
  };

  const { startDrag: startColorDrag } = useRafDrag({
    onMove: (clientX, clientY) => {
      if (dragModeRef.current) updateFromClientPoint(dragModeRef.current, clientX, clientY);
    },
    onEnd: () => {
      dragModeRef.current = null;
    },
  });

  const startDragging = (mode: 'sv' | 'hue', event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragModeRef.current = mode;
    updateFromClientPoint(mode, event.clientX, event.clientY);
    startColorDrag(event);
  };

  // useRafDrag follows the mouse, and a touch sends no mouse events until it lifts. A touch
  // stays with the element it landed on, so the surface itself can follow it. Touch pointers only
  // (see `isTouchPointer`); a mouse-model press is left to the mousedown above.
  // Only the gesture's first finger drags, so a second one can neither steal nor end it.
  const touchPointerRef = useRef<number | null>(null);
  const endTouchDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerId !== touchPointerRef.current) return;
    touchPointerRef.current = null;
    dragModeRef.current = null;
  };
  const bindTouchDrag = (mode: 'sv' | 'hue') => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (!isTouchPointer(event) || !event.isPrimary) return;
      // Also stops the compatibility mousedown from starting a mouse drag on release.
      event.preventDefault();
      touchPointerRef.current = event.pointerId;
      dragModeRef.current = mode;
      updateFromClientPoint(mode, event.clientX, event.clientY);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerId === touchPointerRef.current && dragModeRef.current === mode) {
        updateFromClientPoint(mode, event.clientX, event.clientY);
      }
    },
    onPointerUp: endTouchDrag,
    onPointerCancel: endTouchDrag,
  });

  useEffect(() => {
    if (!isOpen) return;
    const nextColor = normalizeHexColor(initialColor) ?? FALLBACK_MARKER_COLOR;
    const nextHsv = hexToHsv(nextColor);
    hsvRef.current = nextHsv;
    setHsv(nextHsv);
    setColor(nextColor);
    setHexInputValue(nextColor);
    setOpacity(initialOpacity);
    setFillOpacity(initialFillOpacity);
  }, [isOpen, initialColor, initialOpacity, initialFillOpacity]);

  const commitHexInput = () => {
    const normalizedColor = normalizeHexColor(hexInputValue);
    if (!normalizedColor) {
      setHexInputValue(color);
      return;
    }

    commitHsv(hexToHsv(normalizedColor));
  };

  const parsedHexInputColor = normalizeHexColor(hexInputValue);
  const previewColor = parsedHexInputColor ?? color;

  useEscapeLayer(ESC_PRIORITY.COLOR_PICKER, isOpen, onCancel);

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (event.target instanceof Node && panelRef.current.contains(event.target)) {
        return;
      }
      onCancel();
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [isOpen, onCancel]);

  useLayoutEffect(() => {
    if (!isOpen || !anchor || !panelRef.current) return;

    const applyPosition = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const panelRect = panel.getBoundingClientRect();
      const bounds = getGameViewportBounds();
      const viewportPadding = 8;
      const left = Math.max(
        bounds.left + viewportPadding,
        Math.min(anchor.x, bounds.right - panelRect.width - viewportPadding),
      );
      const top = Math.max(
        bounds.top + viewportPadding,
        Math.min(anchor.y, bounds.bottom - panelRect.height - viewportPadding),
      );
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    applyPosition();
    // Re-clamp on window resize so the picker doesn't end up clipped if
    // the viewport shrinks or the fixed-resolution frame changes while
    // the picker is open.
    window.addEventListener('resize', applyPosition);
    return () => window.removeEventListener('resize', applyPosition);
  }, [isOpen, anchor]);

  if (!isOpen || !anchor) return null;

  const hueHex = hueToHex(hsv.h);
  const svStyle = { '--tile-marker-picker-hue': hueHex } as React.CSSProperties;
  const activePreset = MARKER_COLOR_PRESETS.find((preset) => preset.color.toLowerCase() === color.toLowerCase());

  return createPortal(
    <div className="tile-marker-picker-backdrop">
      <div className="tile-marker-picker" {...sheet.popover} ref={panelRef}>
        <div className="tile-marker-picker-header">
          <div className="tile-marker-picker-heading">
            <div className="tile-marker-picker-title">{title}</div>
            {subtitle && <div className="tile-marker-picker-subtitle">{subtitle}</div>}
          </div>
          <div className="tile-marker-picker-identity">
            {activePreset && <span className="tile-marker-picker-current-name">{activePreset.name}</span>}
            <span
              className="tile-marker-picker-current"
              role="img"
              style={{ backgroundColor: color, opacity }}
              aria-label="Current color"
            />
          </div>
        </div>

        <div className="tile-marker-picker-body">
          <div className="tile-marker-picker-field">
            <button
              type="button"
              ref={svRef}
              className="tile-marker-picker-sv"
              style={svStyle}
              onMouseDown={(event) => startDragging('sv', event)}
              {...bindTouchDrag('sv')}
              aria-label="Saturation and brightness"
            >
              <div
                className="tile-marker-picker-sv-indicator"
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
                aria-hidden="true"
              />
            </button>

            <button
              type="button"
              ref={hueRef}
              className="tile-marker-picker-hue"
              onMouseDown={(event) => startDragging('hue', event)}
              {...bindTouchDrag('hue')}
              aria-label="Hue"
            >
              <div
                className="tile-marker-picker-hue-thumb"
                style={{ top: `${(hsv.h / 360) * 100}%` }}
                aria-hidden="true"
              />
            </button>
          </div>

          <div className="tile-marker-picker-section">
            <div className="tile-marker-picker-section-label">
              <span>Presets</span>
            </div>
            <div className="tile-marker-picker-swatches">
              {MARKER_COLOR_PRESETS.map((preset) => {
                const isSelected = preset.color.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={preset.name}
                    type="button"
                    className={`tile-marker-swatch${isSelected ? ' selected' : ''}`}
                    title={preset.name}
                    style={{ backgroundColor: preset.color }}
                    onClick={() => {
                      const normalizedColor = normalizeHexColor(preset.color);
                      if (!normalizedColor) {
                        return;
                      }

                      commitHsv(hexToHsv(normalizedColor));
                    }}
                    aria-label={`Select ${preset.name}`}
                    aria-pressed={isSelected}
                  />
                );
              })}
            </div>
          </div>

          <div className="tile-marker-picker-section">
            <div className="tile-marker-picker-section-label">
              <span>Hex</span>
              <span className="tile-marker-picker-section-value">{color}</span>
            </div>
            <div className="tile-marker-picker-hex-row">
              <input
                id="tile-marker-picker-hex-input"
                className="tile-marker-picker-hex-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={7}
                value={hexInputValue}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setHexInputValue(nextValue);

                  const normalizedColor = normalizeHexColor(nextValue);
                  if (normalizedColor) {
                    commitHsv(hexToHsv(normalizedColor));
                  }
                }}
                onBlur={commitHexInput}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitHexInput();
                  }
                }}
                aria-label="Custom hex color"
              />
              <span
                className="tile-marker-picker-hex-preview"
                style={{ backgroundColor: previewColor }}
                aria-hidden="true"
              />
            </div>
          </div>

          {showOpacity && (
            <div className="tile-marker-picker-section">
              <div className="tile-marker-picker-section-label">
                <span>Opacity</span>
                <span className="tile-marker-picker-section-value">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                className="tile-marker-picker-range"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
            </div>
          )}

          {showFill && (
            <div className="tile-marker-picker-section">
              <div className="tile-marker-picker-section-label">
                <span>Fill opacity</span>
                <span className="tile-marker-picker-section-value">{Math.round(fillOpacity * 100)}%</span>
              </div>
              <input
                className="tile-marker-picker-range"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={fillOpacity}
                onChange={(event) => setFillOpacity(Number(event.target.value))}
              />
            </div>
          )}
        </div>

        <div className="tile-marker-picker-footer" {...sheet.foot}>
          <button
            type="button"
            className="osrs-btn osrs-btn--primary"
            onClick={() => onApply(color, opacity, showFill ? fillOpacity : 0)}
          >
            Apply
          </button>
          <button type="button" className="osrs-btn osrs-btn--default" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
