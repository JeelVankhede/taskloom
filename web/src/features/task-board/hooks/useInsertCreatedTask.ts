import { useApolloClient } from '@apollo/client/react';
import { useCallback } from 'react';
import {
  type TaskBoardQueryVariables,
  TaskBoardDocument,
  type TaskCardFieldsFragment,
  TaskSummaryDocument,
} from '../../../generated/graphql';
import { useOrgOperationContext } from '../../org/org-context';

/**
 * Places a created task without refetching the board, so loaded pages and scroll positions stay:
 * the card goes to the top of its column (the database gives a new task the column's top rank)
 * when it matches the current filters, and the counts refresh with one summary query.
 */
export function useInsertCreatedTask(variables: TaskBoardQueryVariables) {
  const client = useApolloClient();
  const context = useOrgOperationContext();

  return useCallback(
    (task: TaskCardFieldsFragment, visible: boolean) => {
      if (visible) {
        client.cache.updateQuery({ query: TaskBoardDocument, variables }, (data) => {
          if (!data) return data;
          const columns = data.board.columns.map((column) =>
            column.status.id !== task.status.id
              ? column
              : {
                  ...column,
                  tasks: {
                    ...column.tasks,
                    // The cursor is never used for paging: pages continue from the last card.
                    edges: [
                      { __typename: 'TaskEdge' as const, cursor: `created:${task.id}`, node: task },
                      ...column.tasks.edges,
                    ],
                  },
                },
          );
          return { ...data, board: { ...data.board, columns } };
        });
      }
      client
        .query({
          query: TaskSummaryDocument,
          variables: { filter: variables.filter },
          context,
          fetchPolicy: 'network-only',
        })
        .catch((e: unknown) => console.error('Refreshing the summary failed', e));
    },
    [client, context, variables],
  );
}
