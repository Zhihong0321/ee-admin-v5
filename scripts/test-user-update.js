import { db } from '../src/lib/db.ts';
import { users, agents } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function testUserUpdate() {
  try {
    console.log('Step 1: Fetching a user to test...\n');
    
    const testUser = await db.query.users.findFirst({
      with: { agent: true },
      limit: 1
    });

    if (!testUser || !testUser.agent) {
      console.log('❌ No user with linked agent found');
      return;
    }

    console.log('Original Agent Data:');
    console.log('  Name:', testUser.agent.name);
    console.log('  Email:', testUser.agent.email);
    console.log('  Contact:', testUser.agent.contact);
    console.log('  User ID:', testUser.id);
    console.log('  Agent bubble_id:', testUser.linked_agent_profile);
    
    console.log('\n\nStep 2: Attempting update with NEW data...');
    const testData = {
      name: 'TEST UPDATE ' + Date.now(),
      email: 'test@example.com',
      contact: '1234567890'
    };
    console.log('  New name:', testData.name);
    console.log('  New email:', testData.email);
    console.log('  New contact:', testData.contact);

    // Simulate what the action does
    if (testUser.linked_agent_profile) {
      console.log('\n✅ linked_agent_profile exists, proceeding with update...');
      
      const result = await db
        .update(agents)
        .set({
          ...testData,
          updated_at: new Date(),
        })
        .where(eq(agents.bubble_id, testUser.linked_agent_profile))
        .returning();
      
      console.log('\nUpdate query executed!');
      console.log('Rows affected:', result.length);
      
      if (result.length > 0) {
        console.log('\n✅ Update successful! Updated data:');
        console.log('  Name:', result[0].name);
        console.log('  Email:', result[0].email);
        console.log('  Contact:', result[0].contact);
      } else {
        console.log('\n❌ UPDATE FAILED - No rows were updated!');
        console.log('This means the WHERE clause did not match any records.');
      }
    } else {
      console.log('\n❌ No linked_agent_profile - update would be skipped');
    }

    console.log('\n\nStep 3: Verifying the actual data in DB...');
    const verifyUser = await db.query.users.findFirst({
      where: eq(users.id, testUser.id),
      with: { agent: true }
    });

    console.log('Current Agent Data in DB:');
    console.log('  Name:', verifyUser.agent?.name);
    console.log('  Email:', verifyUser.agent?.email);
    console.log('  Contact:', verifyUser.agent?.contact);

    // Rollback the test change
    console.log('\n\nStep 4: Rolling back test change...');
    await db
      .update(agents)
      .set({
        name: testUser.agent.name,
        email: testUser.agent.email,
        contact: testUser.agent.contact,
        updated_at: new Date(),
      })
      .where(eq(agents.bubble_id, testUser.linked_agent_profile));
    console.log('✅ Rolled back to original values');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during test:', error);
    process.exit(1);
  }
}

testUserUpdate();
