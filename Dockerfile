# Railway / 云平台友好的单阶段构建（SQLite）
FROM node:20-alpine

# 基础依赖（Prisma 等需要）
RUN apk add --no-cache openssl libc6-compat python3 make g++

WORKDIR /app

# 全局 pnpm，忽略 engines 检查
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
ENV PNPM_IGNORE_ENGINE=true \
    CI=true \
    NODE_ENV=development

# 拷贝 monorepo 描述文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

# 不使用 frozen-lockfile，避免 lock 与环境细微差异导致失败
RUN pnpm install --no-frozen-lockfile

# 拷贝源码
COPY . .

# 生产构建
ENV NODE_ENV=production
RUN pnpm --filter web build
RUN pnpm --filter server build
RUN cd apps/server && pnpm exec prisma generate

# 运行时
WORKDIR /app/apps/server
RUN mkdir -p data && chmod +x docker-bootstrap.sh

ENV HOST=0.0.0.0 \
    PORT=4000 \
    DATABASE_TYPE=sqlite \
    DATABASE_URL="file:../data/wewe-rss.db" \
    AUTH_CODE="" \
    MAX_REQUEST_PER_MINUTE=60 \
    SERVER_ORIGIN_URL=""

EXPOSE 4000

CMD ["sh", "docker-bootstrap.sh"]
