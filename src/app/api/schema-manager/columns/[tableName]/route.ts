import { db } from '@/lib/db';
import { schema_descriptions } from '@/db/schema';
import { sql, eq, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/schema-manager/columns/[tableName]
 * Fetches all columns for a specific table along with their descriptions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableName: string }> }
) {
  try {
    const { tableName } = await params;

    // Fetch columns from information_schema
    const columnsQuery = sql`
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
      ORDER BY ordinal_position ASC
    `;

    const columnsResult = await db.execute(columnsQuery);

    // Fetch descriptions from schema_descriptions table (if it exists)
    let descriptionMap = new Map<string, string>();
    try {
      const descriptions = await db
        .select()
        .from(schema_descriptions)
        .where(eq(schema_descriptions.table_name, tableName));

      descriptionMap = new Map(
        descriptions.map((d) => [d.column_name, d.description])
      );
    } catch (descError) {
      // Table might not exist yet, that's okay - just continue with empty descriptions
      console.log('Schema descriptions table not yet available, continuing without descriptions');
    }

    // Combine column info with descriptions
    const columns = columnsResult.rows.map((col: any) => ({
      name: col.column_name,
      dataType: col.data_type,
      maxLength: col.character_maximum_length,
      nullable: col.is_nullable === 'YES',
      default: col.column_default,
      description: descriptionMap.get(col.column_name) || ''
    }));

    return NextResponse.json({
      success: true,
      tableName,
      columns
    });
  } catch (error) {
    console.error('Failed to fetch columns:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error)
      },
      { status: 500 }
    );
  }
}
