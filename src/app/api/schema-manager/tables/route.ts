import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/schema-manager/tables
 * Fetches all tables from the database schema
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeSystemTables = searchParams.get('includeSystemTables') === 'true';

    // Fetch all tables from information_schema
    let query = sql`
      SELECT
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `;

    if (!includeSystemTables) {
      query = sql`
        SELECT
          table_name,
          table_type
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name NOT LIKE 'pg_%'
          AND table_name NOT LIKE 'sql_%'
      `;
    }

    const result = await db.execute(query);

    return NextResponse.json({
      success: true,
      tables: result.rows.map((row: any) => ({
        name: row.table_name,
        type: row.table_type
      }))
    });
  } catch (error) {
    console.error('Failed to fetch tables:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error)
      },
      { status: 500 }
    );
  }
}
