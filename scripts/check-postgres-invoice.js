const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
});

async function checkInvoice() {
  await client.connect();

  const invoiceId = '1765783727740x576746698897358800';

  console.log(`\n=== CHECKING INVOICE ${invoiceId} IN POSTGRESQL ===\n`);

  // Check invoice
  const invoiceResult = await client.query(`
    SELECT
      bubble_id,
      invoice_id,
      total_amount,
      linked_invoice_item,
      array_length(linked_invoice_item, 1) as item_count
    FROM invoice
    WHERE bubble_id = $1
  `, [invoiceId]);

  if (invoiceResult.rows.length === 0) {
    console.log('❌ Invoice NOT FOUND in database!');
  } else {
    const invoice = invoiceResult.rows[0];
    console.log('✅ Invoice found:');
    console.log('  bubble_id:', invoice.bubble_id);
    console.log('  invoice_id:', invoice.invoice_id);
    console.log('  total_amount:', invoice.total_amount);
    console.log('  linked_invoice_item:', invoice.linked_invoice_item);
    console.log('  item_count:', invoice.item_count);
  }

  // Check if invoice items exist
  console.log('\n=== CHECKING INVOICE ITEMS ===\n');
  const itemsResult = await client.query(`
    SELECT bubble_id, description, amount, qty
    FROM invoice_item
    WHERE bubble_id = ANY($1)
  `, [['1765783727740x812920548953423900', '1765783861106x323007386208698400']]);

  console.log(`Found ${itemsResult.rows.length} invoice items:`);
  itemsResult.rows.forEach(item => {
    console.log(`  - ${item.bubble_id}: ${item.description} - RM${item.amount} x ${item.qty}`);
  });

  await client.end();
}

checkInvoice().catch(console.error);
