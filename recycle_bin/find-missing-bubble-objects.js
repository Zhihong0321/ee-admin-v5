/**
 * FIND MISSING BUBBLE OBJECTS
 *
 * Trying to find correct Bubble object names for:
 * - invoice_item
 * - invoice_template
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

async function tryObjectName(name) {
  try {
    const res = await fetch(`${BUBBLE_BASE_URL}/${name}?limit=1`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (res.ok) {
      const data = await res.json();
      const count = data.response.remaining;
      return { found: true, name, count };
    }

    return { found: false, name };
  } catch (error) {
    return { found: false, name, error: error.message };
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FINDING MISSING BUBBLE OBJECTS                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Try all possible variations
  const invoiceItemNames = [
    'invoice_new_item',
    'invoice_item',
    'Invoice Item',
    'Invoice Items',
    'InvoiceItem',
    'invoiceItems',
    'Invoice_New_Item',
    'Invoice_New_Item',
    'line_item',
    'Line Item',
  ];

  const templateNames = [
    'invoice_template',
    'Invoice Template',
    'Invoice Templates',
    'InvoiceTemplate',
    'invoiceTemplates',
    'template',
    'Template',
  ];

  console.log('Searching for invoice_item object...\n');

  for (const name of invoiceItemNames) {
    const result = await tryObjectName(name);
    if (result.found) {
      console.log(`✅ FOUND: "${name}" (records: ${result.count + 1}+)\n`);
      const data = await tryObjectName(name);
      const fields = Object.keys(data.sample);
      console.log(`Fields (${fields.length}):`);
      fields.forEach(f => console.log(`  • ${f}`));
      break;
    } else {
      console.log(`   ❌ "${name}"`);
    }
  }

  console.log('\n' + '─'.repeat(70) + '\n');
  console.log('Searching for invoice_template object...\n');

  for (const name of templateNames) {
    const result = await tryObjectName(name);
    if (result.found) {
      console.log(`✅ FOUND: "${name}" (records: ${result.count + 1}+)\n`);
      break;
    } else {
      console.log(`   ❌ "${name}"`);
    }
  }

  console.log('\n');
}

main();
