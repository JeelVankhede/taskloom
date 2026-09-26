-- CreateEnum
CREATE TYPE "org_role" AS ENUM ('owner', 'admin', 'member', 'contributor');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('active', 'deactivated');

-- CreateEnum
CREATE TYPE "join_request_status" AS ENUM ('pending', 'approved', 'rejected', 'canceled');

-- CreateEnum
CREATE TYPE "project_state" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "closed_kind" AS ENUM ('completed', 'canceled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" CITEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "auth_subject" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "org_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "priority_labels" TEXT[] DEFAULT ARRAY['Urgent', 'High', 'Medium', 'Low']::TEXT[],
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("org_id")
);

-- CreateTable
CREATE TABLE "org_memberships" (
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "org_role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("org_id","user_id")
);

-- CreateTable
CREATE TABLE "org_join_requests" (
    "org_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "status" "join_request_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "decided_by" UUID,

    CONSTRAINT "org_join_requests_pkey" PRIMARY KEY ("org_id","id")
);

-- CreateTable
CREATE TABLE "org_template_statuses" (
    "org_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "closed_kind" "closed_kind",
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "org_template_statuses_pkey" PRIMARY KEY ("org_id","id")
);

-- CreateTable
CREATE TABLE "projects" (
    "org_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "state" "project_state" NOT NULL DEFAULT 'active',
    "default_status_id" UUID NOT NULL,
    "next_task_number" INTEGER NOT NULL DEFAULT 1,
    "rank_epoch" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("org_id","id")
);

-- CreateTable
CREATE TABLE "project_statuses" (
    "org_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "template_status_id" UUID,
    "name" TEXT NOT NULL,
    "closed_kind" "closed_kind",
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_statuses_pkey" PRIMARY KEY ("org_id","id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "org_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "number" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status_id" UUID NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMPTZ(6),
    "priority" SMALLINT,
    "assignee_id" UUID,
    "due_date" DATE NOT NULL,
    "rank" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("org_id","id")
);

-- CreateTable
CREATE TABLE "labels" (
    "org_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("org_id","id")
);

-- CreateTable
CREATE TABLE "task_labels" (
    "org_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("org_id","task_id","label_id")
);

-- CreateTable
CREATE TABLE "comments" (
    "org_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "task_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("org_id","id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_subject_key" ON "users"("auth_subject");

-- CreateIndex
CREATE INDEX "refresh_tokens_by_family" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_by_user" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_hash" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "org_memberships_by_user" ON "org_memberships"("user_id") WHERE (status = 'active'::membership_status);

-- CreateIndex
CREATE INDEX "org_join_requests_by_user" ON "org_join_requests"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "org_join_requests_pending" ON "org_join_requests"("org_id", "user_id") WHERE (status = 'pending'::join_request_status);

-- CreateIndex
CREATE UNIQUE INDEX "org_template_statuses_one_default" ON "org_template_statuses"("org_id") WHERE (is_default);

-- CreateIndex
CREATE UNIQUE INDEX "projects_org_id_key_key" ON "projects"("org_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "project_statuses_org_id_project_id_id_key" ON "project_statuses"("org_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "tasks_board" ON "tasks"("org_id", "project_id", "status_id", "rank") WHERE (archived_at IS NULL);

-- CreateIndex
CREATE INDEX "tasks_project_created" ON "tasks"("org_id", "project_id", "id") WHERE (archived_at IS NULL);

-- CreateIndex
CREATE INDEX "tasks_org_created" ON "tasks"("org_id", "id") WHERE (archived_at IS NULL);

-- CreateIndex
CREATE INDEX "tasks_project_due" ON "tasks"("org_id", "project_id", "due_date") WHERE (archived_at IS NULL);

-- CreateIndex
CREATE INDEX "tasks_project_assignee" ON "tasks"("org_id", "project_id", "assignee_id") WHERE (archived_at IS NULL);

-- CreateIndex
CREATE INDEX "tasks_overdue_by_assignee" ON "tasks"("org_id", "assignee_id", "due_date") WHERE ((archived_at IS NULL) AND (NOT is_closed));

-- CreateIndex
CREATE INDEX "tasks_by_status" ON "tasks"("org_id", "project_id", "status_id");

-- CreateIndex
CREATE INDEX "tasks_open_by_assignee" ON "tasks"("org_id", "assignee_id") WHERE ((NOT is_closed) AND (assignee_id IS NOT NULL));

-- CreateIndex
CREATE INDEX "tasks_archived" ON "tasks"("org_id", "project_id", "archived_at" DESC) WHERE (archived_at IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "tasks_number_unique" ON "tasks"("org_id", "project_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_rank_unique" ON "tasks"("org_id", "project_id", "rank");

-- CreateIndex
CREATE INDEX "task_labels_by_label" ON "task_labels"("org_id", "label_id", "task_id");

-- CreateIndex
CREATE INDEX "comments_timeline" ON "comments"("org_id", "task_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "comments_live_count" ON "comments"("org_id", "task_id") WHERE (deleted_at IS NULL);

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_org_id_project_id_fkey" FOREIGN KEY ("org_id", "project_id") REFERENCES "projects"("org_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_org_id_task_id_fkey" FOREIGN KEY ("org_id", "task_id") REFERENCES "tasks"("org_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_org_id_actor_id_fkey" FOREIGN KEY ("org_id", "actor_id") REFERENCES "org_memberships"("org_id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "org_join_requests" ADD CONSTRAINT "org_join_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "org_join_requests" ADD CONSTRAINT "org_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "org_join_requests" ADD CONSTRAINT "org_join_requests_org_id_decided_by_fkey" FOREIGN KEY ("org_id", "decided_by") REFERENCES "org_memberships"("org_id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "org_template_statuses" ADD CONSTRAINT "org_template_statuses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_created_by_fkey" FOREIGN KEY ("org_id", "created_by") REFERENCES "org_memberships"("org_id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_id_default_status_id_fkey" FOREIGN KEY ("org_id", "id", "default_status_id") REFERENCES "project_statuses"("org_id", "project_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_statuses" ADD CONSTRAINT "project_statuses_org_id_project_id_fkey" FOREIGN KEY ("org_id", "project_id") REFERENCES "projects"("org_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_statuses" ADD CONSTRAINT "project_statuses_org_id_template_status_id_fkey" FOREIGN KEY ("org_id", "template_status_id") REFERENCES "org_template_statuses"("org_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_project_id_fkey" FOREIGN KEY ("org_id", "project_id") REFERENCES "projects"("org_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_project_id_status_id_fkey" FOREIGN KEY ("org_id", "project_id", "status_id") REFERENCES "project_statuses"("org_id", "project_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_assignee_id_fkey" FOREIGN KEY ("org_id", "assignee_id") REFERENCES "org_memberships"("org_id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_created_by_fkey" FOREIGN KEY ("org_id", "created_by") REFERENCES "org_memberships"("org_id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_org_id_task_id_fkey" FOREIGN KEY ("org_id", "task_id") REFERENCES "tasks"("org_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_org_id_label_id_fkey" FOREIGN KEY ("org_id", "label_id") REFERENCES "labels"("org_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_task_id_fkey" FOREIGN KEY ("org_id", "task_id") REFERENCES "tasks"("org_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_author_id_fkey" FOREIGN KEY ("org_id", "author_id") REFERENCES "org_memberships"("org_id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_deleted_by_fkey" FOREIGN KEY ("org_id", "deleted_by") REFERENCES "org_memberships"("org_id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
