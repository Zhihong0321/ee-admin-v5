import { db } from '../src/lib/db';
import { invoices } from '../src/db/schema';
import { eq } from 'drizzle-orm';

(async () => {
  // Query for the bubble_id from the debug output
  const result = await db.select().from(invoices).where(eq(invoices.bubble_id, '1708327130811x106027240349761540'));
  if (result.length > 0) {
    console.log('✓ Found synced invoice:');
    console.log('  Invoice ID:', result[0].invoice_id);
    console.log('  Bubble ID:', result[0].bubble_id);
    console.log('  Amount:', result[0].amount);
    console.log('  Total Amount:', result[0].total_amount);
    console.log('  Status:', result[0].status);
    console.log('  Linked Customer:', result[0].linked_customer);
    console.log('  Linked Agent:', result[0].linked_agent);
  } else {
    console.log('✗ Not found');
  }
  process.exit(0);
})();
