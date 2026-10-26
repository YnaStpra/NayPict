# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Native module build dependencies (sharp)
RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@11.6.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# Run stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8082

# Create non-root system group and user
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Create data directory for SQLite persistent storage and set ownership
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy initial seed database if it exists
COPY --from=builder /app/data ./data

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 8082

CMD ["node", "server.js"]
