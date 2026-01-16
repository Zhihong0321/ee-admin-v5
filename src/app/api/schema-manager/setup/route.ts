import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/schema-manager/setup
 * Creates the schema_descriptions table if it doesn't exist
 */
export async function POST() {
  try {
    // Create the table using raw SQL
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS schema_descriptions (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL,
        column_name TEXT NOT NULL,
        description TEXT NOT NULL,
        data_type TEXT,
        is_nullable TEXT,
        column_default TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_by TEXT
      );
    `);

    // Create a unique index on table_name + column_name to prevent duplicates
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS schema_descriptions_table_column_idx
      ON schema_descriptions (table_name, column_name);
    `);

    return NextResponse.json({
      success: true,
      message: 'Schema descriptions table created successfully'
    });
  } catch (error) {
    console.error('Failed to create schema_descriptions table:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error)
      },
      { status: 500 }
    );
  }
}
