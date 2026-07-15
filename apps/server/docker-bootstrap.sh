#!/bin/sh
set -e

cd /usr/src/app/apps/server

# 确保数据目录存在（SQLite 文件写在这里）
mkdir -p ./data

echo "DATABASE_TYPE=${DATABASE_TYPE:-sqlite}"
echo "Running prisma migrate deploy..."

# 使用环境变量中的 DATABASE_URL 执行迁移
npx prisma migrate deploy --schema ./prisma/schema.prisma

echo "Starting server..."
exec node dist/main
