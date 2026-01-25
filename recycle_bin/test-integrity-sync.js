/**
 * TEST INTEGRITY SYNC FUNCTION
 *
 * Run with: node test-integrity-sync.js
 *
 * This script tests the new integrity sync function with a real invoice
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

async function testIntegritySync() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     INTEGRITY SYNC TEST                                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // STEP 1: Get a recent invoice from Bubble
  console.log('STEP 1: Fetching a recent invoice from Bubble...\n');

  try {
    const response = await fetch(`${BUBBLE_BASE_URL}/invoice?limit=1`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch invoice: ${response.statusText}`);
    }

    const data = await response.json();
    const invoice = data.response.results[0];

    console.log('✅ Found invoice:');
    console.log(`   Bubble ID: ${invoice._id}`);
    console.log(`   Invoice Number: ${invoice['Invoice Number'] || 'N/A'}`);
    console.log(`   Customer: ${invoice['Linked Customer'] || 'None'}`);
    console.log(`   Agent: ${invoice['Linked Agent'] || 'None'}`);
    console.log(`   Total Amount: ${invoice['Total Amount'] || 'N/A'}`);
    console.log(`   Modified Date: ${invoice['Modified Date']}\n`);

    // STEP 2: Extract relations
    console.log('STEP 2: Extracting relations...\n');

    const relations = {
      customer: invoice['Linked Customer'],
      agent: invoice['Linked Agent'],
      created_by: invoice['Created By'],
      payments: invoice['Linked Payment'],
      invoice_items: invoice['invoice_item'],
      seda: invoice['Linked SEDA Registration']
    };

    console.log('Relations found:');
    console.log(`   Customer: ${relations.customer || 'None'}`);
    console.log(`   Agent: ${relations.agent || 'None'}`);
    console.log(`   Created By: ${relations.created_by || 'None'}`);
    console.log(`   Payments: ${Array.isArray(relations.payments) ? relations.payments.length : 0} payment(s)`);
    console.log(`   Invoice Items: ${Array.isArray(relations.invoice_items) ? relations.invoice_items.length : 0} item(s)`);
    console.log(`   SEDA: ${relations.seda || 'None'}\n`);

    // STEP 3: Test fetching each relation
    console.log('STEP 3: Testing relation fetch from Bubble...\n');

    const fetchRecord = async (typeName, id, label) => {
      if (!id) {
        console.log(`   ⚠️  ${label}: No ID`);
        return null;
      }

      try {
        const res = await fetch(`${BUBBLE_BASE_URL}/${typeName}/${id}`, {
          headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
        });

        if (!res.ok) {
          console.log(`   ❌ ${label}: Failed to fetch (${res.statusText})`);
          return null;
        }

        const record = await res.json();
        console.log(`   ✅ ${label}: Fetched successfully`);
        return record.response;
      } catch (error) {
        console.log(`   ❌ ${label}: ${error.message}`);
        return null;
      }
    };

    // Test customer
    await fetchRecord('Customer_Profile', relations.customer, 'Customer');

    // Test agent
    await fetchRecord('agent', relations.agent, 'Agent');

    // Test created_by (user)
    await fetchRecord('user', relations.created_by, 'Created By (User)');

    // Test payments (array)
    if (Array.isArray(relations.payments) && relations.payments.length > 0) {
      console.log(`   📄 Payments: ${relations.payments.length} payment(s)`);
      for (let i = 0; i < Math.min(3, relations.payments.length); i++) {
        await fetchRecord('payment', relations.payments[i], `   └─ Payment ${i + 1}`);
      }
    }

    // Test invoice items (array)
    if (Array.isArray(relations.invoice_items) && relations.invoice_items.length > 0) {
      console.log(`   📦 Invoice Items: ${relations.invoice_items.length} item(s)`);
      for (let i = 0; i < Math.min(3, relations.invoice_items.length); i++) {
        await fetchRecord('invoice_item', relations.invoice_items[i], `   └─ Item ${i + 1}`);
      }
    }

    // Test SEDA
    await fetchRecord('seda_registration', relations.seda, 'SEDA Registration');

    console.log('\n✅ All relations accessible from Bubble API!\n');

    // STEP 4: Instructions for testing the actual sync
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     NEXT STEPS                                                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('To test the actual sync function:\n');
    console.log('1. Start your dev server:');
    console.log('   npm run dev\n');
    console.log('2. Open your browser console (F12)\n');
    console.log('3. Run this code in the console:');
    console.log(`
      const { runIntegritySync } = await import('./src/app/sync/actions.ts');
      const result = await runIntegritySync('${invoice._id}', { force: true });
      console.log('Result:', result);
    `);
    console.log('\n4. Check the results:');
    console.log('   - Success status');
    console.log('   - Stats (agent, customer, user, payments, items, seda)');
    console.log('   - Errors (if any)');
    console.log('   - Steps (progress log)\n');

    console.log('5. Verify in your database:');
    console.log(`   SELECT * FROM invoice WHERE bubble_id = '${invoice._id}';`);
    console.log(`   SELECT * FROM customer WHERE customer_id = '${relations.customer}';`);
    console.log(`   SELECT * FROM agent WHERE bubble_id = '${relations.agent}';\n`);

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     TEST COMPLETE                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testIntegritySync();
