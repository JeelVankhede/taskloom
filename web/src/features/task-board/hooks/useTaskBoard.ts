import { useMemo } from 'react';
import { TaskBoardDocument } from '../../../generated/graphql';
import { useOrgQuery } from '../../org/hooks/useOrgOperation';
import { type BoardFilters, toTaskFilter } from '../filters';

/** Cards per column page (the API default; at most 100). */
export const COLUMN_PAGE = 50;

/**
 * The board and its summary, from one operation with one filter value: one read-only snapshot,
 * so the column counts, the cards, and the chart always agree. A filter change shows cached
 * results at once when there are some, and refreshes them.
 */
export function useTaskBoard(projectId: string, filters: BoardFilters) {
  const filter = useMemo(() => toTaskFilter(filters, projectId), [filters, projectId]);
  const variables = { projectId, filter, first: COLUMN_PAGE };
  const query = useOrgQuery(TaskBoardDocument, variables, { refreshOnNewVariables: true });
  const countByStatus = useMemo(
    () => new Map(query.data?.taskSummary.byStatus?.map((c) => [c.status.id, c.total]) ?? []),
    [query.data],
  );
  return { ...query, variables, filter, countByStatus };
}
