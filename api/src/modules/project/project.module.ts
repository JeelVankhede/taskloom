import { Module } from '@nestjs/common';
import { ProjectRepository } from './project.repository.js';
import {
  OrganizationProjectsResolver,
  ProjectMutationResolver,
  ProjectQueryResolver,
} from './project.resolver.js';

@Module({
  providers: [
    ProjectRepository,
    OrganizationProjectsResolver,
    ProjectMutationResolver,
    ProjectQueryResolver,
  ],
  exports: [ProjectRepository],
})
export class ProjectModule {}
