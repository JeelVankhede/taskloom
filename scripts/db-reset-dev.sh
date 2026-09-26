#!/bin/sh
# LOCAL DEVELOPMENT ONLY. Drops and re-creates the Docker dev databases, then applies the
# migration chain. Prisma's own reset only drops the public schema, but the chain also owns
# the app and history_parts schemas, so a full database re-create is the only clean reset.
set -eu

cd "$(dirname "$0")/.."

docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS taskloom WITH (FORCE)" \
  -c "DROP DATABASE IF EXISTS taskloom_shadow WITH (FORCE)"
docker compose exec -T postgres sh /docker-entrypoint-initdb.d/02-databases.sh
npm run migrate
