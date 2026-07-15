#!/bin/sh
set -e

cd /app/apps/server 2>/dev/null || cd "$(dirname "$0")"

mkdir -p ./data

echo "[bootstrap] cwd=$(pwd)"
echo "[bootstrap] DATABASE_URL=${DATABASE_URL}"
echo "[bootstrap] prisma migrate deploy..."

npx prisma migrate deploy --schema ./prisma/schema.prisma

echo "[bootstrap] starting node dist/main"
exec node dist/main
