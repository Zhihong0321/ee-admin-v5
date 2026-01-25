const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const ITEM_ID = '1765783727740x812920548953423900';

async function recheck() {
  const url = `https://eternalgy.bubbleapps.io/api/1.1/obj/invoice_item/${ITEM_ID}`;

  console.log('Fetching:', url);

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` },
  });

  const data = await response.json();

  console.log('\nStatus:', response.status);
  console.log('Full Response:', JSON.stringify(data, null, 2));

  if (data.response) {
    console.log('\n✅ Invoice item found!');
    console.log('\nKeys:', Object.keys(data.response));
    console.log('\nDescription:', data.response['Description'] || data.response['description'] || 'N/A');
    console.log('QTY:', data.response['QTY'] || data.response['qty'] || 'N/A');
    console.log('Amount:', data.response['Amount'] || data.response['amount'] || 'N/A');
  }
}

recheck().catch(console.error);
