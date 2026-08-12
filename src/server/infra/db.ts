import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { schema } from '@/server/infra/schema';

// This module initializes the Neon PostgreSQL database client for serverless environments.

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required but not set.');
}

// Create a Neon HTTP client from the connection string.
const sql = neon(process.env.DATABASE_URL);

// Initialize Drizzle ORM with the Neon client and full schema.
export const orm = drizzle(sql, { schema });

// Export a no-op db shim so legacy migrate.ts import does not break during transition.
export const db = { exec: () => {} };
