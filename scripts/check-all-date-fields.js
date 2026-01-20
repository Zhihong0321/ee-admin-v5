const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const INVOICE_ID = '1757580492227x987236194607431700';

async function checkAllDateFields() {
  const url = `https://eternalgy.bubbleapps.io/api/1.1/obj/invoice/${INVOICE_ID}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` },
  });
  const data = await response.json();
  const invoice = data.response;

  console.log('\n=== ALL DATE FIELDS IN BUBBLE ===\n');
  console.log('Invoice has', Object.keys(invoice).length, 'fields total\n');

  Object.entries(invoice).forEach(([key, value]) => {
    const isDate = value && (
      typeof value === 'string' && (
        value.includes('2025') ||
        value.includes('2024') ||
        value.includes('2026') ||
        value.includes('T') && value.includes('Z')
      )
    );

    if (isDate || key.toLowerCase().includes('date') || key.toLowerCase().includes('time')) {
      console.log(`  ${key}: ${value}`);
    }
  });

  console.log('\n=== SEARCHING FOR 2025/11/9 ===\n');
  Object.entries(invoice).forEach(([key, value]) => {
    if (value && typeof value === 'string' && value.includes('2025-11-09')) {
      console.log(`  ✅ FOUND: ${key} = ${value}`);
    }
    if (value && typeof value === 'string' && value.includes('2025-11-9')) {
      console.log(`  ✅ FOUND: ${key} = ${value}`);
    }
  });

  // If not found, search for November dates
  console.log('\n=== SEARCHING FOR NOVEMBER DATES ===\n');
  Object.entries(invoice).forEach(([key, value]) => {
    if (value && typeof value === 'string' && value.includes('11')) {
      console.log(`  ${key}: ${value}`);
    }
  });
}

checkAllDateFields().catch(console.error);
