import { db } from '../src/lib/db';
import { invoices } from '../src/db/schema';

(async () => {
  try {
    console.log('Querying database...');
    const result = await db.select().from(invoices).limit(3);
    console.log('Found', result.length, 'invoices');

    if (result.length > 0) {
      console.log('\n=== INVOICE 1 ===');
      const inv = result[0];
      console.log('Invoice ID:', inv.invoice_id);
      console.log('Bubble ID:', inv.bubble_id);
      console.log('Amount:', inv.amount);
      console.log('Total Amount:', inv.total_amount);
      console.log('Invoice Date:', inv.invoice_date);
      console.log('Linked Customer:', inv.linked_customer);
      console.log('Linked Agent:', inv.linked_agent);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
