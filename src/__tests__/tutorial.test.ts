import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { onboardingMainTutorial } from '../tutorial/content/onboarding-main';

const tutorialCss = readFileSync(resolve(__dirname, '../tutorial/tutorial.css'), 'utf-8');

const stepsSource = readFileSync(resolve(__dirname, '../tutorial/content/onboarding-main.ts'), 'utf-8');

const hookSource = readFileSync(resolve(__dirname, '../tutorial/runtime/SpotlightRunner.ts'), 'utf-8');

const pickerCss = readFileSync(resolve(__dirname, '../components/TutorialPickerModal.css'), 'utf-8');

describe('Tutorial CSS', () => {
  describe('popover entrance animation', () => {
    it('osrs-popover-in keyframes must NOT use transform (breaks getBoundingClientRect positioning)', () => {
      const keyframeMatch = tutorialCss.match(/@keyframes\s+osrs-popover-in\s*\{[\s\S]*?\n\}/);
      expect(keyframeMatch).not.toBeNull();

      const keyframeBlock = keyframeMatch![0];

      // transform: scale() or translateY() inside the animation causes
      // getBoundingClientRect() to return wrong dimensions during animation,
      // which makes Driver.js position the popover incorrectly.
      expect(keyframeBlock).not.toMatch(/transform\s*:/);
      expect(keyframeBlock).not.toMatch(/scale\s*\(/);
      expect(keyframeBlock).not.toMatch(/translate/);
    });

    it('entrance animation should only use opacity for fade-in', () => {
      const keyframeMatch = tutorialCss.match(/@keyframes\s+osrs-popover-in\s*\{[\s\S]*?\n\}/);
      expect(keyframeMatch).not.toBeNull();
      expect(keyframeMatch![0]).toMatch(/opacity\s*:\s*0/);
      expect(keyframeMatch![0]).toMatch(/opacity\s*:\s*1/);
    });
  });

  describe('popover card must not break Driver.js positioning', () => {
    it('must NOT set position: relative on the popover card', () => {
      // Driver.js uses position: fixed with inline top/left styles.
      // position: relative overrides it and breaks all positioning.
      const popoverRule = tutorialCss.match(/\.osrs-tutorial-popover\.driver-popover\s*\{[\s\S]*?\}/);
      if (popoverRule) {
        expect(popoverRule[0]).not.toMatch(/position\s*:\s*relative/);
      }
    });
  });

  describe('action indicator specificity', () => {
    it('action indicator must be scoped under .osrs-tutorial-popover to beat Driver.js wildcard', () => {
      // .driver-popover * { font-family: ... } has specificity (0,1,0) + wildcard
      // .osrs-tutorial-popover.driver-popover * { font-family: inherit !important } has (0,2,0)
      // So .tutorial-action-indicator alone at (0,1,0) loses.
      // Must be .osrs-tutorial-popover .tutorial-action-indicator at (0,2,0) to win.
      expect(tutorialCss).toMatch(/\.osrs-tutorial-popover\s+\.tutorial-action-indicator/);
    });
  });

  describe('backgrounds must be opaque', () => {
    it('popover card background must not use rgba (overlay bleeds through)', () => {
      const popoverRule = tutorialCss.match(/\.osrs-tutorial-popover\.driver-popover\s*\{[\s\S]*?\}/);
      if (popoverRule) {
        const bgMatch = popoverRule[0].match(/background\s*:([^;]+)/);
        if (bgMatch) {
          expect(bgMatch[1]).not.toMatch(/rgba\(/);
        }
      }
    });
  });
});

describe('Tutorial Steps', () => {
  it('all action steps must have a tutorial event name', () => {
    for (const step of onboardingMainTutorial.steps) {
      if (step.kind === 'spotlight' && step.action) expect(step.action.event).toMatch(/^tutorial:/);
    }
  });

  it('all action steps must have waitingText and completedText', () => {
    const actionBlocks = stepsSource.matchAll(/action:\s*\{([^}]+)\}/g);
    for (const match of actionBlocks) {
      expect(match[1]).toMatch(/waitingText\s*:/);
      expect(match[1]).toMatch(/completedText\s*:/);
    }
  });

  it('trackElement steps must have an action (no passive tracking)', () => {
    // trackElement without action would start a refresh loop with no way to stop it
    const trackMatches = [...stepsSource.matchAll(/trackElement:\s*true/g)];
    for (const match of trackMatches) {
      const before = stepsSource.slice(Math.max(0, match.index! - 500), match.index!);
      expect(before).toMatch(/action:\s*\{/);
    }
  });
});

describe('Tutorial Hook', () => {
  it('must use animate: false in Driver.js config', () => {
    // animate: true causes a 400ms interpolation that conflicts with positioning
    expect(hookSource).toMatch(/animate:\s*false/);
  });

  it('must use allowKeyboardControl: false to prevent bypassing action gates', () => {
    expect(hookSource).toMatch(/allowKeyboardControl:\s*false/);
  });

  it('must import driver.js CSS statically (not dynamically)', () => {
    // Dynamic import of CSS can cause the tour to start before styles are loaded
    expect(hookSource).toMatch(/^import\s+['"]driver\.js\/dist\/driver\.css['"]/m);
    expect(hookSource).not.toMatch(/import\(\s*['"]driver\.js\/dist\/driver\.css['"]\s*\)/);
  });

  it('must listen for tutorial:panel-moved and tutorial:panel-resized events for spotlight sync', () => {
    expect(hookSource).toMatch(/tutorial:panel-moved/);
    expect(hookSource).toMatch(/tutorial:panel-resized/);
  });
});

describe('Design token usage', () => {
  it('popover card must use CSS variables for background, not hardcoded hex', () => {
    const popoverRule = tutorialCss.match(/\.osrs-tutorial-popover\.driver-popover\s*\{[\s\S]*?\}/);
    expect(popoverRule).not.toBeNull();
    expect(popoverRule![0]).toMatch(/var\(--color-/);
    expect(popoverRule![0]).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it('buttons must use CSS variables for colors', () => {
    expect(tutorialCss).toMatch(/\.driver-popover-next-btn[\s\S]*?var\(--color-/);
    expect(tutorialCss).toMatch(/\.driver-popover-prev-btn[\s\S]*?var\(--color-/);
  });

  it('footer must use a theme token for background (not a hardcoded color)', () => {
    const footerRule = tutorialCss.match(/\.osrs-tutorial-popover\s+\.driver-popover-footer\s*\{[\s\S]*?\}/);
    expect(footerRule).not.toBeNull();
    // Footer may use any theme surface token — bg-elevated, surface, etc.
    const bgMatch = footerRule![0].match(/background\s*:\s*([^;]+)/);
    expect(bgMatch).not.toBeNull();
    expect(bgMatch![1]).toMatch(/var\(--color-/);
    expect(bgMatch![1]).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe('Title layout', () => {
  it('title must use a theme color token for color', () => {
    // We only enforce that the title pulls its color from the theme — the
    // layout method is free to evolve.
    const titleRule = tutorialCss.match(/\.driver-popover-title\s*\{[\s\S]*?\}/);
    expect(titleRule).not.toBeNull();
    expect(titleRule![0]).toMatch(/color\s*:\s*var\(--color-/);
  });
});

describe('TutorialPickerModal CSS', () => {
  it('draws no keyboard focus styling (pointer and touch chrome)', () => {
    expect(pickerCss).not.toMatch(/focus-visible/);
  });

  it('keeps the picker motion-free for reduced-motion users', () => {
    // The redesigned picker has no entrance animation or transitions to override.
    expect(pickerCss).not.toMatch(/\b(?:animation|transition)(?:-[a-z-]+)?\s*:/);
  });
});

describe('No dead CSS selectors', () => {
  it('tutorial-click-hint should not exist (removed dead selector)', () => {
    expect(tutorialCss).not.toMatch(/\.tutorial-click-hint/);
  });
});

describe('Transition safety', () => {
  it('buttons must NOT use transition: all (animates unintended properties)', () => {
    const prevBtn = tutorialCss.match(/\.driver-popover-prev-btn\s*\{[\s\S]*?\}/);
    const nextBtn = tutorialCss.match(/\.driver-popover-next-btn\s*\{[\s\S]*?\}/);
    if (prevBtn) expect(prevBtn[0]).not.toMatch(/transition:\s*all\b/);
    if (nextBtn) expect(nextBtn[0]).not.toMatch(/transition:\s*all\b/);
  });
});

// The guarantee — resuming pre-completes the action gates of every step before
// the bookmark — is asserted behaviorally in SpotlightRunner.test.ts
// ('pre-satisfies the gate of action steps before the resume bookmark'), by
// driving a real runner rather than matching the signature of an internal
// helper. Do not add source greps for it: the seeding lives in start(), not
// toDriverSteps, and such a grep fails while the behavior is intact.
