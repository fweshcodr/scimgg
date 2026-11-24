import type React from 'react';
import { detectMobileDevice } from '../util/mobileDetection';
import './BrowserSuggestions.css';

const BROWSERS = [
  { name: 'Chrome', href: 'https://www.google.com/chrome/' },
  { name: 'Firefox', href: 'https://www.mozilla.org/firefox/new/' },
] as const;

/**
 * Secondary actions for a notice that has to send the reader somewhere else: another browser.
 *
 * Desktop only, and that is the point of the check. Every browser on iPhone and iPad is the system
 * WebKit under a different name, so "install Chrome" cannot change what the page is told; on
 * Android the store listing is the wrong place to send someone mid-fight. On those devices the
 * notice's own steps are the whole advice.
 *
 * `detectMobileDevice`, not `isMobileDevice`: this asks what the hardware is, and the Device
 * setting those browsers would be installed on does not change with a forced layout choice.
 *
 * `tabIndex={-1}` per the keyboard and focus policy (docs/agent-reference.md): pointer and touch
 * targets, never Tab stops.
 */
export const BrowserSuggestions: React.FC = () => {
  if (detectMobileDevice()) return null;

  return (
    <>
      {BROWSERS.map((browser) => (
        <a
          key={browser.name}
          className="browser-suggestion"
          href={browser.href}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
        >
          {browser.name}
        </a>
      ))}
    </>
  );
};
