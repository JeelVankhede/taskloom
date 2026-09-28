import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTaskDocument } from '../../generated/graphql';
import { org, sessionBody, viewerMock } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { resetSessionForTests, session } from '../auth/session';
import {
  boardMock,
  filterFor,
  optionsMock,
  PROJECT_ID,
  projectMock,
  summaryMock,
  task,
} from './test-fixtures';

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

/** Types a date into the MUI date field (month, day, year sections). */
async function typeDate(u: ReturnType<typeof userEvent.setup>, label: string, mmddyyyy: string) {
  const group = screen.getByRole('group', { name: label });
  await u.click(within(group).getAllByRole('spinbutton')[0]!);
  await u.keyboard(mmddyyyy);
}

function createMock(input: Record<string, unknown>, created: ReturnType<typeof task>) {
  return {
    request: { query: CreateTaskDocument, variables: { input } },
    result: { data: { createTask: created } },
  };
}

describe('NewTaskDialog', () => {
  it('requires a title and a due date', async () => {
    renderApp('/o/acme/p/ENG', [...base, boardMock([task()])]);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'New task' }));
    await u.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByText('Enter a title')).toBeInTheDocument();
    expect(screen.getByText('Choose a due date')).toBeInTheDocument();
  });

  it('creates a task, puts it at the top of its column, and refreshes the counts', async () => {
    // Arrange
    const existing = task({ title: 'Older' });
    const created = task({ title: 'Fresh', priority: 'HIGH', dueDate: '2099-09-30' });
    renderApp('/o/acme/p/ENG', [
      ...base,
      boardMock([existing]),
      createMock(
        {
          projectId: PROJECT_ID,
          title: 'Fresh',
          description: null,
          priority: 'HIGH',
          assigneeId: null,
          dueDate: '2099-09-30',
          labelIds: [],
        },
        created,
      ),
      summaryMock([created, existing]),
    ]);
    const u = userEvent.setup();
    await screen.findByText('Older');

    // Act
    await u.click(screen.getByRole('button', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    await u.type(within(dialog).getByLabelText('Title'), 'Fresh');
    await u.click(within(dialog).getByRole('combobox', { name: 'Priority' }));
    await u.click(screen.getByRole('option', { name: 'High' }));
    await typeDate(u, 'Due date', '09302099');
    await u.click(within(dialog).getByRole('button', { name: 'Create task' }));

    // Assert
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New task' })).not.toBeInTheDocument(),
    );
    const todo = await screen.findByRole('region', { name: /^Todo, 2 tasks$/ });
    const titles = within(todo)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(titles[0]).toContain('Fresh');
    expect(titles[1]).toContain('Older');
    expect(await screen.findByText(`${created.identifier} created.`)).toBeInTheDocument();
  });

  it('tells the user when the current filters hide the new task', async () => {
    const created = task({ title: 'Hidden', priority: 'LOW', dueDate: '2099-09-30' });
    const filter = filterFor({ priorities: ['URGENT'] });
    renderApp('/o/acme/p/ENG?priority=URGENT', [
      ...base,
      boardMock([task({ title: 'Urgent one', priority: 'URGENT' })], { filter }),
      createMock(
        {
          projectId: PROJECT_ID,
          title: 'Hidden',
          description: null,
          priority: 'LOW',
          assigneeId: null,
          dueDate: '2099-09-30',
          labelIds: [],
        },
        created,
      ),
      summaryMock([task({ priority: 'URGENT' })], filter),
    ]);
    const u = userEvent.setup();
    await screen.findByText('Urgent one');
    await u.click(screen.getByRole('button', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    await u.type(within(dialog).getByLabelText('Title'), 'Hidden');
    await u.click(within(dialog).getByRole('combobox', { name: 'Priority' }));
    await u.click(screen.getByRole('option', { name: 'Low' }));
    await typeDate(u, 'Due date', '09302099');
    await u.click(within(dialog).getByRole('button', { name: 'Create task' }));

    expect(
      await screen.findByText(`${created.identifier} created. The current filters hide it.`),
    ).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});
