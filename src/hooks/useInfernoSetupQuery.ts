import { useEffect, useMemo, useState } from 'react';
import { INFERNO_LINK_PARAMS } from '../encounters/inferno/setupLink';
import type { RouteQuery } from './useRouting';

/** How long an edit to the setup settles before it reaches the address, so typing a wave writes once. */
export const INFERNO_SETUP_QUERY_SETTLE_MS = 400;

/**
 * The address bar's Inferno query (`useRouting`'s `routeQuery`): `query`, the saved setup's link
 * query (`infernoSetupQuery`), while `active` (the Inferno is the route), else ''. It owns every
 * link parameter wherever the app is, so none is left behind. Edits reach it once they have settled
 * for {@link INFERNO_SETUP_QUERY_SETTLE_MS}; becoming active shows the current setup at once, and
 * becoming inactive drops it at once.
 */
export function useInfernoSetupQuery(query: string, active: boolean): RouteQuery {
  const [shown, setShown] = useState({ active, query });
  useEffect(() => {
    if (shown.active === active && shown.query === query) return;
    if (shown.active !== active || !active) {
      setShown({ active, query });
      return;
    }
    const timer = setTimeout(() => setShown({ active, query }), INFERNO_SETUP_QUERY_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [active, query, shown]);
  const current = !active ? '' : shown.active ? shown.query : query;
  return useMemo(() => ({ params: INFERNO_LINK_PARAMS, query: current }), [current]);
}
