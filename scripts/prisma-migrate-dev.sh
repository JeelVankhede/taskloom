#!/bin/sh
# LOCAL DEVELOPMENT ONLY. Runs `prisma migrate dev` against a freshly created shadow database.
# Prisma cleans a configured shadow database by dropping only the public schema, but the
# migration chain also owns the app and history_parts schemas, so replays would collide.
# Usage: npm run migrate:dev -w @taskloom/api -- --create-only --name <name>
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS taskloom_shadow WITH (FORCE)" \
  -c "CREATE DATABASE taskloom_shadow OWNER app_owner"

cd "$root/api"
PRISMA_HIDE_UPDATE_MESSAGE=1 npx prisma migrate dev "$@"
