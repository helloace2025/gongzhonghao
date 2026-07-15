#!/bin/sh
set -e

cd /app/apps/server 2>/dev/null || cd "$(dirname "$0")"

# ---------- SQLite 持久化路径 ----------
# Railway 挂载 Volume 后会注入 RAILWAY_VOLUME_MOUNT_PATH（例如 /data）
# 数据库必须写在卷上，redeploy 才不会丢数据
if [ -n "$RAILWAY_VOLUME_MOUNT_PATH" ]; then
  export DATABASE_URL="file:${RAILWAY_VOLUME_MOUNT_PATH%/}/wewe-rss.db"
  echo "[bootstrap] using Railway volume: $RAILWAY_VOLUME_MOUNT_PATH"
elif [ -z "$DATABASE_URL" ] || echo "$DATABASE_URL" | grep -Eq 'file:\.\./data|file:data/'; then
  # 默认绝对路径 /data（请把 Volume 挂到 /data）
  export DATABASE_URL="file:/data/wewe-rss.db"
fi

export DATABASE_TYPE="${DATABASE_TYPE:-sqlite}"

DB_PATH=$(echo "$DATABASE_URL" | sed 's|^file:||')
DB_DIR=$(dirname "$DB_PATH")
mkdir -p "$DB_DIR"

echo "[bootstrap] cwd=$(pwd)"
echo "[bootstrap] DATABASE_TYPE=$DATABASE_TYPE"
echo "[bootstrap] DATABASE_URL=$DATABASE_URL"
echo "[bootstrap] db file will be: $DB_PATH"

# 在 Railway 上若没挂卷，醒目告警（数据仍会随容器丢失）
if [ -n "$RAILWAY_ENVIRONMENT" ] && [ -z "$RAILWAY_VOLUME_MOUNT_PATH" ]; then
  echo "========================================================"
  echo "[bootstrap] WARNING: No Railway Volume detected!"
  echo "[bootstrap] Add Volume with mount path /data"
  echo "[bootstrap] otherwise ALL DATA is wiped on every deploy."
  echo "========================================================"
fi

if [ -f "$DB_PATH" ]; then
  echo "[bootstrap] existing database found ($(wc -c < "$DB_PATH") bytes)"
else
  echo "[bootstrap] no database file yet (will create on migrate)"
fi

echo "[bootstrap] prisma migrate deploy..."
npx prisma migrate deploy --schema ./prisma/schema.prisma

echo "[bootstrap] starting node dist/main"
exec node dist/main
