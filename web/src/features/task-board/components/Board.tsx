import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import type { TaskBoardQuery, TaskFilter } from '../../../generated/graphql';
import { Column, COLUMN_WIDTH } from './Column';

export interface BoardProps {
  columns: TaskBoardQuery['board']['columns'];
  countByStatus: Map<string, number>;
  projectId: string;
  filter: TaskFilter;
  today: string;
  onOpen: (identifier: string) => void;
}

/** Columns side by side; the row scrolls sideways and each column scrolls on its own. */
export function Board({ columns, countByStatus, projectId, filter, today, onOpen }: BoardProps) {
  return (
    <BoardFrame>
      {columns.map((column) => (
        <Column
          key={column.status.id}
          column={column}
          count={countByStatus.get(column.status.id)}
          projectId={projectId}
          filter={filter}
          today={today}
          onOpen={onOpen}
        />
      ))}
    </BoardFrame>
  );
}

function BoardFrame({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <Box
      role={busy ? 'status' : undefined}
      aria-busy={busy || undefined}
      aria-label={busy ? 'Loading the board' : undefined}
      sx={{
        display: 'flex',
        gap: 3,
        overflowX: 'auto',
        pb: 2,
        // The columns fill the rest of the viewport and scroll inside it.
        height: { xs: '70vh', md: 'calc(100vh - 260px)' },
        minHeight: 420,
      }}
    >
      {children}
    </Box>
  );
}

/** Four column-shaped placeholders while the board loads. */
export function BoardSkeleton() {
  return (
    <BoardFrame busy>
      {[0, 1, 2, 3].map((i) => (
        <Paper
          key={i}
          variant="outlined"
          aria-hidden
          sx={{ flex: `0 0 ${COLUMN_WIDTH}px`, p: 3, bgcolor: 'background.default' }}
        >
          <Skeleton variant="text" width="50%" height={28} />
          <Stack spacing={2} sx={{ mt: 2 }}>
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} variant="rounded" height={96} />
            ))}
          </Stack>
        </Paper>
      ))}
    </BoardFrame>
  );
}
