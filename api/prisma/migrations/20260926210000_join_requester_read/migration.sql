-- Hand-written. Owners and admins need to see who is asking to join (Phase 4, question 1).
-- A requester is not a member, so org_peer_read hides their user row. This policy makes a
-- user row visible to app_user only when that user has a join request in the current org
-- AND the caller is an active owner or admin there. Column grants still hide
-- password_hash and auth_subject.

SET lock_timeout = '3s';

CREATE POLICY join_requester_read ON users FOR SELECT TO app_user
  USING (
    EXISTS (SELECT 1 FROM org_join_requests r
            WHERE r.org_id = (SELECT app.current_org_id()) AND r.user_id = users.id)
    AND EXISTS (SELECT 1 FROM org_memberships m
                WHERE m.org_id = (SELECT app.current_org_id())
                  AND m.user_id = (SELECT app.current_user_id())
                  AND m.status = 'active' AND m.role IN ('owner', 'admin')));
