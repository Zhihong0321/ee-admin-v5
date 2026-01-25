const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const INVOICE_ID = '1757580492227x987236194607431700';

async function checkDates() {
  // Fetch from Bubble
  console.log('\n=== FETCHING FROM BUBBLE ===\n');
  const url = `https://eternalgy.bubbleapps.io/api/1.1/obj/invoice/${INVOICE_ID}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` },
  });
  const data = await response.json();
  const invoice = data.response;

  console.log('Invoice Date fields from Bubble:');
  console.log('  Invoice Date:', invoice['Invoice Date']);
  console.log('  Created Date:', invoice['Created Date']);
  console.log('  Modified Date:', invoice['Modified Date']);

  // Check the field mapping
  console.log('\n=== FIELD MAPPING ===\n');
  console.log('Invoice Date → invoice_date (timestamp)');
}

checkDates().catch(console.error);
