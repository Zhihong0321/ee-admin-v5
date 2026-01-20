/**
 * Check what fields are actually in the invoice item from Bubble
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const ITEM_ID = '1765783727740x812920548953423900';

async function checkInvoiceItemFields() {
  const url = `https://eternalgy.bubbleapps.io/api/1.1/obj/invoice-item/${ITEM_ID}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` },
  });

  const data = await response.json();
  const item = data.response;

  console.log('\n=== FULL INVOICE ITEM OBJECT ===\n');
  console.log(JSON.stringify(item, null, 2));

  console.log('\n=== ALL KEYS ===\n');
  Object.keys(item).forEach(key => {
    console.log(`  - ${key}: ${item[key]}`);
  });
}

checkInvoiceItemFields().catch(console.error);
