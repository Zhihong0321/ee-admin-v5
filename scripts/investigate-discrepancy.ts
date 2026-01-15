import { db } from '../src/lib/db';
import { invoices } from '../src/db/schema';
import { eq, inArray } from 'drizzle-orm';

async function main() {
  const invoiceNumbers = ['1006165', '1007225', '1007364']; // Two missing, one found
  
  const results = await db.select().from(invoices).where(inArray(invoices.invoice_number, invoiceNumbers));

  console.log('--- Investigation of Discrepant Invoices ---');
  console.log('User ID searched by Team: 1743046333602x572201987825473600');
  console.log('Agent ID used by Me:      1743046625411x149828353222770700');
  console.log('--------------------------------------------------');

  for (const inv of results) {
    console.log(`Invoice: ${inv.invoice_number}`);
    console.log(`  linked_agent: ${inv.linked_agent}`);
    console.log(`  created_by:   ${inv.created_by}`);
    console.log(`  agent_id:     ${inv.agent_id}`);
    
    const matchesAgent = inv.linked_agent === '1743046625411x149828353222770700';
    const matchesUser = inv.created_by === '1743046333602x572201987825473600';
    
    console.log(`  Matches My Query (linked_agent)? ${matchesAgent ? 'YES' : 'NO'}`);
    console.log(`  Matches Team Query (created_by)? ${matchesUser ? 'YES' : 'NO'}`);
    console.log('--------------------------------------------------');
  }

  process.exit(0);
}

main().catch(console.error);