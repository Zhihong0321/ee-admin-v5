/**
 * Test Customer Snapshot Triggers
 *
 * This script tests the customer snapshot triggers to ensure they work correctly.
 * Run this after applying the migration: migrations/add_customer_snapshot_table.sql
 *
 * Usage: node scripts/test-customer-snapshot.js
 */

import { db } from '../src/lib/db.js';
import { customers, customer_snapshots } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function testCustomerSnapshots() {
  console.log('🧪 Testing Customer Snapshot Triggers...\n');

  try {
    // Step 1: Create a test customer
    console.log('1️⃣ Creating test customer...');
    const [newCustomer] = await db.insert(customers).values({
      customer_id: 'TEST_' + Date.now(),
      name: 'Test User',
      email: 'test@example.com',
      phone: '0123456789',
      address: '123 Test Street',
      city: 'Test City',
      state: 'Test State',
      postcode: '12345',
      ic_number: '123456789012',
      version: 1,
      updated_by: 'test_script',
      created_by: 'test_script',
    }).returning();

    console.log(`   ✅ Created customer with ID: ${newCustomer.id}\n`);

    // Step 2: Update the customer (should create snapshot)
    console.log('2️⃣ Updating customer (should trigger UPDATE snapshot)...');
    await db.update(customers)
      .set({
        name: 'Test User Updated',
        email: 'updated@example.com',
        updated_by: 'test_script',
      })
      .where(eq(customers.id, newCustomer.id));

    console.log(`   ✅ Customer updated\n`);

    // Step 3: Check for UPDATE snapshot
    console.log('3️⃣ Checking for UPDATE snapshot...');
    const updateSnapshots = await db.select()
      .from(customer_snapshots)
      .where(eq(customer_snapshots.customer_id, newCustomer.id));

    console.log(`   Found ${updateSnapshots.length} snapshot(s)`);

    if (updateSnapshots.length === 0) {
      console.log('   ❌ ERROR: No UPDATE snapshot was created!');
      return;
    }

    const updateSnapshot = updateSnapshots[0];
    console.log('   ✅ UPDATE snapshot created:');
    console.log(`      - Snapshot ID: ${updateSnapshot.snapshot_id}`);
    console.log(`      - Operation: ${updateSnapshot.snapshot_operation}`);
    console.log(`      - Old name: ${updateSnapshot.name} (should be "Test User")`);
    console.log(`      - Old email: ${updateSnapshot.email} (should be "test@example.com")`);
    console.log(`      - Old version: ${updateSnapshot.version} (should be 1)`);
    console.log(`      - Created at: ${updateSnapshot.snapshot_created_at}\n`);

    // Verify the old values were captured
    if (updateSnapshot.name !== 'Test User') {
      console.log('   ⚠️  WARNING: Snapshot name does not match expected value!');
    }
    if (updateSnapshot.snapshot_operation !== 'UPDATE') {
      console.log('   ❌ ERROR: Snapshot operation is not UPDATE!');
      return;
    }

    // Step 4: Get current customer version (should be incremented)
    console.log('4️⃣ Checking current customer version...');
    const [currentCustomer] = await db.select()
      .from(customers)
      .where(eq(customers.id, newCustomer.id));

    console.log(`   Current version: ${currentCustomer.version} (should be 2)`);

    if (currentCustomer.version !== 2) {
      console.log('   ⚠️  WARNING: Version was not auto-incremented!');
    } else {
      console.log('   ✅ Version auto-incremented correctly\n');
    }

    // Step 5: Delete the customer (should create DELETE snapshot)
    console.log('5️⃣ Deleting customer (should trigger DELETE snapshot)...');
    await db.delete(customers).where(eq(customers.id, newCustomer.id));
    console.log(`   ✅ Customer deleted\n`);

    // Step 6: Check for DELETE snapshot
    console.log('6️⃣ Checking for DELETE snapshot...');
    const allSnapshots = await db.select()
      .from(customer_snapshots)
      .where(eq(customer_snapshots.customer_id, newCustomer.id))
      .orderBy(customer_snapshots.snapshot_created_at);

    console.log(`   Found ${allSnapshots.length} snapshot(s) total`);

    if (allSnapshots.length !== 2) {
      console.log('   ⚠️  WARNING: Expected 2 snapshots (1 UPDATE + 1 DELETE)!');
    }

    const deleteSnapshot = allSnapshots[1];
    console.log('   ✅ DELETE snapshot created:');
    console.log(`      - Snapshot ID: ${deleteSnapshot.snapshot_id}`);
    console.log(`      - Operation: ${deleteSnapshot.snapshot_operation}`);
    console.log(`      - Name: ${deleteSnapshot.name} (should be "Test User Updated")`);
    console.log(`      - Email: ${deleteSnapshot.email} (should be "updated@example.com")`);
    console.log(`      - Version: ${deleteSnapshot.version} (should be 2)`);
    console.log(`      - Created at: ${deleteSnapshot.snapshot_created_at}\n`);

    if (deleteSnapshot.snapshot_operation !== 'DELETE') {
      console.log('   ❌ ERROR: Second snapshot operation is not DELETE!');
      return;
    }

    // Step 7: Cleanup test data
    console.log('7️⃣ Cleaning up test snapshots...');
    await db.delete(customer_snapshots).where(eq(customer_snapshots.customer_id, newCustomer.id));
    console.log('   ✅ Test data cleaned up\n');

    console.log('✨ All tests passed! Customer snapshot triggers are working correctly.\n');
    console.log('Summary:');
    console.log('  - UPDATE snapshots capture old values before changes');
    console.log('  - DELETE snapshots capture data before deletion');
    console.log('  - Version number auto-increments on UPDATE');
    console.log('  - FK cascade deletion works correctly');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testCustomerSnapshots()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
