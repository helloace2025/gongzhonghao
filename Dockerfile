# Railway 友好单阶段构建（SQLite + 持久卷 /data）
FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat python3 make g++

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

ENV PNPM_IGNORE_ENGINE=true \
    CI=true

# 先拷全部源码（含 prisma schema）
COPY . .

# 安装依赖时跳过 lifecycle
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# 先 prisma generate，再 build
WORKDIR /app/apps/server
RUN pnpm exec prisma generate --schema ./prisma/schema.prisma

WORKDIR /app
RUN pnpm --filter web build
RUN pnpm --filter server build

WORKDIR /app/apps/server
RUN chmod +x docker-bootstrap.sh

# 数据库写在 /data（请在 Railway 挂载 Volume 到 /data，否则 redeploy 会丢数据）
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DATABASE_TYPE=sqlite \
    DATABASE_URL="file:/data/wewe-rss.db" \
    AUTH_CODE="" \
    MAX_REQUEST_PER_MINUTE=60 \
    SERVER_ORIGIN_URL=""

EXPOSE 4000

# 声明数据目录（Railway Volume 挂载点）
VOLUME ["/data"]

CMD ["sh", "docker-bootstrap.sh"]
