import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlineOutlined';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import { errorCode } from '../../../app/apollo';
import { Button } from '../../../design-system';
import {
  BoardColumnDocument,
  type TaskBoardQuery,
  type TaskFilter,
} from '../../../generated/graphql';
import { messageFor } from '../../../lib/error-messages';
import { useOrgQuery } from '../../org/hooks/useOrgOperation';
import { COLUMN_PAGE } from '../hooks/useTaskBoard';
import { TaskCard } from './TaskCard';

type BoardColumn = TaskBoardQuery['board']['columns'][number];

export const COLUMN_WIDTH = 300;
/** Start loading the next page this many cards before the end. */
const PREFETCH = 5;

export interface ColumnProps {
  column: BoardColumn;
  /** Matching tasks in this column, from the summary. */
  count: number | undefined;
  projectId: string;
  filter: TaskFilter;
  today: string;
  onOpen: (identifier: string) => void;
}

/**
 * One status. The first page comes with the board; later pages load on their own cursor as the
 * column scrolls near its end. Only the cards in view are rendered (virtualized).
 */
export function Column({ column, count, projectId, filter, today, onOpen }: ColumnProps) {
  const first = column.tasks;
  const [requested, setRequested] = useState(false);
  const more = useOrgQuery(
    BoardColumnDocument,
    {
      projectId,
      statusId: column.status.id,
      filter,
      first: COLUMN_PAGE,
      after: first.pageInfo.endCursor,
    },
    { skip: !requested },
  );
  const [fetchingMore, setFetchingMore] = useState(false);

  const extra = more.data?.boardColumn;
  const tasks = [...first.edges, ...(extra?.edges ?? [])].map((edge) => edge.node);
  const hasNext = extra ? extra.pageInfo.hasNextPage : first.pageInfo.hasNextPage;
  const loadingMore = more.loading || fetchingMore;

  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- no React Compiler in this app; this is TanStack's documented use
  const virtualizer = useVirtualizer({
    count: tasks.length + (hasNext || more.error ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 112,
    overscan: 6,
    getItemKey: (index) => tasks[index]?.id ?? 'end',
    // Before layout (and in tests) assume a column-sized viewport.
    initialRect: { width: COLUMN_WIDTH, height: 800 },
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;

  const { fetchMore, error: moreError } = more;
  const endCursor = extra?.pageInfo.endCursor;
  useEffect(() => {
    if (!hasNext || loadingMore || moreError || lastIndex < tasks.length - PREFETCH) return;
    if (!requested) {
      setRequested(true);
      return;
    }
    if (!endCursor) return;
    setFetchingMore(true);
    fetchMore({ variables: { after: endCursor } })
      .catch((e: unknown) => console.error('Loading more cards failed', e))
      .finally(() => setFetchingMore(false));
  }, [hasNext, loadingMore, moreError, lastIndex, tasks.length, requested, endCursor, fetchMore]);

  const name = column.status.name;
  const total = count ?? tasks.length;
  return (
    <Paper
      component="section"
      aria-label={`${name}, ${total} ${total === 1 ? 'task' : 'tasks'}`}
      variant="outlined"
      sx={{
        width: COLUMN_WIDTH,
        flex: `0 0 ${COLUMN_WIDTH}px`,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        maxHeight: '100%',
      }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', px: 4, py: 3 }}>
        {column.status.isClosed ? (
          <CheckCircleOutline fontSize="small" color="success" aria-hidden />
        ) : (
          <RadioButtonUnchecked fontSize="small" color="action" aria-hidden />
        )}
        <Typography variant="h4" component="h2" sx={{ flex: 1 }} noWrap>
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary" aria-hidden>
          {total}
        </Typography>
      </Stack>
      <Box ref={scrollRef} sx={{ overflowY: 'auto', px: 2, pb: 2, flex: 1 }}>
        {tasks.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            No tasks
          </Typography>
        ) : (
          <Box role="list" sx={{ position: 'relative', height: virtualizer.getTotalSize() }}>
            {items.map((item) => {
              const task = tasks[item.index];
              return (
                <Box
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  role="listitem"
                  aria-setsize={task ? total : undefined}
                  aria-posinset={task ? item.index + 1 : undefined}
                  sx={{ position: 'absolute', top: 0, left: 0, width: '100%', pb: 2 }}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {task ? (
                    <TaskCard task={task} today={today} onOpen={onOpen} />
                  ) : more.error ? (
                    <Stack role="alert" spacing={2} sx={{ p: 3, alignItems: 'center' }}>
                      <Typography variant="caption" color="error">
                        {messageFor(errorCode(more.error))}
                      </Typography>
                      <Button size="small" onClick={() => void more.refetch()}>
                        Try again
                      </Button>
                    </Stack>
                  ) : (
                    <Stack
                      role="status"
                      aria-label={`Loading more ${name} tasks`}
                      sx={{ alignItems: 'center', p: 3 }}
                    >
                      <CircularProgress size={20} />
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
