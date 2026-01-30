import { db } from '../src/lib/db.ts';
import { users, agents } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function debugUserUpdate() {
  try {
    console.log('Fetching sample user with agent data...\n');
    
    // Get a user with agent relationship
    const sampleUser = await db.query.users.findFirst({
      with: {
        agent: true
      },
      limit: 1
    });

    if (!sampleUser) {
      console.log('No users found in database');
      return;
    }

    console.log('User ID:', sampleUser.id);
    console.log('User bubble_id:', sampleUser.bubble_id);
    console.log('linked_agent_profile:', sampleUser.linked_agent_profile);
    console.log('Agent data:', sampleUser.agent ? {
      id: sampleUser.agent.id,
      bubble_id: sampleUser.agent.bubble_id,
      name: sampleUser.agent.name,
      email: sampleUser.agent.email,
      contact: sampleUser.agent.contact
    } : 'NO AGENT LINKED');
    
    console.log('\n--- Diagnosis ---');
    if (!sampleUser.linked_agent_profile) {
      console.log('❌ ISSUE FOUND: User has NO linked_agent_profile!');
      console.log('   This means agent updates will be silently skipped.');
    } else if (!sampleUser.agent) {
      console.log('❌ ISSUE FOUND: linked_agent_profile exists but no matching agent record!');
      console.log('   The linked_agent_profile value:', sampleUser.linked_agent_profile);
    } else {
      console.log('✅ User has properly linked agent profile');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugUserUpdate();
