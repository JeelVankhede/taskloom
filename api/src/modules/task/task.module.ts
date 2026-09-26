import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module.js';
import { TaskRepository } from './task.repository.js';
import { TaskMutationResolver, TaskResolver } from './task.resolver.js';
import { TaskService } from './task.service.js';

@Module({
  imports: [ProjectModule],
  providers: [TaskRepository, TaskService, TaskMutationResolver, TaskResolver],
})
export class TaskModule {}
