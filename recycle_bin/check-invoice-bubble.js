/**
 * Check specific invoice: 1757638707968x511321813070381060
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';
const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const invoiceId = '1757638707968x511321813070381060';

async function checkPostgres() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('=== POSTGRESQL ===\n');

    const inv = await client.query(`
      SELECT
        bubble_id,
        invoice_number,
        invoice_date,
        total_amount,
        status,
        linked_invoice_item,
        array_length(linked_invoice_item, 1) as item_count,
        created_at,
        updated_at
      FROM invoice
      WHERE bubble_id = $1
    `, [invoiceId]);

    if (inv.rows.length === 0) {
      console.log('❌ Invoice NOT FOUND\n');
      return;
    }

    const i = inv.rows[0];
    console.log('Invoice:');
    console.log(`  ID: ${i.bubble_id}`);
    console.log(`  #: ${i.invoice_number || 'N/A'}`);
    console.log(`  Date: ${i.invoice_date}`);
    console.log(`  Amount: ${i.total_amount}`);
    console.log(`  Status: ${i.status}`);
    console.log(`  linked_invoice_item: ${JSON.stringify(i.linked_invoice_item)} (${i.item_count || 0} items)`);
    console.log(`  Created: ${i.created_at}`);
    console.log(`  Updated: ${i.updated_at}\n`);

    // Check invoice_item table
    const items = await client.query(`
      SELECT
        bubble_id,
        description,
        qty,
        unit_price,
        linked_invoice,
        created_at
      FROM invoice_item
      WHERE linked_invoice = $1
    `, [invoiceId]);

    console.log(`invoice_item table: ${items.rows.length} items with linked_invoice = this invoice`);
    items.rows.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.description?.substring(0, 50)}... (${item.bubble_id})`);
    });
    console.log('');

  } finally {
    await client.end();
  }
}

async function checkBubble() {
  console.log('=== BUBBLE API ===\n');

  try {
    // Get invoice
    console.log('Fetching invoice...');
    const invRes = await fetch(`https://eternalgy.bubbleapps.io/api/1.1/obj/invoice/${invoiceId}`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (!invRes.ok) {
      console.log(`❌ Invoice fetch failed: ${invRes.status}\n`);
      return;
    }

    const invData = await invRes.json();
    const inv = invData.response;

    console.log('Invoice in Bubble:');
    console.log(`  ID: ${inv._id}`);
    console.log(`  #: ${inv["Invoice Number"] || 'N/A'}`);
    console.log(`  Date: ${inv["Invoice Date"]}`);
    console.log(`  Amount: ${inv["Total Amount"] || inv.Amount}`);
    console.log(`  linked_invoice_item: ${JSON.stringify(inv["linked_invoice_item"])}`);
    console.log(`  Modified: ${inv["Modified Date"]}\n`);

    // Get all invoice_new_item and filter locally
    console.log('Fetching ALL invoice_new_item from Bubble...');
    const itemsRes = await fetch('https://eternalgy.bubbleapps.io/api/1.1/obj/invoice_new_item', {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (!itemsRes.ok) {
      console.log(`❌ Items fetch failed: ${itemsRes.status}\n`);
      return;
    }

    const itemsData = await itemsRes.json();
    const allItems = itemsData.response.results || [];

    // Filter items for this invoice
    const invoiceItems = allItems.filter(item => item.Invoice === invoiceId);

    console.log(`\nResult: ${invoiceItems.length} items found for this invoice in Bubble\n`);

    if (invoiceItems.length > 0) {
      invoiceItems.forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item.Description}`);
        console.log(`     ID: ${item._id}`);
        console.log(`     Invoice: ${item.Invoice}`);
        console.log(`     Qty: ${item.Qty} × ${item["Unit Price"]}`);
        console.log(`     Modified: ${item["Modified Date"]}`);
        console.log('');
      });
    }

    // DIAGNOSIS
    console.log('=== DIAGNOSIS ===\n');
    const pgItems = inv["linked_invoice_item"];
    const pgCount = Array.isArray(pgItems) ? pgItems.length : 0;

    console.log(`PostgreSQL: ${pgCount} items (linked_invoice_item)`);
    console.log(`Bubble: ${invoiceItems.length} items`);
    console.log('');

    if (invoiceItems.length === 0 && pgCount === 0) {
      console.log('✓ Both agree: NO ITEMS');
      console.log('  Invoice genuinely has no items');
    } else if (invoiceItems.length > 0 && pgCount === 0) {
      console.log('❌❌❌ SYNC BUG CONFIRMED!');
      console.log(`  → Bubble HAS ${invoiceItems.length} items`);
      console.log('  → PostgreSQL shows 0 items');
      console.log('  → The sync FAILED to copy linked_invoice_item from Bubble');
    } else if (invoiceItems.length === 0 && pgCount > 0) {
      console.log('⚠️  Inverse: PostgreSQL has items, Bubble does not');
    } else if (invoiceItems.length !== pgCount) {
      console.log(`⚠️  Count mismatch: PG=${pgCount}, Bubble=${invoiceItems.length}`);
    } else {
      console.log('✓ Counts match');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function main() {
  await checkPostgres();
  await checkBubble();
}

main();
