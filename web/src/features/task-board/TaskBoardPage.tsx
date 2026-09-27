import AddOutlined from '@mui/icons-material/AddOutlined';
import Snackbar from '@mui/material/Snackbar';
import { ErrorCode } from '@taskloom/contracts';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { errorCode } from '../../app/apollo';
import { Button, EmptyState, ErrorState, PageHeader } from '../../design-system';
import { DateProvider } from '../../design-system/DateProvider';
import { BoardOptionsDocument, BoardProjectDocument } from '../../generated/graphql';
import { messageFor } from '../../lib/error-messages';
import { useOrgQuery } from '../org/hooks/useOrgOperation';
import { Board, BoardSkeleton } from './components/Board';
import { FilterBar } from './components/FilterBar';
import { NewTaskDialog } from './components/NewTaskDialog';
import { SummaryPanel, SummarySkeleton } from './components/SummaryPanel';
import { TaskDetailPane } from './components/TaskDetailPane';
import { isFiltered, matchesFilters, todayIn } from './filters';
import { useInsertCreatedTask } from './hooks/useInsertCreatedTask';
import { useTaskBoard } from './hooks/useTaskBoard';
import { useTaskFilters } from './hooks/useTaskFilters';

/** Options for filters and the dialog: members beyond the first 100 are not offered. */
const OPTION_MEMBERS = 100;

/** /o/:orgSlug/p/:projectKey: the Task Board (Task 2.2). */
export function TaskBoardPage() {
  const { projectKey = '' } = useParams();
  const { data, error, loading, refetch } = useOrgQuery(BoardProjectDocument, { key: projectKey });

  if (!data && loading) {
    return (
      <>
        <PageHeader title={projectKey} />
        <SummarySkeleton />
        <BoardSkeleton />
      </>
    );
  }
  if (!data) {
    return errorCode(error) === ErrorCode.NOT_FOUND ? (
      <EmptyState
        title="Project not found"
        description="It does not exist in this organization, or it was archived."
        action={<Button to="..">Back to projects</Button>}
      />
    ) : (
      <ErrorState message={messageFor(errorCode(error))} onRetry={() => void refetch()} />
    );
  }
  const project = data.projectByKey!;
  return (
    <DateProvider>
      <BoardView project={project} timezone={data.organization.timezone} />
    </DateProvider>
  );
}

interface BoardViewProps {
  project: { id: string; key: string; name: string };
  timezone: string;
}

function BoardView({ project, timezone }: BoardViewProps) {
  const { filters, setFilters, clear } = useTaskFilters();
  const board = useTaskBoard(project.id, filters);
  const options = useOrgQuery(BoardOptionsDocument, { first: OPTION_MEMBERS });
  const insertCreated = useInsertCreatedTask(board.variables);
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Today in the organization's timezone decides overdue, as it does on the server.
  const today = useMemo(() => todayIn(timezone), [timezone]);

  const assignees = useMemo(
    () =>
      (options.data?.organization.members.edges ?? [])
        .filter((e) => e.node.status === 'ACTIVE')
        .map((e) => ({ id: e.node.user.id, name: e.node.user.displayName })),
    [options.data],
  );
  const labels = useMemo(
    () => (options.data?.labels ?? []).map((l) => ({ id: l.id, name: l.name })),
    [options.data],
  );
  const columns = board.data?.board.columns;
  const statuses = (columns ?? []).map((c) => ({ id: c.status.id, name: c.status.name }));

  const openTask = (identifier: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (identifier) next.set('task', identifier);
        else next.delete('task');
        return next;
      },
      { replace: false },
    );

  const summary = board.data?.taskSummary;
  let body;
  if (!board.data && board.loading) {
    body = (
      <>
        <SummarySkeleton />
        <BoardSkeleton />
      </>
    );
  } else if (!board.data || !summary || !columns) {
    body = (
      <ErrorState
        message={messageFor(errorCode(board.error))}
        onRetry={() => void board.refetch()}
        retrying={board.loading}
      />
    );
  } else if (summary.total === 0) {
    body = isFiltered(filters) ? (
      <EmptyState
        title="No tasks match these filters"
        description="Try removing a filter."
        action={<Button onClick={clear}>Clear filters</Button>}
      />
    ) : (
      <EmptyState
        title="No tasks yet"
        description="Create the first task in this project."
        action={
          <Button tone="primary" onClick={() => setCreating(true)}>
            New task
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <SummaryPanel summary={summary} />
        {/* Keyed by filter: a new filter starts every column at its top again. */}
        <Board
          key={JSON.stringify(board.filter)}
          columns={columns}
          countByStatus={board.countByStatus}
          projectId={project.id}
          filter={board.filter}
          today={today}
          onOpen={openTask}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={project.name}
        description={`${project.key} · tasks by status`}
        actions={
          <Button tone="primary" startIcon={<AddOutlined />} onClick={() => setCreating(true)}>
            New task
          </Button>
        }
      />
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onClear={clear}
        assignees={assignees}
        labels={labels}
      />
      {body}
      <TaskDetailPane
        identifier={params.get('task')}
        today={today}
        onClose={() => openTask(null)}
      />
      <NewTaskDialog
        open={creating}
        onClose={() => setCreating(false)}
        projectId={project.id}
        statuses={statuses}
        assignees={assignees}
        labels={labels}
        onCreated={(task) => {
          const visible = matchesFilters(task, filters, today);
          insertCreated(task, visible);
          setNotice(
            visible
              ? `${task.identifier} created.`
              : `${task.identifier} created. The current filters hide it.`,
          );
        }}
      />
      <Snackbar
        open={notice !== null}
        message={notice}
        autoHideDuration={5000}
        onClose={() => setNotice(null)}
      />
    </>
  );
}
