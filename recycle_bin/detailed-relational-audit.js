/**
 * DETAILED AUDIT: Get exact Bubble field lists for all relational tables
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

// Try multiple possible names
const TABLE_NAMES = {
  customer: ['Customer_Profile', 'customer', 'Customer'],
  invoice_template: ['invoice_template', 'Invoice Template', 'Invoice_Template'],
};

async function tryFetchTable(names) {
  for (const name of names) {
    try {
      const res = await fetch(`${BUBBLE_BASE_URL}/${name}?limit=1`, {
        headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
      });

      if (res.ok) {
        const data = await res.json();
        return { name, fields: Object.keys(data.response.results[0] || {}) };
      }
    } catch (e) {
      // Try next name
    }
  }
  return null;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FINDING CORRECT BUBBLE TABLE NAMES                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Test customer
  console.log('Testing Customer...');
  const customer = await tryFetchTable(TABLE_NAMES.customer);
  if (customer) {
    console.log(`✓ Found: "${customer.name}" with ${customer.fields.length} fields\n`);
    console.log('Fields:');
    customer.fields.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  } else {
    console.log('❌ Not found\n');
  }

  console.log('\n' + '─'.repeat(60) + '\n');

  // Test invoice_template
  console.log('Testing Invoice Template...');
  const template = await tryFetchTable(TABLE_NAMES.invoice_template);
  if (template) {
    console.log(`✓ Found: "${template.name}" with ${template.fields.length} fields\n`);
    console.log('Fields:');
    template.fields.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  } else {
    console.log('❌ Not found\n');
  }

  // Fetch detailed fields from other tables
  console.log('\n' + '═'.repeat(60) + '\n');
  console.log('FETCHING ALL BUBBLE FIELDS FOR COMPARISON\n');

  const tables = [
    { name: 'agent', bubble: 'agent' },
    { name: 'payment', bubble: 'payment' },
    { name: 'submit_payment', bubble: 'submit_payment' },
    { name: 'seda_registration', bubble: 'seda_registration' },
    { name: 'invoice_item', bubble: 'invoice_new_item' }, // Try this name
    { name: 'user', bubble: 'user' },
  ];

  for (const table of tables) {
    console.log(`\n${table.bubble.toUpperCase()}:`);
    try {
      const res = await fetch(`${BUBBLE_BASE_URL}/${table.bubble}?limit=1`, {
        headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
      });

      if (res.ok) {
        const data = await res.json();
        const fields = Object.keys(data.response.results[0] || {});
        console.log(`  Fields: ${fields.length}`);
        fields.slice(0, 20).forEach(f => console.log(`    • ${f}`));
        if (fields.length > 20) {
          console.log(`    ... and ${fields.length - 20} more`);
        }
      } else {
        console.log(`  ❌ Failed: ${res.status}`);
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }

  console.log('\n');
}

main();
