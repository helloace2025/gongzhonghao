#!/bin/sh
set -e

cd /app/apps/server 2>/dev/null || cd "$(dirname "$0")"

# 默认把 SQLite 放到 /data，便于 Railway Volume 持久化
# 相对路径 file:../data/... 在容器重建后会丢，不要用于生产
if [ -z "$DATABASE_URL" ] || echo "$DATABASE_URL" | grep -q 'file:\.\./data'; then
  export DATABASE_URL="file:/data/wewe-rss.db"
fi

# 从 file:/path/to.db 解析目录并创建
DB_PATH=$(echo "$DATABASE_URL" | sed 's|^file:||')
DB_DIR=$(dirname "$DB_PATH")
mkdir -p "$DB_DIR"

echo "[bootstrap] cwd=$(pwd)"
echo "[bootstrap] DATABASE_URL=$DATABASE_URL"
echo "[bootstrap] data dir=$DB_DIR"
echo "[bootstrap] prisma migrate deploy..."

npx prisma migrate deploy --schema ./prisma/schema.prisma

echo "[bootstrap] starting node dist/main"
exec node dist/main
