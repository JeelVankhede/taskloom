-- Hand-written prelude. Runs as app_owner before the Prisma-generated tables.
-- Creates what Prisma cannot: extensions, schemas, roles, context functions, and the
-- range-partitioned history table (Prisma only adds its foreign keys afterwards).

SET lock_timeout = '3s';

CREATE EXTENSION IF NOT EXISTS citext;

-- Private schemas: app holds functions; history_parts holds history partitions
-- and is not modelled by Prisma, so the drift check (T13) never sees partitions.
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS history_parts;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON SCHEMA history_parts FROM PUBLIC;

-- Roles are cluster-wide, so creation is idempotent (the shadow database replays this).
-- app_runtime is created LOGIN by the docker init script; it is created NOLOGIN here only
-- when missing, so no secret ever lives in a migration.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['app_user', 'app_identity', 'app_membership_reader', 'app_join', 'app_runtime'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', r);
    END IF;
  END LOOP;
END
$$;

-- app_runtime holds no privileges of its own. It can only act by SET ROLE (T32).
GRANT app_user TO app_runtime WITH INHERIT FALSE, SET TRUE;
GRANT app_identity TO app_runtime WITH INHERIT FALSE, SET TRUE;

-- app_owner hands function ownership to the scoped roles, which needs SET on them.
GRANT app_membership_reader, app_join, app_identity TO app_owner WITH INHERIT FALSE, SET TRUE;

GRANT USAGE ON SCHEMA public, app TO app_user, app_identity, app_membership_reader, app_join;

-- Tenant context. Transaction-local (set_config(..., true)) and NULL without context,
-- so every tenant policy fails closed.
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;

REVOKE ALL ON FUNCTION app.current_user_id(), app.current_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_user_id(), app.current_org_id()
  TO app_user, app_identity, app_membership_reader, app_join;

-- History enums are created here because the partitioned table needs them before Prisma runs.
CREATE TYPE actor_kind AS ENUM ('user', 'system');

CREATE TYPE activity_type AS ENUM (
  'task.created', 'task.title_changed', 'task.description_changed', 'task.status_changed',
  'task.priority_changed', 'task.assignee_changed', 'task.due_date_changed',
  'task.labels_changed', 'task.archived', 'task.restored',
  'comment.edited', 'comment.deleted',
  'project.created', 'project.updated', 'project.archived', 'project.restored',
  'status.created', 'status.updated', 'status.closed_kind_changed', 'status.archived',
  'label.created', 'label.updated', 'label.archived',
  'member.added', 'member.join_request_rejected', 'member.role_changed',
  'member.deactivated', 'member.reactivated',
  'org.settings_changed', 'org.template_changed'
);

CREATE TABLE activity_events (
  org_id         uuid          NOT NULL,
  id             uuid          NOT NULL DEFAULT uuidv7(),
  created_at     timestamptz(6) NOT NULL DEFAULT now(),
  project_id     uuid,
  task_id        uuid,
  type           activity_type NOT NULL,
  actor_kind     actor_kind    NOT NULL,
  actor_id       uuid,
  payload        jsonb         NOT NULL,
  schema_version smallint      NOT NULL DEFAULT 1,
  CONSTRAINT activity_events_pkey PRIMARY KEY (org_id, id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX activity_by_task ON activity_events (org_id, task_id, created_at, id) WHERE (task_id IS NOT NULL);
CREATE INDEX activity_by_project ON activity_events (org_id, project_id, created_at, id) WHERE (project_id IS NOT NULL);
CREATE INDEX activity_by_org ON activity_events (org_id, created_at, id);

-- Creates missing monthly partitions from p_from's month through months_ahead months later,
-- plus the DEFAULT partition, which must stay empty. Idempotent. Months are UTC.
CREATE OR REPLACE FUNCTION app.ensure_activity_partitions(
  months_ahead integer DEFAULT 12,
  p_from timestamptz DEFAULT now()
) RETURNS integer
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $$
DECLARE
  first_month date := date_trunc('month', p_from AT TIME ZONE 'UTC')::date;
  m date;
  part text;
  created integer := 0;
BEGIN
  FOR i IN 0..months_ahead LOOP
    m := (first_month + make_interval(months => i))::date;
    part := format('activity_events_%s', to_char(m, 'YYYY_MM'));
    IF to_regclass(format('history_parts.%I', part)) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE history_parts.%I PARTITION OF public.activity_events FOR VALUES FROM (%L) TO (%L)',
        part, (m::timestamp AT TIME ZONE 'UTC'), ((m + interval '1 month')::timestamp AT TIME ZONE 'UTC'));
      created := created + 1;
    END IF;
  END LOOP;
  IF to_regclass('history_parts.activity_events_default') IS NULL THEN
    EXECUTE 'CREATE TABLE history_parts.activity_events_default PARTITION OF public.activity_events DEFAULT';
    created := created + 1;
  END IF;
  RETURN created;
END
$$;

REVOKE ALL ON FUNCTION app.ensure_activity_partitions(integer, timestamptz) FROM PUBLIC;

SELECT app.ensure_activity_partitions(12);
