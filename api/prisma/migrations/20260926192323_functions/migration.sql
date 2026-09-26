-- Hand-written. Creation procedures, the definer functions that are the only
-- cross-tenant entry points, and rank generation.
-- Definer functions pin search_path. Each cross-tenant function is owned by a scoped role
-- that cannot log in, so its body runs under that role's policies only.

SET lock_timeout = '3s';

-- Replay-safe: Prisma's shadow replay drops only the public schema between passes, so
-- functions left over in schema app from a previous pass are dropped here, each as its
-- owning role. On a fresh database this finds nothing.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND pg_get_userbyid(p.proowner) <> current_user
  LOOP
    EXECUTE format('SET ROLE %I', f.owner);
    EXECUTE format('DROP FUNCTION %s', f.sig);
    RESET ROLE;
  END LOOP;
END
$$;

-- Organization creation (Built) ------------------------------------------------------
-- Runs org-less: sets its own tenant context, then creates the org, its settings, the
-- caller's owner membership, and the default status template in one transaction.
CREATE OR REPLACE FUNCTION app.create_organization(p_name text, p_slug text, p_timezone text DEFAULT 'UTC')
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_org uuid := uuidv7();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'UNAUTHENTICATED';
  END IF;
  IF app.current_org_id() IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'VALIDATION_FAILED', DETAIL = 'org-less operation';
  END IF;

  PERFORM set_config('app.org_id', v_org::text, true);

  BEGIN
    INSERT INTO organizations (id, slug, name) VALUES (v_org, p_slug, p_name);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORG_SLUG_TAKEN';
  END;

  INSERT INTO organization_settings (org_id, timezone) VALUES (v_org, coalesce(p_timezone, 'UTC'));
  INSERT INTO org_memberships (org_id, user_id, role, status) VALUES (v_org, v_user, 'owner', 'active');

  INSERT INTO org_template_statuses (org_id, name, closed_kind, is_default, position) VALUES
    (v_org, 'Backlog', NULL, false, 0),
    (v_org, 'Todo', NULL, true, 1),
    (v_org, 'In Progress', NULL, false, 2),
    (v_org, 'In Review', NULL, false, 3),
    (v_org, 'Done', 'completed', false, 4),
    (v_org, 'Canceled', 'canceled', false, 5);

  RETURN v_org;
END
$$;

-- Project creation (Built) -----------------------------------------------------------
-- Copies the org template into project statuses, with the template's default status as
-- the project default, and records project.created.
CREATE OR REPLACE FUNCTION app.create_project(p_name text, p_key text, p_description text DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_org uuid := app.current_org_id();
  v_project uuid := uuidv7();
  v_default uuid := uuidv7();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'UNAUTHENTICATED';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND', DETAIL = 'organization';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_template_statuses WHERE org_id = v_org AND is_default) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DEFAULT_STATUS_INVALID';
  END IF;

  BEGIN
    INSERT INTO projects (org_id, id, key, name, description, default_status_id, created_by)
    VALUES (v_org, v_project, p_key, p_name, p_description, v_default, v_user);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROJECT_KEY_TAKEN';
  END;

  INSERT INTO project_statuses (org_id, id, project_id, template_status_id, name, closed_kind, position)
  SELECT v_org, CASE WHEN t.is_default THEN v_default ELSE uuidv7() END, v_project,
         t.id, t.name, t.closed_kind, t.position
  FROM org_template_statuses t
  WHERE t.org_id = v_org;

  INSERT INTO activity_events (org_id, project_id, type, actor_kind, actor_id, payload)
  VALUES (v_org, v_project, 'project.created', 'user', v_user,
          jsonb_build_object('key', p_key, 'name', p_name));

  RETURN v_project;
END
$$;

-- Org switcher (Built): the caller's active memberships and those orgs ------------------
CREATE OR REPLACE FUNCTION app.viewer_memberships()
  RETURNS TABLE (org_id uuid, slug text, name text, role org_role)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT m.org_id, o.slug::text, o.name, m.role
  FROM org_memberships m
  JOIN organizations o ON o.id = m.org_id
  WHERE m.user_id = app.current_user_id() AND m.status = 'active'
  ORDER BY o.name, m.org_id
$$;

-- Join requests (Built): only the caller's own requests ---------------------------------
-- Replay-safe: Prisma's shadow replay drops only the public schema between passes.
DROP TYPE IF EXISTS app.viewer_join_request CASCADE;
CREATE TYPE app.viewer_join_request AS (
  id uuid, org_id uuid, org_slug text, org_name text,
  status join_request_status, created_at timestamptz, decided_at timestamptz
);

CREATE OR REPLACE FUNCTION app.viewer_join_requests() RETURNS SETOF app.viewer_join_request
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT r.id, r.org_id, o.slug::text, o.name, r.status, r.created_at, r.decided_at
  FROM org_join_requests r
  JOIN organizations o ON o.id = r.org_id
  WHERE r.user_id = app.current_user_id()
  ORDER BY r.created_at DESC, r.id DESC
$$;

CREATE OR REPLACE FUNCTION app.submit_join_request(p_slug text) RETURNS app.viewer_join_request
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_org record;
  v_request_id uuid;
  result app.viewer_join_request;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'UNAUTHENTICATED';
  END IF;

  SELECT o.id, o.slug::text AS slug, o.name INTO v_org FROM organizations o WHERE o.slug = p_slug::citext;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND', DETAIL = 'organization';
  END IF;

  IF EXISTS (SELECT 1 FROM org_memberships m
             WHERE m.org_id = v_org.id AND m.user_id = v_user AND m.status = 'active') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_MEMBER';
  END IF;

  BEGIN
    INSERT INTO org_join_requests (org_id, user_id) VALUES (v_org.id, v_user)
    RETURNING org_join_requests.id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'JOIN_REQUEST_PENDING';
  END;

  SELECT * INTO result FROM app.viewer_join_requests() r WHERE r.id = v_request_id;
  RETURN result;
END
$$;

CREATE OR REPLACE FUNCTION app.cancel_join_request(p_id uuid) RETURNS app.viewer_join_request
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  result app.viewer_join_request;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'UNAUTHENTICATED';
  END IF;

  UPDATE org_join_requests r SET status = 'canceled'
  WHERE r.id = p_id AND r.user_id = v_user AND r.status = 'pending';

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM org_join_requests r WHERE r.id = p_id AND r.user_id = v_user) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'JOIN_REQUEST_NOT_PENDING';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND', DETAIL = 'join request';
  END IF;

  SELECT * INTO result FROM app.viewer_join_requests() r WHERE r.id = p_id;
  RETURN result;
END
$$;

-- Member lookup (Built): exact email, id only (T33) -------------------------------------
CREATE OR REPLACE FUNCTION app.lookup_user_id_by_email(p_email text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT u.id FROM users u WHERE u.email = p_email::citext
$$;

-- Rank generation -------------------------------------------------------------------
-- Base-62 fractional keys compared with COLLATE "C" ('0' < '9' < 'A' < 'Z' < 'a' < 'z').
-- rank_midpoint returns a key strictly between a and b (b NULL means "no upper bound").
-- Keys never end in '0', so a key between any two distinct keys always exists.
-- Not STRICT: a NULL bound means open-ended.
CREATE OR REPLACE FUNCTION app.rank_midpoint(a text, b text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  n integer := 0;
  da integer;
  db integer;
BEGIN
  a := coalesce(a, '');
  IF b IS NOT NULL THEN
    WHILE n < length(b)
      AND coalesce(nullif(substr(a, n + 1, 1), ''), '0') = substr(b, n + 1, 1) LOOP
      n := n + 1;
    END LOOP;
    IF n > 0 THEN
      RETURN substr(b, 1, n) || app.rank_midpoint(substr(a, n + 1), substr(b, n + 1));
    END IF;
  END IF;

  da := CASE WHEN a = '' THEN 0 ELSE strpos(digits, substr(a, 1, 1)) - 1 END;
  db := CASE WHEN b IS NULL THEN 62 ELSE strpos(digits, substr(b, 1, 1)) - 1 END;

  IF db - da > 1 THEN
    RETURN substr(digits, round((da + db) / 2.0)::integer + 1, 1);
  ELSIF b IS NOT NULL AND length(b) > 1 THEN
    RETURN substr(b, 1, 1);
  ELSE
    RETURN substr(digits, da + 1, 1) || app.rank_midpoint(substr(a, 2), NULL);
  END IF;
END
$$;

-- A key strictly between lower and upper; NULL lower means "before everything",
-- NULL upper means "after everything".
CREATE OR REPLACE FUNCTION app.rank_between(p_lower text, p_upper text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
BEGIN
  IF p_lower IS NOT NULL AND p_upper IS NOT NULL AND (p_lower COLLATE "C") >= (p_upper COLLATE "C") THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RANK_CONFLICT';
  END IF;
  RETURN app.rank_midpoint(coalesce(p_lower, ''), p_upper);
END
$$;

-- New tasks go to the top of their column: a key before the column's first rank.
CREATE OR REPLACE FUNCTION app.task_rank_before(p_first_rank text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT app.rank_between(NULL, p_first_rank) $$;

-- Ownership and execute grants -------------------------------------------------------
GRANT CREATE ON SCHEMA app TO app_membership_reader, app_join, app_identity;
ALTER FUNCTION app.viewer_memberships() OWNER TO app_membership_reader;
ALTER FUNCTION app.viewer_join_requests() OWNER TO app_join;
ALTER FUNCTION app.submit_join_request(text) OWNER TO app_join;
ALTER FUNCTION app.cancel_join_request(uuid) OWNER TO app_join;
ALTER FUNCTION app.lookup_user_id_by_email(text) OWNER TO app_identity;
REVOKE CREATE ON SCHEMA app FROM app_membership_reader, app_join, app_identity;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_user_id(), app.current_org_id()
  TO app_user, app_identity, app_membership_reader, app_join;
GRANT EXECUTE ON FUNCTION
  app.create_organization(text, text, text), app.create_project(text, text, text),
  app.viewer_memberships(), app.viewer_join_requests(), app.submit_join_request(text),
  app.cancel_join_request(uuid), app.lookup_user_id_by_email(text),
  app.rank_midpoint(text, text), app.rank_between(text, text), app.task_rank_before(text)
  TO app_user;
-- submit_join_request and cancel_join_request call viewer_join_requests as their owner.
GRANT EXECUTE ON FUNCTION app.viewer_join_requests() TO app_join;
