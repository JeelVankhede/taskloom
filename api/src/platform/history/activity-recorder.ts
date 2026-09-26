import { Injectable } from '@nestjs/common';
import { DbContext } from '../database/db-context.js';

export type ActivityType = 'task.created' | 'member.added' | 'member.join_request_rejected';

/**
 * Writes one activity event in the request transaction, attributed to the caller.
 * The database checks that the scope matches the type prefix (design reference 5.1).
 */
@Injectable()
export class ActivityRecorder {
  constructor(private readonly db: DbContext) {}

  async record(
    type: ActivityType,
    payload: Record<string, unknown>,
    scope: { projectId?: string; taskId?: string } = {},
  ): Promise<void> {
    await this.db.tx.$executeRaw`
      INSERT INTO activity_events (org_id, project_id, task_id, type, actor_kind, actor_id, payload)
      VALUES (${this.db.orgId}::uuid, ${scope.projectId ?? null}::uuid, ${scope.taskId ?? null}::uuid,
              ${type}::activity_type, 'user', ${this.db.userId}::uuid, ${JSON.stringify(payload)}::jsonb)`;
  }
}
