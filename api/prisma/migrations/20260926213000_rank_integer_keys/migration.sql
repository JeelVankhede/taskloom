-- Hand-written. Rank keys switch to fractional indexing with a length-prefixed integer part.
-- Found while seeding: the old keys grew about one character per six "top of column" creates
-- and passed the 128-character limit after ~770 creates in one column. With an integer part,
-- "before the first key" decrements the integer, so keys stay a few characters long
-- (20,000 top inserts: 4 characters). Rebalance stays Designed, for dense drag-and-drop moves.
--
-- Old keys cannot be read by the new functions. This migration refuses to run while any task
-- exists (Phase 5 decision); rebuild local databases with `npm run db:reset`.

SET lock_timeout = '3s';

-- Refuse if any task exists. app_owner is under forced row-level security and would count zero
-- rows, so the guard validates a CHECK (false) constraint: validation scans every row
-- regardless of row-level security.
DO $$
BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_empty_guard CHECK (false) NOT VALID;
  BEGIN
    ALTER TABLE tasks VALIDATE CONSTRAINT tasks_empty_guard;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Existing tasks use the old rank format; this migration runs only on a database without tasks',
      HINT = 'Rebuild local databases with npm run db:reset';
  END;
  ALTER TABLE tasks DROP CONSTRAINT tasks_empty_guard;
END
$$;

-- Fractional indexing with a length-prefixed integer part (after rocicorp/fractional-indexing),
-- base 62 in C collation order: 0-9 < A-Z < a-z.
-- A key is: head letter, integer digits (head a..z = 1..26 digits, A..Z = 26..1 digits), then an
-- optional fraction that never ends in '0'. The smallest integer 'A' || 26 zeros is reserved.

CREATE OR REPLACE FUNCTION app.rank_digits() RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'::text $$;

-- Number of characters in the integer part (head included), from its head letter; NULL if invalid.
CREATE OR REPLACE FUNCTION app.rank_integer_length(head text) RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN head COLLATE "C" BETWEEN 'a' AND 'z' THEN ascii(head) - ascii('a') + 2
    WHEN head COLLATE "C" BETWEEN 'A' AND 'Z' THEN ascii('Z') - ascii(head) + 2
  END
$$;

-- Midpoint of two fractions (a < b, b NULL = no upper bound). Never ends in '0'.
CREATE OR REPLACE FUNCTION app.rank_midpoint(a text, b text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  digits constant text := app.rank_digits();
  n integer := 0;
  da integer;
  db integer;
BEGIN
  a := coalesce(a, '');
  IF b IS NOT NULL THEN
    WHILE n < length(b) AND coalesce(nullif(substr(a, n + 1, 1), ''), '0') = substr(b, n + 1, 1) LOOP
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

-- The integer part of a key, or NULL when the key is malformed.
CREATE OR REPLACE FUNCTION app.rank_integer_part(k text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE WHEN app.rank_integer_length(left(k, 1)) <= length(k)
              THEN left(k, app.rank_integer_length(left(k, 1))) END
$$;

-- True for a well-formed key: valid head, full integer part, base-62 digits, no trailing '0' in
-- the fraction, not the reserved smallest integer, at most 128 characters.
CREATE OR REPLACE FUNCTION app.rank_is_valid(k text) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT k ~ '^[A-Za-z][0-9A-Za-z]*$' AND length(k) <= 128
     AND app.rank_integer_part(k) IS NOT NULL
     AND k <> ('A' || repeat('0', 26))
     AND right(substr(k, length(app.rank_integer_part(k)) + 1), 1) <> '0'
$$;

CREATE OR REPLACE FUNCTION app.rank_increment_integer(x text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  digits constant text := app.rank_digits();
  head text := left(x, 1);
  digs text := substr(x, 2);
  i integer := length(digs);
  d integer;
BEGIN
  WHILE i >= 1 LOOP
    d := strpos(digits, substr(digs, i, 1));      -- index + 1 of the next digit (0-based + 1)
    IF d = 62 THEN
      digs := overlay(digs placing '0' from i for 1);
      i := i - 1;
    ELSE
      RETURN head || overlay(digs placing substr(digits, d + 1, 1) from i for 1);
    END IF;
  END LOOP;
  -- Carried past the most significant digit: grow the integer.
  IF head = 'Z' THEN RETURN 'a0'; END IF;
  IF head = 'z' THEN RETURN NULL; END IF;
  head := chr(ascii(head) + 1);
  IF head COLLATE "C" > 'a' THEN digs := digs || '0'; ELSE digs := left(digs, length(digs) - 1); END IF;
  RETURN head || digs;
END
$$;

CREATE OR REPLACE FUNCTION app.rank_decrement_integer(x text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  digits constant text := app.rank_digits();
  head text := left(x, 1);
  digs text := substr(x, 2);
  i integer := length(digs);
  d integer;
BEGIN
  WHILE i >= 1 LOOP
    d := strpos(digits, substr(digs, i, 1)) - 1;  -- 0-based digit value
    IF d = 0 THEN
      digs := overlay(digs placing 'z' from i for 1);
      i := i - 1;
    ELSE
      RETURN head || overlay(digs placing substr(digits, d, 1) from i for 1);
    END IF;
  END LOOP;
  -- Borrowed past the most significant digit: shrink the integer.
  IF head = 'a' THEN RETURN 'Z' || 'z'; END IF;
  IF head = 'A' THEN RETURN NULL; END IF;
  head := chr(ascii(head) - 1);
  IF head COLLATE "C" < 'Z' THEN digs := digs || 'z'; ELSE digs := left(digs, length(digs) - 1); END IF;
  RETURN head || digs;
END
$$;

-- A key strictly between lower and upper (NULL = open-ended). RANK_CONFLICT on bad bounds.
CREATE OR REPLACE FUNCTION app.rank_between(p_lower text, p_upper text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  il text; fl text; iu text; fu text; next_int text;
BEGIN
  IF (p_lower IS NOT NULL AND NOT app.rank_is_valid(p_lower))
     OR (p_upper IS NOT NULL AND NOT app.rank_is_valid(p_upper))
     OR (p_lower IS NOT NULL AND p_upper IS NOT NULL AND (p_lower COLLATE "C") >= (p_upper COLLATE "C")) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RANK_CONFLICT';
  END IF;

  IF p_lower IS NULL AND p_upper IS NULL THEN
    RETURN 'a0';
  END IF;

  IF p_lower IS NULL THEN
    iu := app.rank_integer_part(p_upper);
    fu := substr(p_upper, length(iu) + 1);
    IF iu = 'A' || repeat('0', 26) THEN RETURN iu || app.rank_midpoint('', fu); END IF;
    IF (iu COLLATE "C") < (p_upper COLLATE "C") THEN RETURN iu; END IF;
    next_int := app.rank_decrement_integer(iu);
    IF next_int IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RANK_CONFLICT'; END IF;
    RETURN next_int;
  END IF;

  il := app.rank_integer_part(p_lower);
  fl := substr(p_lower, length(il) + 1);

  IF p_upper IS NULL THEN
    next_int := app.rank_increment_integer(il);
    RETURN CASE WHEN next_int IS NULL THEN il || app.rank_midpoint(fl, NULL) ELSE next_int END;
  END IF;

  iu := app.rank_integer_part(p_upper);
  fu := substr(p_upper, length(iu) + 1);
  IF il = iu THEN
    RETURN il || app.rank_midpoint(fl, fu);
  END IF;
  next_int := app.rank_increment_integer(il);
  IF next_int IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RANK_CONFLICT'; END IF;
  IF (next_int COLLATE "C") < (p_upper COLLATE "C") THEN RETURN next_int; END IF;
  RETURN il || app.rank_midpoint(fl, NULL);
END
$$;

ALTER TABLE tasks DROP CONSTRAINT tasks_rank_format;
ALTER TABLE tasks ADD CONSTRAINT tasks_rank_format CHECK (app.rank_is_valid(rank));

REVOKE ALL ON FUNCTION
  app.rank_digits(), app.rank_integer_length(text), app.rank_integer_part(text), app.rank_is_valid(text),
  app.rank_increment_integer(text), app.rank_decrement_integer(text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.rank_digits(), app.rank_integer_length(text), app.rank_integer_part(text), app.rank_is_valid(text),
  app.rank_increment_integer(text), app.rank_decrement_integer(text)
  TO app_user;

-- New tasks go to the top of their column with a key before the PROJECT's lowest rank. That key
-- is below the column's first card (top of column), unique in the project (rank is unique per
-- project), and made by decrementing the integer part, so it stays short (3,000 creates
-- interleaved across columns: 3 characters). Creates serialize on the project counter lock, so
-- two concurrent creates never compute the same key.
CREATE OR REPLACE FUNCTION app.next_top_rank(p_org uuid, p_project uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT app.rank_between(NULL, (SELECT min(t.rank) FROM tasks t WHERE t.org_id = p_org AND t.project_id = p_project))
$$;
REVOKE ALL ON FUNCTION app.next_top_rank(uuid, uuid) FROM PUBLIC;

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

  -- Top of the column (design reference 6.2, rank rules), after the counter lock.
  NEW.rank := app.next_top_rank(NEW.org_id, NEW.project_id);

  NEW.created_at := now();
  NEW.updated_at := NEW.created_at;
  RETURN NEW;
END
$$;

DROP FUNCTION IF EXISTS app.next_top_rank(uuid, uuid, uuid);
