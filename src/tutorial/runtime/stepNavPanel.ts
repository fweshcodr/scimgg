import type { PopoverDOM } from 'driver.js';

// Vanilla DOM rather than React: Driver.js owns the popover element and tears
// it down between steps, so a portal's unmount would race that teardown.

export interface StepNavContext {
  /** Step titles in Driver.js's own (post-filter) index space. */
  titles: readonly string[];
  currentIndex: number;
  /** Whether the user has already been shown that step in this run or a prior one. */
  isVisited: (index: number) => boolean;
  onJump: (index: number) => void;
}

/** Panel is anchored above the chip unless that would clear the viewport top. */
const FLIP_MARGIN_PX = 12;

const CHEVRON_SVG =
  '<svg class="tutorial-stepnav-chevron" viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="M1.5 2.5 L6 6.5 L10.5 2.5" /></svg>';

const CHECK_SVG =
  '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 6.5 L5 9 L10 3" /></svg>';

type StepStatus = 'active' | 'done' | 'pending';

function statusOf(index: number, ctx: StepNavContext): StepStatus {
  if (index === ctx.currentIndex) return 'active';
  return ctx.isVisited(index) ? 'done' : 'pending';
}

function buildList(ctx: StepNavContext, close: () => void): HTMLOListElement {
  const list = document.createElement('ol');
  list.className = 'tutorial-stepnav-list';

  ctx.titles.forEach((title, index) => {
    const status = statusOf(index, ctx);
    const isActive = status === 'active';

    const item = document.createElement('li');
    item.className = `tutorial-stepnav-item ${status}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tutorial-stepnav-item-btn';
    // The current step stays enabled (not `disabled`): clicking it closes the list.
    if (isActive) btn.setAttribute('aria-current', 'step');
    btn.title = isActive ? `${title} — you are here` : `Go to: ${title}`;

    const marker = document.createElement('span');
    marker.className = 'tutorial-stepnav-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.innerHTML = status === 'done' ? CHECK_SVG : `<span>${index + 1}</span>`;

    const label = document.createElement('span');
    label.className = 'tutorial-stepnav-label';
    label.textContent = title;

    btn.append(marker, label);

    if (isActive) {
      const tag = document.createElement('span');
      tag.className = 'tutorial-stepnav-tag';
      tag.setAttribute('aria-hidden', 'true');
      tag.textContent = 'current';
      btn.append(tag);
    }

    btn.addEventListener('click', () => {
      close();
      if (!isActive) ctx.onJump(index);
    });

    item.append(btn);
    list.append(item);
  });

  return list;
}

/**
 * Returns a disposer. Driver.js re-runs its popover render hook on every step,
 * so the caller MUST dispose the previous mount first: the panel installs
 * document-level listeners that would otherwise outlive their own DOM.
 */
export function mountStepNav(popover: PopoverDOM, ctx: StepNavContext): () => void {
  const total = ctx.titles.length;
  popover.footer.querySelector('.tutorial-stepnav')?.remove();
  if (total <= 1) return () => {};

  // Driver keeps writing its own "{{current}} of {{total}}" into this node; we
  // hide it rather than repurpose it so our label is never overwritten mid-step.
  popover.progress.classList.add('tutorial-stepnav-native');

  const root = document.createElement('div');
  root.className = 'tutorial-stepnav';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tutorial-stepnav-trigger';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', `Step ${ctx.currentIndex + 1} of ${total}. Jump to another step.`);
  trigger.title = 'Jump to any step';
  trigger.innerHTML =
    `<span class="tutorial-stepnav-count">` +
    `<span class="tutorial-stepnav-current">${ctx.currentIndex + 1}</span>` +
    `<span class="tutorial-stepnav-sep" aria-hidden="true">/</span>` +
    `<span class="tutorial-stepnav-total">${total}</span>` +
    `</span>${CHEVRON_SVG}`;

  const panel = document.createElement('div');
  panel.className = 'tutorial-stepnav-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Jump to step');
  panel.hidden = true;

  const head = document.createElement('p');
  head.className = 'tutorial-stepnav-head';
  // The list shows ten rows of however many the tour has, and the trigger that
  // carries the total is hidden behind the open panel, so the extent is stated
  // here or nowhere.
  head.innerHTML = `<span>Jump to step</span><span class="tutorial-stepnav-head-count">${total} steps</span>`;

  let isOpen = false;

  const close = (): void => {
    if (!isOpen) return;
    isOpen = false;
    panel.hidden = true;
    root.classList.remove('open', 'flipped');
    trigger.setAttribute('aria-expanded', 'false');
  };

  const list = buildList(ctx, close);
  panel.append(head, list);
  root.append(trigger, panel);

  const open = (): void => {
    if (isOpen) return;
    isOpen = true;
    panel.hidden = false;
    root.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');

    // The popover can sit anywhere on screen, so a panel that always opens
    // upward would be clipped off the top for steps near the viewport top.
    const triggerBox = trigger.getBoundingClientRect();
    const panelHeight = panel.getBoundingClientRect().height;
    if (triggerBox.top - panelHeight < FLIP_MARGIN_PX) root.classList.add('flipped');

    const current = list.querySelector<HTMLElement>('.tutorial-stepnav-item.active .tutorial-stepnav-item-btn');
    current?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  };

  // Pointer-only: a click leaves no focus on the trigger, where Space would toggle it again.
  trigger.addEventListener('mousedown', (event) => event.preventDefault());
  trigger.addEventListener('click', () => {
    if (isOpen) close();
    else open();
  });

  const onPointerDown = (event: Event): void => {
    if (!isOpen) return;
    if (!root.contains(event.target as Node)) close();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isOpen || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  // Capture phase: Driver.js's own popover is a keyboard sink, and the tutorial
  // shell also listens for Escape to exit the tour. Closing the panel here must
  // win over both, or Escape exits training instead of dismissing the list.
  document.addEventListener('keydown', onKeyDown, true);

  popover.progress.insertAdjacentElement('afterend', root);

  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    root.remove();
  };
}
