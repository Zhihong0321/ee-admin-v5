
import { db } from '../src/lib/db';
import { invoices } from '../src/db/schema';
import { isNull, eq, and } from 'drizzle-orm';

async function main() {
  const agentId = '1743046625411x149828353222770700';
  console.log(`Checking for invoices with NULL invoice_id linked to Agent ${agentId} in Postgres...`);
  
  const nullIdInvoices = await db.select().from(invoices).where(
      and(
          isNull(invoices.invoice_id),
          eq(invoices.linked_agent, agentId)
      )
  );
  
  console.log(`Total invoices with NULL invoice_id for this agent: ${nullIdInvoices.length}`);
  
  if (nullIdInvoices.length > 0) {
      console.log('Sample (First 5):');
      nullIdInvoices.slice(0, 5).forEach(inv => {
          console.log(`- ID: ${inv.id}, Bubble ID: ${inv.bubble_id}, Created By: ${inv.created_by}`);
      });
  }
}

main().catch(console.error).finally(() => process.exit(0));
