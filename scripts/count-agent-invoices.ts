
import { db } from '../src/lib/db';
import { agents, users, invoices } from '../src/db/schema';
import { eq, ilike, or } from 'drizzle-orm';

async function main() {
  console.log('Searching for "Ching Zhe Hang"...');

  // Search Agents
  const foundAgents = await db.select().from(agents).where(ilike(agents.name, '%Ching Zhe Hang%'));
  
  console.log(`Found ${foundAgents.length} agents matching "Ching Zhe Hang":`);
  for (const agent of foundAgents) {
    console.log(`- Agent Name: ${agent.name}, Bubble ID: ${agent.bubble_id}, ID: ${agent.id}`);
    
    // Count invoices for this agent
    if (agent.bubble_id) {
        const invoiceCount = await db.select({ count: invoices.id }).from(invoices).where(eq(invoices.linked_agent, agent.bubble_id));
        console.log(`  -> Invoices linked to this Agent Bubble ID (${agent.bubble_id}): ${invoiceCount.length}`);
        
        // Also check agent_id just in case
        const invoiceCount2 = await db.select({ count: invoices.id }).from(invoices).where(eq(invoices.agent_id, agent.bubble_id));
        if (invoiceCount2.length > 0 && invoiceCount2.length !== invoiceCount.length) {
             console.log(`  -> Invoices linked via 'agent_id' column: ${invoiceCount2.length}`);
        }
    }
  }

  // Search Users
  // Users might not have a name column directly if it's strictly auth, but let's check schema again.
  // Schema says: users has `email`, `linked_agent_profile`. No `name` column? 
  // Wait, I missed checking if users has a name. Schema: `linked_agent_profile`, `agent_code`, `email`.
  // It seems users table doesn't have a 'name' column. 
  // However, the memory said "Agent ... has User ID ...". 
  // Let's try to find a user linked to the found agent(s).

  for (const agent of foundAgents) {
      if (agent.bubble_id) {
          const foundUsers = await db.select().from(users).where(eq(users.linked_agent_profile, agent.bubble_id));
          if (foundUsers.length > 0) {
              console.log(`  -> Found ${foundUsers.length} User(s) linked to this Agent:`);
              for (const user of foundUsers) {
                  console.log(`     - User Bubble ID: ${user.bubble_id}, Email: ${user.email}`);
                   // Check if invoices are linked to User Bubble ID (unlikely but possible via created_by)
                   if (user.bubble_id) {
                       const invoiceCreatedCount = await db.select({ count: invoices.id }).from(invoices).where(eq(invoices.created_by, user.bubble_id));
                       console.log(`     -> Invoices 'created_by' this User Bubble ID: ${invoiceCreatedCount.length}`);
                   }
              }
          }
      }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
