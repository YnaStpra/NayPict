import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { schema } from '@/server/infra/schema';

// This module initializes the Neon PostgreSQL database client for serverless environments with connection pooling and fetch connection caching.

// Enable HTTP connection reuse across serverless function invocations to eliminate cold-start TCP/TLS handshake latency
neonConfig.poolQueryViaFetch = true;

const connectionString = process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

if (!process.env.DATABASE_URL) {
  console.warn('[DB] DATABASE_URL environment variable is not set. Using fallback string for build-time evaluation.');
}

// Create a Neon HTTP client with connection caching enabled for primary writes.
const sql = neon(connectionString);

// Read Replica Connection Partitioning: dedicated read connection pool for high-concurrency public queries.
const readConnectionString = process.env.DATABASE_READ_URL || connectionString;
const readSql = neon(readConnectionString);

// Initialize Drizzle ORM for primary (writes) and read-replica (public SELECTs).
export const orm = drizzle(sql, { schema });
export const readOrm = drizzle(readSql, { schema });

// Export a no-op db shim so legacy migrate.ts import does not break during transition.
export const db = { exec: () => {} };


