import type React from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { PLUGIN_KEYBIND_HELP } from '../../data/pluginKeybinds';
import {
  getKeybindingConflicts,
  getKeybindingValue,
  isChordBinding,
  KEYBINDING_DEFINITIONS,
  type KeybindingChange,
  type KeybindingDefinition,
  keybindingId,
  saveKeybindingChanges,
} from '../../hooks/keybindStore';
import { useUnifiedKeybinds } from '../../hooks/useUnifiedKeybinds';
import { TAB_ICONS } from '../../resourcePack';
import {
  GAMEPANEL_KEYBINDS_CAMERA_ID,
  GAMEPANEL_KEYBINDS_ID,
  GAMEPANEL_KEYBINDS_PLUGINS_ID,
} from '../../settingsSearch/ids';
import { PixelSprite } from '../PixelSprite';
import { flashRevealTarget } from '../settingsReveal';
import { DisclosureChevron } from '../ui/DisclosureChevron';
import { InfoHint } from '../ui/InfoHint';
import { ResetButton } from '../ui/ResetButton';
import { KeybindingEditor } from './KeybindingEditor';
import './KeybindingsContent.css';

interface KeybindingsContentProps {
  readonly group?: string;
  readonly readOnly?: boolean;
  /**
   * Embedded presentation (configurer rail): drops the help paragraph and the footer rule and
   * shortens the idle hint, because the host row already says what the group is. Saved, reserved,
   * unbound and recording feedback stay — those are states, not decoration.
   */
  readonly compact?: boolean;
  /**
   * The group shown, when the game panel owns it (so a reveal can pick Camera). Uncontrolled,
   * it starts on general keys. Ignored with `group`.
   */
  readonly category?: KeybindingCategory;
  readonly onCategoryChange?: (category: KeybindingCategory) => void;
}

export const KEYBINDING_CATEGORIES = ['Panel', 'Camera', 'Plugins'] as const;
export type KeybindingCategory = (typeof KEYBINDING_CATEGORIES)[number];
type Category = KeybindingCategory;
const KEYBINDING_DOMAIN_ORDER = { gamePanel: 0, camera: 0, ui: 1, plugins: 2 };
const CATEGORY_SEARCH_IDS = {
  Panel: undefined,
  Camera: GAMEPANEL_KEYBINDS_CAMERA_ID,
  Plugins: GAMEPANEL_KEYBINDS_PLUGINS_ID,
};

function DisclosureSummary({ children }: { readonly children: React.ReactNode }) {
  return (
    <summary>
      <DisclosureChevron className="keybindings-chevron" />
      {children}
    </summary>
  );
}

/** A clicked control keeps no focus, where Space or Enter would press it again instead of
 *  reaching the game. The key field takes focus itself while it records. */
const keepFocusOffControls = (event: React.MouseEvent) => {
  if (event.target instanceof Element && event.target.closest('button, summary')) event.preventDefault();
};

function categoryFor(binding: KeybindingDefinition): Category | null {
  switch (binding.domain) {
    case 'gamePanel':
      return 'Panel';
    case 'camera':
      return 'Camera';
    case 'plugins':
      return 'Plugins';
    case 'ui':
      return null;
  }
}

function scopeFor(binding: KeybindingDefinition): string {
  return binding.domain === 'plugins' ? binding.group : (categoryFor(binding) ?? binding.group);
}

function rowIsVisible(row: HTMLElement, scroller: HTMLElement): boolean {
  if (row.closest('details:not([open])')) return false;
  const rect = row.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top < Math.min(box.bottom, window.innerHeight) &&
    rect.bottom > Math.max(box.top, 0) &&
    rect.left < Math.min(box.right, window.innerWidth) &&
    rect.right > Math.max(box.left, 0)
  );
}

export function KeybindingsContent({
  group,
  readOnly = false,
  compact = false,
  category: controlledCategory,
  onCategoryChange,
}: KeybindingsContentProps) {
  const instanceId = useId();
  const feedbackId = `${instanceId}-feedback`;
  const store = useUnifiedKeybinds();
  const [ownCategory, setOwnCategory] = useState<Category>('Panel');
  const category = controlledCategory ?? ownCategory;
  const setCategory = (next: Category) => {
    setOwnCategory(next);
    onCategoryChange?.(next);
  };
  const [editing, setEditing] = useState<KeybindingDefinition | null>(null);
  const [notice, setNotice] = useState<
    | { readonly kind: 'saved' | 'reserved'; readonly text: string }
    | { readonly kind: 'unbound'; readonly bindings: readonly KeybindingDefinition[] }
    | null
  >(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dismissalLabelRef = useRef<HTMLSpanElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingFlashes = useRef<string[]>([]);
  const activeFlashes = useRef(new Map<string, () => void>());
  const clearFlashes = useCallback(() => {
    for (const stop of activeFlashes.current.values()) stop();
    activeFlashes.current.clear();
  }, []);
  const categoryLabel = category === 'Panel' ? 'General' : category;
  const scopeLabel = group ?? categoryLabel;
  const bindings = KEYBINDING_DEFINITIONS.filter((binding) =>
    group
      ? binding.group === group
      : categoryFor(binding) === category || (category === 'Panel' && categoryFor(binding) === null),
  ).sort((a, b) => KEYBINDING_DOMAIN_ORDER[a.domain] - KEYBINDING_DOMAIN_ORDER[b.domain]);
  const groups = [...new Set(bindings.map((binding) => binding.group))];
  const unavailable = new Map(
    bindings
      .filter(isChordBinding)
      .map((binding) => [
        keybindingId(binding),
        getKeybindingConflicts(store, [{ target: binding, value: getKeybindingValue(store, binding) }]),
      ]),
  );
  const unboundScopes = new Set(notice?.kind === 'unbound' ? notice.bindings.map(scopeFor) : []);
  const unboundScope = unboundScopes.size === 1 ? [...unboundScopes][0] : null;

  useEffect(() => clearFlashes, [clearFlashes]);
  useLayoutEffect(() => {
    for (const [id, stop] of activeFlashes.current) {
      if (!rowRefs.current.get(id)?.querySelector('.keybindings-value.is-unbound')) {
        stop();
        activeFlashes.current.delete(id);
      }
    }
    const ids = pendingFlashes.current.splice(0);
    if (ids.length === 0) return;
    clearFlashes();
    const scroller = scrollRef.current;
    if (!scroller) return;
    for (const id of ids) {
      const row = rowRefs.current.get(id);
      if (row && rowIsVisible(row, scroller)) activeFlashes.current.set(id, flashRevealTarget(row));
    }
  });

  useEffect(() => {
    if (readOnly) setEditing(null);
  }, [readOnly]);

  // A group the owner picked (a reveal) starts fresh at its top with nothing recording, as a click does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each change of group, which it does not read.
  useEffect(() => {
    setEditing(null);
    setNotice(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [category]);

  const cancel = () => {
    setEditing(null);
    setNotice(null);
  };

  const save = (changes: readonly KeybindingChange[], label: string) => {
    const previouslyBound = KEYBINDING_DEFINITIONS.filter((binding) => getKeybindingValue(store, binding));
    const result = saveKeybindingChanges(changes, true);
    if (!result.saved) {
      setNotice({
        text: 'Reserved. Try another key.',
        kind: 'reserved',
      });
      return;
    }
    pendingFlashes.current = previouslyBound
      .filter((binding) => !getKeybindingValue(result.store, binding))
      .map(keybindingId);
    cancel();
    setNotice(
      result.unbound.length
        ? { kind: 'unbound', bindings: result.unbound }
        : { kind: 'saved', text: `${label} saved.` },
    );
  };

  const renderBinding = (binding: KeybindingDefinition) => {
    const id = keybindingId(binding);
    const ariaId = `${instanceId}-${id}`;
    const value = getKeybindingValue(store, binding);
    const conflicts = unavailable.get(id) ?? [];
    const isPlugin = binding.domain === 'plugins';
    const lastWordStart = binding.label.lastIndexOf(' ') + 1;
    return (
      <div
        key={id}
        ref={(row) => {
          if (row) rowRefs.current.set(id, row);
          else rowRefs.current.delete(id);
        }}
        className={`keybindings-row${isPlugin ? ' keybindings-row--plugin' : ''}${conflicts.length ? ' has-conflict' : ''}`}
      >
        {binding.domain === 'gamePanel' && (
          <PixelSprite src={TAB_ICONS[binding.action]} alt="" width={15} height={15} />
        )}
        {binding.domain === 'ui' ? (
          <span className="keybindings-label keybindings-label--hint info-hint-region" ref={dismissalLabelRef}>
            <span id={`${ariaId}-label`}>{binding.label.slice(0, lastWordStart)}</span>
            <span className="keybindings-hint-word">
              <span id={`${ariaId}-label-end`}>{binding.label.slice(lastWordStart)}</span>
              <InfoHint
                label={binding.label}
                text="Closes the topmost menu, panel or dialog. Also cancels a selected spell or backs out of a replay."
                hoverRegionRef={dismissalLabelRef}
              />
            </span>
          </span>
        ) : (
          <span className="keybindings-label" id={`${ariaId}-label`}>
            {binding.label}
          </span>
        )}
        {conflicts.length > 0 && (
          <span className="keybindings-row-status" id={`${ariaId}-status`}>
            In use: {conflicts.map((conflict) => conflict.label).join(', ')}
          </span>
        )}
        <KeybindingEditor
          binding={binding}
          value={value}
          editing={!readOnly && !!editing && keybindingId(editing) === id}
          readOnly={readOnly}
          description={`${ariaId}-label${binding.domain === 'ui' ? ` ${ariaId}-label-end` : ''} ${ariaId}-value${conflicts.length ? ` ${ariaId}-status` : ''}${editing && keybindingId(editing) === id ? ` ${feedbackId}` : ''}`}
          footerRef={footerRef}
          onEdit={() => {
            clearFlashes();
            setNotice(null);
            setEditing(binding);
          }}
          onChange={(next) => save([{ target: binding, value: next }], binding.label)}
          onCancel={cancel}
        />
        <span className="keybindings-sr-only" id={`${ariaId}-value`}>
          {value || 'Unbound'}
        </span>
      </div>
    );
  };

  const renderGroup = (name: string) => {
    const groupBindings = bindings.filter((binding) => binding.group === name);
    const content = groupBindings.map(renderBinding);
    if (!group && groupBindings.every((binding) => binding.domain === 'plugins'))
      return (
        <details key={name} data-keybinding-group={name} className="keybindings-plugin-group" tabIndex={-1} open>
          <DisclosureSummary>{name}</DisclosureSummary>
          {PLUGIN_KEYBIND_HELP[name] && <p className="keybindings-help">{PLUGIN_KEYBIND_HELP[name]}</p>}
          {content}
        </details>
      );
    if (name === 'Free Camera')
      return (
        <details key={name} data-keybinding-group={name} tabIndex={-1}>
          <DisclosureSummary>Free camera</DisclosureSummary>
          {content}
        </details>
      );
    return (
      <section key={name} data-keybinding-group={name} aria-label={name}>
        {!group && groupBindings.some((binding) => binding.domain === 'ui') && (
          <hr className="keybindings-group-divider" />
        )}
        {content}
      </section>
    );
  };

  const listContent = groups.map(renderGroup);

  return (
    <fieldset
      className={`keybindings-content${group ? ' keybindings-content--feature' : ''}${compact ? ' keybindings-content--compact' : ''}`}
      aria-label={group ? `${group} keybindings` : 'Keybindings'}
      data-search-id={group ? undefined : GAMEPANEL_KEYBINDS_ID}
      // While a key is recorded, nothing pressed in here is a game key.
      onKeyDown={(event) => {
        if (editing) event.stopPropagation();
      }}
      onMouseDown={keepFocusOffControls}
    >
      {!group && (
        <div className="keybindings-categories" role="tablist" aria-label="Keybinding categories">
          {KEYBINDING_CATEGORIES.map((name) => (
            <button
              type="button"
              key={name}
              role="tab"
              id={`${instanceId}-tab-${name}`}
              aria-selected={category === name}
              aria-controls={`${instanceId}-list`}
              data-search-id={CATEGORY_SEARCH_IDS[name]}
              onClick={() => {
                setEditing(null);
                setCategory(name);
                setNotice(null);
                if (scrollRef.current) scrollRef.current.scrollTop = 0;
              }}
            >
              {name === 'Panel' ? 'General' : name}
            </button>
          ))}
        </div>
      )}
      {group && !compact && PLUGIN_KEYBIND_HELP[group] && (
        <p className="keybindings-help">{PLUGIN_KEYBIND_HELP[group]}</p>
      )}
      {group ? (
        <div className="keybindings-scroll" ref={scrollRef}>
          {listContent}
        </div>
      ) : (
        <div
          className="game-panel-scroll keybindings-scroll"
          ref={scrollRef}
          id={`${instanceId}-list`}
          role="tabpanel"
          aria-labelledby={`${instanceId}-tab-${category}`}
        >
          {listContent}
        </div>
      )}
      <div
        className={`keybindings-footer${editing ? ' is-editing' : ''}${notice?.kind === 'unbound' ? ' has-unbound' : ''}`}
        ref={footerRef}
      >
        <div
          className={`keybindings-feedback game-panel-scroll${notice?.kind === 'reserved' ? ' is-warning' : ''}`}
          id={feedbackId}
          role="status"
        >
          {notice?.kind === 'unbound' ? (
            <>
              <span className="keybindings-notice-label">Unbound: {unboundScope ?? ''}</span>
              <span className="keybindings-notice-actions">
                {notice.bindings
                  .map((binding) => (unboundScope ? binding.label : `${scopeFor(binding)}: ${binding.label}`))
                  .join(', ')}
              </span>
            </>
          ) : (
            (notice?.text ??
            (readOnly
              ? 'Exit replay to edit bindings.'
              : editing
                ? 'Press a key.'
                : compact
                  ? 'Click a key to rebind.'
                  : 'Click a key to change it.'))
          )}
        </div>
        {editing && !readOnly ? (
          <div className="keybindings-edit-tools">
            <button
              type="button"
              className="keybindings-text-button"
              disabled={!getKeybindingValue(store, editing)}
              onClick={() => save([{ target: editing, value: '' }], editing.label)}
            >
              Unbind
            </button>
            {getKeybindingValue(store, editing) !== editing.defaultKey && (
              <ResetButton
                aria-label={`Reset ${editing.label} binding to default`}
                onClick={() => save([{ target: editing, value: editing.defaultKey }], editing.label)}
              />
            )}
            <button type="button" className="keybindings-text-button keybindings-cancel" onClick={() => cancel()}>
              Cancel
            </button>
          </div>
        ) : (
          !readOnly &&
          bindings.some((binding) => getKeybindingValue(store, binding) !== binding.defaultKey) && (
            <ResetButton
              aria-label={`Reset ${scopeLabel} bindings to defaults`}
              onClick={() => {
                const changes = bindings.map((target) => ({ target, value: target.defaultKey }));
                save(changes, `${scopeLabel} bindings`);
              }}
            />
          )
        )}
      </div>
    </fieldset>
  );
}
