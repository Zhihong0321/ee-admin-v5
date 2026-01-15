
import { db } from '../src/lib/db';
import { agents, invoices, payments } from '../src/db/schema';
import { eq, or } from 'drizzle-orm';

async function main() {
  console.log('Starting investigation for agent: CHING ZHE HANG');
  
  // 1. Find the agent
  // User provided Bubble ID: 1743046625411x149828353222770700
  const targetBubbleId = '1743046625411x149828353222770700';
  const targetName = 'CHING ZHE HANG';

  const foundAgents = await db.select().from(agents).where(
    or(
      eq(agents.bubble_id, targetBubbleId),
      eq(agents.name, targetName)
    )
  );

  if (foundAgents.length === 0) {
    console.error('Agent not found in Postgres!');
    return;
  }

  const agent = foundAgents[0];
  console.log(`Found Agent: ${agent.name} (Bubble ID: ${agent.bubble_id})`);

  // 2. Find invoices linked to this agent
  // Invoices link to agent via linked_agent which should match agent.bubble_id
  const agentInvoices = await db.select().from(invoices).where(
    eq(invoices.linked_agent, agent.bubble_id!)
  );

  console.log(`Found ${agentInvoices.length} invoices for this agent.`);

  let fullyPaidCount = 0;

  for (const inv of agentInvoices) {
    console.log('--------------------------------------------------');
    console.log(`Invoice: ${inv.invoice_number} (ID: ${inv.invoice_id})`);
    console.log(`  Bubble ID: ${inv.bubble_id}`);
    console.log(`  Status: ${inv.status}`);
    console.log(`  Total Amount: ${inv.total_amount}`);
    
    // Check linked payments
    // linked_payment is an array of strings (bubble_ids)
    const paymentIds = inv.linked_payment || [];
    let totalPaid = 0;
    
    if (paymentIds.length > 0) {
      console.log(`  Linked Payments (Count: ${paymentIds.length}):`);
      for (const payId of paymentIds) {
        // Query the payment details
        const payRecs = await db.select().from(payments).where(eq(payments.bubble_id, payId));
        if (payRecs.length > 0) {
          const p = payRecs[0];
          console.log(`    - Payment: ${p.bubble_id}, Amount: ${p.amount}, Status/Method: ${p.payment_method}`);
          totalPaid += parseFloat(p.amount || '0');
        } else {
            console.log(`    - Payment ID ${payId} found in invoice but missing in payments table!`);
        }
      }
    } else {
        console.log(`  No linked payments found in 'linked_payment' column.`);
    }

    // Also check if status implies paid
    const isPaidStatus = inv.status?.toLowerCase().includes('paid');
    
    // Simple logic for "Full Payment"
    // Note: total_amount is a string, so we parse it.
    const invoiceTotal = parseFloat(inv.total_amount || '0');
    
    // Check if fully paid
    // Tolerance for floating point
    const remaining = invoiceTotal - totalPaid;
    const isFullyPaidMath = invoiceTotal > 0 && remaining <= 0.1; // Allow small variance

    console.log(`  Total Paid Calculated: ${totalPaid}`);
    
    if (isPaidStatus || isFullyPaidMath) {
        console.log(`  => CONSIDERED FULL PAYMENT`);
        fullyPaidCount++;
    } else {
        console.log(`  => NOT FULL PAYMENT`);
    }
  }

  console.log('--------------------------------------------------');
  console.log(`Summary:`);
  console.log(`Total Invoices in Postgres: ${agentInvoices.length}`);
  console.log(`Total Fully Paid Invoices (Calculated/Status): ${fullyPaidCount}`);
  
  process.exit(0);
}

main().catch((err) => {
  console.error('Error running script:', err);
  process.exit(1);
});
