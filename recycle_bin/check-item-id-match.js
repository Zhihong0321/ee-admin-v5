/**
 * Check if item IDs from invoice.linked_invoice_item exist in invoice_item table
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function check() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✓ Connected\n');

    // 1. Sample linked_invoice_item IDs
    console.log('=== SAMPLE invoice.linked_invoice_item IDs ===');
    const sampleResult = await client.query(`
      SELECT
        bubble_id,
        invoice_number,
        linked_invoice_item
      FROM invoice
      WHERE invoice_date >= '2026-01-01'
        AND invoice_date <= '2026-01-18'
        AND linked_invoice_item IS NOT NULL
        AND array_length(linked_invoice_item, 1) > 0
      LIMIT 3
    `);

    sampleResult.rows.forEach((inv, idx) => {
      console.log(`Invoice ${idx + 1}: ${inv.invoice_number}`);
      console.log(`  linked_invoice_item array:`, inv.linked_invoice_item);
      console.log('');
    });

    // 2. Check if these IDs exist in invoice_item table
    console.log('=== CHECK: DO THESE IDs EXIST IN invoice_item TABLE? ===\n');

    for (const inv of sampleResult.rows) {
      console.log(`Invoice: ${inv.invoice_number} (${inv.bubble_id})`);

      if (inv.linked_invoice_item && Array.isArray(inv.linked_invoice_item)) {
        for (const itemId of inv.linked_invoice_item) {
          // Check if this item exists in invoice_item table
          const checkResult = await client.query(`
            SELECT bubble_id, description, qty, unit_price
            FROM invoice_item
            WHERE bubble_id = $1
          `, [itemId]);

          if (checkResult.rows.length === 0) {
            console.log(`  ❌ Item "${itemId}" NOT FOUND in invoice_item table`);
          } else {
            const item = checkResult.rows[0];
            console.log(`  ✓ Item "${itemId}" FOUND`);
            console.log(`     Description: ${item.description?.substring(0, 50)}...`);
            console.log(`     Qty: ${item.qty}, Price: ${item.unit_price}`);
          }
        }
      }
      console.log('');
    }

    // 3. Check invoice_item bubble_id format
    console.log('=== CHECK invoice_item TABLE bubble_id FORMAT ===');
    const itemSampleResult = await client.query(`
      SELECT bubble_id, description, created_at
      FROM invoice_item
      WHERE created_at >= '2026-01-01'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('Recent invoice_item bubble_id formats:');
    itemSampleResult.rows.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.bubble_id}`);
      console.log(`     Description: ${item.description?.substring(0, 40)}...`);
    });
    console.log('');

    // 4. DIAGNOSIS
    console.log('=== DIAGNOSIS ===');
    console.log('The invoice.linked_invoice_item contains IDs like: "item_8bcb43da7b07528e"');
    console.log('');
    console.log('QUESTION: Do these match invoice_item.bubble_id?');
    console.log('');

    // Count how many linked_invoice_item IDs exist in invoice_item table
    const matchCountResult = await client.query(`
      SELECT COUNT(*) as count
      FROM invoice i
      CROSS JOIN LATERAL unnest(i.linked_invoice_item) as item_id
      INNER JOIN invoice_item ii ON ii.bubble_id = item_id
      WHERE i.invoice_date >= '2026-01-01'
        AND i.invoice_date <= '2026-01-18'
    `);

    const totalIdsResult = await client.query(`
      SELECT SUM(array_length(linked_invoice_item, 1)) as total_ids
      FROM invoice
      WHERE invoice_date >= '2026-01-01'
        AND invoice_date <= '2026-01-18'
        AND linked_invoice_item IS NOT NULL
    `);

    const matched = parseInt(matchCountResult.rows[0].count);
    const total = parseInt(totalIdsResult.rows[0].total_ids) || 0;

    console.log(`Total linked_invoice_item IDs: ${total}`);
    console.log(`Found in invoice_item table: ${matched}`);
    console.log(`Match rate: ${total > 0 ? ((matched / total) * 100).toFixed(1) : 0}%`);
    console.log('');

    if (matched === total) {
      console.log('✓✓✓ ALL item IDs MATCH!');
      console.log('   → The sync IS working correctly');
      console.log('   → Sales Agent App should use invoice.linked_invoice_item');
    } else if (matched === 0) {
      console.log('❌❌❌ ZERO item IDs match!');
      console.log('   → invoice_item table uses different bubble_id format');
      console.log('   → OR the items are in a different table');
    } else {
      console.log(`⚠️  PARTIAL match: ${matched}/${total} (${((matched/total)*100).toFixed(1)}%)`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

check();
