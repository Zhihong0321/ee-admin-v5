import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';

// Prevent multiple pools in development
const globalForDb = global as unknown as { pool: Pool | undefined };
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Railway must provide the Postgres connection string.');
}

const pool = globalForDb.pool ?? new Pool({
  connectionString,
  application_name: "ee-admin-v5",
  max: 10, // Limit connections for SME scale
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
