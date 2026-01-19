/**
 * Check invoice.linked_invoice_item column (SOURCE OF TRUTH)
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function check() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // 1. Check column structure
    console.log('=== 1. INVOICE TABLE SCHEMA (linked_invoice_item column) ===');
    const columnResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'invoice'
        AND column_name LIKE '%item%'
      ORDER BY ordinal_position
    `);

    if (columnResult.rows.length === 0) {
      console.log('❌ NO linked_invoice_item column found in invoice table!\n');
    } else {
      columnResult.rows.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
      console.log('');
    }

    // 2. Check if linked_invoice_item column exists
    const hasLinkedItemsColumn = columnResult.rows.some(col => col.column_name === 'linked_invoice_item');

    if (!hasLinkedItemsColumn) {
      console.log('⚠️  Column linked_invoice_item does NOT exist in invoice table\n');
      console.log('Checking other possible column names...\n');

      // Check for any array columns that might contain items
      const arrayColumnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'invoice'
          AND data_type = 'ARRAY'
        ORDER BY column_name
      `);

      console.log('Array columns in invoice table:');
      arrayColumnsResult.rows.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type}`);
      });
      console.log('');

      return;
    }

    // 3. Count invoices with/without linked_invoice_item
    console.log('=== 2. INVOICES WITH linked_invoice_item (Jan 2026) ===');
    const countResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(linked_invoice_item) as with_items,
        COUNT(*) - COUNT(linked_invoice_item) as without_items
      FROM invoice
      WHERE invoice_date >= '2026-01-01'
        AND invoice_date <= '2026-01-18'
    `);

    console.log(`Total invoices: ${countResult.rows[0].total}`);
    console.log(`WITH linked_invoice_item: ${countResult.rows[0].with_items}`);
    console.log(`WITHOUT linked_invoice_item: ${countResult.rows[0].without_items}\n`);

    // 4. Sample invoices WITH linked_invoice_item
    console.log('=== 3. SAMPLE INVOICES WITH linked_invoice_item ===');
    const sampleWithResult = await client.query(`
      SELECT
        bubble_id,
        invoice_number,
        invoice_date,
        linked_invoice_item,
        array_length(linked_invoice_item, 1) as item_count
      FROM invoice
      WHERE invoice_date >= '2026-01-01'
        AND invoice_date <= '2026-01-18'
        AND linked_invoice_item IS NOT NULL
      ORDER BY invoice_date DESC
      LIMIT 5
    `);

    if (sampleWithResult.rows.length === 0) {
      console.log('  (No invoices with linked_invoice_item found)');
    } else {
      sampleWithResult.rows.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. Invoice #: ${inv.invoice_number}`);
        console.log(`     Bubble ID: ${inv.bubble_id}`);
        console.log(`     Date: ${inv.invoice_date}`);
        console.log(`     Item count: ${inv.item_count}`);
        console.log(`     linked_invoice_item array:`);
        if (inv.linked_invoice_item && Array.isArray(inv.linked_invoice_item)) {
          inv.linked_invoice_item.forEach((itemId, i) => {
            console.log(`       [${i}] ${itemId}`);
          });
        }
        console.log('');
      });
    }

    // 5. Sample invoices WITHOUT linked_invoice_item
    console.log('=== 4. SAMPLE INVOICES WITHOUT linked_invoice_item ===');
    const sampleWithoutResult = await client.query(`
      SELECT
        bubble_id,
        invoice_number,
        invoice_date,
        total_amount,
        status
      FROM invoice
      WHERE invoice_date >= '2026-01-01'
        AND invoice_date <= '2026-01-18'
        AND linked_invoice_item IS NULL
      ORDER BY invoice_date DESC
      LIMIT 5
    `);

    if (sampleWithoutResult.rows.length === 0) {
      console.log('  (All invoices have linked_invoice_item - no issues!)');
    } else {
      sampleWithoutResult.rows.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. Invoice #: ${inv.invoice_number || 'N/A'}`);
        console.log(`     Bubble ID: ${inv.bubble_id}`);
        console.log(`     Date: ${inv.invoice_date}`);
        console.log(`     Amount: ${inv.total_amount}`);
        console.log(`     Status: ${inv.status}`);
        console.log('');
      });
    }

    // 6. Check if items in invoice_item table match linked_invoice_item
    console.log('=== 5. VERIFY: DO linked_invoice_item IDs EXIST IN invoice_item TABLE? ===');
    const verificationResult = await client.query(`
      SELECT
        i.bubble_id,
        i.invoice_number,
        i.linked_invoice_item,
        COUNT(ii.bubble_id) as items_found
      FROM invoice i
      CROSS JOIN LATERAL unnest(i.linked_invoice_item) as item_id
      LEFT JOIN invoice_item ii ON ii.bubble_id = item_id
      WHERE i.invoice_date >= '2026-01-01'
        AND i.invoice_date <= '2026-01-18'
        AND i.linked_invoice_item IS NOT NULL
      GROUP BY i.bubble_id, i.invoice_number, i.linked_invoice_item
      ORDER BY i.invoice_date DESC
      LIMIT 5
    `);

    verificationResult.rows.forEach((inv, idx) => {
      console.log(`  ${idx + 1}. Invoice #: ${inv.invoice_number}`);
      console.log(`     linked_invoice_item has ${inv.linked_invoice_item.length} item IDs`);
      console.log(`     Found in invoice_item table: ${inv.items_found} items`);
      const matchRate = (inv.items_found / inv.linked_invoice_item.length * 100).toFixed(0);
      console.log(`     Match rate: ${matchRate}%`);
      console.log('');
    });

    // 7. DIAGNOSIS
    console.log('=== 6. DIAGNOSIS ===');
    const total = parseInt(countResult.rows[0].total);
    const withItems = parseInt(countResult.rows[0].with_items);
    const withoutItems = parseInt(countResult.rows[0].without_items);

    if (withItems === total) {
      console.log('✓ ALL invoices have linked_invoice_item populated!');
      console.log('  The data structure is correct.');
      console.log('  Issue must be in how the Sales Agent App queries the data.');
    } else if (withItems === 0) {
      console.log('❌ NONE of the invoices have linked_invoice_item!');
      console.log('  This is the ROOT CAUSE:');
      console.log('  → Sync is NOT populating invoice.linked_invoice_item');
      console.log('  → Or the column does not exist in schema');
    } else {
      console.log(`⚠️  PARTIAL: ${withItems}/${total} invoices have linked_invoice_item`);
      console.log(`  (${Math.round(withItems/total*100)}% complete)`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

check();
