import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { type BoardFilters, NO_FILTERS, parseFilters, writeFilters } from '../filters';

/** Board filters, owned by the URL: a filtered board survives reload and can be shared. */
export function useTaskFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const setFilters = useCallback(
    (next: BoardFilters) => setParams((current) => writeFilters(current, next), { replace: true }),
    [setParams],
  );
  const clear = useCallback(() => setFilters(NO_FILTERS), [setFilters]);
  return { filters, setFilters, clear };
}
