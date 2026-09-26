-- Hand-written. New tasks get their rank from the insert trigger, like their number.
-- Rank is unique per project and columns share that key space, so the key must be before
-- the column's first live rank and unused anywhere in the project. It is generated after
-- the project counter lock, where creates in one project already serialize, so two
-- concurrent creates can never compute the same key.

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION app.next_top_rank(p_org uuid, p_project uuid, p_status uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  column_first text;
  candidate text;
  next_used text;
BEGIN
  SELECT min(t.rank) INTO column_first FROM tasks t
  WHERE t.org_id = p_org AND t.project_id = p_project AND t.status_id = p_status
    AND t.archived_at IS NULL;

  candidate := app.rank_between(NULL, column_first);

  -- Step between the candidate and the next key used in the project. That key is at most
  -- column_first, so the result always stays above nothing and below the column's first card.
  WHILE EXISTS (SELECT 1 FROM tasks t
                WHERE t.org_id = p_org AND t.project_id = p_project AND t.rank = candidate) LOOP
    SELECT min(t.rank) INTO next_used FROM tasks t
    WHERE t.org_id = p_org AND t.project_id = p_project AND t.rank > candidate;
    candidate := app.rank_between(candidate, next_used);
  END LOOP;

  RETURN candidate;
END
$$;

REVOKE ALL ON FUNCTION app.next_top_rank(uuid, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.tasks_before_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Task numbers and ranks are always generated here (T19). 0 and '' are the placeholders
  -- Prisma sends; any other value fails.
  IF NEW.number IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DERIVED_COLUMN_WRITE', DETAIL = 'tasks.number';
  END IF;
  IF NEW.rank IS DISTINCT FROM '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DERIVED_COLUMN_WRITE', DETAIL = 'tasks.rank';
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

  -- New tasks go to the top of their column (design reference section 6.2, rank rules).
  NEW.rank := app.next_top_rank(NEW.org_id, NEW.project_id, NEW.status_id);

  NEW.created_at := now();
  NEW.updated_at := NEW.created_at;
  RETURN NEW;
END
$$;
