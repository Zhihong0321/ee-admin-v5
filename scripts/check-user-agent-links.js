import { db } from '../src/lib/db.ts';
import { users, agents } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function checkUserAgentLink() {
  try {
    console.log('Checking all users and their agent links...\n');
    
    const allUsers = await db.query.users.findMany({
      with: { agent: true },
      limit: 10
    });

    console.log(`Found ${allUsers.length} users\n`);
    
    for (const user of allUsers) {
      console.log('---');
      console.log('User ID:', user.id);
      console.log('User bubble_id:', user.bubble_id);
      console.log('Agent Code:', user.agent_code);
      console.log('linked_agent_profile:', user.linked_agent_profile);
      console.log('Has agent joined?', user.agent ? 'YES' : 'NO');
      if (user.agent) {
        console.log('  Agent name:', user.agent.name);
        console.log('  Agent bubble_id:', user.agent.bubble_id);
      } else if (user.linked_agent_profile) {
        console.log('  ⚠️ WARNING: Has linked_agent_profile but NO agent record found!');
        console.log('  This means the link is BROKEN - update will NOT work');
      } else {
        console.log('  ⚠️ WARNING: No linked_agent_profile - update will be SKIPPED');
      }
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserAgentLink();
