// Test what Bubble API returns for linked_invoice_item field

const BUBBLE_BASE_URL = 'https://app.atapsolar.org/api/1.1/obj';
const API_TOKEN = '8d0460b28e6966a5a756fe4cfe7daf0';

async function testInvoiceFields() {
  console.log('=== Testing Bubble Invoice API Fields ===\n');

  // Fetch a few recent invoices
  const url = `${BUBBLE_BASE_URL}/invoice?limit=5`;

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`
      }
    });

    if (!res.ok) {
      console.error(`API Error: ${res.statusText}`);
      return;
    }

    const data = await res.json();
    const records = data.response.results || [];

    console.log(`Fetched ${records.length} invoices from Bubble\n`);

    records.forEach((inv, i) => {
      console.log(`--- Invoice ${i + 1} ---`);
      console.log(`Bubble ID: ${inv._id}`);
      console.log(`Invoice Number: ${inv["Invoice Number"] || inv.invoice_number || 'N/A'}`);

      // Check ALL possible field names for linked_invoice_item
      console.log(`\nField checking:`);
      console.log(`  linked_invoice_item: ${inv.linked_invoice_item ? JSON.stringify(inv.linked_invoice_item) : 'NOT FOUND'}`);
      console.log(`  Linked Invoice Item: ${inv["Linked Invoice Item"] ? JSON.stringify(inv["Linked Invoice Item"]) : 'NOT FOUND'}`);
      console.log(`  linked invoice item: ${inv["linked invoice item"] ? JSON.stringify(inv["linked invoice item"]) : 'NOT FOUND'}`);
      console.log(`  Linked invoice_item: ${inv["Linked invoice_item"] ? JSON.stringify(inv["Linked invoice_item"]) : 'NOT FOUND'}`);

      // Show all keys that contain "item" or "Item"
      const itemKeys = Object.keys(inv).filter(k =>
        k.toLowerCase().includes('item') || k.includes('linked')
      );

      console.log(`\nAll keys with 'item' or 'linked':`);
      itemKeys.forEach(key => {
        const value = inv[key];
        if (Array.isArray(value)) {
          console.log(`  ${key}: Array[${value.length}]`);
        } else if (value !== null && value !== undefined) {
          console.log(`  ${key}: ${typeof value} (${value})`);
        }
      });

      console.log('');
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testInvoiceFields();
