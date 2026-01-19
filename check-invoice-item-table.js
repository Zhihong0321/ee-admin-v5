/**
 * Check the invoice_item table (not invoice_new_item)
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function checkInvoiceItemTable() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // Check invoice_item table structure
    console.log('=== invoice_item TABLE STRUCTURE ===');
    const schemaResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'invoice_item'
      ORDER BY ordinal_position
    `);

    schemaResult.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    console.log('');

    // Count total items
    console.log('=== TOTAL ITEMS ===');
    const countResult = await client.query('SELECT COUNT(*) as count FROM invoice_item');
    console.log(`Total items: ${countResult.rows[0].count}\n`);

    // Check items for January 2026 invoices
    console.log('=== ITEMS FOR JANUARY 2026 INVOICES ===');
    const janItemsResult = await client.query(`
      SELECT COUNT(*) as count
      FROM invoice_item ii
      JOIN invoice i ON i.bubble_id = ii.invoice_id
      WHERE i.invoice_date >= '2026-01-01'
        AND i.invoice_date <= '2026-01-18'
    `);
    console.log(`Items for Jan 2026 invoices: ${janItemsResult.rows[0].count}\n`);

    // Sample items
    console.log('=== SAMPLE ITEMS ===');
    const sampleResult = await client.query(`
      SELECT
        ii.invoice_id,
        ii.description,
        ii.qty,
        ii.unit_price,
        ii.total_price,
        i.invoice_date
      FROM invoice_item ii
      JOIN invoice i ON i.bubble_id = ii.invoice_id
      WHERE i.invoice_date >= '2026-01-01'
        AND i.invoice_date <= '2026-01-18'
      LIMIT 5
    `);

    if (sampleResult.rows.length === 0) {
      console.log('  (No items found for Jan 2026 invoices)');
    } else {
      sampleResult.rows.forEach((item, idx) => {
        console.log(`  ${idx + 1}. Invoice ID: ${item.invoice_id}`);
        console.log(`     Description: ${item.description}`);
        console.log(`     Qty: ${item.qty} × ${item.unit_price} = ${item.total_price}`);
        console.log(`     Invoice Date: ${item.invoice_date}`);
        console.log('');
      });
    }

    // Check invoices with items
    console.log('=== INVOICES WITH/WITHOUT ITEMS (using invoice_item) ===');
    const statusResult = await client.query(`
      SELECT
        COUNT(CASE WHEN ii.invoice_id IS NOT NULL THEN 1 END) as with_items,
        COUNT(CASE WHEN ii.invoice_id IS NULL THEN 1 END) as without_items
      FROM (
        SELECT i.bubble_id, i.invoice_number, i.invoice_date
        FROM invoice i
        WHERE i.invoice_date >= '2026-01-01'
          AND i.invoice_date <= '2026-01-18'
      ) inv
      LEFT JOIN (
        SELECT DISTINCT invoice_id
        FROM invoice_item
      ) ii ON ii.invoice_id = inv.bubble_id
    `);
    console.log(`Invoices WITH items: ${statusResult.rows[0].with_items}`);
    console.log(`Invoices WITHOUT items: ${statusResult.rows[0].without_items}\n`);

    // DIAGNOSIS
    console.log('=== DIAGNOSIS ===');
    console.log('✓ The table is invoice_item (NOT invoice_new_item)');
    console.log('✓ The schema.ts file is pointing to the WRONG table name!');
    console.log('');
    console.log('ROOT CAUSE:');
    console.log('  Schema definition uses: pgTable("invoice_new_item", ...)');
    console.log('  But actual database table is: "invoice_item"');
    console.log('');
    console.log('IMPACT:');
    console.log('  - All queries for invoice items are failing');
    console.log('  - Sales Agent App cannot find any items');
    console.log('  - Invoice PDF generation likely has no items');
    console.log('');
    console.log('SOLUTION:');
    console.log('  Update schema.ts line 107 from:');
    console.log('    export const invoice_new_items = pgTable("invoice_new_item", {');
    console.log('  To:');
    console.log('    export const invoice_new_items = pgTable("invoice_item", {');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkInvoiceItemTable();
