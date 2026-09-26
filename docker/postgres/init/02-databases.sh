#!/bin/sh
# Creates the application database and the migrate dev shadow database, both owned by
# app_owner. Also run by scripts/db-reset-dev.sh after dropping them (local development only).
set -eu

for db in taskloom taskloom_shadow; do
  psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<SQL
CREATE DATABASE ${db} OWNER app_owner;
REVOKE ALL ON DATABASE ${db} FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE ${db} TO app_runtime;
SQL
  psql -v ON_ERROR_STOP=1 --username postgres --dbname "${db}" <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_runtime;
SQL
done
