import { db } from '../src/lib/db';
import { invoices } from '../src/db/schema';
import { eq } from 'drizzle-orm';

(async () => {
  const result = await db.select().from(invoices).where(eq(invoices.bubble_id, '1708327130811x180664511603756500'));
  if (result.length > 0) {
    console.log('Found invoice:');
    console.log('  Invoice ID:', result[0].invoice_id);
    console.log('  Bubble ID:', result[0].bubble_id);
    console.log('  Amount:', result[0].amount);
    console.log('  Total Amount:', result[0].total_amount);
  } else {
    console.log('Not found');
  }
  process.exit(0);
})();
