import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    // Check what tables exist in the database
    const tablesResult = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE '%invoice%'
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map((row: any) => row.table_name);

    let diagnostics: any = {
      tables_found: tables,
    };

    // Check if invoice_new_item table exists
    if (tables.includes('invoice_new_item')) {
      // Count total items
      const itemCount = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM invoice_new_item
      `);
      diagnostics.total_items = itemCount.rows[0].count;

      // Count items by invoice date (invoices from Jan 2026)
      const recentItems = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM invoice_new_item item
        JOIN invoice inv ON inv.bubble_id = item.invoice_id
        WHERE inv.invoice_date >= '2026-01-01'
          AND inv.invoice_date <= '2026-01-18'
      `);
      diagnostics.recent_items_count = recentItems.rows[0].count;

      // Sample invoices with items
      const sampleWithItems = await db.execute(sql`
        SELECT
          inv.bubble_id,
          inv.invoice_number,
          inv.invoice_date::text,
          COUNT(item.id) as item_count
        FROM invoice inv
        INNER JOIN invoice_new_item item ON item.invoice_id = inv.bubble_id
        WHERE inv.invoice_date >= '2026-01-01'
          AND inv.invoice_date <= '2026-01-18'
        GROUP BY inv.bubble_id, inv.invoice_number, inv.invoice_date
        ORDER BY inv.invoice_date DESC
        LIMIT 5
      `);
      diagnostics.sample_invoices_with_items = sampleWithItems.rows;

      // Sample invoices without items
      const sampleWithoutItems = await db.execute(sql`
        SELECT
          inv.bubble_id,
          inv.invoice_number,
          inv.invoice_date::text,
          inv.total_amount
        FROM invoice inv
        LEFT JOIN invoice_new_item item ON item.invoice_id = inv.bubble_id
        WHERE inv.invoice_date >= '2026-01-01'
          AND inv.invoice_date <= '2026-01-18'
          AND item.invoice_id IS NULL
        ORDER BY inv.invoice_date DESC
        LIMIT 5
      `);
      diagnostics.sample_invoices_without_items = sampleWithoutItems.rows;

      // Check for orphaned items
      const orphanedItems = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM invoice_new_item item
        LEFT JOIN invoice inv ON inv.bubble_id = item.invoice_id
        WHERE inv.bubble_id IS NULL
      `);
      diagnostics.orphaned_items = orphanedItems.rows[0].count;

    } else {
      diagnostics.error = 'invoice_new_item table does not exist';
      diagnostics.suggestion = 'The table may need to be created via migration';
    }

    // Check total invoices in date range
    const invoiceCount = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM invoice
      WHERE invoice_date >= '2026-01-01'
        AND invoice_date <= '2026-01-18'
    `);
    diagnostics.total_invoices_in_range = invoiceCount.rows[0].count;

    return NextResponse.json(diagnostics);
  } catch (error) {
    console.error('Diagnostic error:', error);
    return NextResponse.json(
      { error: String(error), details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
