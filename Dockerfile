# Railway 友好单阶段构建（SQLite 数据目录固定 /data）
FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat python3 make g++

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

ENV PNPM_IGNORE_ENGINE=true \
    CI=true

COPY . .

RUN pnpm install --no-frozen-lockfile --ignore-scripts

WORKDIR /app/apps/server
RUN pnpm exec prisma generate --schema ./prisma/schema.prisma

WORKDIR /app
RUN pnpm --filter web build
RUN pnpm --filter server build

WORKDIR /app/apps/server
RUN chmod +x docker-bootstrap.sh \
  && mkdir -p /data

# 重要：在 Railway 面板 → Volumes → Add Volume → Mount path 填 /data
# 否则每次 redeploy 数据会丢失
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DATABASE_TYPE=sqlite \
    DATABASE_URL="file:/data/wewe-rss.db" \
    AUTH_CODE="" \
    MAX_REQUEST_PER_MINUTE=60 \
    SERVER_ORIGIN_URL=""

EXPOSE 4000

VOLUME ["/data"]

CMD ["sh", "docker-bootstrap.sh"]
