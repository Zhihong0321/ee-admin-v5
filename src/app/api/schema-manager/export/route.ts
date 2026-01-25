import { db } from '@/lib/db';
import { schema_descriptions } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/schema-manager/export
 * Exports the complete database schema with descriptions as JSON
 * Query params:
 *   - format: 'pretty' (default, formatted) or 'compact' (minified)
 *   - tables: comma-separated list of table names (optional, exports all if not specified)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'pretty';
    const tablesParam = searchParams.get('tables');
    const includeSystemTables = searchParams.get('includeSystemTables') === 'true';

    // Fetch all tables
    let tablesQuery = sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `;

    if (!includeSystemTables) {
      tablesQuery = sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name NOT LIKE 'pg_%'
          AND table_name NOT LIKE 'sql_%'
      `;
    }

    const tablesResult = await db.execute(tablesQuery);
    let tableNames = tablesResult.rows.map((row: any) => row.table_name);

    // Filter by specific tables if provided
    if (tablesParam) {
      const requestedTables = tablesParam.split(',').map((t) => t.trim());
      tableNames = tableNames.filter((name) => requestedTables.includes(name));
    }

    // Fetch all descriptions at once
    const allDescriptions = await db.select().from(schema_descriptions);

    // Build schema object
    const schema: any = {
      metadata: {
        exportedAt: new Date().toISOString(),
        database: 'PostgreSQL',
        totalTables: tableNames.length,
        format: 'AI-Agent-Friendly-Schema-v1'
      },
      tables: {}
    };

    // Fetch columns for each table
    for (const tableName of tableNames) {
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

      const columns = columnsResult.rows.map((col: any) => {
        // Find description for this column
        const descRecord = allDescriptions.find(
          (d) => d.table_name === tableName && d.column_name === col.column_name
        );

        return {
          name: col.column_name,
          dataType: col.data_type,
          maxLength: col.character_maximum_length,
          nullable: col.is_nullable === 'YES',
          default: col.column_default,
          description: descRecord?.description || '',
          hasDescription: !!descRecord?.description
        };
      });

      schema.tables[tableName] = {
        tableName,
        columnCount: columns.length,
        columns: columns.reduce((acc: any, col: any) => {
          acc[col.name] = {
            type: col.dataType,
            nullable: col.nullable,
            default: col.default,
            description: col.description,
            _hasDocumentation: col.hasDescription
          };
          return acc;
        }, {}),
        _rawColumns: columns
      };
    }

    // Calculate statistics
    const totalColumns = Object.values(schema.tables).reduce(
      (sum: number, table: any) => sum + table.columnCount,
      0
    );

    const documentedColumns = Object.values(schema.tables).reduce(
      (sum: number, table: any) =>
        sum + table._rawColumns.filter((c: any) => c.hasDescription).length,
      0
    );

    schema.metadata.totalColumns = totalColumns;
    schema.metadata.documentedColumns = documentedColumns;
    schema.metadata.documentationPercentage =
      totalColumns > 0 ? ((documentedColumns / totalColumns) * 100).toFixed(2) + '%' : '0%';

    // Format output
    const jsonString = format === 'compact'
      ? JSON.stringify(schema)
      : JSON.stringify(schema, null, 2);

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="schema-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Failed to export schema:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error)
      },
      { status: 500 }
    );
  }
}
