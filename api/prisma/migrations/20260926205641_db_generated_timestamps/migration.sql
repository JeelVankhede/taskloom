-- AlterTable
ALTER TABLE "activity_events" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "comments" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "labels" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp(),
ALTER COLUMN "updated_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "org_join_requests" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "org_memberships" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp(),
ALTER COLUMN "updated_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "organization_settings" ALTER COLUMN "updated_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp(),
ALTER COLUMN "updated_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "project_statuses" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp(),
ALTER COLUMN "updated_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp(),
ALTER COLUMN "updated_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "task_labels" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp(),
ALTER COLUMN "updated_at" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT transaction_timestamp(),
ALTER COLUMN "updated_at" SET DEFAULT transaction_timestamp();
