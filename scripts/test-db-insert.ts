import { db } from '../src/lib/db';
import { invoices } from '../src/db/schema';
import { eq } from 'drizzle-orm';

(async () => {
  console.log('Testing simple insert...');

  try {
    // Test insert
    await db.insert(invoices).values({
      bubble_id: 'test123456',
      invoice_id: 999999,
      amount: '100.00',
      total_amount: '100.00',
      status: 'test',
      created_at: new Date(),
      updated_at: new Date()
    });
    console.log('✓ Insert successful!');

    // Verify
    const result = await db.select().from(invoices).where(eq(invoices.bubble_id, 'test123456'));
    console.log('✓ Found:', result.length, 'records');
    if (result.length > 0) {
      console.log('  Invoice ID:', result[0].invoice_id);
      console.log('  Amount:', result[0].amount);
    }

    // Clean up
    await db.delete(invoices).where(eq(invoices.bubble_id, 'test123456'));
    console.log('✓ Cleanup done');
  } catch (err) {
    console.error('✗ Error:', err);
  }

  process.exit(0);
})();
