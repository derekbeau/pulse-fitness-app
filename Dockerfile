# ---------- Stage 1: Build ----------
FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

# Install dependencies first (layer cache)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
COPY turbo.json tsconfig*.json ./

# Clean incremental cache and build everything (shared → api + web)
RUN find . -name '*.tsbuildinfo' -delete && pnpm build

# Point shared package exports to compiled output for Node.js runtime
RUN cd packages/shared && \
    node -e "const p=require('./package.json'); \
    p.main='./dist/index.js'; \
    p.exports={'.':{'import':'./dist/index.js','types':'./dist/index.d.ts'}}; \
    require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"

# ---------- Stage 2: API runtime ----------
FROM node:22-slim AS api

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Copy built shared package.json (with dist exports)
COPY --from=build /app/packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile --prod --ignore-scripts && \
    cd apps/api && pnpm rebuild better-sqlite3

# Copy compiled code
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/packages/shared/dist packages/shared/dist

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]

# ---------- Stage 3: Frontend (nginx) ----------
FROM nginx:alpine AS web

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
