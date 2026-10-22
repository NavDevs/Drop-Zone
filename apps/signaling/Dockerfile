# Multi-stage build for the DropZone signaling server.
#
# Build context is the monorepo root (see infra/docker-compose.yml and
# render.yaml), so paths below are relative to the repository root.

FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/protocol ./packages/protocol
COPY apps/signaling ./apps/signaling
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @dropzone/protocol build
RUN pnpm --filter web build
RUN pnpm --filter signaling build

# Produce a self-contained, production-only bundle.
RUN pnpm --filter signaling deploy --prod --legacy /out

# Copy the built web assets into the signaling deployment's public folder
RUN mkdir -p /out/public && cp -r apps/web/dist/* /out/public/


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /out ./

# Hosts (Render, Railway, Fly, docker-compose) inject PORT at runtime.
# Defaults to 3001 for plain `docker run`.
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/healthz" || exit 1

USER node

CMD ["node", "dist/server.js"]
