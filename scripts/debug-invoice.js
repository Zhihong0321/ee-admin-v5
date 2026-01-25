/**
 * Debug script to check what's in Bubble for invoice 1765783727740x576746698897358800
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const INVOICE_ID = '1765783727740x576746698897358800';

async function fetchInvoice() {
  const url = `https://eternalgy.bubbleapps.io/api/1.1/obj/invoice/${INVOICE_ID}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${BUBBLE_API_KEY}`,
    },
  });

  const data = await response.json();
  console.log('Full Bubble Response:', JSON.stringify(data, null, 2));

  if (data.response) {
    const invoice = data.response;
    console.log('\n=== KEY FIELDS ===');
    console.log('Invoice ID:', invoice['_id']);
    console.log('Invoice Number:', invoice['Invoice Number']);
    console.log('Linked Invoice Item:', invoice['Linked Invoice Item']);
    console.log('Linked Invoice Item type:', Array.isArray(invoice['Linked Invoice Item']) ? 'array' : typeof invoice['Linked Invoice Item']);
    console.log('Linked Invoice Item length:', Array.isArray(invoice['Linked Invoice Item']) ? invoice['Linked Invoice Item'].length : 'N/A');

    if (Array.isArray(invoice['Linked Invoice Item'])) {
      console.log('\nInvoice Items:');
      invoice['Linked Invoice Item'].forEach((item, idx) => {
        console.log(`  [${idx}] ${item}`);
      });
    }
  }
}

fetchInvoice().catch(console.error);
