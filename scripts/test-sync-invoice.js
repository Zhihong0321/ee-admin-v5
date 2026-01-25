/**
 * Test sync for invoice 1765783727740x576746698897358800
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const INVOICE_ID = '1765783727740x576746698897358800';

async function fetchFromBubble() {
  console.log('\n=== STEP 1: FETCH FROM BUBBLE ===\n');

  const url = `https://eternalgy.bubbleapps.io/api/1.1/obj/invoice/${INVOICE_ID}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` },
  });
  const data = await response.json();
  const invoice = data.response;

  console.log('Invoice fetched from Bubble');
  console.log('Linked Invoice Item:', invoice['Linked Invoice Item']);
  console.log('Is Array?', Array.isArray(invoice['Linked Invoice Item']));
  console.log('Length:', invoice['Linked Invoice Item']?.length);

  return invoice;
}

async function fetchInvoiceItem(itemId) {
  const url = `https://eternalgy.bubbleapps.io/api/1.1/obj/invoice-item/${itemId}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` },
  });
  const data = await response.json();
  return data.response;
}

async function main() {
  const invoice = await fetchFromBubble();

  console.log('\n=== STEP 2: EXTRACT RELATIONS ===\n');

  const relations = {
    customer: invoice['Linked Customer'] || null,
    agent: invoice['Linked Agent'] || null,
    seda_registration: invoice['Linked SEDA registration'] || null,
    payments: Array.isArray(invoice['Linked Payment']) ? invoice['Linked Payment'] : [],
    invoice_items: Array.isArray(invoice['Linked Invoice Item']) ? invoice['Linked Invoice Item'] : [],
  };

  console.log('Extracted relations:');
  console.log('  invoice_items:', relations.invoice_items);
  console.log('  invoice_items length:', relations.invoice_items.length);

  console.log('\n=== STEP 3: TEST FETCH INVOICE ITEMS ===\n');

  for (let i = 0; i < relations.invoice_items.length; i++) {
    const itemId = relations.invoice_items[i];
    console.log(`\nFetching invoice item ${i + 1}/${relations.invoice_items.length}: ${itemId}`);

    try {
      const item = await fetchInvoiceItem(itemId);
      console.log('  ✅ Fetched successfully');
      console.log('  Description:', item['Description']);
      console.log('  Amount:', item['Amount']);
      console.log('  Qty:', item['Quantity']);
    } catch (error) {
      console.log('  ❌ FAILED:', error.message);
    }
  }

  console.log('\n=== STEP 4: CHECK MAPPING ===\n');

  // Simulate the mapping
  const mapped = {
    linked_invoice_item: relations.invoice_items,
  };

  console.log('Mapped linked_invoice_item:', mapped.linked_invoice_item);
  console.log('Type:', Array.isArray(mapped.linked_invoice_item) ? 'array' : typeof mapped.linked_invoice_item);
}

main().catch(console.error);
