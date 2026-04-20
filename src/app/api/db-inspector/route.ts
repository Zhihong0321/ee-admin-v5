import { Pool } from 'pg';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Direct pool — bypasses Drizzle ORM so we see the REAL DB, not what schema.ts thinks
const pool = new Pool({
    connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
});

export async function GET(request: NextRequest) {
    const client = await pool.connect();
    try {
        const { searchParams } = new URL(request.url);
        const filterTable = searchParams.get('table');

        // 1. Get all tables
        const tablesResult = await client.query(`
      SELECT
        t.table_name,
        t.table_type,
        pg_stat_user_tables.n_live_tup AS row_estimate,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name))) AS total_size
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables ON pg_stat_user_tables.relname = t.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name ASC
    `);

        const tableNames = tablesResult.rows.map((r: any) => r.table_name);

        // 2. Get all columns for all tables (or filtered table)
        const colFilter = filterTable ? `AND c.table_name = $1` : '';
        const colParams = filterTable ? [filterTable] : [];

        const columnsResult = await client.query(`
      SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        c.ordinal_position,
        CASE WHEN c.data_type = 'ARRAY' THEN
          (SELECT e.data_type FROM information_schema.element_types e
           WHERE e.object_schema = c.table_schema
             AND e.object_name = c.table_name
             AND e.object_type = 'TABLE'
             AND e.collection_type_identifier = c.dtd_identifier)
        ELSE NULL END AS array_element_type
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      ${colFilter}
      ORDER BY c.table_name ASC, c.ordinal_position ASC
    `, colParams);

        // 3. Get primary keys
        const pkResult = await client.query(`
      SELECT
        kcu.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
    `);
        const pkSet = new Set(pkResult.rows.map((r: any) => `${r.table_name}.${r.column_name}`));

        // 4. Get foreign keys
        const fkResult = await client.query(`
      SELECT
        kcu.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `);
        const fkMap = new Map<string, { foreignTable: string; foreignColumn: string }>();
        fkResult.rows.forEach((r: any) => {
            fkMap.set(`${r.table_name}.${r.column_name}`, {
                foreignTable: r.foreign_table_name,
                foreignColumn: r.foreign_column_name,
            });
        });

        // 5. Get indexes
        const indexResult = await client.query(`
      SELECT
        t.relname AS table_name,
        i.relname AS index_name,
        a.attname AS column_name,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary
      FROM pg_index ix
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.relname, i.relname
    `);
        const indexMap = new Map<string, string[]>();
        indexResult.rows.forEach((r: any) => {
            const key = `${r.table_name}.${r.column_name}`;
            if (!indexMap.has(key)) indexMap.set(key, []);
            indexMap.get(key)!.push(r.index_name + (r.is_unique ? ' (unique)' : ''));
        });

        // 6. Build grouped structure
        const tableMap = new Map<string, any>();
        tablesResult.rows.forEach((t: any) => {
            tableMap.set(t.table_name, {
                tableName: t.table_name,
                tableType: t.table_type,
                rowEstimate: t.row_estimate,
                totalSize: t.total_size,
                columns: [],
            });
        });

        columnsResult.rows.forEach((col: any) => {
            const key = `${col.table_name}.${col.column_name}`;
            const colEntry = {
                name: col.column_name,
                dataType: col.data_type === 'ARRAY'
                    ? `${col.array_element_type || col.udt_name}[]`
                    : col.data_type,
                udtName: col.udt_name,
                maxLength: col.character_maximum_length,
                numericPrecision: col.numeric_precision,
                numericScale: col.numeric_scale,
                nullable: col.is_nullable === 'YES',
                default: col.column_default,
                ordinalPosition: col.ordinal_position,
                isPrimaryKey: pkSet.has(key),
                foreignKey: fkMap.get(key) || null,
                indexes: indexMap.get(key) || [],
            };
            if (tableMap.has(col.table_name)) {
                tableMap.get(col.table_name).columns.push(colEntry);
            }
        });

        const tables = Array.from(tableMap.values());

        return NextResponse.json({
            success: true,
            fetchedAt: new Date().toISOString(),
            totalTables: tables.length,
            tables,
        });
    } catch (error: any) {
        console.error('DB Inspector error:', error);
        return NextResponse.json(
            { success: false, error: String(error), stack: error?.stack },
            { status: 500 }
        );
    } finally {
        client.release();
    }
}
