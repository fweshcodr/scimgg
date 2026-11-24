import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import './EncounterPicker.css';
import type { EncounterDescriptor, EncounterRegistry } from '../core/encounters/encounterFactory';
import type { EncounterVariant } from '../core/encounters/types';
import { ESC_PRIORITY, useEscapeLayer } from '../hooks/useEscapeLayer';
import { hasTutorialsForEncounter } from '../tutorial/content';
import {
  type EncounterPresentation,
  encounterPresentationModuleForKind,
  VARIANT_REWARD_ICON,
} from './encounterPickerMeta';
import { PixelSprite } from './PixelSprite';
import { useBackdropDismiss } from './ui/backdropDismiss';
import { CloseButton } from './ui/CloseButton';
import { sheet } from './ui/mobileSheet';
import { OsrsButton } from './ui/OsrsButton';
import { BetaBadge } from './ui/StatusBadge';
import { useCenteredModalSnap } from './ui/useCenteredModalSnap';

interface EncounterPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onEnter: (kind: string) => void;
  onConfigure: (kind: string, displayName: string, description: string) => void;
  /**
   * Optional callback for the "Tutorial mode" entry point. When provided, the
   * selected boss gets a Start Tutorial action that loads the encounter and opens
   * the tutorial picker pre-scoped to it. Hidden when the boss has zero tutorials.
   */
  onTutorialMode?: (kind: string) => void;
  /**
   * Encounter kind the user is currently in (e.g. 'yama_p3'). When it is
   * present and selectable in the rail, it becomes the default selection on
   * open. Null/absent (or a lobby/unlisted kind) falls back to the first
   * available boss.
   */
  currentEncounterKind?: string | null;
  /**
   * What to open on instead, chosen in the quick search: a rail entry (base kind or encounter
   * group id) and optionally one of its rows (a contract, or a group's stage). A stage's own kind
   * opens its group on that stage. Read on the open transition only, like `currentEncounterKind`.
   */
  initialSelection?: { readonly kind: string; readonly variantId?: string } | null;
  encounterRegistry: EncounterRegistry;
}

interface BossCard {
  /** The rail key: the encounter's base kind, or the group's id for an encounter group. */
  kind: string;
  title: string;
  description: string;
  /** The line under the title in the rail. */
  subtitle: string;
  /** What a search matches the card itself on; its rows match on their own words. */
  searchText: string;
  isWorkInProgress: boolean;
  /** The kind Start Tutorial loads, when a tutorial targets this card's encounter (or a stage of it). */
  tutorialKind: string | null;
  /** The detail list's rows: the boss's contracts. */
  variants: EncounterVariant[];
  presentation: EncounterPresentation;
}

const LOBBY_KIND = 'lobby';

/** Neutral glyph for contracts that grant no reward (e.g. "No Contract"). */
function RewardGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M10 2l2 5 5 .4-3.8 3.3 1.2 4.9L10 13.2 5.4 15.6l1.2-4.9L2.8 7.4 7.8 7z"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  );
}

/** Group variants by their `group` field, preserving order; ungrouped first. */
function groupVariants(variants: EncounterVariant[]) {
  const groups: { group: string | null; items: EncounterVariant[] }[] = [];
  let current: { group: string | null; items: EncounterVariant[] } | null = null;
  for (const v of variants) {
    const g = v.group ?? null;
    if (!current || current.group !== g) {
      current = { group: g, items: [] };
      groups.push(current);
    }
    current.items.push(v);
  }
  return groups;
}

export function EncounterPicker({
  isOpen,
  onClose,
  onEnter,
  onConfigure,
  onTutorialMode,
  currentEncounterKind = null,
  initialSelection = null,
  encounterRegistry,
}: EncounterPickerProps) {
  const [search, setSearch] = useState('');
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRailRef = useRef<HTMLButtonElement | null>(null);
  const selectedContractRef = useRef<HTMLDivElement | null>(null);
  const pendingContractScrollRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useCenteredModalSnap(cardRef, isOpen);
  const backdropDismiss = useBackdropDismiss(cardRef, onClose);

  useEscapeLayer(ESC_PRIORITY.ENCOUNTER_PICKER, isOpen, onClose);

  // The lobby is excluded here and surfaced as the picker's "Return to Lobby" footer
  // link instead.
  // An encounter group's stages fold into one card, where the first of them would sit.
  const bosses = useMemo<BossCard[]>(() => {
    const cards: BossCard[] = [];
    const descriptors = encounterRegistry
      .getRegisteredKinds()
      .map((kind) => encounterRegistry.getDescriptor(kind))
      .filter((desc): desc is EncounterDescriptor => !!desc)
      .filter((desc) => desc.kind !== LOBBY_KIND);
    for (const desc of descriptors) {
      const presentation = encounterPresentationModuleForKind(desc.kind)?.presentation ?? {};
      const variants = desc.variants ?? [];
      cards.push({
        kind: desc.kind,
        title: presentation.title ?? desc.displayName,
        description: desc.description,
        subtitle: variants.length > 0 ? `${variants.length} contracts` : (presentation.tagline ?? desc.description),
        searchText: `${presentation.title ?? desc.displayName} ${desc.description} ${presentation.tagline ?? ''}`,
        isWorkInProgress: desc.isWorkInProgress ?? false,
        tutorialKind: hasTutorialsForEncounter(desc.kind) ? desc.kind : null,
        variants,
        presentation,
      });
    }
    return cards;
  }, [encounterRegistry]);

  const firstAvailableKind = bosses[0]?.kind ?? null;

  // Read the live scene kind via a ref so a mid-picker scene change can't
  // clobber the user's selection; only the open transition consumes it.
  const currentEncounterKindRef = useRef(currentEncounterKind);
  currentEncounterKindRef.current = currentEncounterKind;
  const initialSelectionRef = useRef(initialSelection);
  initialSelectionRef.current = initialSelection;

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      // Resolve through the registry before matching: contract variants are
      // registered as kinds but carry no descriptor of their own, so they never
      // appear as rail cards. A user inside `yama_forfeit_breath` must still land
      // on the Yama row rather than falling back to the first available boss.
      const cardFor = (kind: string | null): { card: BossCard; rowId?: string } | null => {
        if (!kind) return null;
        const own = bosses.find((b) => b.kind === kind);
        return own ? { card: own } : null;
      };
      const select = (card: BossCard, rowId: string | undefined) => {
        setSelectedKind(card.kind);
        // The row in the detail list, which Enter then configures.
        const index = Math.max(
          0,
          card.variants.findIndex((v) => v.id === rowId),
        );
        setSelectedIndex(index);
        pendingContractScrollRef.current = index > 0 ? index : null;
      };
      const requested = initialSelectionRef.current;
      const live = currentEncounterKindRef.current;
      const current = cardFor(live ? (encounterRegistry.getDescriptorForKind(live)?.kind ?? live) : null);
      const chosen = requested ? cardFor(requested.kind) : null;
      if (requested && chosen) {
        select(chosen.card, requested.variantId ?? chosen.rowId);
      } else if (current) {
        select(current.card, current.rowId);
      } else {
        setSelectedKind(firstAvailableKind);
        setSelectedIndex(0);
      }
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, firstAvailableKind, bosses, encounterRegistry]);

  const query = search.trim().toLowerCase();

  const matchBoss = (boss: BossCard): { nameMatch: boolean; variants: EncounterVariant[] } => {
    if (!query) return { nameMatch: true, variants: boss.variants };
    const nameMatch = boss.searchText.toLowerCase().includes(query);
    if (nameMatch) return { nameMatch, variants: boss.variants };
    const variants = boss.variants.filter((v) => `${v.name} ${v.subtitle}`.toLowerCase().includes(query));
    return { nameMatch, variants };
  };

  const railBosses = bosses.filter((boss) => {
    if (!query) return true;
    const m = matchBoss(boss);
    return m.nameMatch || m.variants.length > 0;
  });
  const selectedBoss = railBosses.find((b) => b.kind === selectedKind) ?? railBosses[0] ?? null;

  // Keep the selected rail entry visible (default selection may sit below the
  // fold; keyboard/search-driven selection changes too). `nearest` makes this a
  // no-op when the row is already on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll when the selected boss changes.
  useEffect(() => {
    if (!isOpen) return;
    // Optional-call guarded: jsdom does not implement scrollIntoView.
    selectedRailRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isOpen, selectedBoss?.kind]);

  // Likewise the contract a quick search chose, which can sit below the fold: once, when its row is
  // the selected one. Not on every selection change, or hovering a half-visible row would scroll
  // the list under the pointer.
  useEffect(() => {
    if (!isOpen || pendingContractScrollRef.current !== selectedIndex) return;
    pendingContractScrollRef.current = null;
    selectedContractRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isOpen, selectedIndex]);

  const detailVariants = selectedBoss ? matchBoss(selectedBoss).variants : [];

  // Bosses with no variants still render as a single "base" entry row so the
  // detail layout is identical to multi-contract bosses; it routes to the boss kind.
  const entries: EncounterVariant[] =
    selectedBoss && selectedBoss.variants.length === 0
      ? [
          {
            id: selectedBoss.kind,
            encounterKind: selectedBoss.kind,
            name: 'Standard Fight',
            subtitle: selectedBoss.description,
            available: true,
          },
        ]
      : detailVariants;

  if (!isOpen) return null;

  const enterKind = (kind: string) => {
    onEnter(kind);
    onClose();
  };
  const configureVariant = (v: EncounterVariant) => {
    onConfigure(v.encounterKind, v.name, v.subtitle);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (entries.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % entries.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + entries.length) % entries.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const v = entries[selectedIndex];
      if (v?.available) configureVariant(v);
    }
  };

  const hasLobby = encounterRegistry.hasKind(LOBBY_KIND);

  const renderThumb = (boss: BossCard) => {
    const { thumb, thumbFit } = boss.presentation;
    if (!thumb) {
      return <span className="picker-boss-pic picker-boss-pic--empty">{boss.title.charAt(0)}</span>;
    }
    return (
      <span className={`picker-boss-pic picker-boss-pic--${thumbFit ?? 'contain'}`}>
        <img crossOrigin="anonymous" src={thumb} alt="" />
      </span>
    );
  };

  const presentation = selectedBoss?.presentation;
  const tutorialKind = selectedBoss?.tutorialKind ?? null;
  const showTrain = !!onTutorialMode && tutorialKind !== null;

  return (
    <div className="picker-overlay" {...sheet.overlay} {...backdropDismiss}>
      <div className="picker-backdrop" />
      <div
        className="picker centered-modal-snap"
        {...sheet.card}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Encounters"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) event.preventDefault();
        }}
      >
        <CloseButton className="picker-close" {...sheet.close} onClick={onClose} aria-label="Close" />
        <aside className="picker-rail">
          <div className="picker-rail-head">
            <h2>Encounters</h2>
            <div className="picker-search">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                aria-label="Search encounters"
                placeholder="Search encounters..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>

          <label className="picker-mobile-select">
            <span>Encounter</span>
            <select
              value={selectedBoss?.kind ?? ''}
              onChange={(event) => {
                setSelectedKind(event.target.value);
                setSelectedIndex(0);
              }}
            >
              {railBosses.length === 0 && <option value="">No encounters found</option>}
              {railBosses.map((boss) => (
                <option key={boss.kind} value={boss.kind}>
                  {boss.title}
                  {boss.isWorkInProgress ? ' (Beta)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="picker-rail-scroll">
            {railBosses.length > 0 && <div className="picker-rail-section">Bosses</div>}
            {railBosses.map((boss) => (
              <button
                key={boss.kind}
                type="button"
                tabIndex={-1}
                aria-pressed={boss.kind === selectedBoss?.kind}
                ref={boss.kind === selectedBoss?.kind ? selectedRailRef : null}
                className={`picker-boss${boss.kind === selectedBoss?.kind ? ' active' : ''}`}
                onClick={() => {
                  setSelectedKind(boss.kind);
                  setSelectedIndex(0);
                }}
              >
                {renderThumb(boss)}
                <span className="picker-boss-meta">
                  <span className="picker-boss-heading">
                    <span className="picker-boss-name">{boss.title}</span>
                    {boss.isWorkInProgress && <BetaBadge compact />}
                  </span>
                  <span className="picker-boss-sub">{boss.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="picker-detail">
          {selectedBoss && presentation ? (
            <div className="picker-detail-scroll">
              <div className="picker-hero">
                {presentation.heroArt && (
                  <div className={`picker-hero-art${presentation.heroArtFull ? ' picker-hero-art--full' : ''}`}>
                    <img crossOrigin="anonymous" src={presentation.heroArt} alt={selectedBoss.title} />
                  </div>
                )}
                <div className="picker-hero-text">
                  <div className="picker-hero-title">
                    <h1>{selectedBoss.title}</h1>
                    {selectedBoss.isWorkInProgress && <BetaBadge />}
                  </div>
                  {presentation.tagline && <span className="picker-hero-tag">{presentation.tagline}</span>}
                  {presentation.blurb && <p>{presentation.blurb}</p>}
                  {showTrain && (
                    /* One action, not a block. The callout that lived here ran 94px
                       tall inside a 190px hero column — half the hero — and its
                       headline only repeated the Tutorial chip sitting beside the
                       boss name above it. The chip announces; this offers. */
                    <div className="picker-hero-actions">
                      <button
                        type="button"
                        className="picker-btn picker-btn--train"
                        onClick={() => {
                          if (tutorialKind) onTutorialMode?.(tutorialKind);
                          onClose();
                        }}
                      >
                        Start Tutorial
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="picker-contracts">
                {entries.length > 0 ? (
                  groupVariants(entries).map((group) => (
                    <div key={group.group ?? 'ungrouped'} className="picker-contract-group">
                      {group.group && <div className="picker-cg-label">{group.group} contracts</div>}
                      {group.items.map((variant) => {
                        const idx = entries.indexOf(variant);
                        const selected = idx === selectedIndex;
                        const reward = VARIANT_REWARD_ICON[variant.id];
                        return (
                          <div
                            key={variant.id}
                            ref={selected ? selectedContractRef : null}
                            className={`picker-contract${selected ? ' selected' : ''}${
                              variant.available ? '' : ' soon'
                            }`}
                          >
                            <span className="picker-contract-icon">
                              {reward ? <PixelSprite src={reward} alt="" width={32} height={32} /> : <RewardGlyph />}
                            </span>
                            <span className="picker-contract-body">
                              <span className="picker-contract-heading">
                                <span className="picker-contract-name">{variant.name}</span>
                                {variant.isWorkInProgress && <BetaBadge />}
                              </span>
                              <span className="picker-contract-effect">{variant.subtitle}</span>
                            </span>
                            {!variant.available && <span className="picker-badge">Soon</span>}
                            {variant.available && (
                              <div className="picker-contract-actions">
                                <OsrsButton onClick={() => configureVariant(variant)}>Configure</OsrsButton>
                                <OsrsButton variant="ghost" onClick={() => enterKind(variant.encounterKind)}>
                                  Enter
                                </OsrsButton>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="picker-empty">No contracts found.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="picker-empty">No encounters found.</div>
          )}
        </section>
        {hasLobby && (
          <div className="picker-navigation-foot">
            <OsrsButton className="picker-lobby-link" fullWidth onClick={() => enterKind(LOBBY_KIND)}>
              Return to Lobby
            </OsrsButton>
          </div>
        )}
      </div>
    </div>
  );
}
