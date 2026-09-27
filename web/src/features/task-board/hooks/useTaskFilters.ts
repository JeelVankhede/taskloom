import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { type BoardFilters, NO_FILTERS, parseFilters, writeFilters } from '../filters';

/** Board filters, owned by the URL: a filtered board survives reload and can be shared. */
export function useTaskFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  // flushSync: apply the new filters as an urgent update, not in React Router's default
  // transition. In a transition React renders the old and new filters side by side; each render
  // points the board query at its own variables and every response restarts the transition, so
  // on a slow device the query alternated between them and never settled (found in CI).
  const setFilters = useCallback(
    (next: BoardFilters) =>
      setParams((current) => writeFilters(current, next), { replace: true, flushSync: true }),
    [setParams],
  );
  const clear = useCallback(() => setFilters(NO_FILTERS), [setFilters]);
  return { filters, setFilters, clear };
}
