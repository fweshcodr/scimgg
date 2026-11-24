// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cssRuleBlocks } from '../../test/helpers/cssRules';
import { setDeviceMode } from '../../util/deviceMode';
import { BrowserSuggestions } from '../BrowserSuggestions';
import { BrowserSupportScreen } from '../BrowserSupportScreen';
import { HardwareAccelWarning } from '../HardwareAccelWarning';

const screenCss = readFileSync(join(process.cwd(), 'src/components/BrowserSupportScreen.css'), 'utf8');

const ruleBody = (selector: string): string => {
  const bodies = cssRuleBlocks(screenCss)
    .filter((block) => block.selectors.includes(selector))
    .map((block) => block.body);
  expect(bodies.length, `${selector} not found`).toBeGreaterThan(0);
  return bodies.join('\n');
};

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

afterEach(() => {
  setDeviceMode('auto');
  setUserAgent(DESKTOP_UA);
});

describe('HardwareAccelWarning', () => {
  const software = { gpuStatus: 'software', renderer: 'SwiftShader', variant: 'gameplay', hidden: false } as const;

  it('says what software rendering costs, in the final wording', () => {
    render(<HardwareAccelWarning {...software} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('sys-notice--caution');
    expect(alert.textContent).toContain('Software rendering');
    expect(alert.textContent).toContain(
      "Your browser isn't using your graphics card, so the simulator will run slowly.",
    );
    expect(alert.textContent).toContain('Detected: SwiftShader');
  });

  // A browser with no WebGL2 never reaches the app: BrowserSupportGate replaces it first, and the
  // viewport's own notice covers a context that fails later. This component carried a third,
  // unreachable copy of that screen.
  it.each(['no-webgl2', 'hardware'] as const)('shows nothing for %s', (gpuStatus) => {
    const { container } = render(<HardwareAccelWarning {...software} gpuStatus={gpuStatus} />);
    expect(container.firstChild).toBeNull();
  });

  it('puts itself away to one line and comes back', () => {
    render(<HardwareAccelWarning {...software} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide this warning' }));

    const strip = screen.getByRole('button');
    expect(strip).toHaveClass('hw-accel-strip');
    expect(strip.textContent).toBe('Software rendering, reduced performance');

    fireEvent.click(strip);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  // Pointer and touch only (docs/agent-reference.md, keyboard and focus policy): no Tab stops,
  // and a press over the game must not leave focus behind to eat the next game key.
  it('keeps its controls out of the Tab order and out of focus', () => {
    render(<HardwareAccelWarning {...software} />);
    const dismiss = screen.getByRole('button', { name: 'Hide this warning' });
    expect(dismiss).toHaveAttribute('tabindex', '-1');

    const press = fireEvent.mouseDown(dismiss);
    expect(press, 'mousedown default not prevented, so the button would keep focus').toBe(false);

    fireEvent.click(dismiss);
    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '-1');
  });
});

describe('BrowserSuggestions', () => {
  // The question is what the hardware is, not which layout the player forced: the browsers these
  // links install do not exist on iOS whatever the Device setting says.
  it('offers none on a phone, even with the Desktop layout forced', () => {
    setUserAgent(IPHONE_UA);
    setDeviceMode('desktop');
    const { container } = render(<BrowserSuggestions />);
    expect(container.firstChild).toBeNull();
  });

  it('offers them on a desktop, even with the Mobile layout forced', () => {
    setUserAgent(DESKTOP_UA);
    setDeviceMode('mobile');
    render(<BrowserSuggestions />);
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Chrome', 'Firefox']);
    for (const link of screen.getAllByRole('link')) expect(link).toHaveAttribute('tabindex', '-1');
  });
});

describe('BrowserSupportScreen', () => {
  it('says the one thing it ever says, in the final wording', () => {
    render(<BrowserSupportScreen />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('3D graphics unavailable');
    expect(alert.textContent).toContain("This browser can't run the WebGL2 graphics the simulator needs.");
    expect(alert.textContent).toContain('Try Scim.GG on another device, or in a different browser.');
    expect(alert.textContent).toContain(
      'To keep using this browser, make sure hardware acceleration is on and no extension is blocking WebGL.',
    );
  });

  it('adds the Lockdown Mode aside only where that setting exists', () => {
    setUserAgent(IPHONE_UA);
    const apple = render(<BrowserSupportScreen />);
    expect(apple.container.querySelector('.sys-notice__note')?.textContent).toBe(
      "Lockdown Mode can also cause this. You can exclude one site in Safari's Website Settings, but we don't recommend turning off security protections.",
    );
    apple.unmount();

    setUserAgent(DESKTOP_UA);
    const other = render(<BrowserSupportScreen />);
    expect(other.container.querySelector('.sys-notice__note')).toBeNull();
  });

  // A landscape phone is shorter than the wordmark plus the notice, and `.app-container` is a
  // viewport-height box that clips. This screen scrolls instead, and centers with auto margins so
  // the top of the column stays reachable rather than being cut off by `justify-content`.
  describe('on a screen shorter than its content', () => {
    it('scrolls, overriding the app container clip for this screen alone', () => {
      const body = ruleBody('.app-container.browser-support');
      expect(body).toMatch(/overflow:\s*auto;/);
      expect(body).not.toMatch(/justify-content:\s*center/);
    });

    it('takes its page backdrop from the pack tokens, not a fixed color', () => {
      const body = ruleBody('.app-container.browser-support');
      // `.app-container`'s own navy belongs to no pack; here the page is seen beside the card.
      expect(body).toContain('background-color: var(--color-bg);');
      expect(body).toMatch(/background-image:\s*radial-gradient\(/);
      expect(body.match(/background-image:[^;]+;/)?.[0]).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl/i);
    });

    it('centers one column with auto margins, and does not let it shrink', () => {
      const { container } = render(<BrowserSupportScreen />);
      const column = container.querySelector('.browser-support__column');
      // One wrapper, so a single `margin: auto` can do the centering.
      expect(column?.parentElement).toHaveClass('browser-support');
      expect(column?.children).toHaveLength(2);

      const body = ruleBody('.browser-support__column');
      expect(body).toMatch(/margin:\s*auto;/);
      expect(body).toMatch(/flex:\s*0 0 auto;/);
    });
  });
});
