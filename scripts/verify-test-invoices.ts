import { db } from '../src/lib/db';
import { invoices } from '../src/db/schema';
import { eq } from 'drizzle-orm';

// The bubble IDs from our test data
const testBubbleIds = [
  '1700670315988x214795166274289660',
  '1700718886219x456527832674730000',
  '1712640273783x535423118046396400',
  '1712898360812x294364521341911040',
  '1713510082792x680156890601095200'
];

(async () => {
  try {
    console.log('Checking for test invoices...\n');

    for (const bubbleId of testBubbleIds) {
      const result = await db.select().from(invoices).where(eq(invoices.bubble_id, bubbleId));
      if (result.length > 0) {
        const inv = result[0];
        console.log(`✓ Found Invoice ${inv.invoice_id || '(no ID)'} (${bubbleId.substring(0, 20)}...)`);
        console.log(`  Amount: ${inv.amount || inv.total_amount || '(no amount)'}`);
        console.log(`  Date: ${inv.invoice_date || '(no date)'}`);
        console.log(`  Customer: ${inv.linked_customer || '(none)'}`);
        console.log(`  Agent: ${inv.linked_agent || '(none)'}`);
      } else {
        console.log(`✗ NOT FOUND: ${bubbleId.substring(0, 20)}...`);
      }
      console.log();
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
