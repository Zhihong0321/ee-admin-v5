
import { db } from '../src/lib/db';
import { invoices, sedaRegistration } from '../src/db/schema';
import { eq, isNull, or, sql, and } from 'drizzle-orm';

async function main() {
  console.log('Scanning for "Demo Invoices"...');
  
  // Criteria: No linked customer AND No linked payments
  // We check for NULL or Empty String for linked_customer (just in case)
  // We check for NULL or Empty Array for linked_payment

  // Fetch potential candidates
  const allInvoices = await db.select().from(invoices);
  
  const demoInvoices = allInvoices.filter(inv => {
    const noCustomer = !inv.linked_customer || inv.linked_customer.trim() === '';
    
    // Check linked_payment
    // It's an array of strings in schema: text('linked_payment').array()
    // In JS it comes as string[] or null
    const payments = inv.linked_payment as string[] | null;
    const noPayments = !payments || payments.length === 0;

    return noCustomer && noPayments;
  });

  console.log(`Found ${demoInvoices.length} invoices matching "Demo" criteria.`);
  
  let withSedaCount = 0;
  const sampleWithSeda: any[] = [];

  for (const inv of demoInvoices) {
    if (inv.linked_seda_registration) {
      withSedaCount++;
      if (sampleWithSeda.length < 5) {
        sampleWithSeda.push({
          invoice_bubble_id: inv.bubble_id,
          seda_id: inv.linked_seda_registration
        });
      }
    }
  }

  console.log(`- Of these, ${withSedaCount} have a linked SEDA registration.`);
  
  if (withSedaCount > 0) {
    console.log('Sample of invoices with SEDA to be deleted:');
    console.log(sampleWithSeda);
  }

  // Also print a few regular demo invoices without SEDA
  const noSedaSample = demoInvoices.filter(i => !i.linked_seda_registration).slice(0, 3);
  if (noSedaSample.length > 0) {
    console.log('Sample of Demo Invoices (No SEDA):');
    noSedaSample.forEach(inv => console.log(`- ID: ${inv.bubble_id}, Inv#: ${inv.invoice_number}, Total: ${inv.total_amount}`));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
