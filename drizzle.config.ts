import { defineConfig } from 'drizzle-kit';

// Drizzle Kit configuration for PostgreSQL (Neon) schema and migrations.

export default defineConfig({
  schema: './src/server/entity',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
