/**
 * Test different type names to find the correct one for invoice items
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const ITEM_ID = '1765783727740x812920548953423900';

const TYPE_NAMES = [
  'invoice-item',
  'invoice_item',
  'invoice item',
  'Invoice Item',
  'Invoice item',
  'invoice_new_item',
  'Invoice Item/Product',
  'invoiceitem',
];

async function testTypeNames() {
  for (const typeName of TYPE_NAMES) {
    const url = `https://eternalgy.bubbleapps.io/api/1.1/obj/${typeName}/${ITEM_ID}`;

    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` },
      });

      const data = await response.json();

      if (response.ok && data.response) {
        console.log(`\n✅ SUCCESS! Type name is: "${typeName}"`);
        console.log(`Response has keys:`, Object.keys(data.response).slice(0, 5).join(', '), '...');
        return;
      } else {
        console.log(`❌ "${typeName}": ${data.message || response.statusText}`);
      }
    } catch (error) {
      console.log(`❌ "${typeName}": ${error.message}`);
    }
  }

  console.log('\n❌ None of the type names worked!');
}

testTypeNames().catch(console.error);
