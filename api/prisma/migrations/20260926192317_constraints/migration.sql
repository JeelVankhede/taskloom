-- Hand-written. Checks, collations, deferrable constraints, and expression indexes:
-- the parts of the data model Prisma cannot express. Limits follow the Phase 1 decisions
-- recorded in docs/implementation-plan.md and docs/design-reference.md section 3.

SET lock_timeout = '3s';

-- users ----------------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_email_format CHECK (char_length(email) <= 254 AND email::text ~ '^[^@\s]+@[^@\s]+$'),
  ADD CONSTRAINT users_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 80 AND btrim(display_name) <> ''),
  ADD CONSTRAINT users_has_credential CHECK (password_hash IS NOT NULL OR auth_subject IS NOT NULL);

-- organizations --------------------------------------------------------------
-- Slug: 3 to 6 characters, lowercase letters and digits, inner hyphens allowed.
ALTER TABLE organizations
  ADD CONSTRAINT organizations_slug_format CHECK (slug::text ~ '^[a-z0-9](?:[a-z0-9-]{1,4}[a-z0-9])$'),
  ADD CONSTRAINT organizations_slug_not_reserved CHECK (slug::text NOT IN (
    'admin', 'api', 'auth', 'app', 'o', 'signin', 'signup', 'onboarding', 'settings', 'www')),
  ADD CONSTRAINT organizations_name_length CHECK (char_length(name) BETWEEN 1 AND 80 AND btrim(name) <> '');

ALTER TABLE organization_settings
  ADD CONSTRAINT organization_settings_priority_labels CHECK (
    cardinality(priority_labels) = 4 AND array_position(priority_labels, NULL) IS NULL
    AND '' <> ALL (priority_labels));

-- memberships and join requests ----------------------------------------------
ALTER TABLE org_memberships
  ADD CONSTRAINT org_memberships_deactivated_at CHECK ((status = 'deactivated') = (deactivated_at IS NOT NULL));

ALTER TABLE org_join_requests
  ADD CONSTRAINT org_join_requests_decision CHECK (
    (status IN ('approved', 'rejected')) = (decided_at IS NOT NULL AND decided_by IS NOT NULL)
    AND (status IN ('approved', 'rejected') OR (decided_at IS NULL AND decided_by IS NULL)));

-- statuses -------------------------------------------------------------------
ALTER TABLE org_template_statuses
  ADD CONSTRAINT org_template_statuses_name_length CHECK (char_length(name) BETWEEN 1 AND 40 AND btrim(name) <> ''),
  ADD CONSTRAINT org_template_statuses_default_open CHECK (NOT is_default OR closed_kind IS NULL);

ALTER TABLE project_statuses
  ADD CONSTRAINT project_statuses_name_length CHECK (char_length(name) BETWEEN 1 AND 40 AND btrim(name) <> '');

CREATE UNIQUE INDEX org_template_statuses_name_unique ON org_template_statuses (org_id, lower(name));
CREATE UNIQUE INDEX project_statuses_live_name_unique ON project_statuses (org_id, project_id, lower(name))
  WHERE (archived_at IS NULL);

-- projects -------------------------------------------------------------------
-- Key: exactly 3 characters, a letter then letters or digits. Never updated (column grants).
ALTER TABLE projects
  ADD CONSTRAINT projects_key_format CHECK (key ~ '^[A-Z][A-Z0-9]{2}$'),
  ADD CONSTRAINT projects_name_length CHECK (char_length(name) BETWEEN 1 AND 80 AND btrim(name) <> ''),
  ADD CONSTRAINT projects_description_length CHECK (description IS NULL OR char_length(description) <= 2000),
  ADD CONSTRAINT projects_archived_state CHECK ((state = 'archived') = (archived_at IS NOT NULL)),
  ADD CONSTRAINT projects_counter_positive CHECK (next_task_number >= 1);

-- A project and its statuses are created in one transaction, so the default status
-- reference is checked at commit.
ALTER TABLE projects DROP CONSTRAINT projects_org_id_id_default_status_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_org_id_id_default_status_id_fkey
  FOREIGN KEY (org_id, id, default_status_id) REFERENCES project_statuses (org_id, project_id, id)
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- tasks ----------------------------------------------------------------------
ALTER TABLE tasks ALTER COLUMN rank TYPE text COLLATE "C";

ALTER TABLE tasks
  ADD CONSTRAINT tasks_title_length CHECK (char_length(title) BETWEEN 1 AND 200 AND btrim(title) <> ''),
  ADD CONSTRAINT tasks_description_length CHECK (description IS NULL OR char_length(description) <= 20000),
  ADD CONSTRAINT tasks_priority_range CHECK (priority IS NULL OR priority BETWEEN 1 AND 4),
  -- Base-62 digits, no trailing zero (so a key between any two keys always exists), 128 max.
  ADD CONSTRAINT tasks_rank_format CHECK (rank ~ '^[0-9A-Za-z]{1,128}$' AND right(rank, 1) <> '0'),
  ADD CONSTRAINT tasks_closed_at CHECK (closed_at IS NULL OR is_closed);

-- Rank is unique per project, deferrable so a rebalance can rewrite a project in one transaction.
DROP INDEX tasks_rank_unique;
ALTER TABLE tasks ADD CONSTRAINT tasks_rank_unique UNIQUE (org_id, project_id, rank)
  DEFERRABLE INITIALLY IMMEDIATE;

-- Priority order with no priority last. An expression index, so Prisma does not model it.
CREATE INDEX tasks_project_priority ON tasks (org_id, project_id, coalesce(priority, 5), id)
  WHERE (archived_at IS NULL);

-- labels ---------------------------------------------------------------------
-- The design system's ten label color tokens.
ALTER TABLE labels
  ADD CONSTRAINT labels_name_length CHECK (char_length(name) BETWEEN 1 AND 40 AND btrim(name) <> ''),
  ADD CONSTRAINT labels_color_token CHECK (color IN (
    'slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'));

CREATE UNIQUE INDEX labels_live_name_unique ON labels (org_id, lower(name)) WHERE (archived_at IS NULL);

-- comments -------------------------------------------------------------------
ALTER TABLE comments
  ADD CONSTRAINT comments_body_iff_live CHECK ((body IS NULL) = (deleted_at IS NOT NULL)),
  ADD CONSTRAINT comments_deleted_by CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
  ADD CONSTRAINT comments_body_length CHECK (body IS NULL OR (char_length(body) BETWEEN 1 AND 10000 AND btrim(body) <> ''));

-- history --------------------------------------------------------------------
-- The scope of an event matches its type prefix (design reference section 5.1).
ALTER TABLE activity_events
  ADD CONSTRAINT activity_events_scope CHECK (
    CASE split_part(type::text, '.', 1)
      WHEN 'task' THEN task_id IS NOT NULL AND project_id IS NOT NULL
      WHEN 'comment' THEN task_id IS NOT NULL AND project_id IS NOT NULL
      WHEN 'project' THEN project_id IS NOT NULL AND task_id IS NULL
      WHEN 'status' THEN project_id IS NOT NULL AND task_id IS NULL
      ELSE project_id IS NULL AND task_id IS NULL
    END),
  ADD CONSTRAINT activity_events_actor CHECK ((actor_kind = 'user') = (actor_id IS NOT NULL)),
  ADD CONSTRAINT activity_events_payload_object CHECK (jsonb_typeof(payload) = 'object');
