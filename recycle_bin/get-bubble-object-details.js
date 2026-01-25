/**
 * GET DETAILS FOR FOUND BUBBLE OBJECTS
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

async function getObjectDetails(objectName) {
  try {
    const res = await fetch(`${BUBBLE_BASE_URL}/${objectName}?limit=1`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (!res.ok) {
      return { found: false, name: objectName };
    }

    const data = await res.json();
    const record = data.response.results[0];
    const remaining = data.response.remaining;

    return {
      found: true,
      name: objectName,
      fieldCount: Object.keys(record).length,
      fields: Object.keys(record),
      sample: record,
      totalRecords: remaining + 1
    };
  } catch (error) {
    return { found: false, name: objectName, error: error.message };
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     BUBBLE OBJECT DETAILS                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // invoice_item
  console.log('invoice_item:');
  console.log('─'.repeat(70) + '\n');

  const invoiceItem = await getObjectDetails('invoice_item');

  if (invoiceItem.found) {
    console.log(`✅ FOUND: "invoice_item"`);
    console.log(`Total Records: ${invoiceItem.totalRecords}`);
    console.log(`Fields: ${invoiceItem.fieldCount}\n`);

    console.log('All Fields:\n');
    invoiceItem.fields.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  } else {
    console.log('❌ NOT FOUND');
  }

  console.log('\n\n');

  // Try template variations
  console.log('Searching for invoice_template...\n');

  const templateNames = [
    'invoice_template',
    'template',
    'Template',
  ];

  for (const name of templateNames) {
    const result = await getObjectDetails(name);
    if (result.found) {
      console.log(`✅ FOUND: "${name}"`);
      console.log(`Total Records: ${result.totalRecords}`);
      console.log(`Fields: ${result.fieldCount}\n`);
      console.log('All Fields:\n');
      result.fields.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
      break;
    } else {
      console.log(`   ❌ "${name}"`);
    }
  }

  console.log('\n');
}

main();
