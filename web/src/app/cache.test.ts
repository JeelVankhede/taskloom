import { describe, expect, it } from 'vitest';
import { BoardColumnDocument } from '../generated/graphql';
import { columnMock, task } from '../features/task-board/test-fixtures';
import { createCache } from './apollo';

/** Later pages of a board column accumulate per (project, column, filter). */
describe('boardColumn cache policy', () => {
  const [a, b, c, d] = [task(), task(), task(), task()];
  const write = (cache: ReturnType<typeof createCache>, after: string, tasks: (typeof a)[]) => {
    const mock = columnMock('s-todo', after, tasks, true);
    cache.writeQuery({
      query: BoardColumnDocument,
      variables: mock.request.variables,
      data: mock.result.data,
    });
  };
  const read = (cache: ReturnType<typeof createCache>) =>
    cache
      .readQuery({
        query: BoardColumnDocument,
        variables: columnMock('s-todo', 'c-x', []).request.variables,
      })
      ?.boardColumn.edges.map((e) => e.node.id);

  it('appends a page that continues from the last card', () => {
    const cache = createCache();
    write(cache, 'c-first-page-end', [a!, b!]);
    write(cache, `c-${b!.id}`, [c!, d!]);
    expect(read(cache)).toEqual([a!.id, b!.id, c!.id, d!.id]);
  });

  it('starts over when a page does not continue the list (a remount), so nothing repeats', () => {
    const cache = createCache();
    write(cache, 'c-first-page-end', [a!, b!]);
    write(cache, `c-${b!.id}`, [c!]);
    write(cache, 'c-first-page-end', [a!, b!]);
    expect(read(cache)).toEqual([a!.id, b!.id]);
  });
});
