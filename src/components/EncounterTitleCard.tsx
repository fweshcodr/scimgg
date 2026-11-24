import type React from 'react';
import { useEffect, useState } from 'react';
import { FightStartCountdown, type FightStartCountdownProps } from './FightStartCountdown';
import './EncounterTitleCard.css';

interface EncounterTitleCardProps {
  encounterName: string | null;
  /** Includes untimed pending states; only cancellation/finish returns to the fixed 3.6s lifetime. */
  countdownActive: boolean;
  /** Optional secondary line (e.g. contract variant or "Tutorial Mode"). */
  subtitle?: string | null;
  /** Reserves the same title geometry after arrival fades and on a restart. */
  layoutName?: string | null;
  /** Fight countdown, in flow directly beneath the arrival heading. */
  countdown?: FightStartCountdownProps & { key: number };
}

export interface TitleParts {
  heroName: string;
  subtitle: string | null;
}

/**
 * Shape the raw encounter name into title-card roles: the hero line is ONE
 * focal word/name, everything qualifying it (phase, contract, tutorial mode)
 * belongs on the metadata line below.
 *
 * Two delimiters feed the metadata line: a trailing " · " suffix (composed
 * names like "Yama · Tutorial Mode") and a spaced " - " qualifier ("Yama -
 * Phase 3"). The spaced dash is deliberate — unspaced hyphens ("TzKal-Zuk")
 * are part of the name itself. An explicit `subtitle` prop wins over the
 * parsed " · " suffix; a parsed " - " qualifier is prepended to either.
 */
export function resolveTitleParts(name: string, subtitle: string | null): TitleParts {
  const [first, ...nameSuffix] = name.split(' · ');
  const dashIdx = first.indexOf(' - ');
  const heroName = dashIdx === -1 ? first : first.slice(0, dashIdx);
  const qualifier = dashIdx === -1 ? null : first.slice(dashIdx + 3);
  const tail = subtitle ?? (nameSuffix.length ? nameSuffix.join(' · ') : null);
  const parts = [qualifier, tail].filter((p): p is string => p !== null && p !== '');
  return {
    heroName,
    subtitle: parts.length ? parts.join(' · ') : null,
  };
}

export const EncounterTitleCard: React.FC<EncounterTitleCardProps> = ({
  encounterName,
  subtitle = null,
  layoutName = encounterName,
  countdown,
  countdownActive,
}) => {
  const [displayContent, setDisplayContent] = useState<{
    name: string;
    subtitle: string | null;
    key: number;
    shownAtMs: number;
  } | null>(null);

  useEffect(() => {
    if (encounterName) {
      // Every time we get a valid name, create a new key to re-trigger the CSS animation
      setDisplayContent((prev) => ({
        name: encounterName,
        subtitle: subtitle ?? null,
        key: prev ? prev.key + 1 : 0,
        shownAtMs: performance.now(),
      }));
    } else {
      setDisplayContent(null);
    }
  }, [encounterName, subtitle]);

  useEffect(() => {
    // Counted entries clear through the countdown's actual-release completion,
    // not a second predicted deadline. Non-counted entries keep the fixed 3.6s lifetime.
    if (!displayContent || countdownActive) return;
    const timer = setTimeout(
      () => setDisplayContent(null),
      Math.max(0, displayContent.shownAtMs + 3600 - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [displayContent, countdownActive]);

  if (!displayContent && !countdownActive) {
    return null;
  }

  const content = displayContent ?? (layoutName ? { name: layoutName, subtitle } : null);
  if (!content) return null;
  const { heroName, subtitle: resolvedSubtitle } = resolveTitleParts(content.name, content.subtitle);
  const countedEntry = !!displayContent && countdownActive;
  const exiting = countedEntry && countdown?.releasedAtMs != null;

  return (
    <div className="encounter-arrival">
      <div
        className={`encounter-title-card-overlay${countedEntry ? ' encounter-title-card-overlay--countdown' : ''}${exiting ? ' encounter-title-card-overlay--exiting' : ''}`}
      >
        {/* Keyed alongside the card so the dimming restarts on a fresh encounter. */}
        {displayContent && (
          <div key={`${displayContent.key}-vignette`} className="encounter-title-card-vignette" aria-hidden="true" />
        )}
        <div className="encounter-arrival-content">
          <div
            key={displayContent?.key ?? 'reserved'}
            className={`encounter-title-card${displayContent ? '' : ' encounter-title-card--reserved'}`}
            aria-hidden={displayContent ? undefined : true}
          >
            <div className="encounter-title-card-eyebrow">Now Entering</div>
            {/* Two stacked copies of the name: a dark extrude/shadow layer under a
            gradient-clipped fill. The gradient needs a transparent text fill,
            which would let a same-element text-shadow bleed through the glyphs
            — hence the separate layer. */}
            <div className="encounter-title-card-text">
              <span className="encounter-title-card-text-shadow" aria-hidden="true">
                {heroName}
              </span>
              <span className="encounter-title-card-text-fill">{heroName}</span>
            </div>
            <div className="encounter-title-card-emblem" aria-hidden="true">
              <span className="encounter-title-card-emblem-line encounter-title-card-emblem-line--l" />
              <span className="encounter-title-card-emblem-diamond" />
              <span className="encounter-title-card-emblem-line encounter-title-card-emblem-line--r" />
            </div>
            {resolvedSubtitle && <div className="encounter-title-card-sub">{resolvedSubtitle}</div>}
          </div>
          {countdown && (
            <FightStartCountdown
              key={countdown.key}
              startsAtMs={countdown.startsAtMs}
              endsAtMs={countdown.endsAtMs}
              releasedAtMs={countdown.releasedAtMs}
              tickCount={countdown.tickCount}
              tickMs={countdown.tickMs}
              encounterName={countdown.encounterName}
              onFinished={() => {
                setDisplayContent(null);
                countdown.onFinished();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
