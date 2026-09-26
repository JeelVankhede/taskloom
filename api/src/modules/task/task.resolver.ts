import { Args, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Loaders } from '../../platform/loaders/loaders.js';
import type { TaskRow } from './task.repository.js';
import { type CreateTaskInput, TaskService } from './task.service.js';

@Resolver()
export class TaskMutationResolver {
  constructor(private readonly tasks: TaskService) {}

  @Mutation('createTask')
  createTask(@Args('input') input: CreateTaskInput): Promise<TaskRow> {
    return this.tasks.create(input);
  }
}

@Resolver('Task')
export class TaskResolver {
  constructor(private readonly loaders: Loaders) {}

  @ResolveField('identifier')
  async identifier(@Parent() task: TaskRow): Promise<string> {
    const project = await this.loaders.project(task.projectId);
    return `${project!.key}-${task.number}`;
  }

  @ResolveField('status')
  status(@Parent() task: TaskRow) {
    return this.loaders.status(task.statusId);
  }

  @ResolveField('assignee')
  assignee(@Parent() task: TaskRow) {
    return task.assigneeId ? this.loaders.user(task.assigneeId) : null;
  }

  @ResolveField('labels')
  labels(@Parent() task: TaskRow) {
    return this.loaders.labelsOf(task.id);
  }

  /** Returned only while the task is closed (design reference 7.3.4). */
  @ResolveField('closedAt')
  closedAt(@Parent() task: TaskRow): Date | null {
    return task.isClosed ? task.closedAt : null;
  }
}
