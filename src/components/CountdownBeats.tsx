import { Fragment } from 'react';
import './CountdownBeats.css';

/** The beats a countdown from `from` walks through: `3 → ['3', '2', '1', 'GO']`. */
export function countdownTokens(from: number): string[] {
  const tokens: string[] = [];
  for (let n = from; n >= 1; n--) tokens.push(String(n));
  tokens.push('GO');
  return tokens;
}

interface CountdownBeatsProps {
  /** First number shown; the row ends with GO. */
  from: number;
  /** Index into the row of the current beat (0 = `from`, `from` = GO). */
  activeIndex: number;
  className?: string;
}

/**
 * The `3 · 2 · 1 · GO` strip shared by the tutorial step intro and the fight-start
 * countdown. Every token is laid out up front, so the row never reflows as the
 * highlight travels. Timing belongs to the caller; this only draws a position.
 */
export function CountdownBeats({ from, activeIndex, className }: CountdownBeatsProps) {
  const tokens = countdownTokens(from);
  return (
    <div className={className ? `countdown-beats ${className}` : 'countdown-beats'} aria-hidden="true">
      {tokens.map((token, i) => {
        const state = i < activeIndex ? 'is-lit' : i === activeIndex ? 'is-active' : 'is-pending';
        return (
          <Fragment key={token}>
            {i > 0 && <span className="countdown-beats-dot">·</span>}
            <span className={`countdown-beats-tick ${state}${token === 'GO' ? ' is-go' : ''}`}>{token}</span>
          </Fragment>
        );
      })}
    </div>
  );
}
