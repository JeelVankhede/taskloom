-- Hand-written. Forced row-level security, policies, and column-level grants.
-- Policy rule: every tenant table has exactly one policy for app_user, the tenant policy.
-- app_owner is included so that definer functions and maintenance work under the same
-- fail-closed context: without app.org_id, the owner sees nothing either.

SET lock_timeout = '3s';

-- Forced row-level security on every table ----------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'refresh_tokens', 'organizations', 'organization_settings', 'org_memberships',
    'org_join_requests', 'org_template_statuses', 'projects', 'project_statuses', 'tasks',
    'labels', 'task_labels', 'comments', 'activity_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- Tenant policy ---------------------------------------------------------------
CREATE POLICY tenant ON organizations TO app_user, app_owner
  USING      (id = (SELECT app.current_org_id()))
  WITH CHECK (id = (SELECT app.current_org_id()));

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organization_settings', 'org_memberships', 'org_join_requests', 'org_template_statuses',
    'projects', 'project_statuses', 'tasks', 'labels', 'task_labels', 'comments', 'activity_events'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY tenant ON %I TO app_user, app_owner '
      'USING (org_id = (SELECT app.current_org_id())) '
      'WITH CHECK (org_id = (SELECT app.current_org_id()))', t);
  END LOOP;
END
$$;

-- users: the API role sees itself and members of the current org (any status) -----
CREATE POLICY self ON users FOR ALL TO app_user
  USING      (id = (SELECT app.current_user_id()))
  WITH CHECK (id = (SELECT app.current_user_id()));

CREATE POLICY org_peer_read ON users FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM org_memberships m
                 WHERE m.org_id = (SELECT app.current_org_id()) AND m.user_id = users.id));

-- users and refresh tokens: the identity role -----------------------------------
CREATE POLICY identity ON users FOR ALL TO app_identity USING (true) WITH CHECK (true);
CREATE POLICY identity ON refresh_tokens FOR ALL TO app_identity USING (true) WITH CHECK (true);

-- Org switcher: only the caller's memberships and those orgs ---------------------
CREATE POLICY membership_reader ON org_memberships FOR SELECT TO app_membership_reader
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY membership_reader ON organizations FOR SELECT TO app_membership_reader
  USING (EXISTS (SELECT 1 FROM org_memberships m
                 WHERE m.org_id = organizations.id
                   AND m.user_id = (SELECT app.current_user_id())));

-- Join requests: the caller's own requests; any org by slug (id, slug, name only) --
CREATE POLICY own_requests ON org_join_requests FOR ALL TO app_join
  USING      (user_id = (SELECT app.current_user_id()))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND status IN ('pending', 'canceled'));

CREATE POLICY join_lookup ON organizations FOR SELECT TO app_join USING (true);

CREATE POLICY own_memberships ON org_memberships FOR SELECT TO app_join
  USING (user_id = (SELECT app.current_user_id()));

-- Grants: app_user ----------------------------------------------------------------
-- Omitted on purpose: projects.key (never changes, T28), tasks.number, is_closed, and
-- closed_at (derived, T2), counters and rank epoch (definer triggers only), and any
-- UPDATE or DELETE on history (append-only, T10).
GRANT SELECT ON organizations, organization_settings, org_memberships, org_join_requests,
  org_template_statuses, projects, project_statuses, tasks, labels, task_labels, comments,
  activity_events TO app_user;

GRANT UPDATE (name) ON organizations TO app_user;
GRANT UPDATE (timezone, priority_labels) ON organization_settings TO app_user;
GRANT INSERT (org_id, user_id, role, status), UPDATE (role, status, deactivated_at) ON org_memberships TO app_user;
GRANT UPDATE (status, decided_at, decided_by) ON org_join_requests TO app_user;
GRANT INSERT (org_id, name, closed_kind, is_default, position),
      UPDATE (name, closed_kind, is_default, position) ON org_template_statuses TO app_user;
GRANT UPDATE (name, description, state, archived_at, default_status_id) ON projects TO app_user;
GRANT INSERT (org_id, project_id, template_status_id, name, closed_kind, position),
      UPDATE (name, closed_kind, position, archived_at) ON project_statuses TO app_user;
GRANT INSERT (org_id, project_id, number, title, description, status_id, priority, assignee_id, due_date, rank, created_by),
      UPDATE (title, description, status_id, priority, assignee_id, due_date, rank, archived_at) ON tasks TO app_user;
GRANT INSERT (org_id, name, color), UPDATE (name, color, archived_at) ON labels TO app_user;
GRANT INSERT (org_id, task_id, label_id), DELETE ON task_labels TO app_user;
GRANT INSERT (org_id, task_id, author_id, body), UPDATE (body, edited_at, deleted_at, deleted_by) ON comments TO app_user;
GRANT INSERT (org_id, project_id, task_id, type, actor_kind, actor_id, payload, schema_version) ON activity_events TO app_user;

-- password_hash and auth_subject are never readable by the API role (T17).
GRANT SELECT (id, email, display_name, created_at, updated_at), UPDATE (display_name) ON users TO app_user;

-- Grants: app_identity --------------------------------------------------------------
GRANT SELECT (id, auth_subject, email, password_hash, display_name, created_at, updated_at),
      INSERT (email, display_name, password_hash, auth_subject),
      UPDATE (email, display_name, password_hash) ON users TO app_identity;
GRANT SELECT, INSERT (user_id, family_id, token_hash, expires_at), UPDATE (revoked_at, replaced_by_id)
  ON refresh_tokens TO app_identity;

-- Grants: app_membership_reader -----------------------------------------------------
GRANT SELECT (id, slug, name) ON organizations TO app_membership_reader;
GRANT SELECT (org_id, user_id, role, status) ON org_memberships TO app_membership_reader;

-- Grants: app_join --------------------------------------------------------------------
GRANT SELECT (id, slug, name) ON organizations TO app_join;
GRANT SELECT (org_id, user_id, status) ON org_memberships TO app_join;
GRANT SELECT (org_id, id, user_id, status, created_at, decided_at), INSERT (org_id, user_id), UPDATE (status)
  ON org_join_requests TO app_join;
