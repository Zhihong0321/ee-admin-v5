
import { db } from '../src/lib/db';
import { agents, users, invoices } from '../src/db/schema';
import { eq, ilike, and, ne, isNull } from 'drizzle-orm';

async function main() {
  const agentBubbleId = '1743046625411x149828353222770700';
  const userBubbleId = '1743046333602x572201987825473600';

  console.log(`Investigating discrepancy for Agent: ${agentBubbleId}`);

  // Invoices linked to Agent
  const linkedToAgent = await db.select().from(invoices).where(eq(invoices.linked_agent, agentBubbleId));
  console.log(`Total invoices linked to Agent: ${linkedToAgent.length}`);

  // Invoices created by User
  const createdByUser = linkedToAgent.filter(inv => inv.created_by === userBubbleId);
  console.log(`Invoices linked to Agent AND created by User: ${createdByUser.length}`);

  // The discrepancy
  const others = linkedToAgent.filter(inv => inv.created_by !== userBubbleId);
  console.log(`Invoices linked to Agent BUT NOT created by User: ${others.length}`);

  // Breakdown of 'created_by' for these 33 invoices
  const createdByStats: Record<string, number> = {};
  others.forEach(inv => {
    const cb = inv.created_by || 'NULL';
    createdByStats[cb] = (createdByStats[cb] || 0) + 1;
  });

  console.log('\nBreakdown of "created_by" for these others:');
  for (const [cb, count] of Object.entries(createdByStats)) {
    console.log(`- ${cb}: ${count} invoices`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
