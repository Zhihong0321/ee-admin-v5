/**
 * Check specific invoice: 1757638707968x511321813070381060
 * Compare PostgreSQL vs Bubble API
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function checkPostgres() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('=== POSTGRESQL CHECK ===\n');

    // 1. Get invoice details
    const invoiceResult = await client.query(`
      SELECT
        bubble_id,
        invoice_number,
        invoice_date,
        total_amount,
        status,
        linked_invoice_item,
        array_length(linked_invoice_item, 1) as item_count
      FROM invoice
      WHERE bubble_id = $1
    `, ['1757638707968x511321813070381060']);

    if (invoiceResult.rows.length === 0) {
      console.log('❌ Invoice NOT FOUND in PostgreSQL!\n');
      return;
    }

    const inv = invoiceResult.rows[0];
    console.log('✓ Invoice Found:');
    console.log(`  Bubble ID: ${inv.bubble_id}`);
    console.log(`  Invoice #: ${inv.invoice_number || 'N/A'}`);
    console.log(`  Date: ${inv.invoice_date}`);
    console.log(`  Amount: ${inv.total_amount}`);
    console.log(`  Status: ${inv.status}`);
    console.log(`  linked_invoice_item: ${JSON.stringify(inv.linked_invoice_item)}`);
    console.log(`  Item count: ${inv.item_count || 0}`);
    console.log('');

    // 2. Check if any items in invoice_item table reference this invoice
    console.log('=== CHECK invoice_item TABLE FOR ITEMS LINKED TO THIS INVOICE ===\n');
    const itemsResult = await client.query(`
      SELECT
        bubble_id,
        description,
        qty,
        unit_price,
        total_price,
        linked_invoice,
        created_at
      FROM invoice_item
      WHERE linked_invoice = $1
      ORDER BY created_at
    `, ['1757638707968x511321813070381060']);

    if (itemsResult.rows.length === 0) {
      console.log(`❌ No items found in invoice_item.linked_invoice = '${inv.bubble_id}'\n`);
    } else {
      console.log(`✓ Found ${itemsResult.rows.length} items:\n`);
      itemsResult.rows.forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item.description}`);
        console.log(`     Bubble ID: ${item.bubble_id}`);
        console.log(`     linked_invoice: ${item.linked_invoice}`);
        console.log(`     Qty: ${item.qty} × ${item.unit_price} = ${item.total_price}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

async function checkBubbleAPI() {
  console.log('\n=== BUBBLE API CHECK ===\n');

  const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
  const invoiceBubbleId = '1757638707968x511321813070381060';

  try {
    // 1. Get invoice from Bubble
    console.log(`Fetching invoice from Bubble...`);
    const invResponse = await fetch(`https://eternalgy.bubbleapps.io/api/1.1/obj/invoice/${invoiceBubbleId}`, {
      headers: {
        'Authorization': `Bearer ${BUBBLE_API_KEY}`
      }
    });

    if (!invResponse.ok) {
      console.log(`❌ Bubble API Error: ${invResponse.status} ${invResponse.statusText}\n`);
      return;
    }

    const invData = await invResponse.json();
    const invoice = invData.response;

    console.log('✓ Invoice Found in Bubble:');
    console.log(`  Bubble ID: ${invoice._id}`);
    console.log(`  Invoice Number: ${invoice["Invoice Number"] || invoice.invoice_number || 'N/A'}`);
    console.log(`  Invoice Date: ${invoice["Invoice Date"]}`);
    console.log(`  Total Amount: ${invoice["Total Amount"] || invoice.total_amount}`);
    console.log(`  Status: ${invoice.Status || invoice.status}`);
    console.log('');

    // 2. Check linked_invoice_item in Bubble
    console.log('=== CHECK Bubble linked_invoice_item ===');
    const bubbleLinkedItems = invoice["linked_invoice_item"];
    console.log(`  Bubble linked_invoice_item: ${JSON.stringify(bubbleLinkedItems)}`);
    console.log(`  Array length: ${Array.isArray(bubbleLinkedItems) ? bubbleLinkedItems.length : 'N/A'}`);
    console.log('');

    // 3. Fetch invoice_new_item from Bubble for this invoice
    console.log('=== FETCHING ITEMS FROM BUBBLE ===');
    const itemsResponse = await fetch(
      `https://eternalgy.bubbleapps.io/api/1.1/obj/invoice_new_item?constraints=${encodeURIComponent(JSON.stringify([{
        key: 'Invoice',
        constraint: 'equals',
        value: invoiceBubbleId
      }]))}`,
      {
        headers: {
          'Authorization': `Bearer ${BUBBLE_API_KEY}`
        }
      }
    );

    if (!itemsResponse.ok) {
      console.log(`❌ Items API Error: ${itemsResponse.status} ${itemsResponse.statusText}\n`);
      return;
    }

    const itemsData = await itemsResponse.json();
    const items = itemsData.response.results || [];

    console.log(`✓ Found ${items.length} items in Bubble for this invoice:\n`);

    if (items.length === 0) {
      console.log('  (No items found in Bubble either!)');
    } else {
      items.forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item.Description}`);
        console.log(`     Bubble ID: ${item._id}`);
        console.log(`     Invoice field: ${item.Invoice}`);
        console.log(`     Qty: ${item.Qty}`);
        console.log(`     Unit Price: ${item["Unit Price"]}`);
        console.log(`     Total Price: ${item["Total Price"]}`);
        console.log(`     Created: ${item["Created Date"]}`);
        console.log(`     Modified: ${item["Modified Date"]}`);
        console.log('');
      });
    }

    // 4. DIAGNOSIS
    console.log('=== DIAGNOSIS ===');
    console.log(`PostgreSQL linked_invoice_item: ${JSON.stringify(bubbleLinkedItems)} (${Array.isArray(bubbleLinkedItems) ? bubbleLinkedItems.length : 0} items)`);
    console.log(`Bubble API items count: ${items.length}`);
    console.log('');

    if (items.length === 0 && (!bubbleLinkedItems || bubbleLinkedItems.length === 0)) {
      console.log('✓✓✓ Both PostgreSQL AND Bubble show 0 items');
      console.log('   → This invoice genuinely has no items');
    } else if (items.length > 0 && (!bubbleLinkedItems || bubbleLinkedItems.length === 0)) {
      console.log('❌❌❌ BUG FOUND!');
      console.log('   → Bubble HAS items, but PostgreSQL shows empty linked_invoice_item');
      console.log('   → The sync FAILED to populate linked_invoice_item array');
      console.log('');
      console.log('   ITEMS IN BUBBLE:');
      items.forEach(item => {
        console.log(`      - ${item._id}: ${item.Description}`);
      });
    } else if (items.length === 0 && bubbleLinkedItems && bubbleLinkedItems.length > 0) {
      console.log('⚠️  WARNING');
      console.log('   → PostgreSQL HAS items in linked_invoice_item, but Bubble query returns 0');
      console.log('   → Possible query constraint issue');
    } else {
      console.log('⚠️  MISMATCH');
      console.log(`   → PostgreSQL shows ${bubbleLinkedItems?.length || 0} items`);
      console.log(`   → Bubble shows ${items.length} items`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function main() {
  await checkPostgres();
  await checkBubbleAPI();
}

main();
