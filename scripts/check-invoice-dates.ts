
import { db } from '../src/lib/db';
import { invoices } from '../src/db/schema';
import { isNull, sql } from 'drizzle-orm';

async function main() {
  console.log('Checking for Invoices with NULL invoice_date...');

  const nullDateInvoices = await db.select({
    id: invoices.id,
    bubble_id: invoices.bubble_id,
    invoice_number: invoices.invoice_number,
    invoice_date: invoices.invoice_date,
    created_at: invoices.created_at,
    created_by: invoices.created_by
  })
  .from(invoices)
  .where(isNull(invoices.invoice_date));

  console.log(`Found ${nullDateInvoices.length} invoices with NULL invoice_date.`);

  if (nullDateInvoices.length > 0) {
    console.log('Sample of 5 invoices with NULL invoice_date:');
    nullDateInvoices.slice(0, 5).forEach(inv => {
      console.log(`- ID: ${inv.bubble_id}, Number: ${inv.invoice_number}, Created At: ${inv.created_at}, Created By: ${inv.created_by}`);
    });
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
