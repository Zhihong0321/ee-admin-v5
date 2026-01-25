/**
 * Check ONLY: invoice.linked_invoice_item in Bubble vs PostgreSQL
 * IGNORE invoice_item table completely
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';
const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const invoiceId = '1757638707968x511321813070381060';

async function main() {
  // 1. Check PostgreSQL
  const client = new Client({ connectionString });
  await client.connect();

  const pgResult = await client.query(`
    SELECT
      bubble_id,
      invoice_number,
      invoice_date,
      total_amount,
      status,
      linked_invoice_item,
      array_length(linked_invoice_item, 1) as item_count,
      updated_at
    FROM invoice
    WHERE bubble_id = $1
  `, [invoiceId]);

  console.log('=== POSTGRESQL: invoice.linked_invoice_item ===\n');
  const pgInv = pgResult.rows[0];
  console.log(`Invoice: ${pgInv.invoice_number || 'N/A'} (${pgInv.bubble_id})`);
  console.log(`linked_invoice_item: ${JSON.stringify(pgInv.linked_invoice_item)}`);
  console.log(`Count: ${pgInv.item_count || 0}`);
  console.log(`Last updated: ${pgInv.updated_at}\n`);

  await client.end();

  // 2. Check Bubble
  console.log('=== BUBBLE: invoice.linked_invoice_item ===\n');
  const response = await fetch(`https://eternalgy.bubbleapps.io/api/1.1/obj/invoice/${invoiceId}`, {
    headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
  });

  const data = await response.json();
  const bubbleInv = data.response;

  console.log(`Invoice: ${bubbleInv["Invoice Number"] || 'N/A'} (${bubbleInv._id})`);
  console.log(`linked_invoice_item: ${JSON.stringify(bubbleInv["linked_invoice_item"])}`);
  console.log(`Type: ${Array.isArray(bubbleInv["linked_invoice_item"]) ? 'array' : typeof bubbleInv["linked_invoice_item"]}`);
  console.log(`Modified: ${bubbleInv["Modified Date"]}\n`);

  // 3. DIAGNOSIS
  console.log('=== DIAGNOSIS ===\n');
  const pgCount = pgInv.item_count || 0;
  const bubbleCount = Array.isArray(bubbleInv["linked_invoice_item"]) ? bubbleInv["linked_invoice_item"].length : 0;

  console.log(`PostgreSQL linked_invoice_item count: ${pgCount}`);
  console.log(`Bubble linked_invoice_item count: ${bubbleCount}`);
  console.log('');

  if (bubbleCount === 0 && pgCount === 0) {
    console.log('✓✓✓ Both agree: ZERO items');
    console.log('   → This invoice genuinely has NO items in Bubble');
    console.log('   → Sync is working correctly (empty = empty)');
  } else if (bubbleCount > 0 && pgCount === 0) {
    console.log('❌❌❌ SYNC BUG FOUND!');
    console.log(`   → Bubble HAS ${bubbleCount} items in linked_invoice_item`);
    console.log('   → PostgreSQL shows 0 items');
    console.log('   → THE SYNC FAILED TO COPY linked_invoice_item FROM BUBBLE!');
    console.log('');
    console.log('   Bubble items:');
    bubbleInv["linked_invoice_item"].forEach((itemId, idx) => {
      console.log(`      [${idx}] ${itemId}`);
    });
  } else if (bubbleCount === 0 && pgCount > 0) {
    console.log('⚠️  Inverse: PostgreSQL has items, Bubble does not');
  } else {
    console.log(`⚠️  Count mismatch: PG=${pgCount}, Bubble=${bubbleCount}`);
  }

  console.log('\n=== SYNC LOG CHECK ===\n');
  console.log('PG updated_at:', pgInv.updated_at);
  console.log('Bubble Modified Date:', bubbleInv["Modified Date"]);
  console.log('');

  const pgUpdated = new Date(pgInv.updated_at);
  const bubbleModified = new Date(bubbleInv["Modified Date"]);

  if (bubbleModified > pgUpdated) {
    console.log('⚠️  Bubble is NEWER than PostgreSQL!');
    console.log('   → Need to run sync to update this invoice');
  } else {
    console.log('✓ PostgreSQL is up-to-date');
  }
}

main().catch(console.error);
