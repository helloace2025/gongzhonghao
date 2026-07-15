# Railway 友好单阶段构建（SQLite）
FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat python3 make g++

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

ENV PNPM_IGNORE_ENGINE=true \
    CI=true

# 先拷全部源码（含 prisma schema），避免 install 时 postinstall 生成失败
COPY . .

# 安装依赖时跳过 lifecycle，避免 schema 未就绪时 prisma generate 出错
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# 必须先生成 Prisma Client，再 nest build（否则 @prisma/client 无 Article/Feed 类型）
WORKDIR /app/apps/server
RUN pnpm exec prisma generate --schema ./prisma/schema.prisma

WORKDIR /app
RUN pnpm --filter web build
RUN pnpm --filter server build

WORKDIR /app/apps/server
RUN mkdir -p data && chmod +x docker-bootstrap.sh

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DATABASE_TYPE=sqlite \
    DATABASE_URL="file:../data/wewe-rss.db" \
    AUTH_CODE="" \
    MAX_REQUEST_PER_MINUTE=60 \
    SERVER_ORIGIN_URL=""

EXPOSE 4000

CMD ["sh", "docker-bootstrap.sh"]
