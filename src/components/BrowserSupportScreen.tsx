import type React from 'react';
import { BrowserSuggestions } from './BrowserSuggestions';
import { NO_WEBGL2_BODY, NO_WEBGL2_TITLE, noWebgl2Note, noWebgl2Steps } from './noWebgl2Guidance';
import { SystemNotice } from './ui/SystemNotice';
import './BrowserSupportScreen.css';

/**
 * The screen instead of the app, when the browser cannot give the simulator a 3D context.
 *
 * WebGL2 is the only capability that blocks the app (`util/browserSupport.ts`), so this is the one
 * thing the screen ever says; the wording and the steps live in `noWebgl2Guidance.ts`, beside the
 * viewport notice that says the same thing. The wordmark is here so a reader who has never loaded
 * the site still sees what refused to start.
 *
 * The column is one element so it can center with `margin: auto` in a scrolling page: a landscape
 * phone is shorter than this content, and `justify-content: center` would put the top of it out
 * of reach (BrowserSupportScreen.css).
 */
export const BrowserSupportScreen: React.FC = () => (
  <div className="app-container webgl2-gate browser-support">
    <div className="browser-support__column">
      <div className="browser-support__mark">
        <h1 className="loading-title browser-support__wordmark">SCIM.GG</h1>
        <div className="loading-subtitle">OSRS Combat Simulator</div>
      </div>
      <SystemNotice
        role="alert"
        tone="blocked"
        className="browser-support__notice"
        title={NO_WEBGL2_TITLE}
        body={NO_WEBGL2_BODY}
        steps={noWebgl2Steps()}
        links={<BrowserSuggestions />}
        note={noWebgl2Note()}
      />
    </div>
  </div>
);
