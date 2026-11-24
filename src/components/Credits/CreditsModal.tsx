import { useRef } from 'react';
import { useEscapeLayer } from '../../hooks/useEscapeLayer';
import { CONTRIBUTORS } from './contributors';
import './CreditsModal.css';
import { CloseButton } from '../ui/CloseButton';
import { sheet } from '../ui/mobileSheet';
import { useCenteredModalSnap } from '../ui/useCenteredModalSnap';

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreditsModal = ({ isOpen, onClose }: CreditsModalProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  useCenteredModalSnap(cardRef, isOpen);
  useEscapeLayer(1300, isOpen, onClose);

  if (!isOpen) return null;

  return (
    /* biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes via useEscapeLayer; the backdrop click is a supplementary pointer affordance for mouse users. */
    <div
      className="credits-modal-overlay"
      {...sheet.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-modal-title"
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Card stops propagation to prevent backdrop dismiss; it is not itself an interactive target. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Card stops propagation to prevent backdrop dismiss. */}
      <div
        ref={cardRef}
        className="credits-modal-card centered-modal-snap"
        {...sheet.card}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) event.preventDefault();
        }}
      >
        <CloseButton className="credits-modal-close" {...sheet.close} onClick={onClose} aria-label="Close" />

        <h2 id="credits-modal-title" className="credits-modal-title">
          Thanks
        </h2>

        <div className="credits-modal-names">
          <ul className="credits-modal-list" aria-label="Contributors">
            {CONTRIBUTORS.map((contributor) => (
              <li key={contributor.name} className="credits-modal-name">
                {contributor.url ? (
                  <a href={contributor.url} target="_blank" rel="noopener noreferrer">
                    {contributor.name}
                  </a>
                ) : (
                  contributor.name
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* The bundle ships no @license banners — the minifier strips them — so this
            link is how the MIT and BSD notices in dist/licenses.txt stay reachable
            by a reader. Removing it leaves those licenses unsatisfied in practice. */}
        <a className="credits-modal-licenses" href="/licenses.txt" target="_blank" rel="noopener noreferrer">
          Third-party licenses
        </a>
      </div>
    </div>
  );
};
