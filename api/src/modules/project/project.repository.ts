import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DbContext } from '../../platform/database/db-context.js';

export interface ProjectRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  createdAt: Date;
  defaultStatusId: string;
}

const COLUMNS = Prisma.sql`
  p.id, p.key, p.name, p.description, p.state = 'archived' AS "isArchived", p.created_at AS "createdAt",
  p.default_status_id AS "defaultStatusId"`;

@Injectable()
export class ProjectRepository {
  constructor(private readonly db: DbContext) {}

  /** By name, then id. Active projects only unless includeArchived. */
  list(
    includeArchived: boolean,
    limit: number,
    after?: { name: string; id: string },
  ): Promise<ProjectRow[]> {
    const archived = includeArchived ? Prisma.empty : Prisma.sql`AND p.state = 'active'`;
    const cursor = after
      ? Prisma.sql`AND (p.name, p.id) > (${after.name}, ${after.id}::uuid)`
      : Prisma.empty;
    return this.db.tx.$queryRaw<ProjectRow[]>`
      SELECT ${COLUMNS} FROM projects p
      WHERE p.org_id = ${this.db.orgId}::uuid ${archived} ${cursor}
      ORDER BY p.name, p.id
      LIMIT ${limit}`;
  }

  async find(id: string): Promise<ProjectRow | undefined> {
    const [row] = await this.db.tx.$queryRaw<ProjectRow[]>`
      SELECT ${COLUMNS} FROM projects p WHERE p.org_id = ${this.db.orgId}::uuid AND p.id = ${id}::uuid`;
    return row;
  }

  async findByKey(key: string): Promise<ProjectRow | undefined> {
    const [row] = await this.db.tx.$queryRaw<ProjectRow[]>`
      SELECT ${COLUMNS} FROM projects p WHERE p.org_id = ${this.db.orgId}::uuid AND p.key = ${key}`;
    return row;
  }

  /** Copies the org template and records project.created (app.create_project). */
  async create(input: { name: string; key: string; description: string | null }): Promise<string> {
    const [row] = await this.db.tx.$queryRaw<{ id: string }[]>`
      SELECT app.create_project(${input.name}, ${input.key}, ${input.description})::text AS id`;
    return row!.id;
  }
}
