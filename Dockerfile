# 简化版 Docker 构建：默认 SQLite，适配 Railway / Zeabur 等平台
FROM node:20.16.0-alpine

RUN apk add --no-cache openssl libc6-compat

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# 容器内没有 vscode，避免 engine-strict 导致 install 失败
ENV PNPM_IGNORE_ENGINE=true

RUN npm i -g pnpm@9.15.9

WORKDIR /usr/src/app

# 先拷依赖描述，利用层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY . .

# 构建前端（输出到 apps/server/client）+ 后端
RUN pnpm --filter web build && pnpm --filter server build

WORKDIR /usr/src/app/apps/server

# 生成 Prisma Client（当前 prisma 目录为 SQLite schema）
RUN pnpm exec prisma generate

RUN mkdir -p /usr/src/app/apps/server/data \
  && chmod +x ./docker-bootstrap.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
ENV DATABASE_TYPE=sqlite
ENV DATABASE_URL="file:../data/wewe-rss.db"
ENV AUTH_CODE=""
ENV MAX_REQUEST_PER_MINUTE=60
ENV SERVER_ORIGIN_URL=""

EXPOSE 4000

# 持久化目录：部署平台请挂载 /usr/src/app/apps/server/data
VOLUME ["/usr/src/app/apps/server/data"]

CMD ["./docker-bootstrap.sh"]
