# Multi-stage build for DropZone Signaling Server
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/protocol ./packages/protocol
COPY apps/signaling ./apps/signaling

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @dropzone/protocol build
RUN pnpm --filter signaling build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/pnpm-lock.yaml /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/protocol ./packages/protocol
COPY --from=builder /app/apps/signaling/package.json ./apps/signaling/
COPY --from=builder /app/apps/signaling/dist ./apps/signaling/dist

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --prod --frozen-lockfile

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/healthz || exit 1

CMD ["node", "apps/signaling/dist/server.js"]
