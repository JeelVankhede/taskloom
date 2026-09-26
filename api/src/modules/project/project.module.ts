import { Module } from '@nestjs/common';
import { ProjectRepository } from './project.repository.js';
import { OrganizationProjectsResolver, ProjectMutationResolver } from './project.resolver.js';

@Module({
  providers: [ProjectRepository, OrganizationProjectsResolver, ProjectMutationResolver],
  exports: [ProjectRepository],
})
export class ProjectModule {}
