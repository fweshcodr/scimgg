import { useRef } from 'react';
import { getShortcutCategories } from '../data/shortcuts';
import { useEscapeLayer } from '../hooks/useEscapeLayer';
import './KeyboardShortcutsModal.css';
import { GAMEPANEL_KEYBINDS_ID } from '../settingsSearch/ids';
import { CloseButton } from './ui/CloseButton';
import { sheet } from './ui/mobileSheet';
import { RevealLink } from './ui/RevealLinks';
import { useCenteredModalSnap } from './ui/useCenteredModalSnap';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal = ({ isOpen, onClose }: KeyboardShortcutsModalProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  useCenteredModalSnap(cardRef, isOpen);
  useEscapeLayer(1300, isOpen, onClose);

  if (!isOpen) return null;
  const categories = getShortcutCategories();
  return (
    /* biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes via useEscapeLayer; the backdrop click is a supplementary pointer affordance for mouse users. */
    <div className="shortcuts-modal-overlay" {...sheet.overlay} onClick={onClose} role="dialog" aria-modal="true">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Card stops propagation to prevent backdrop dismiss; it is not itself an interactive target. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Card stops propagation to prevent backdrop dismiss. */}
      <div
        ref={cardRef}
        className="shortcuts-modal-card centered-modal-snap"
        {...sheet.card}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) event.preventDefault();
        }}
      >
        <div className="shortcuts-modal-header" {...sheet.head}>
          <h2 className="shortcuts-modal-title">Shortcuts</h2>
          <CloseButton
            className="shortcuts-modal-close"
            {...sheet.close}
            onClick={onClose}
            aria-label="Close shortcuts modal"
          />
        </div>

        {/* This is a reference; the keys themselves are changed in the game panel. */}
        <p className="shortcuts-modal-edit">
          Change keybindings in the game panel.{' '}
          <RevealLink target={GAMEPANEL_KEYBINDS_ID} onNavigate={onClose}>
            Edit keybinds
          </RevealLink>
        </p>

        <div className="shortcuts-modal-content" {...sheet.body}>
          <div className="shortcuts-modal-grid">
            {categories.map((category) => (
              <div
                key={category.title}
                className={`shortcuts-modal-category${category.title === 'Game Panel Tabs' ? ' shortcuts-modal-category--compact' : ''}`}
              >
                <h3 className="shortcuts-modal-category-title">{category.title}</h3>
                <div className="shortcuts-modal-list">
                  {category.shortcuts.map((shortcut) => (
                    <div key={`${shortcut.keys}|${shortcut.description}`} className="shortcuts-modal-row">
                      <div className="shortcuts-modal-keys">
                        {shortcut.keys.split(' + ').map((keyPart, i, arr) => (
                          <span key={keyPart} className="shortcuts-modal-keys-wrapper">
                            <kbd className="kbd">{keyPart}</kbd>
                            {i < arr.length - 1 && <span className="shortcuts-modal-plus">+</span>}
                          </span>
                        ))}
                      </div>
                      <div className="shortcuts-modal-desc">{shortcut.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
