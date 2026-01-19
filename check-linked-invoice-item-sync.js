const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
});

async function checkInvoiceItems() {
  const client = await pool.connect();

  try {
    console.log('=== Checking linked_invoice_item sync status ===\n');

    // 1. Check total invoices
    const totalResult = await client.query('SELECT COUNT(*) FROM invoice');
    console.log(`Total invoices in database: ${totalResult.rows[0].count}`);

    // 2. Check invoices with linked_invoice_item
    const withItemsResult = await client.query(`
      SELECT COUNT(*) as count
      FROM invoice
      WHERE linked_invoice_item IS NOT NULL
      AND array_length(linked_invoice_item, 1) > 0
    `);
    console.log(`Invoices with linked_invoice_item: ${withItemsResult.rows[0].count}`);

    // 3. Check recent invoices (last synced)
    const recentInvoices = await client.query(`
      SELECT
        bubble_id,
        invoice_number,
        linked_invoice_item,
        created_at,
        updated_at
      FROM invoice
      WHERE updated_at > NOW() - INTERVAL '1 day'
      ORDER BY updated_at DESC
      LIMIT 10
    `);

    console.log(`\n=== Recent invoices (last 24 hours) ===`);
    recentInvoices.rows.forEach(inv => {
      console.log(`Bubble ID: ${inv.bubble_id}`);
      console.log(`  Invoice Number: ${inv.invoice_number || 'N/A'}`);
      console.log(`  linked_invoice_item: ${inv.linked_invoice_item ? JSON.stringify(inv.linked_invoice_item) : 'NULL'}`);
      console.log(`  Updated: ${inv.updated_at}`);
      console.log('');
    });

    // 4. Check specific invoice from Jan 2026
    const janInvoices = await client.query(`
      SELECT
        bubble_id,
        invoice_number,
        linked_invoice_item,
        updated_at
      FROM invoice
      WHERE updated_at >= '2026-01-01'
      AND updated_at < '2026-02-01'
      LIMIT 5
    `);

    console.log(`=== Sample January 2026 invoices ===`);
    janInvoices.rows.forEach(inv => {
      const hasItems = inv.linked_invoice_item && inv.linked_invoice_item.length > 0;
      console.log(`${inv.invoice_number || inv.bubble_id}: ${hasItems ? '✓ HAS ITEMS' : '✗ NO ITEMS'}`);
      if (hasItems) {
        console.log(`  Items: ${inv.linked_invoice_item.length} items`);
      }
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkInvoiceItems();
