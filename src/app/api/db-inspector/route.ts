import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
    try {
        // ── 1. Tables ──────────────────────────────────────────────────────────────
        const tablesResult = await db.execute(sql`
      SELECT
        t.table_name,
        t.table_type,
        COALESCE(s.n_live_tup, 0)::text AS row_estimate,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name))) AS total_size
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name ASC
    `);

        const tableRows = tablesResult.rows as any[];

        // ── 2. Columns ─────────────────────────────────────────────────────────────
        const columnsResult = await db.execute(sql`
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
        c.dtd_identifier,
        CASE WHEN c.data_type = 'ARRAY' THEN
          (SELECT e.data_type
           FROM information_schema.element_types e
           WHERE e.object_schema = c.table_schema
             AND e.object_name = c.table_name
             AND e.object_type = 'TABLE'
             AND e.collection_type_identifier = c.dtd_identifier)
        ELSE NULL END AS array_element_type
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      ORDER BY c.table_name ASC, c.ordinal_position ASC
    `);

        // ── 3. Primary Keys ────────────────────────────────────────────────────────
        const pkResult = await db.execute(sql`
      SELECT kcu.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
    `);
        const pkSet = new Set(
            (pkResult.rows as any[]).map((r) => `${r.table_name}.${r.column_name}`)
        );

        // ── 4. Foreign Keys ────────────────────────────────────────────────────────
        const fkResult = await db.execute(sql`
      SELECT
        kcu.table_name,
        kcu.column_name,
        ccu.table_name  AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `);
        const fkMap = new Map<string, { foreignTable: string; foreignColumn: string }>();
        (fkResult.rows as any[]).forEach((r) => {
            fkMap.set(`${r.table_name}.${r.column_name}`, {
                foreignTable: r.foreign_table_name,
                foreignColumn: r.foreign_column_name,
            });
        });

        // ── 5. Indexes ─────────────────────────────────────────────────────────────
        const indexResult = await db.execute(sql`
      SELECT
        t.relname  AS table_name,
        i.relname  AS index_name,
        a.attname  AS column_name,
        ix.indisunique  AS is_unique,
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
        (indexResult.rows as any[]).forEach((r) => {
            const key = `${r.table_name}.${r.column_name}`;
            if (!indexMap.has(key)) indexMap.set(key, []);
            indexMap.get(key)!.push(r.index_name + (r.is_unique ? ' (unique)' : ''));
        });

        // ── 6. Assemble ────────────────────────────────────────────────────────────
        const tableMap = new Map<string, any>();
        tableRows.forEach((t) => {
            tableMap.set(t.table_name, {
                tableName: t.table_name,
                tableType: t.table_type,
                rowEstimate: Number(t.row_estimate) || 0,
                totalSize: t.total_size ?? null,
                columns: [],
            });
        });

        (columnsResult.rows as any[]).forEach((col) => {
            const key = `${col.table_name}.${col.column_name}`;
            const entry = {
                name: col.column_name,
                dataType:
                    col.data_type === 'ARRAY'
                        ? `${col.array_element_type || col.udt_name}[]`
                        : col.data_type,
                udtName: col.udt_name,
                maxLength: col.character_maximum_length ?? null,
                numericPrecision: col.numeric_precision ?? null,
                numericScale: col.numeric_scale ?? null,
                nullable: col.is_nullable === 'YES',
                default: col.column_default ?? null,
                ordinalPosition: col.ordinal_position,
                isPrimaryKey: pkSet.has(key),
                foreignKey: fkMap.get(key) ?? null,
                indexes: indexMap.get(key) ?? [],
            };
            tableMap.get(col.table_name)?.columns.push(entry);
        });

        return NextResponse.json({
            success: true,
            fetchedAt: new Date().toISOString(),
            totalTables: tableMap.size,
            tables: Array.from(tableMap.values()),
        });
    } catch (error: any) {
        console.error('[db-inspector] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error?.message ?? String(error),
            },
            { status: 500 }
        );
    }
}
