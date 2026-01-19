/**
 * CHECK SPECIFIC INVOICE FIELDS - DETAILED
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

async function checkInvoice() {
  const invoiceId = '1767600992638x672718351750922200';

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     CHECKING INVOICE FROM BUBBLE                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    const response = await fetch(`${BUBBLE_BASE_URL}/invoice/${invoiceId}`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const data = await response.json();
    const invoice = data.response; // IMPORTANT: Bubble wraps in "response"

    console.log('✅ Invoice Found!\n');
    console.log(`Total fields in Bubble: ${Object.keys(invoice).length}\n`);

    console.log('CRITICAL FIELDS:');
    console.log('─'.repeat(70));
    console.log(`_id:                ${invoice['_id'] || 'N/A'}`);
    console.log(`Invoice ID:         ${invoice['Invoice ID'] || 'N/A'}`);
    console.log(`Invoice Number:     ${invoice['Invoice Number'] || 'N/A'}`);
    console.log(`Total Amount:       ${invoice['Total Amount'] || 'N/A'} (type: ${typeof invoice['Total Amount']})`);
    console.log(`Amount:             ${invoice['Amount'] || 'N/A'} (type: ${typeof invoice['Amount']})`);
    console.log(`Invoice Date:       ${invoice['Invoice Date'] || 'N/A'}`);
    console.log(`Created Date:       ${invoice['Created Date'] || 'N/A'}`);
    console.log(`Modified Date:      ${invoice['Modified Date'] || 'N/A'}`);
    console.log(`\n`);

    console.log('LINKED INVOICE ITEMS:');
    console.log('─'.repeat(70));
    const items = invoice['Linked Invoice Item'];
    if (Array.isArray(items)) {
      console.log(`Count: ${items.length}`);
      items.forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item}`);
      });
    } else {
      console.log(`Value: ${items} (type: ${typeof items})`);
    }
    console.log(`\n`);

    console.log('ALL FIELDS (sorted):');
    console.log('═'.repeat(70));
    Object.keys(invoice).sort().forEach((key, idx) => {
      const value = invoice[key];
      const valueStr = Array.isArray(value)
        ? `[Array with ${value.length} items: ${value.slice(0, 2).join(', ')}${value.length > 2 ? '...' : ''}]`
        : value === null
          ? 'null'
          : typeof value === 'object'
            ? '[object]'
            : String(value).substring(0, 60);

      console.log(`${(idx + 1).toString().padStart(3)}. ${key.padEnd(40)}: ${valueStr}`);
    });
    console.log('═'.repeat(70));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

checkInvoice();
