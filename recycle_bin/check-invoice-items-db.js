/**
 * READ-ONLY diagnostic script to check invoice items in database
 *
 * Usage: node check-invoice-items-db.js
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function checkInvoiceItems() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // 1. Check what invoice-related tables exist
    console.log('=== 1. CHECKING TABLES ===');
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name LIKE '%invoice%' OR table_name LIKE '%item%')
      ORDER BY table_name
    `);

    console.log('Tables found:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    console.log('');

    // 2. Check if invoice_new_item table exists
    const hasInvoiceItemTable = tablesResult.rows.some(row => row.table_name === 'invoice_new_item');

    if (!hasInvoiceItemTable) {
      console.log('❌ invoice_new_item table DOES NOT EXIST');
      console.log('This means invoice items were never synced or the table was never created.\n');
      return;
    }

    console.log('✓ invoice_new_item table exists\n');

    // 3. Count total items
    console.log('=== 2. TOTAL ITEMS IN DATABASE ===');
    const totalItemsResult = await client.query('SELECT COUNT(*) as count FROM invoice_new_item');
    console.log(`Total items: ${totalItemsResult.rows[0].count}\n`);

    // 4. Count invoices in date range
    console.log('=== 3. INVOICES IN DATE RANGE (2026-01-01 to 2026-01-18) ===');
    const invoiceCountResult = await client.query(`
      SELECT COUNT(*) as count,
             MIN(invoice_date) as min_date,
             MAX(invoice_date) as max_date
      FROM invoice
      WHERE invoice_date >= '2026-01-01'
        AND invoice_date <= '2026-01-18'
    `);
    console.log(`Total invoices: ${invoiceCountResult.rows[0].count}`);
    console.log(`Date range: ${invoiceCountResult.rows[0].min_date} to ${invoiceCountResult.rows[0].max_date}\n`);

    // 5. Count invoices WITH items vs WITHOUT items
    console.log('=== 4. INVOICES WITH/WITHOUT ITEMS ===');
    const itemsStatusResult = await client.query(`
      SELECT
        COUNT(CASE WHEN item.invoice_id IS NOT NULL THEN 1 END) as with_items,
        COUNT(CASE WHEN item.invoice_id IS NULL THEN 1 END) as without_items
      FROM (
        SELECT i.bubble_id, i.invoice_number, i.invoice_date
        FROM invoice i
        WHERE i.invoice_date >= '2026-01-01'
          AND i.invoice_date <= '2026-01-18'
      ) inv
      LEFT JOIN (
        SELECT DISTINCT invoice_id
        FROM invoice_new_item
      ) item ON item.invoice_id = inv.bubble_id
    `);
    console.log(`Invoices WITH items: ${itemsStatusResult.rows[0].with_items}`);
    console.log(`Invoices WITHOUT items: ${itemsStatusResult.rows[0].without_items}\n`);

    // 6. Sample invoices WITHOUT items
    console.log('=== 5. SAMPLE INVOICES WITHOUT ITEMS (first 5) ===');
    const withoutItemsSample = await client.query(`
      SELECT
        i.bubble_id,
        i.invoice_number,
        i.invoice_date,
        i.total_amount,
        i.status
      FROM invoice i
      LEFT JOIN invoice_new_item item ON item.invoice_id = i.bubble_id
      WHERE i.invoice_date >= '2026-01-01'
        AND i.invoice_date <= '2026-01-18'
        AND item.invoice_id IS NULL
      ORDER BY i.invoice_date DESC
      LIMIT 5
    `);

    if (withoutItemsSample.rows.length === 0) {
      console.log('  (All invoices have items - no issues found!)');
    } else {
      withoutItemsSample.rows.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. Bubble ID: ${inv.bubble_id}`);
        console.log(`     Invoice #: ${inv.invoice_number || 'N/A'}`);
        console.log(`     Date: ${inv.invoice_date}`);
        console.log(`     Amount: ${inv.total_amount}`);
        console.log(`     Status: ${inv.status}`);
        console.log('');
      });
    }

    // 7. Sample invoices WITH items (show item count)
    console.log('=== 6. SAMPLE INVOICES WITH ITEMS (first 5) ===');
    const withItemsSample = await client.query(`
      SELECT
        i.bubble_id,
        i.invoice_number,
        i.invoice_date,
        COUNT(item.id) as item_count
      FROM invoice i
      INNER JOIN invoice_new_item item ON item.invoice_id = i.bubble_id
      WHERE i.invoice_date >= '2026-01-01'
        AND i.invoice_date <= '2026-01-18'
      GROUP BY i.bubble_id, i.invoice_number, i.invoice_date
      ORDER BY i.invoice_date DESC
      LIMIT 5
    `);

    if (withItemsSample.rows.length === 0) {
      console.log('  (No invoices with items found)');
    } else {
      withItemsSample.rows.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. Bubble ID: ${inv.bubble_id}`);
        console.log(`     Invoice #: ${inv.invoice_number || 'N/A'}`);
        console.log(`     Date: ${inv.invoice_date}`);
        console.log(`     Items: ${inv.item_count}`);
        console.log('');
      });
    }

    // 8. Check for orphaned items
    console.log('=== 7. DATA QUALITY CHECKS ===');
    const orphanedItemsResult = await client.query(`
      SELECT COUNT(*) as count
      FROM invoice_new_item item
      LEFT JOIN invoice inv ON inv.bubble_id = item.invoice_id
      WHERE inv.bubble_id IS NULL
    `);
    console.log(`Orphaned items (no matching invoice): ${orphanedItemsResult.rows[0].count}`);

    const nullItemsResult = await client.query(`
      SELECT COUNT(*) as count
      FROM invoice_new_item
      WHERE invoice_id IS NULL
    `);
    console.log(`Items with NULL invoice_id: ${nullItemsResult.rows[0].count}\n`);

    // 9. Check item creation dates
    console.log('=== 8. ITEMS CREATED IN JANUARY 2026 ===');
    const recentItemsResult = await client.query(`
      SELECT COUNT(*) as count,
             MIN(created_at) as oldest,
             MAX(created_at) as newest
      FROM invoice_new_item
      WHERE created_at >= '2026-01-01'
        AND created_at <= '2026-01-18'
    `);
    console.log(`Items created in date range: ${recentItemsResult.rows[0].count}`);
    console.log(`  Oldest: ${recentItemsResult.rows[0].oldest}`);
    console.log(`  Newest: ${recentItemsResult.rows[0].newest}\n`);

    // 10. DIAGNOSIS
    console.log('=== 9. DIAGNOSIS ===');
    const totalInvoices = parseInt(invoiceCountResult.rows[0].count);
    const withoutItems = parseInt(itemsStatusResult.rows[0].without_items);
    const withItems = parseInt(itemsStatusResult.rows[0].with_items);

    if (totalInvoices === 0) {
      console.log('⚠️  No invoices found in the specified date range.');
      console.log('   The sync might not have run or the date range is incorrect.');
    } else if (withoutItems === totalInvoices) {
      console.log('❌ CRITICAL: NONE of the invoices have items!');
      console.log('   This means:');
      console.log('   1. Items were never synced from Bubble, OR');
      console.log('   2. The items table is empty, OR');
      console.log('   3. The sync logic failed to link items to invoices');
      console.log('');
      console.log('   → Sales Agent App is NOT broken - there are no items to display!');
    } else if (withoutItems > 0) {
      console.log(`⚠️  PARTIAL ISSUE: ${withoutItems} out of ${totalInvoices} invoices have no items`);
      console.log(`   (${Math.round(withoutItems / totalInvoices * 100)}% affected)`);
      console.log('   Possible causes:');
      console.log('   1. Some invoices genuinely have no items in Bubble');
      console.log('   2. Items failed to sync for certain invoices');
      console.log('   3. Invoice ID mismatch between Bubble and local DB');
    } else {
      console.log('✓ All invoices have items!');
      console.log('   If Sales Agent App shows no items, the issue is in the APP query logic.');
    }

    console.log('\n✓ Diagnostic complete!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkInvoiceItems();
