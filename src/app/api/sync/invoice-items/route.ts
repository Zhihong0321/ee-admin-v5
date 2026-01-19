import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoices } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

/**
 * POST /api/sync/invoice-items
 * DEDICATED sync to populate invoice.linked_invoice_item from invoice_item table
 * This DOES NOT fetch from Bubble - it links existing data in Postgres!
 * Body: { dateFrom?: string, dateTo?: string } // filters by invoice.created_at
 */
export async function POST(request: NextRequest) {
  const logData: any[] = [];
  const startTime = Date.now();

  function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
    const entry = { time: new Date().toISOString(), message, type };
    logData.push(entry);
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { dateFrom, dateTo } = body;

    log("╔════════════════════════════════════════════════╗", 'info');
    log("║  DEDICATED INVOICE ITEM LINK SYNC             ║", 'info');
    log("║  Populates invoice.linked_invoice_item         ║", 'info');
    log("║  from existing invoice_item table records      ║", 'info');
    log("╚════════════════════════════════════════════════╝", 'info');

    if (dateFrom) {
      log(`Filter: invoices created ${dateFrom} to ${dateTo || 'present'}`, 'info');
    }

    // Step 1: Get all invoice_item bubble_ids grouped by linked_invoice
    log("Step 1: Querying invoice_item table...", 'info');

    let dateFilter = "";
    if (dateFrom) {
      dateFilter = `AND i.created_at >= '${dateFrom}'`;
      if (dateTo) {
        dateFilter += ` AND i.created_at <= '${dateTo}'`;
      }
    }

    const itemLinksResult = await db.execute(sql`
      WITH invoice_items AS (
        SELECT
          ii.bubble_id as item_bubble_id,
          ii.linked_invoice as invoice_bubble_id
        FROM invoice_item ii
        WHERE ii.linked_invoice IS NOT NULL
      ),
      invoices AS (
        SELECT
          i.bubble_id,
          i.id
        FROM invoice i
        WHERE 1=1 ${sql.raw(dateFilter)}
      )
      SELECT
        inv.invoice_bubble_id,
        ARRAY_AGG(inv.item_bubble_id) as item_bubble_ids
      FROM invoice_items inv
      INNER JOIN invoices i ON inv.invoice_bubble_id = i.bubble_id
      GROUP BY inv.invoice_bubble_id
    `);

    const itemLinks = itemLinksResult.rows;
    log(`Found ${itemLinks.length} invoices with items`, 'success');

    // Step 2: Update each invoice's linked_invoice_item array
    log("Step 2: Updating invoice.linked_invoice_item...", 'info');

    let updatedCount = 0;
    let totalItems = 0;

    for (const link of itemLinks) {
      const invoiceBubbleId = link.invoice_bubble_id as string;
      const itemBubbleIds = (link.item_bubble_ids as string[]) || [];

      await db.update(invoices)
        .set({
          linked_invoice_item: itemBubbleIds,
          updated_at: new Date()
        })
        .where(eq(invoices.bubble_id, invoiceBubbleId));

      updatedCount++;
      totalItems += itemBubbleIds.length;

      if (updatedCount % 500 === 0) {
        log(`Updated ${updatedCount} invoices...`, 'info');
      }
    }

    // Step 3: Clear linked_invoice_item for invoices that have NO items
    log("Step 3: Clearing items for invoices without items...", 'info');

    if (dateFrom) {
      await db.execute(sql`
        UPDATE invoice i
        SET linked_invoice_item = NULL,
            updated_at = NOW()
        WHERE i.linked_invoice_item IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM invoice_item ii
          WHERE ii.linked_invoice = i.bubble_id
        )
        AND i.created_at >= ${dateFrom}
        ${dateTo ? sql`AND i.created_at <= ${dateTo}` : sql``}
      `);
    } else {
      await db.execute(sql`
        UPDATE invoice i
        SET linked_invoice_item = NULL,
            updated_at = NOW()
        WHERE i.linked_invoice_item IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM invoice_item ii
          WHERE ii.linked_invoice = i.bubble_id
        )
      `);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    log("╔════════════════════════════════════════════════╗", 'success');
    log("║  ✓ SYNC COMPLETE!                             ║", 'success');
    log("╚════════════════════════════════════════════════╝", 'success');
    log(`Invoices updated: ${updatedCount}`, 'info');
    log(`Total item links: ${totalItems}`, 'info');
    log(`Avg items per invoice: ${(totalItems / updatedCount).toFixed(2)}`, 'info');
    log(`Duration: ${duration}s`, 'info');

    return NextResponse.json({
      success: true,
      results: {
        updatedCount,
        totalItems,
        avgItemsPerInvoice: (totalItems / updatedCount).toFixed(2),
        duration,
        logs: logData
      }
    });

  } catch (error: any) {
    log(`✗ ERROR: ${error.message}`, 'error');
    console.error(error);

    return NextResponse.json({
      success: false,
      error: error.message,
      logs: logData
    }, { status: 500 });
  }
}

// GET endpoint for info
export async function GET() {
  return NextResponse.json({
    status: "ready",
    endpoint: "/api/sync/invoice-items",
    method: "POST",
    description: "Populates invoice.linked_invoice_item from existing invoice_item table (NO Bubble fetch)"
  });
}
