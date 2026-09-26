import { Args, Mutation, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Capability, LENGTH, PROJECT_KEY_PATTERN } from '@taskloom/contracts';
import { DbContext } from '../../platform/database/db-context.js';
import { notFound, validationFailed } from '../../platform/errors/domain-error.js';
import { assertId } from '../../platform/graphql/ids.js';
import {
  type Connection,
  decodeCursor,
  pageSize,
  toConnection,
} from '../../platform/pagination/connection.js';
import { ProjectRepository, type ProjectRow } from './project.repository.js';

@Resolver('Organization')
export class OrganizationProjectsResolver {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly db: DbContext,
  ) {}

  @ResolveField('projects')
  async projects(
    @Args('includeArchived') includeArchived: boolean,
    @Args('first') first: number | null,
    @Args('after') after: string | null,
  ): Promise<Connection<ProjectRow>> {
    this.db.require(Capability.READ_ORG);
    const size = pageSize(first);
    const cursor = after ? decodeCursor(after, ['string', 'string']) : undefined;
    const rows = await this.repo.list(
      includeArchived,
      size + 1,
      cursor ? { name: cursor[0] as string, id: cursor[1] as string } : undefined,
    );
    return toConnection(rows, size, (row) => [row.name, row.id]);
  }
}

@Resolver()
export class ProjectMutationResolver {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly db: DbContext,
  ) {}

  @Mutation('createProject')
  async createProject(
    @Args('input') input: { name: string; key: string; description?: string | null },
  ): Promise<ProjectRow> {
    this.db.require(Capability.MANAGE_PROJECTS);
    const name = input.name.trim();
    const key = input.key.trim();
    const description = input.description?.trim() || null;
    if (name.length < LENGTH.projectName.min || name.length > LENGTH.projectName.max) {
      throw validationFailed(
        `Name must be ${LENGTH.projectName.min} to ${LENGTH.projectName.max} characters`,
      );
    }
    if (!PROJECT_KEY_PATTERN.test(key)) {
      throw validationFailed(
        'Key must be exactly 3 characters: a capital letter, then capitals or digits',
      );
    }
    if (description && description.length > LENGTH.projectDescription.max) {
      throw validationFailed(
        `Description must be at most ${LENGTH.projectDescription.max} characters`,
      );
    }
    const id = await this.projects.create({ name, key, description });
    return (await this.projects.find(id))!;
  }
}

@Resolver()
export class ProjectQueryResolver {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly db: DbContext,
  ) {}

  @Query('project')
  async project(@Args('id') id: string): Promise<ProjectRow> {
    this.db.require(Capability.READ_ORG);
    const project = await this.repo.find(assertId(id, 'project'));
    if (!project) throw notFound('project');
    return project;
  }

  /** Keys are stored upper case; any letter case is accepted. */
  @Query('projectByKey')
  async projectByKey(@Args('key') key: string): Promise<ProjectRow> {
    this.db.require(Capability.READ_ORG);
    const project = await this.repo.findByKey(key.trim().toUpperCase());
    if (!project) throw notFound('project');
    return project;
  }
}
