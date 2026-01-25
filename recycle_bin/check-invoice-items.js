/**
 * Diagnostic script to check invoice items sync status
 *
 * Usage: node check-invoice-items.js
 */

const { Client } = require('pg');

const db = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function checkInvoiceItems() {
  await db.connect();

  console.log('=== Invoice Items Sync Diagnostic ===\n');

  // Check 1: Count invoices by date range
  console.log('Checking invoices from 2026-01-01 to 2026-01-18...');
  const invoiceCountResult = await db.query(`
    SELECT COUNT(*) as count,
           MIN(invoice_date) as min_date,
           MAX(invoice_date) as max_date
    FROM invoice
    WHERE invoice_date >= '2026-01-01'
      AND invoice_date <= '2026-01-18'
  `);

  console.log(`Total invoices in range: ${invoiceCountResult.rows[0].count}`);
  console.log(`Date range: ${invoiceCountResult.rows[0].min_date} to ${invoiceCountResult.rows[0].max_date}\n`);

  // Check 2: Count invoices with items vs without items
  const itemsStatusResult = await db.query(`
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

  console.log('Invoice Items Status:');
  console.log(`  - Invoices WITH items: ${itemsStatusResult.rows[0].invoices_with_items}`);
  console.log(`  - Invoices WITHOUT items: ${itemsStatusResult.rows[0].invoices_without_items}`);
  console.log(`  - Total invoices: ${itemsStatusResult.rows[0].total_invoices}\n`);

  // Check 3: Show sample invoices without items
  const sampleWithoutItems = await db.query(`
    SELECT i.bubble_id, i.invoice_number, i.invoice_date, i.total_amount
    FROM invoice i
    LEFT JOIN invoice_new_item item ON item.invoice_id = i.bubble_id
    WHERE i.invoice_date >= '2026-01-01'
      AND i.invoice_date <= '2026-01-18'
      AND item.invoice_id IS NULL
    ORDER BY i.invoice_date DESC
    LIMIT 10
  `);

  if (sampleWithoutItems.rows.length > 0) {
    console.log('Sample invoices WITHOUT items (first 10):');
    sampleWithoutItems.rows.forEach((inv, idx) => {
      console.log(`  ${idx + 1}. Bubble ID: ${inv.bubble_id}`);
      console.log(`     Invoice #: ${inv.invoice_number || 'N/A'}`);
      console.log(`     Date: ${inv.invoice_date}`);
      console.log(`     Amount: ${inv.total_amount}`);
      console.log('');
    });
  }

  // Check 4: Show sample invoices WITH items
  const sampleWithItems = await db.query(`
    SELECT DISTINCT i.bubble_id, i.invoice_number, i.invoice_date,
           COUNT(item.id) as item_count
    FROM invoice i
    INNER JOIN invoice_new_item item ON item.invoice_id = i.bubble_id
    WHERE i.invoice_date >= '2026-01-01'
      AND i.invoice_date <= '2026-01-18'
    GROUP BY i.bubble_id, i.invoice_number, i.invoice_date
    ORDER BY i.invoice_date DESC
    LIMIT 10
  `);

  if (sampleWithItems.rows.length > 0) {
    console.log('Sample invoices WITH items (first 10):');
    sampleWithItems.rows.forEach((inv, idx) => {
      console.log(`  ${idx + 1}. Bubble ID: ${inv.bubble_id}`);
      console.log(`     Invoice #: ${inv.invoice_number || 'N/A'}`);
      console.log(`     Date: ${inv.invoice_date}`);
      console.log(`     Items: ${inv.item_count}`);
      console.log('');
    });
  }

  // Check 5: Look for potential data issues
  console.log('Checking for data quality issues...\n');

  // Check items with NULL invoice_id
  const nullItems = await db.query(`
    SELECT COUNT(*) as count
    FROM invoice_new_item
    WHERE invoice_id IS NULL
  `);
  console.log(`Items with NULL invoice_id: ${nullItems.rows[0].count}`);

  // Check items with orphaned invoice_id (no matching invoice)
  const orphanedItems = await db.query(`
    SELECT COUNT(*) as count
    FROM invoice_new_item item
    LEFT JOIN invoice inv ON inv.bubble_id = item.invoice_id
    WHERE inv.bubble_id IS NULL
  `);
  console.log(`Items with orphaned invoice_id (no matching invoice): ${orphanedItems.rows[0].count}`);

  // Check total items in database
  const totalItems = await db.query(`
    SELECT COUNT(*) as count
    FROM invoice_new_item
  `);
  console.log(`Total items in database: ${totalItems.rows[0].count}`);

  // Check items by created_at
  const recentItems = await db.query(`
    SELECT COUNT(*) as count,
           MIN(created_at) as oldest,
           MAX(created_at) as newest
    FROM invoice_new_item
    WHERE created_at >= '2026-01-01'
  `);
  console.log(`Items created since 2026-01-01: ${recentItems.rows[0].count}`);
  console.log(`  Date range: ${recentItems.rows[0].oldest} to ${recentItems.rows[0].newest}`);

  await db.end();
  console.log('\n✓ Diagnostic complete!');
}

checkInvoiceItems().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
