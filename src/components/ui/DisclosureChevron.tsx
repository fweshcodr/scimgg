import './DisclosureChevron.css';

/**
 * The app's one expand/collapse mark: a 10px open chevron drawn with a 1px stroke (the Inferno
 * Wave shortcuts shape), pointing right while closed and down while open. An SVG, never a glyph,
 * so no font can substitute a filled triangle.
 *
 * Open is a quarter turn of the closed shape, which on this 10px box is exactly the down path
 * (`M2 3 5 6 8 3`), so a `<details>` summary needs no state: inside one, the CSS turns the mark
 * when the details is open, and a `<summary>` holding it drops its native marker. A button-driven
 * disclosure passes `open`.
 */
export function DisclosureChevron({ open, className }: { readonly open?: boolean; readonly className?: string }) {
  const classes = ['disclosure-chevron', open ? 'is-open' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <svg className={classes} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M3 2 6 5 3 8" fill="none" stroke="currentColor" />
    </svg>
  );
}
