import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module.js';
import { TaskQueryRepository } from './task-query.repository.js';
import { AssigneeCountResolver, TaskQueryResolver } from './task-query.resolver.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskRepository } from './task.repository.js';
import { TaskMutationResolver, TaskResolver } from './task.resolver.js';
import { TaskService } from './task.service.js';

@Module({
  imports: [ProjectModule],
  providers: [
    TaskRepository,
    TaskService,
    TaskMutationResolver,
    TaskResolver,
    TaskQueryRepository,
    TaskQueryService,
    TaskQueryResolver,
    AssigneeCountResolver,
  ],
})
export class TaskModule {}
