import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invoices, invoice_new_items } from '@/db/schema';
import { eq, and, gte, lte, sql, isNull } from 'drizzle-orm';

export async function GET() {
  try {
    // Check 1: Count invoices by date range
    const invoiceCountResult = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
        min_date: sql<string>`MIN(invoice_date)::text`,
        max_date: sql<string>`MAX(invoice_date)::text`,
      })
      .from(invoices)
      .where(
        and(
          gte(invoices.invoice_date, new Date('2026-01-01')),
          lte(invoices.invoice_date, new Date('2026-01-18'))
        )
      );

    // Check 2: Count invoices with items vs without items
    const itemsStatusResult = await db.execute(sql`
      SELECT
        COUNT(CASE WHEN inv.id IS NOT NULL THEN 1 END) as invoices_with_items,
        COUNT(CASE WHEN inv.id IS NULL THEN 1 END) as invoices_without_items,
        COUNT(*) as total_invoices
      FROM (
        SELECT i.id, i.bubble_id, i.invoice_number, i.invoice_date
        FROM invoice i
        WHERE i.invoice_date >= '2026-01-01'
          AND i.invoice_date <= '2026-01-18'
      ) inv
      LEFT JOIN (
        SELECT DISTINCT invoice_id
        FROM invoice_new_item
      ) items ON items.invoice_id = inv.bubble_id
    `);

    // Check 3: Sample invoices without items
    const sampleWithoutItems = await db
      .select({
        bubble_id: invoices.bubble_id,
        invoice_number: invoices.invoice_number,
        invoice_date: invoices.invoice_date,
        total_amount: invoices.total_amount,
      })
      .from(invoices)
      .leftJoin(
        invoice_new_items,
        eq(invoice_new_items.invoice_id, invoices.bubble_id)
      )
      .where(
        and(
          gte(invoices.invoice_date, new Date('2026-01-01')),
          lte(invoices.invoice_date, new Date('2026-01-18')),
          isNull(invoice_new_items.invoice_id)
        )
      )
      .orderBy(sql`${invoices.invoice_date} DESC`)
      .limit(10);

    // Check 4: Sample invoices WITH items
    const sampleWithItems = await db.execute(sql`
      SELECT DISTINCT
        i.bubble_id,
        i.invoice_number,
        i.invoice_date::text,
        COUNT(item.id) as item_count
      FROM invoice i
      INNER JOIN invoice_new_item item ON item.invoice_id = i.bubble_id
      WHERE i.invoice_date >= '2026-01-01'
        AND i.invoice_date <= '2026-01-18'
      GROUP BY i.bubble_id, i.invoice_number, i.invoice_date
      ORDER BY i.invoice_date DESC
      LIMIT 10
    `);

    // Check 5: Data quality checks
    const nullItems = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(invoice_new_items)
      .where(isNull(invoice_new_items.invoice_id));

    const orphanedItems = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM invoice_new_item item
      LEFT JOIN invoice inv ON inv.bubble_id = item.invoice_id
      WHERE inv.bubble_id IS NULL
    `);

    const totalItems = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(invoice_new_items);

    const recentItems = await db.execute(sql`
      SELECT
        COUNT(*) as count,
        MIN(created_at)::text as oldest,
        MAX(created_at)::text as newest
      FROM invoice_new_item
      WHERE created_at >= '2026-01-01'
    `);

    return NextResponse.json({
      invoice_count: invoiceCountResult[0],
      items_status: itemsStatusResult.rows[0],
      sample_without_items: sampleWithoutItems,
      sample_with_items: sampleWithItems.rows,
      data_quality: {
        items_with_null_invoice_id: nullItems[0].count,
        orphaned_items: orphanedItems.rows[0].count,
        total_items: totalItems[0].count,
        items_since_2026_01_01: recentItems.rows[0],
      },
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
