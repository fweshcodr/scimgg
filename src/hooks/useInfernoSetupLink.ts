import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readInfernoSetupLink } from '../encounters/inferno/setupLink';
import {
  dismissInfernoSetupLinkNotice,
  showInfernoSetupLinkNotice,
  withdrawInfernoSetupLinkUndo,
} from '../encounters/inferno/setupLinkNotice';
import type { EncounterLoadout } from '../types/encounterLoadout';
import type { MechanicsConfig } from '../types/simulation';

/** The Inferno's saved choices a link changes: its own mechanics entry and its current loadout. */
export interface InfernoStoredChoices {
  /** The saved `inferno` mechanics entry; undefined when it has none. */
  readonly mechanics: Readonly<Partial<MechanicsConfig>> | undefined;
  readonly loadout: EncounterLoadout;
}

export interface InfernoSetupLinkActions {
  /**
   * The saved Inferno mechanics: a gearless link that leaves them as they are (the
   * address bar's own mirror, reloaded) applies and announces nothing.
   */
  readonly saved: Readonly<Partial<MechanicsConfig>>;
  /** Make `loadout` the Inferno's current loadout (as an imported setup is; presets are untouched). */
  readonly saveLoadout: (loadout: EncounterLoadout) => void;
  /**
   * Open the Inferno setup card on the saved setup with `mechanics` over it (null: the link applied
   * nothing). Never on the defaults: a link must not reset the player's other Inferno choices.
   */
  readonly openSetup: (mechanics: Partial<MechanicsConfig> | null) => void;
  /**
   * Enter the Inferno now with `mechanics` saved over the saved setup, in `loadout` (omitted: the
   * saved gear), as Start on the setup card does.
   */
  readonly start: (mechanics: Partial<MechanicsConfig>, loadout?: EncounterLoadout) => void;
  /** The Inferno's saved choices as they stand this render (a new object only when they change). */
  readonly stored: InfernoStoredChoices;
  /** Save `choices` back as the Inferno's mechanics entry and loadout, leaving everything else. */
  readonly restore: (choices: InfernoStoredChoices) => void;
}

function fingerprintOf(choices: InfernoStoredChoices): string {
  return JSON.stringify([choices.mechanics ?? null, choices.loadout]);
}

/**
 * Consumes the Inferno setup link the app was opened with (`readInfernoSetupLink`), once.
 *
 * Any address that may be one, the address bar's own mirror included, loses its parameters and
 * moves to the lobby path before the router reads it (a layout effect runs ahead of every passive
 * one), so the router never enters the fight on its own and a reload does not import again. The
 * ORIGINAL address is then judged against the saved settings: a mirror of the saved setup is
 * no link, so it opens as its plain route would (`/inferno/` enters the saved setup in its saved
 * gear, the lobby does nothing); otherwise the outcome is published as the setup notice, its gear
 * saved, and the run either started (complete gear) or the setup card opened. The address bar
 * then mirrors the saved setup, without gear (`useInfernoSetupQuery`).
 *
 * A link that applied something offers Undo on its notice: the Inferno's saved mechanics entry and
 * loadout as they were just before it. The Undo lasts while the notice is shown and those stay as
 * the link left them; the first change to either (an edit in the setup card or Practice, a preset,
 * an autocast pick) withdraws it, so it never discards a later choice. Starting a
 * fight changes neither, so a link that starts the run keeps its Undo; undoing then changes what the
 * next run uses (and, as any setup edit does, the live fight's non-run-start mechanics), never
 * restarting the fight.
 */
export function useInfernoSetupLink(actions: InfernoSetupLinkActions): void {
  const { saved, saveLoadout, openSetup, start, stored } = actions;
  // The undo runs from a click long after the link applied; it restores through the latest actions.
  const restoreRef = useRef(actions.restore);
  restoreRef.current = actions.restore;
  /**
   * The pending undo: the choices it restores with their fingerprint, and the fingerprint of what
   * the link left them as (null until the store first differs from `before`).
   */
  const undoRef = useRef<{ before: InfernoStoredChoices; beforePrint: string; after: string | null } | null>(null);
  const fingerprint = useMemo(() => fingerprintOf(stored), [stored]);
  useEffect(() => {
    const pending = undoRef.current;
    if (!pending) return;
    if (pending.after === null) {
      if (fingerprint !== pending.beforePrint) pending.after = fingerprint;
      return;
    }
    if (pending.after === fingerprint) return;
    undoRef.current = null;
    withdrawInfernoSetupLinkUndo();
  }, [fingerprint]);
  const [original] = useState(() => {
    const { pathname, search, hash } = window.location;
    return { pathname, search, hash };
  });
  // Read without the saved setup: anything that may be a link.
  const [candidate] = useState(() => readInfernoSetupLink(original));
  const consumedRef = useRef(false);

  useLayoutEffect(() => {
    if (candidate) window.history.replaceState(window.history.state, '', candidate.cleanedUrl);
  }, [candidate]);

  useEffect(() => {
    if (!candidate || consumedRef.current) return;
    consumedRef.current = true;
    const link = readInfernoSetupLink(original, saved);
    if (!link) return;
    const { plan } = link;
    if (!plan) {
      // The mirror: `{}` keeps the saved setup, and no loadout keeps the saved gear.
      if (link.onInfernoRoute) start({});
      return;
    }
    if (plan.mechanics) {
      undoRef.current = { before: stored, beforePrint: fingerprintOf(stored), after: null };
      showInfernoSetupLinkNotice({
        ...plan.notice,
        undo: () => {
          const pending = undoRef.current;
          if (!pending) return;
          undoRef.current = null;
          restoreRef.current(pending.before);
          dismissInfernoSetupLinkNotice();
        },
      });
    } else {
      showInfernoSetupLinkNotice(plan.notice);
    }
    if (plan.loadout) saveLoadout(plan.loadout);
    if (plan.autoStart && plan.mechanics && plan.loadout) start(plan.mechanics, plan.loadout);
    else openSetup(plan.mechanics);
  }, [candidate, original, saved, saveLoadout, openSetup, start, stored]);
}
