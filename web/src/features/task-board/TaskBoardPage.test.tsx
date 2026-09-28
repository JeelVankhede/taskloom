import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDetailDocument } from '../../generated/graphql';
import { org, sessionBody, viewerMock } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { resetSessionForTests, session } from '../auth/session';
import { boardMock, columnMock, filterFor, optionsMock, projectMock, task } from './test-fixtures';

// jsdom does no layout: every offsetHeight is 0, so a virtualized column would show no cards.
// Give elements a column-sized box for these tests only.
// The board route is lazy-loaded; import it once up front so the first test does not spend its
// query timeout on the module's first (cold) transform.
beforeAll(async () => {
  await import('./TaskBoardPage');
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
});
afterAll(() => vi.restoreAllMocks());

beforeEach(() => {
  resetSessionForTests();
  localStorage.clear();
  session.start(sessionBody());
});

const base = [viewerMock([org('acme', 'Acme')]), projectMock(), optionsMock()];
const column = (name: RegExp) => screen.findByRole('region', { name });

describe('TaskBoardPage', () => {
  it('shows every column with its count and cards, and the summary for the same tasks', async () => {
    // Arrange
    const tasks = [
      task({ title: 'Write docs', priority: 'URGENT' }),
      task({ title: 'Ship it', statusId: 's-done', priority: 'LOW' }),
    ];

    // Act
    renderApp('/o/acme/p/ENG', [...base, boardMock(tasks)]);

    // Assert
    const todo = await column(/^Todo, 1 task$/);
    expect(within(todo).getByText('Write docs')).toBeInTheDocument();
    expect(within(await column(/^Done, 1 task$/)).getByText('Ship it')).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(within(summary).getByText('Total').nextSibling).toHaveTextContent('2');
    expect(
      within(summary).getByRole('img', { name: /Urgent 1, High 0, Medium 0, Low 1/ }),
    ).toBeInTheDocument();
  });

  it('reads filters from the URL and sends them to the board and the summary', async () => {
    renderApp('/o/acme/p/ENG?priority=URGENT&state=open', [
      ...base,
      boardMock([task({ title: 'Only urgent', priority: 'URGENT' })], {
        filter: filterFor({ priorities: ['URGENT'], isClosed: false }),
      }),
    ]);
    expect(await screen.findByText('Only urgent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('changes the URL, the board, and the summary together when a filter changes', async () => {
    // Arrange
    const router = renderApp('/o/acme/p/ENG', [
      ...base,
      boardMock([task({ title: 'Open one' }), task({ title: 'Done one', statusId: 's-done' })]),
      boardMock([task({ title: 'Done one', statusId: 's-done' })], {
        filter: filterFor({ isClosed: true }),
      }),
    ]);
    const u = userEvent.setup();
    await screen.findByText('Open one');

    // Act
    await u.click(screen.getByRole('combobox', { name: 'State' }));
    await u.click(screen.getByRole('option', { name: 'Closed' }));

    // Assert
    await waitFor(() => expect(router.state.location.search).toBe('?state=closed'));
    expect(await column(/^Todo, 0 tasks$/)).toBeInTheDocument();
    expect(screen.queryByText('Open one')).not.toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(within(summary).getByText('Total').nextSibling).toHaveTextContent('1');
  });

  it('tells an empty project from a filter with no matches', async () => {
    renderApp('/o/acme/p/ENG', [...base, boardMock([])]);
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
  });

  it('offers to clear filters that match nothing', async () => {
    const router = renderApp('/o/acme/p/ENG?overdue=1', [
      ...base,
      boardMock([], { filter: filterFor({ overdueOnly: true }) }),
      boardMock([task({ title: 'Back again' })]),
    ]);
    const u = userEvent.setup();
    expect(await screen.findByText('No tasks match these filters')).toBeInTheDocument();
    await u.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findByText('Back again')).toBeInTheDocument();
  });

  it('shows an error with a retry that reloads the board', async () => {
    const failing = {
      request: boardMock([]).request,
      result: { errors: [{ message: 'x', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] },
    };
    renderApp('/o/acme/p/ENG', [...base, failing, boardMock([task({ title: 'Recovered' })])]);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });

  it('says so when the project does not exist', async () => {
    renderApp('/o/acme/p/NOP', [
      ...base,
      {
        request: projectMock('NOP').request,
        result: { errors: [{ message: 'x', extensions: { code: 'NOT_FOUND' } }] },
      },
    ]);
    expect(await screen.findByText('Project not found')).toBeInTheDocument();
  });

  it('loads a column’s next page as it nears the end, without repeating cards', async () => {
    const first = [task({ title: 'One' }), task({ title: 'Two' })];
    const next = [task({ title: 'Three' })];
    renderApp('/o/acme/p/ENG', [
      ...base,
      boardMock(first, { hasNext: ['s-todo'], counts: { total: 3, open: 3 } }),
      columnMock('s-todo', `c-${first[1]!.id}`, next),
    ]);
    const todo = await column(/^Todo, 2 tasks$/);
    expect(await within(todo).findByText('Three')).toBeInTheDocument();
    expect(
      within(todo)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-posinset')),
    ).toEqual(['1', '2', '3']);
  });

  it('opens a task in the side pane, with the task in the URL', async () => {
    // Arrange
    const t = task({ title: 'Look closer' });
    const router = renderApp('/o/acme/p/ENG', [
      ...base,
      boardMock([t]),
      {
        request: { query: TaskDetailDocument, variables: { identifier: t.identifier } },
        result: {
          data: {
            taskByIdentifier: {
              ...t,
              number: 1,
              description: 'Line one\nLine two',
              closedAt: null,
              createdAt: '2026-09-01T10:00:00Z',
              updatedAt: '2026-09-02T10:00:00Z',
              status: { __typename: 'Status', id: 's-todo', name: 'Todo', isClosed: false },
              createdBy: { __typename: 'User', id: 'u-ada', displayName: 'Ada Lovelace' },
            },
          },
        },
      },
    ]);
    const u = userEvent.setup();

    // Act
    await u.click(await screen.findByRole('button', { name: /Look closer/ }));

    // Assert
    await waitFor(() => expect(router.state.location.search).toBe(`?task=${t.identifier}`));
    const pane = await screen.findByRole('dialog', { name: 'Task details' });
    expect(
      await within(pane).findByText('Line one\nLine two', { normalizer: (s) => s }),
    ).toBeInTheDocument();
    expect(within(pane).getByText(/by Ada Lovelace/)).toBeInTheDocument();
    await u.click(within(pane).getByRole('button', { name: 'Close task details' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
});
