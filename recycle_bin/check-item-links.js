/**
 * Check if 15,957 invoice items are properly linked to invoices
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function checkLinks() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // 1. Total items
    console.log('=== 1. TOTAL ITEMS ===');
    const totalResult = await client.query('SELECT COUNT(*) as count FROM invoice_item');
    const totalItems = parseInt(totalResult.rows[0].count);
    console.log(`Total items: ${totalItems}\n`);

    // 2. Items with NULL linked_invoice
    console.log('=== 2. ITEMS WITH NULL linked_invoice ===');
    const nullResult = await client.query(`
      SELECT COUNT(*) as count
      FROM invoice_item
      WHERE linked_invoice IS NULL
    `);
    const nullCount = parseInt(nullResult.rows[0].count);
    console.log(`Items with NULL linked_invoice: ${nullCount}`);
    console.log(`Percentage: ${((nullCount / totalItems) * 100).toFixed(2)}%\n`);

    // 3. Items with orphaned linked_invoice (no matching invoice)
    console.log('=== 3. ITEMS WITH ORPHANED linked_invoice ===');
    const orphanedResult = await client.query(`
      SELECT COUNT(*) as count
      FROM invoice_item ii
      LEFT JOIN invoice i ON i.bubble_id = ii.linked_invoice
      WHERE ii.linked_invoice IS NOT NULL
        AND i.bubble_id IS NULL
    `);
    const orphanedCount = parseInt(orphanedResult.rows[0].count);
    console.log(`Items with orphaned linked_invoice: ${orphanedCount}`);
    console.log(`Percentage: ${((orphanedCount / totalItems) * 100).toFixed(2)}%\n`);

    // 4. Items properly linked
    const linkedCount = totalItems - nullCount - orphanedCount;
    console.log('=== 4. ITEMS PROPERLY LINKED TO INVOICES ===');
    console.log(`Items with valid links: ${linkedCount}`);
    console.log(`Percentage: ${((linkedCount / totalItems) * 100).toFixed(2)}%\n`);

    // 5. Sample orphaned items
    if (orphanedCount > 0) {
      console.log('=== 5. SAMPLE ORPHANED ITEMS (first 10) ===');
      const orphanedSample = await client.query(`
        SELECT
          ii.bubble_id as item_bubble_id,
          ii.linked_invoice,
          ii.description,
          ii.qty,
          ii.unit_price,
          ii.created_at
        FROM invoice_item ii
        LEFT JOIN invoice i ON i.bubble_id = ii.linked_invoice
        WHERE ii.linked_invoice IS NOT NULL
          AND i.bubble_id IS NULL
        LIMIT 10
      `);

      orphanedSample.rows.forEach((item, idx) => {
        console.log(`  ${idx + 1}. Item: ${item.description}`);
        console.log(`     Item Bubble ID: ${item.item_bubble_id}`);
        console.log(`     linked_invoice: ${item.linked_invoice} (NOT FOUND!)`);
        console.log(`     Created: ${item.created_at}`);
        console.log('');
      });
    }

    // 6. Sample items with NULL linked_invoice
    if (nullCount > 0) {
      console.log('=== 6. SAMPLE ITEMS WITH NULL linked_invoice (first 10) ===');
      const nullSample = await client.query(`
        SELECT
          ii.bubble_id as item_bubble_id,
          ii.description,
          ii.qty,
          ii.unit_price,
          ii.created_at
        FROM invoice_item ii
        WHERE ii.linked_invoice IS NULL
        LIMIT 10
      `);

      nullSample.rows.forEach((item, idx) => {
        console.log(`  ${idx + 1}. Item: ${item.description}`);
        console.log(`     Item Bubble ID: ${item.item_bubble_id}`);
        console.log(`     linked_invoice: NULL`);
        console.log(`     Created: ${item.created_at}`);
        console.log('');
      });
    }

    // 7. Sample properly linked items
    console.log('=== 7. SAMPLE PROPERLY LINKED ITEMS ===');
    const linkedSample = await client.query(`
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
      INNER JOIN invoice i ON i.bubble_id = ii.linked_invoice
      ORDER BY ii.created_at DESC
      LIMIT 5
    `);

    linkedSample.rows.forEach((item, idx) => {
      console.log(`  ${idx + 1}. Item: ${item.description}`);
      console.log(`     linked_invoice: ${item.linked_invoice}`);
      console.log(`     Matches invoice.bubble_id: ${item.invoice_bubble_id}`);
      console.log(`     Invoice #: ${item.invoice_number}`);
      console.log(`     Invoice Date: ${item.invoice_date}`);
      console.log('');
    });

    // 8. FINAL DIAGNOSIS
    console.log('=== 8. FINAL DIAGNOSIS ===');
    console.log(`Total items: ${totalItems}`);
    console.log(`  ✓ Properly linked: ${linkedCount} (${((linkedCount / totalItems) * 100).toFixed(1)}%)`);
    console.log(`  ✗ Orphaned: ${orphanedCount} (${((orphanedCount / totalItems) * 100).toFixed(1)}%)`);
    console.log(`  ✗ NULL: ${nullCount} (${((nullCount / totalItems) * 100).toFixed(1)}%)`);
    console.log('');

    if (linkedCount === totalItems) {
      console.log('✓✓✓ ALL 15,957 ITEMS ARE PROPERLY LINKED TO INVOICES!');
      console.log('');
      console.log('This confirms:');
      console.log('  1. The sync engine IS working correctly');
      console.log('  2. Items are being linked to invoices properly');
      console.log('  3. The issue is SOLELY in the query code (wrong table/column name)');
    } else {
      const problemPercentage = ((orphanedCount + nullCount) / totalItems * 100).toFixed(1);
      console.log(`⚠️  ${problemPercentage}% of items have linking issues`);
      console.log('');
      console.log('This could mean:');
      console.log('  1. Some items were created without invoice links');
      console.log('  2. Some invoices were deleted but items remain');
      console.log('  3. Sync has intermittent issues');
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkLinks();
