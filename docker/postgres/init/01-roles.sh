#!/bin/sh
# Bootstrap logins. Runs once, as the postgres superuser, on an empty data directory.
# Used by docker-compose and by the Testcontainers harness, so both start from the same state.
# The non-login roles (app_user, app_identity, app_membership_reader, app_join) are created by migrations.
set -eu

psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<SQL
CREATE ROLE app_owner LOGIN CREATEROLE NOSUPERUSER PASSWORD '${APP_OWNER_PASSWORD}';
CREATE ROLE app_runtime LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB PASSWORD '${APP_RUNTIME_PASSWORD}';
SQL
