import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { schema } from '@/server/infra/schema';

// This module initializes the Neon PostgreSQL database client for serverless environments.

const connectionString = process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

if (!process.env.DATABASE_URL) {
  console.warn('[DB] DATABASE_URL environment variable is not set. Using fallback string for build-time evaluation.');
}

// Create a Neon HTTP client from the connection string.
const sql = neon(connectionString);

// Initialize Drizzle ORM with the Neon client and full schema.
export const orm = drizzle(sql, { schema });

// Export a no-op db shim so legacy migrate.ts import does not break during transition.
export const db = { exec: () => {} };
