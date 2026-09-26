import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Capability } from '@taskloom/contracts';
import { DbContext } from '../../platform/database/db-context.js';
import { notFound } from '../../platform/errors/domain-error.js';
import { assertId } from '../../platform/graphql/ids.js';
import { Loaders } from '../../platform/loaders/loaders.js';
import type { TaskFilterInput } from './task-filter.js';
import type { TaskOrder } from './task-query.repository.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskRepository } from './task.repository.js';

@Resolver()
export class TaskQueryResolver {
  constructor(
    private readonly queries: TaskQueryService,
    private readonly tasks: TaskRepository,
    private readonly db: DbContext,
  ) {}

  @Query('tasks')
  list(
    @Args('filter') filter: TaskFilterInput | null,
    @Args('orderBy') orderBy: TaskOrder,
    @Args('first') first: number | null,
    @Args('after') after: string | null,
  ) {
    return this.queries.tasks(filter, orderBy, first, after);
  }

  @Query('taskSummary')
  summary(@Args('filter') filter: TaskFilterInput | null) {
    return this.queries.summary(filter);
  }

  @Query('board')
  board(
    @Args('projectId') projectId: string,
    @Args('filter') filter: TaskFilterInput | null,
    @Args('first') first: number | null,
  ) {
    return this.queries.board(projectId, filter, first);
  }

  @Query('boardColumn')
  boardColumn(
    @Args('projectId') projectId: string,
    @Args('statusId') statusId: string,
    @Args('filter') filter: TaskFilterInput | null,
    @Args('first') first: number | null,
    @Args('after') after: string | null,
  ) {
    return this.queries.boardColumn(projectId, statusId, filter, first, after);
  }

  @Query('task')
  async task(@Args('id') id: string) {
    this.db.require(Capability.READ_ORG);
    const task = await this.tasks.find(assertId(id, 'task'));
    if (!task) throw notFound('task');
    return task;
  }

  @Query('taskByIdentifier')
  taskByIdentifier(@Args('identifier') identifier: string) {
    return this.queries.byIdentifier(identifier);
  }
}

@Resolver('AssigneeCount')
export class AssigneeCountResolver {
  constructor(private readonly loaders: Loaders) {}

  @ResolveField('user')
  user(@Parent() entry: { userId: string | null }) {
    return entry.userId ? this.loaders.user(entry.userId) : null;
  }
}
