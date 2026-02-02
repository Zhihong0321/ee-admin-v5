/**
 * Diagnostic script to check payment agent references
 * This will help identify why agent names show as "Unknown Agent"
 */

const { db } = require('../src/lib/db.ts');
const { payments, submitted_payments, agents, users } = require('../src/db/schema.ts');
const { eq, isNotNull } = require('drizzle-orm');

async function diagnosePaymentAgents() {
  console.log('\n=== PAYMENT AGENT DIAGNOSTIC ===\n');

  // 1. Check agents table
  const allAgents = await db.select().from(agents).limit(10);
  console.log(`✓ Total agents in database: ${allAgents.length} (sample)`);
  console.log('Sample agent records:');
  allAgents.slice(0, 3).forEach(agent => {
    console.log(`  - ID: ${agent.id}, Bubble ID: ${agent.bubble_id}, Name: ${agent.name}`);
  });

  // 2. Check submitted_payments with linked_agent
  const submittedWithAgent = await db
    .select({
      id: submitted_payments.id,
      linked_agent: submitted_payments.linked_agent,
    })
    .from(submitted_payments)
    .where(isNotNull(submitted_payments.linked_agent))
    .limit(5);

  console.log(`\n✓ Submitted payments with linked_agent: ${submittedWithAgent.length} (sample)`);
  submittedWithAgent.forEach(p => {
    console.log(`  - Payment ID: ${p.id}, Linked Agent: ${p.linked_agent}`);
  });

  // 3. Check if linked_agent values exist in agents table
  if (submittedWithAgent.length > 0) {
    console.log('\n=== Checking if linked_agent values exist in agents table ===');
    for (const payment of submittedWithAgent) {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.bubble_id, payment.linked_agent))
        .limit(1);
      
      if (agent.length > 0) {
        console.log(`  ✓ FOUND: ${payment.linked_agent} -> Agent: ${agent[0].name}`);
      } else {
        console.log(`  ✗ NOT FOUND in agents: ${payment.linked_agent}`);
        
        // Check if it's a user bubble_id instead
        const user = await db
          .select()
          .from(users)
          .where(eq(users.bubble_id, payment.linked_agent))
          .limit(1);
        
        if (user.length > 0) {
          console.log(`    ⚠ FOUND in users table instead! Email: ${user[0].email}, Linked Agent Profile: ${user[0].linked_agent_profile}`);
          
          if (user[0].linked_agent_profile) {
            const actualAgent = await db
              .select()
              .from(agents)
              .where(eq(agents.bubble_id, user[0].linked_agent_profile))
              .limit(1);
            
            if (actualAgent.length > 0) {
              console.log(`      -> This user's agent is: ${actualAgent[0].name}`);
            }
          }
        }
      }
    }
  }

  // 4. Check verified payments
  const verifiedWithAgent = await db
    .select({
      id: payments.id,
      linked_agent: payments.linked_agent,
    })
    .from(payments)
    .where(isNotNull(payments.linked_agent))
    .limit(5);

  console.log(`\n✓ Verified payments with linked_agent: ${verifiedWithAgent.length} (sample)`);
  verifiedWithAgent.forEach(p => {
    console.log(`  - Payment ID: ${p.id}, Linked Agent: ${p.linked_agent}`);
  });

  // 5. Check if verified payment linked_agent values exist
  if (verifiedWithAgent.length > 0) {
    console.log('\n=== Checking verified payment linked_agent values ===');
    for (const payment of verifiedWithAgent) {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.bubble_id, payment.linked_agent))
        .limit(1);
      
      if (agent.length > 0) {
        console.log(`  ✓ FOUND: ${payment.linked_agent} -> Agent: ${agent[0].name}`);
      } else {
        console.log(`  ✗ NOT FOUND in agents: ${payment.linked_agent}`);
        
        const user = await db
          .select()
          .from(users)
          .where(eq(users.bubble_id, payment.linked_agent))
          .limit(1);
        
        if (user.length > 0) {
          console.log(`    ⚠ FOUND in users table instead! Email: ${user[0].email}`);
        }
      }
    }
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===\n');
  process.exit(0);
}

diagnosePaymentAgents().catch(console.error);
