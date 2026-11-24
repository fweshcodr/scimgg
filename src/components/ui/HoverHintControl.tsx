import type { ComponentPropsWithRef, Ref } from 'react';
import { useCallback, useId, useRef } from 'react';
import { type HoverCardPlacement, useHoverCard } from './HoverCard';

interface HintProps {
  /** Null when the same control is currently showing its label. */
  hint?: string | null;
  hintPlacement?: HoverCardPlacement;
}

function useControlHint<T extends HTMLElement>(
  label: string | null | undefined,
  placement: HoverCardPlacement,
  ref?: Ref<T>,
) {
  const anchorRef = useRef<T>(null);
  const cardId = useId();
  const { card } = useHoverCard({
    content: label,
    anchorRef,
    placement,
    cardId,
    dwellMs: 0,
    cardClassName: 'hover-card--instant',
    openOnFocus: false,
    dismissOnPress: true,
    regionTouch: false,
  });
  const setRef = useCallback(
    (node: T | null) => {
      anchorRef.current = node;
      if (typeof ref === 'function') return ref(node);
      if (ref) ref.current = node;
    },
    [ref],
  );
  return { setRef, card: label ? card : null };
}

/** Same DOM control and handlers, with the launcher's pointer-only instant hover card.
 * An empty title blocks inherited native tooltips; omitting it does not.
 */
export function HoverHintButton({
  hint,
  hintPlacement = 'block',
  title,
  'aria-label': ariaLabel,
  ref,
  ...props
}: ComponentPropsWithRef<'button'> & HintProps) {
  const label = hint === undefined ? (ariaLabel ?? title) : hint;
  const { setRef, card } = useControlHint(label, hintPlacement, ref);
  return (
    <>
      <button {...props} ref={setRef} title="" aria-label={ariaLabel ?? title ?? hint ?? undefined} />
      {card}
    </>
  );
}

export function HoverHintLink({
  href,
  hint,
  hintPlacement = 'block',
  title,
  'aria-label': ariaLabel,
  ref,
  ...props
}: ComponentPropsWithRef<'a'> & HintProps) {
  const label = hint === undefined ? (ariaLabel ?? title) : hint;
  const { setRef, card } = useControlHint(label, hintPlacement, ref);
  return (
    <>
      <a {...props} href={href} ref={setRef} title="" aria-label={ariaLabel ?? title ?? hint ?? undefined} />
      {card}
    </>
  );
}

/** For a disabled control whose existing wrapper owns hit-testing. Adds no extra DOM. */
export function HoverHintRegion({
  hint,
  hintPlacement = 'block',
  ref,
  ...props
}: Omit<ComponentPropsWithRef<'span'>, 'title'> & HintProps & { hint: string }) {
  const { setRef, card } = useControlHint(hint, hintPlacement, ref);
  return (
    <>
      <span {...props} ref={setRef} />
      {card}
    </>
  );
}
