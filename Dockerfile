# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Native module build dependencies (better-sqlite3, sharp)
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

# Create data directory for SQLite persistent storage
RUN mkdir -p /app/data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy initial seed database if it exists
COPY --from=builder /app/data ./data

EXPOSE 8082

CMD ["node", "server.js"]
