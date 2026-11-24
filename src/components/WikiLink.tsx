import type React from 'react';
import './WikiLink.css';

interface WikiLinkProps {
  href: string;
  /** Names the destination in the accessible label, e.g. "Divine Severance". */
  subject: string;
  label?: string;
}

/**
 * The mark is an open book drawn on an 18x12 pixel grid, so at its 1:1 size every edge lands on
 * a whole pixel and it keeps the stepped edges of the bitmap face beside it. It is one traced
 * outline rather than a rect per row, which would show seams at fractional DPR; the page lines
 * are holes in it. It takes the link's color.
 */
export const WikiLink: React.FC<WikiLinkProps> = ({ href, subject, label = 'OSRS Wiki' }) => (
  <a
    className="wiki-link"
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    /* Two of these can share a panel — the selected contract's page and the encounter's own —
       and they are identical but for their destination, so each names its own. */
    aria-label={`${subject} on the OSRS Wiki`}
  >
    <svg className="wiki-link-mark" viewBox="0 0 18 12" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M1 0H4V1H6V2H8V12H5V11H0V1H1ZM14 0H17V1H18V11H13V12H10V2H12V1H14ZM2 4V5H6V4ZM12 4V5H16V4ZM2 6V7H6V6ZM12 6V7H16V6ZM2 8V9H5V8ZM13 8V9H16V8Z"
      />
    </svg>
    <span className="wiki-link-label">{label}</span>
  </a>
);
