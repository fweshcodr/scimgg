import type React from 'react';
import type {
  EncounterModifierDefinition,
  EncounterModifierSelection,
  EncounterModifierTier,
} from '../core/encounters/encounterFactory';
import { CollapsibleField } from './CollapsibleField';
import { PixelSprite } from './PixelSprite';
import './ModifierSelector.css';

interface ModifierSelectorProps {
  readonly modifiers: readonly EncounterModifierDefinition[];
  readonly value: EncounterModifierSelection;
  readonly onChange: (next: EncounterModifierSelection) => void;
}

/** Every modifier icon fits 38x38, so the slot shows each one 1:1, like the loadout's item slots. */
const ICON_BOX = { maxWidth: 38, maxHeight: 38 } as const;

const TIERS: readonly { readonly tier: EncounterModifierTier | 0; readonly label: string }[] = [
  { tier: 0, label: 'Off' },
  { tier: 1, label: 'I' },
  { tier: 2, label: 'II' },
  { tier: 3, label: 'III' },
];

/** The modifiers as a grid of rows, each switched off or set to tier I-III. Lays itself out in one or
 * two columns by its container's width, so the caller gives it an `inline-size` container. */
export const ModifierGrid: React.FC<ModifierSelectorProps> = ({ modifiers, value, onChange }) => {
  const select = (id: string, tier: EncounterModifierTier | 0) => {
    const { [id]: _previous, ...rest } = value;
    onChange(tier === 0 ? rest : { ...rest, [id]: tier });
  };

  return (
    <div
      className="modifier-grid"
      style={{ '--modifier-rows': Math.ceil(modifiers.length / 2) } as React.CSSProperties}
    >
      {modifiers.map((modifier) => {
        const tier = value[modifier.id] ?? 0;
        return (
          <div key={modifier.id} className={`modifier-row${tier > 0 ? ' modifier-row--active' : ''}`}>
            <span className="modifier-slot" aria-hidden="true">
              {modifier.icon && <PixelSprite src={modifier.icon} alt="" style={ICON_BOX} />}
            </span>
            <span className="modifier-name">{modifier.name}</span>
            {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would restyle the row; the group only names the buttons. */}
            <div
              className="modifier-tiers"
              role="group"
              aria-label={`${modifier.name} tier`}
              style={{ '--modifier-tier-count': modifier.tiers.length + 1 } as React.CSSProperties}
            >
              {/* A one-tier modifier keeps the track's width; only Off and I are offered. */}
              {TIERS.filter((option) => option.tier <= modifier.tiers.length).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  className={`modifier-tier${option.tier === tier ? ' modifier-tier--selected' : ''}`}
                  aria-pressed={option.tier === tier}
                  aria-label={option.tier === 0 ? `${modifier.name} off` : `${modifier.name} tier ${option.label}`}
                  onClick={() => select(modifier.id, option.tier)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {/* Every description shares one cell, so the cell is always as tall as the longest
              and changing tier never moves the rows below. Only the current one is visible. */}
            <div className="modifier-effect">
              {[modifier.summary, ...modifier.tiers].map((text, index) => (
                <p
                  key={text}
                  className={index === tier ? undefined : 'modifier-effect-spacer'}
                  aria-hidden={index !== tier}
                >
                  {text}
                </p>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Names the selection, as the Contract field does: "Doom II · Bees!", or an empty list for none. */
export function modifierSelectionNames(
  modifiers: readonly EncounterModifierDefinition[],
  value: EncounterModifierSelection,
): string[] {
  return modifiers.flatMap((modifier) => {
    const tier = value[modifier.id];
    if (tier === undefined) return [];
    return [modifier.tiers.length === 1 ? modifier.name : `${modifier.name} ${TIERS[tier].label}`];
  });
}

/** An encounter's optional run modifiers in the encounter panel, as a field that folds open. */
export const ModifierSelector: React.FC<ModifierSelectorProps> = ({ modifiers, value, onChange }) => {
  // Names the selection, so the collapsed header says what you will fight.
  const selected = modifierSelectionNames(modifiers, value);

  return (
    <CollapsibleField
      label="Modifiers"
      summary={<span className="modifier-summary">{selected.length > 0 ? selected.join(' · ') : 'None'}</span>}
    >
      <div className="modifier-list">
        <ModifierGrid modifiers={modifiers} value={value} onChange={onChange} />
      </div>
    </CollapsibleField>
  );
};
