import { Injectable } from '@nestjs/common';
import { Capability, ErrorCode, LENGTH } from '@taskloom/contracts';
import { DbContext } from '../../platform/database/db-context.js';
import { DomainError, notFound, validationFailed } from '../../platform/errors/domain-error.js';
import { assertId } from '../../platform/graphql/ids.js';
import { ActivityRecorder } from '../../platform/history/activity-recorder.js';
import { ProjectRepository } from '../project/project.repository.js';
import { TaskRepository, type TaskRow } from './task.repository.js';

const MAX_LABELS_PER_TASK = 20;

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string | null;
  statusId?: string | null;
  priority: number;
  assigneeId?: string | null;
  dueDate: string;
  labelIds?: string[] | null;
}

@Injectable()
export class TaskService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly projects: ProjectRepository,
    private readonly activity: ActivityRecorder,
    private readonly db: DbContext,
  ) {}

  /** Every role may create tasks. Status, assignee, and label rules are also enforced by triggers. */
  async create(input: CreateTaskInput): Promise<TaskRow> {
    this.db.require(Capability.EDIT_TASKS);
    const title = input.title.trim();
    const description = input.description?.trim() || null;
    if (title.length < LENGTH.taskTitle.min || title.length > LENGTH.taskTitle.max) {
      throw validationFailed(
        `Title must be ${LENGTH.taskTitle.min} to ${LENGTH.taskTitle.max} characters`,
      );
    }
    if (description && description.length > LENGTH.taskDescription.max) {
      throw validationFailed(
        `Description must be at most ${LENGTH.taskDescription.max} characters`,
      );
    }
    const labelIds = [...new Set(input.labelIds ?? [])];
    if (labelIds.length > MAX_LABELS_PER_TASK) {
      throw validationFailed(`A task can have at most ${MAX_LABELS_PER_TASK} labels`);
    }

    const project = await this.projects.find(assertId(input.projectId, 'project'));
    if (!project) throw notFound('project');
    if (project.isArchived)
      throw new DomainError(ErrorCode.PROJECT_ARCHIVED, 'The project is archived');
    await this.assertLabelsUsable(labelIds.map((id) => assertId(id, 'label')));

    const statusId = input.statusId ? assertId(input.statusId, 'status') : project.defaultStatusId;
    const assigneeId = input.assigneeId ? assertId(input.assigneeId, 'assignee') : null;
    const created = await this.tasks.insert({
      projectId: project.id,
      title,
      description,
      statusId,
      priority: input.priority,
      assigneeId,
      dueDate: input.dueDate,
    });
    await this.tasks.applyLabels(created.id, labelIds);
    await this.activity.record(
      'task.created',
      {
        number: created.number,
        title,
        status_id: statusId,
        priority: input.priority === 0 ? null : input.priority,
        assignee_id: assigneeId,
        due_date: input.dueDate,
        label_ids: labelIds,
      },
      { projectId: project.id, taskId: created.id },
    );
    return (await this.tasks.find(created.id))!;
  }

  private async assertLabelsUsable(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await this.tasks.labels(ids);
    if (found.length !== ids.length) throw notFound('label');
    if (found.some((label) => label.archived)) {
      throw new DomainError(ErrorCode.LABEL_ARCHIVED, 'An archived label cannot be applied');
    }
  }
}
