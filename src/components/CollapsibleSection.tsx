import type React from 'react';
import { useState } from 'react';
import { isWithinRevealScope, useSettingsRevealListener } from './settingsReveal';
import { DisclosureChevron } from './ui/DisclosureChevron';
import './CollapsibleSection.css';

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  /**
   * Settings-search id: the section opens itself when it, or a setting inside it, is revealed.
   * Required, like SettingRow's; `null` (with a comment) only for a section search must not list.
   */
  searchId: string | null;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  defaultExpanded = false,
  searchId,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggle = () => setIsExpanded(!isExpanded);

  useSettingsRevealListener(({ id }) => {
    if (searchId && isWithinRevealScope(id, searchId)) setIsExpanded(true);
  });

  return (
    <div className={`collapsible-section ${isExpanded ? 'expanded' : ''}`} data-search-id={searchId ?? undefined}>
      <button type="button" className="collapsible-header" onClick={toggle} aria-expanded={isExpanded}>
        <DisclosureChevron open={isExpanded} className="collapse-indicator" />
        <span className="section-title">{title}</span>
      </button>
      {/* Collapsed content stays mounted so `grid-template-rows` can animate it, which
          leaves it in the tab order and the accessibility tree unless it is also inert.
          A collapsed section holding a text field would otherwise take a keystroke, or a
          password manager's fill, into a control nobody can see. */}
      <div
        className={`collapsible-content-wrapper ${isExpanded ? 'expanded' : ''}`}
        inert={isExpanded ? undefined : true}
      >
        <div className="collapsible-content">{children}</div>
      </div>
    </div>
  );
};
