-- Hand-written. Triggers derive and guard; the API decides and records (1.2, principle 4).
-- Trigger functions are SECURITY DEFINER, owned by app_owner, so the API role needs no
-- privilege on derived columns or counters. They still run under the caller's tenant
-- context, because app_owner is subject to the same forced tenant policy.
-- Errors use SQLSTATE P0001 with the GraphQL error code as the message.

SET lock_timeout = '3s';

-- updated_at: set on user-visible edits only. TG_ARGV lists columns that do not count.
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $$
DECLARE
  ignored text[] := array_append(TG_ARGV::text[], 'updated_at');
BEGIN
  IF (to_jsonb(NEW) - ignored) IS DISTINCT FROM (to_jsonb(OLD) - ignored) THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER organizations_touch BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER organization_settings_touch BEFORE UPDATE ON organization_settings FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER org_memberships_touch BEFORE UPDATE ON org_memberships FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER projects_touch BEFORE UPDATE ON projects FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at('next_task_number', 'rank_epoch');
CREATE TRIGGER project_statuses_touch BEFORE UPDATE ON project_statuses FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER labels_touch BEFORE UPDATE ON labels FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Organization timezone must be a valid IANA name ------------------------------
CREATE OR REPLACE FUNCTION app.check_timezone() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'VALIDATION_FAILED', DETAIL = 'timezone';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER organization_settings_timezone BEFORE INSERT OR UPDATE OF timezone ON organization_settings
  FOR EACH ROW EXECUTE FUNCTION app.check_timezone();

-- Status is_closed always follows closed_kind (T14) ----------------------------
CREATE OR REPLACE FUNCTION app.derive_status_closed() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.is_closed := NEW.closed_kind IS NOT NULL;
  RETURN NEW;
END
$$;

CREATE TRIGGER org_template_statuses_derive BEFORE INSERT OR UPDATE ON org_template_statuses
  FOR EACH ROW EXECUTE FUNCTION app.derive_status_closed();
CREATE TRIGGER project_statuses_derive BEFORE INSERT OR UPDATE ON project_statuses
  FOR EACH ROW EXECUTE FUNCTION app.derive_status_closed();

-- A flip of closed_kind updates its tasks. closed_at is cleared either way: a flip to
-- closed has no real completion time, and a flip to open clears it (T3). Reopened tasks
-- pass the assignee guard, so a flip that skips the bulk reopen routine fails (T18).
CREATE OR REPLACE FUNCTION app.status_flip_tasks() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE tasks SET is_closed = NEW.is_closed, closed_at = NULL
  WHERE org_id = NEW.org_id AND project_id = NEW.project_id AND status_id = NEW.id
    AND is_closed IS DISTINCT FROM NEW.is_closed;
  RETURN NULL;
END
$$;

CREATE TRIGGER project_statuses_flip AFTER UPDATE OF closed_kind ON project_statuses
  FOR EACH ROW WHEN (OLD.closed_kind IS DISTINCT FROM NEW.closed_kind)
  EXECUTE FUNCTION app.status_flip_tasks();

-- Checked at commit: an archived status has no tasks, and a project's default status is
-- open and live (T7).
CREATE OR REPLACE FUNCTION app.assert_status_valid() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.org_id = NEW.org_id AND t.project_id = NEW.project_id AND t.status_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STATUS_IN_USE';
  END IF;
  IF (NEW.archived_at IS NOT NULL OR NEW.closed_kind IS NOT NULL) AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.org_id = NEW.org_id AND p.id = NEW.project_id AND p.default_status_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DEFAULT_STATUS_INVALID';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER project_statuses_valid AFTER UPDATE OF archived_at, closed_kind ON project_statuses
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.assert_status_valid();

CREATE OR REPLACE FUNCTION app.assert_default_status() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM project_statuses s
    WHERE s.org_id = NEW.org_id AND s.project_id = NEW.id AND s.id = NEW.default_status_id
      AND s.closed_kind IS NULL AND s.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DEFAULT_STATUS_INVALID';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER projects_default_status AFTER INSERT OR UPDATE OF default_status_id ON projects
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.assert_default_status();

-- A live org always has one active owner (T6) --------------------------------------
CREATE OR REPLACE FUNCTION app.assert_org_has_owner() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_memberships m
    WHERE m.org_id = OLD.org_id AND m.role = 'owner' AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LAST_OWNER';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER org_memberships_last_owner AFTER UPDATE OF role, status ON org_memberships
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.role = 'owner' AND OLD.status = 'active')
  EXECUTE FUNCTION app.assert_org_has_owner();

-- Archived labels cannot be applied. The shared lock closes the race with archive (T7, T10).
CREATE OR REPLACE FUNCTION app.guard_label_live() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  label_archived timestamptz;
BEGIN
  SELECT l.archived_at INTO label_archived FROM labels l
  WHERE l.org_id = NEW.org_id AND l.id = NEW.label_id
  FOR SHARE;
  IF FOUND AND label_archived IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LABEL_ARCHIVED';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER task_labels_guard BEFORE INSERT ON task_labels FOR EACH ROW EXECUTE FUNCTION app.guard_label_live();

-- Tasks ------------------------------------------------------------------------------
-- Reads the target status under a shared lock, which conflicts with an archive or flip of
-- that status, so a concurrent move can never land in a status that was just archived (T7).
CREATE OR REPLACE FUNCTION app.lock_live_status(p_org uuid, p_project uuid, p_status uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  s record;
BEGIN
  SELECT closed_kind, archived_at INTO s FROM project_statuses
  WHERE org_id = p_org AND project_id = p_project AND id = p_status
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STATUS_NOT_IN_PROJECT';
  END IF;
  IF s.archived_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STATUS_ARCHIVED';
  END IF;
  RETURN s.closed_kind IS NOT NULL;
END
$$;

-- An open, live task may only be assigned to an active member. The shared lock on the
-- membership row makes a concurrent deactivation wait, so deactivation always wins (T5).
CREATE OR REPLACE FUNCTION app.lock_active_assignee(p_org uuid, p_user uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  st membership_status;
BEGIN
  SELECT status INTO st FROM org_memberships
  WHERE org_id = p_org AND user_id = p_user
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNEE_NOT_MEMBER';
  END IF;
  IF st <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNEE_INACTIVE';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app.tasks_before_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Task numbers are always allocated here (T19). 0 is the placeholder Prisma sends.
  IF NEW.number IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DERIVED_COLUMN_WRITE', DETAIL = 'tasks.number';
  END IF;

  NEW.is_closed := app.lock_live_status(NEW.org_id, NEW.project_id, NEW.status_id);
  NEW.closed_at := CASE WHEN NEW.is_closed THEN now() END;

  IF NEW.assignee_id IS NOT NULL AND NOT NEW.is_closed AND NEW.archived_at IS NULL THEN
    PERFORM app.lock_active_assignee(NEW.org_id, NEW.assignee_id);
  END IF;

  -- Row lock on the project counter: creates in one project serialize here, nowhere else.
  UPDATE projects SET next_task_number = next_task_number + 1
  WHERE org_id = NEW.org_id AND id = NEW.project_id
  RETURNING next_task_number - 1 INTO NEW.number;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND', DETAIL = 'project';
  END IF;

  NEW.created_at := now();
  NEW.updated_at := NEW.created_at;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.tasks_before_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  moved boolean := NEW.status_id IS DISTINCT FROM OLD.status_id;
  restored boolean := OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL;
BEGIN
  IF NEW.number IS DISTINCT FROM OLD.number THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DERIVED_COLUMN_WRITE', DETAIL = 'tasks.number';
  END IF;

  IF moved OR restored THEN
    NEW.is_closed := app.lock_live_status(NEW.org_id, NEW.project_id, NEW.status_id);
    IF moved THEN
      -- Stamped on the task's own move into a closed status; kept on a move between
      -- closed statuses; cleared when the task becomes open (T2, T3).
      NEW.closed_at := CASE
        WHEN NOT NEW.is_closed THEN NULL
        WHEN OLD.is_closed THEN OLD.closed_at
        ELSE now()
      END;
    ELSE
      NEW.closed_at := CASE WHEN NEW.is_closed THEN OLD.closed_at END;
    END IF;
  END IF;
  IF NOT NEW.is_closed THEN
    NEW.closed_at := NULL;
  END IF;

  -- Guard every path that makes a task open, live, and assigned: reassign, reopen, restore.
  IF NEW.assignee_id IS NOT NULL AND NOT NEW.is_closed AND NEW.archived_at IS NULL
     AND (NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR OLD.is_closed OR OLD.archived_at IS NOT NULL) THEN
    PERFORM app.lock_active_assignee(NEW.org_id, NEW.assignee_id);
  END IF;

  -- Rank moves and status flips are not user-visible edits.
  IF ROW(NEW.title, NEW.description, NEW.status_id, NEW.priority, NEW.assignee_id, NEW.due_date, NEW.archived_at)
     IS DISTINCT FROM
     ROW(OLD.title, OLD.description, OLD.status_id, OLD.priority, OLD.assignee_id, OLD.due_date, OLD.archived_at) THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tasks_before_insert BEFORE INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION app.tasks_before_insert();
CREATE TRIGGER tasks_before_update BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION app.tasks_before_update();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_user_id(), app.current_org_id()
  TO app_user, app_identity, app_membership_reader, app_join;
