import type React from 'react';
import { useId, useState } from 'react';
import { getRevealAvailability, revealSetting } from '../settingsReveal';
import { SettingRow } from './SettingRow';
import './RevealLinks.css';

/** Keeps focus where it was, so Space keeps reaching the game after a click (keyboard policy). */
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

function ArrowGlyph({ className }: { className: string }) {
  return (
    <svg
      className={className}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M1.5 5h7M5.5 2l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Inline link to a setting edited elsewhere, e.g. from a plugin to the shared Infobox appearance.
 * It names where it goes; the arrow says it moves you there.
 */
export function RevealLink({
  target,
  children,
  className,
  onNavigate,
}: {
  target: string;
  children: React.ReactNode;
  className?: string;
  /** Runs first, for a surface that should get out of the way (a modal closing). */
  onNavigate?: () => void;
}) {
  const [blocked, setBlocked] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={`reveal-link${className ? ` ${className}` : ''}`}
        onMouseDown={keepFocus}
        onClick={() => {
          // Checked before anything moves: a blocked link says why where it is, and closes nothing.
          const status = getRevealAvailability(target);
          setBlocked(status.ok ? null : status.reason);
          if (!status.ok) return;
          onNavigate?.();
          revealSetting(target);
        }}
      >
        <span className="reveal-link__text">{children}</span>
        <ArrowGlyph className="reveal-link__arrow" />
      </button>
      {blocked && (
        <span className="reveal-link__blocked" role="status">
          {blocked}
        </span>
      )}
    </>
  );
}

/**
 * A row that takes you to the one place something is set: a setting shown where people look for
 * it but edited elsewhere (with its current `value`), or a destination of its own, like Keybinds.
 * `hint` says where it leads. When the destination cannot be reached now (`blockedReason`, or what
 * the reveal route itself says), the row says so in place instead of navigating.
 */
export function SettingLinkRow({
  label,
  value,
  hint,
  target,
  searchId,
  blockedReason,
}: {
  label: string;
  value?: string;
  hint: string;
  target: string;
  /**
   * The row's own search anchor, or `null` when search should list only the destination (`target`)
   * it leads to: one editor, one result. Required, as on SettingRow.
   */
  searchId: string | null;
  blockedReason?: () => string | null;
}) {
  const hintId = useId();
  const [blocked, setBlocked] = useState<string | null>(null);
  return (
    <div className="setting-link" data-search-id={searchId ?? undefined}>
      {/* Never modified here, but it keeps the row's reset gutter so it lines up with the selects. */}
      <SettingRow
        // The link row's wrapper carries any anchor (`searchId` above).
        searchId={null}
        isModified={false}
        onReset={() => {}}
      >
        <button
          type="button"
          className="setting-link__row"
          onMouseDown={keepFocus}
          onClick={() => {
            const reason = blockedReason?.() ?? null;
            if (reason !== null) {
              setBlocked(reason);
              return;
            }
            const status = revealSetting(target);
            setBlocked(status.ok ? null : status.reason);
          }}
          aria-label={value === undefined ? label : `${label}: ${value}`}
          aria-describedby={hintId}
        >
          <span className="setting-link__label">{label}</span>
          {value !== undefined && <span className="setting-link__value">{value}</span>}
          <ArrowGlyph className="setting-link__arrow" />
        </button>
      </SettingRow>
      <div id={hintId} className="settings-hint setting-link__hint">
        {hint}
      </div>
      {blocked && (
        <div className="settings-hint setting-link__blocked" role="status">
          {blocked}
        </div>
      )}
    </div>
  );
}
