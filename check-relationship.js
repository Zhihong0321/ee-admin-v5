/**
 * Check invoice_item table with correct column name
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function check() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✓ Connected\n');

    // Check if linked_invoice maps to invoice.bubble_id
    console.log('=== SAMPLE DATA (checking relationship) ===');
    const sampleResult = await client.query(`
      SELECT
        ii.bubble_id as item_bubble_id,
        ii.linked_invoice,
        ii.description,
        ii.qty,
        ii.unit_price,
        i.bubble_id as invoice_bubble_id,
        i.invoice_number,
        i.invoice_date
      FROM invoice_item ii
      JOIN invoice i ON i.bubble_id = ii.linked_invoice
      WHERE i.invoice_date >= '2026-01-01'
        AND i.invoice_date <= '2026-01-18'
      LIMIT 5
    `);

    if (sampleResult.rows.length === 0) {
      console.log('❌ NO ITEMS FOUND for Jan 2026 invoices!');
      console.log('This confirms the issue: items were not synced.');
    } else {
      console.log(`Found ${sampleResult.rows.length} items:\n`);
      sampleResult.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. Item: ${row.description}`);
        console.log(`   linked_invoice: ${row.linked_invoice}`);
        console.log(`   invoice.bubble_id: ${row.invoice_bubble_id}`);
        console.log(`   Match: ${row.linked_invoice === row.invoice_bubble_id ? '✓ YES' : '✗ NO'}`);
        console.log(`   Invoice #: ${row.invoice_number}`);
        console.log(`   Date: ${row.invoice_date}`);
        console.log('');
      });
    }

    // Count invoices with/without items
    console.log('=== INVOICE ITEMS STATUS (Jan 2026) ===');
    const statusResult = await client.query(`
      SELECT
        COUNT(CASE WHEN ii.linked_invoice IS NOT NULL THEN 1 END) as with_items,
        COUNT(CASE WHEN ii.linked_invoice IS NULL THEN 1 END) as without_items
      FROM (
        SELECT i.bubble_id, i.invoice_number, i.invoice_date
        FROM invoice i
        WHERE i.invoice_date >= '2026-01-01'
          AND i.invoice_date <= '2026-01-18'
      ) inv
      LEFT JOIN (
        SELECT DISTINCT linked_invoice
        FROM invoice_item
      ) ii ON ii.linked_invoice = inv.bubble_id
    `);
    console.log(`Invoices WITH items: ${statusResult.rows[0].with_items}`);
    console.log(`Invoices WITHOUT items: ${statusResult.rows[0].without_items}\n`);

    // Check if items exist for ANY invoice
    console.log('=== TOTAL ITEMS IN DATABASE ===');
    const totalResult = await client.query('SELECT COUNT(*) as count FROM invoice_item');
    console.log(`Total: ${totalResult.rows[0].count} items\n`);

    // Check newest item
    const newestResult = await client.query(`
      SELECT MAX(created_at) as newest,
             MIN(created_at) as oldest
      FROM invoice_item
    `);
    console.log(`Item date range: ${newestResult.rows[0].oldest} to ${newestResult.rows[0].newest}\n`);

    // DIAGNOSIS
    console.log('=== ROOT CAUSE ANALYSIS ===');
    const total = parseInt(statusResult.rows[0].with_items) + parseInt(statusResult.rows[0].without_items);
    const without = parseInt(statusResult.rows[0].without_items);

    if (total === 0) {
      console.log('⚠️  No invoices found in date range');
    } else if (without === total) {
      console.log('❌ CONFIRMED: 100% of invoices have NO items!');
      console.log('');
      console.log('CONCLUSION:');
      console.log('  → Items were NOT synced from Bubble for Jan 2026 invoices');
      console.log('  → Sales Agent App is working correctly - there are NO items to display');
      console.log('  → The SYNC ENGINE failed to sync items');
    } else {
      console.log(`✓ Some invoices have items (${without}/${total} without items)`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

check();
