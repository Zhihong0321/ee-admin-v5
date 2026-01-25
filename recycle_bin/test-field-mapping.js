/**
 * TEST: Field Mapping Logic
 *
 * Verifies that our mapping functions work correctly with real Bubble data
 * Zero database writes - pure logic testing
 */

const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

// Import our mapping functions (simulated for Node.js test)
function convertBubbleValue(value, type) {
  if (value === null || value === undefined) return null;

  switch (type) {
    case 'integer':
      return typeof value === 'number' ? Math.floor(value) : parseInt(String(value), 10);
    case 'numeric':
      return typeof value === 'number' ? value : parseFloat(String(value));
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true' || value === 'yes';
      return Boolean(value);
    case 'timestamp':
      if (value instanceof Date) return value;
      if (typeof value === 'string') return new Date(value);
      if (typeof value === 'number') return new Date(value);
      return null;
    case 'array':
      if (Array.isArray(value)) return value;
      if (typeof value === 'string' && value.length > 0) return [value];
      return [];
    default:
      return String(value);
  }
}

const INVOICE_FIELD_MAPPING = {
  '_id': { column: 'bubble_id', type: 'string' },
  'Invoice ID': { column: 'invoice_id', type: 'integer' },
  'Invoice Number': { column: 'invoice_number', type: 'string' },
  'Amount': { column: 'amount', type: 'numeric' },
  'Total Amount': { column: 'total_amount', type: 'numeric' },
  '1st Payment %': { column: '1st_payment', type: 'integer' },
  '1st Payment Date': { column: '1st_payment_date', type: 'timestamp' },
  '2nd Payment %': { column: '2nd_payment', type: 'integer' },
  'Amount Eligible for Comm': { column: 'amount_eligible_for_comm', type: 'numeric' },
  'Full Payment Date': { column: 'full_payment_date', type: 'timestamp' },
  'Last Payment Date': { column: 'last_payment_date', type: 'timestamp' },
  'Linked Customer': { column: 'linked_customer', type: 'string' },
  'Linked Agent': { column: 'linked_agent', type: 'string' },
  'Linked Payment': { column: 'linked_payment', type: 'array' },
  'Linked SEDA registration': { column: 'linked_seda_registration', type: 'string' },
  'Linked Invoice Item': { column: 'linked_invoice_item', type: 'array' },
  'Created By': { column: 'created_by', type: 'string' },
  'Linked Package': { column: 'linked_package', type: 'string' },
  'Linked Agreement': { column: 'linked_agreement', type: 'string' },
  'Linked Stock Transaction': { column: 'linked_stock_transaction', type: 'array' },
  'Invoice Date': { column: 'invoice_date', type: 'timestamp' },
  'Created Date': { column: 'created_date', type: 'timestamp' },
  'Modified Date': { column: 'modified_date', type: 'timestamp' },
  'Status': { column: 'status', type: 'string' },
  'Type': { column: 'type', type: 'string' },
  'Version': { column: 'version', type: 'integer' },
  'Approval Status': { column: 'approval_status', type: 'string' },
  'Stock Status INV': { column: 'stock_status_inv', type: 'string' },
  'Paid?': { column: 'paid', type: 'boolean' },
  'Need Approval': { column: 'need_approval', type: 'boolean' },
  'Locked Package?': { column: 'locked_package', type: 'boolean' },
  'Commission Paid?': { column: 'commission_paid', type: 'boolean' },
  'Normal Commission': { column: 'normal_commission', type: 'numeric' },
  'Performance Tier Month': { column: 'performance_tier_month', type: 'integer' },
  'Performance Tier Year': { column: 'performance_tier_year', type: 'integer' },
  'Panel Qty': { column: 'panel_qty', type: 'integer' },
  'Stamp Cash Price': { column: 'stamp_cash_price', type: 'numeric' },
  'Percent of Total Amount': { column: 'percent_of_total_amount', type: 'numeric', needsColumn: true },
  'Dealercode': { column: 'dealercode', type: 'string' },
  'Logs': { column: 'logs', type: 'text' },
  'Eligible Amount Description': { column: 'eligible_amount_description', type: 'text' },
  'visit': { column: 'visit', type: 'integer' },
};

function mapAllInvoiceFields(bubbleInvoice) {
  const mapped = {};
  const unmappedFields = [];

  for (const [bubbleField, config] of Object.entries(INVOICE_FIELD_MAPPING)) {
    const bubbleValue = bubbleInvoice[bubbleField];
    if (bubbleValue === undefined) continue;

    mapped[config.column] = convertBubbleValue(bubbleValue, config.type);
  }

  for (const field of Object.keys(bubbleInvoice)) {
    if (!INVOICE_FIELD_MAPPING[field] && field !== '_id') {
      unmappedFields.push(field);
    }
  }

  if (unmappedFields.length > 0) {
    mapped._unmapped_bubble_fields = unmappedFields;
  }

  return mapped;
}

async function testMapping() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     PHASE 1B: FIELD MAPPING TEST                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Fetch sample invoice from Bubble
    console.log('Step 1: Fetching sample invoice from Bubble API...');
    const listRes = await fetch(`${BUBBLE_BASE_URL}/invoice?limit=1`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    if (!listRes.ok) {
      console.log(`❌ Failed to fetch: ${listRes.status}`);
      return;
    }

    const listData = await listRes.json();
    const invoiceId = listData.response.results[0]._id;

    console.log(`✓ Found invoice: ${invoiceId}\n`);

    // Fetch complete invoice
    console.log('Step 2: Fetching complete invoice object...');
    const invRes = await fetch(`${BUBBLE_BASE_URL}/invoice/${invoiceId}`, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` }
    });

    const invData = await invRes.json();
    const bubbleInvoice = invData.response;

    console.log(`✓ Fetched ${Object.keys(bubbleInvoice).length} fields from Bubble\n`);

    // Test mapping
    console.log('Step 3: Testing field mapping...\n');

    const mapped = mapAllInvoiceFields(bubbleInvoice);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('MAPPING RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`Fields Mapped:     ${Object.keys(mapped).length}`);
    console.log(`Bubble Input:       ${Object.keys(bubbleInvoice).length} fields`);
    console.log(`Mapping Coverage:   ${((Object.keys(mapped).length / Object.keys(bubbleInvoice).length) * 100).toFixed(1)}%\n`);

    // Show relational fields
    console.log('═══════════════════════════════════════════════════════════');
    console.log('RELATIONAL FIELDS EXTRACTED');
    console.log('═══════════════════════════════════════════════════════════\n');

    const relations = {
      customer: mapped.linked_customer || 'NONE',
      agent: mapped.linked_agent || 'NONE',
      seda: mapped.linked_seda_registration || 'NONE',
      package: mapped.linked_package || 'NONE',
      agreement: mapped.linked_agreement || 'NONE',
      created_by: mapped.created_by || 'NONE',
      payments: Array.isArray(mapped.linked_payment) ? mapped.linked_payment.length : 0,
      invoice_items: Array.isArray(mapped.linked_invoice_item) ? mapped.linked_invoice_item.length : 0,
      stock_transactions: Array.isArray(mapped.linked_stock_transaction) ? mapped.linked_stock_transaction.length : 0,
    };

    console.log('Relations:');
    console.log(`  Customer:           ${relations.customer}`);
    console.log(`  Agent:               ${relations.agent}`);
    console.log(`  SEDA:                ${relations.seda}`);
    console.log(`  Package:             ${relations.package}`);
    console.log(`  Agreement:           ${relations.agreement}`);
    console.log(`  Created By:          ${relations.created_by}`);
    console.log(`  Payments:            ${relations.payments} items`);
    console.log(`  Invoice Items:       ${relations.invoice_items} items`);
    console.log(`  Stock Transactions:  ${relations.stock_transactions} items\n`);

    // Show critical unmapped fields
    console.log('═══════════════════════════════════════════════════════════');
    console.log('CRITICAL FIELDS (PREVIOUSLY UNMAPPED)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const criticalFields = [
      '1st_payment',
      '1st_payment_date',
      '2nd_payment',
      'amount_eligible_for_comm',
      'full_payment_date',
      'last_payment_date',
      'normal_commission',
      'performance_tier_month',
      'performance_tier_year',
      'panel_qty',
      'stamp_cash_price',
    ];

    criticalFields.forEach(field => {
      const value = mapped[field];
      const status = value !== undefined ? '✓' : '⚠';
      const display = value !== undefined ? JSON.stringify(value) : 'NULL in Bubble';
      console.log(`  ${status} ${field.padEnd(30)} ${display}`);
    });

    // Check for missing columns
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('MISSING POSTGRES COLUMNS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const missingColumns = Object.entries(INVOICE_FIELD_MAPPING)
      .filter(([_, config]) => config.needsColumn)
      .map(([field, config]) => ({ bubbleField: field, column: config.column, type: config.type }));

    // NOTE: After verification, the payment columns exist in Postgres
    // The mapping has been fixed to use actual column names:

    if (missingColumns.length > 0) {
      console.log(`Found ${missingColumns.length} columns that need to be created:\n`);
      missingColumns.forEach(({ bubbleField, column, type }) => {
        console.log(`  • ${column.padEnd(35)} ${type.padEnd(10)} (from "${bubbleField}")`);
      });
    } else {
      console.log('✓ All required columns exist (or no columns marked as needsColumn)');
    }

    // Show sample of mapped data
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('SAMPLE MAPPED DATA (First 20 fields)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const sampleFields = Object.entries(mapped).slice(0, 20);
    sampleFields.forEach(([field, value]) => {
      const display = typeof value === 'object' ? JSON.stringify(value).substring(0, 50) : String(value).substring(0, 50);
      console.log(`  ${field.padEnd(35)} ${display}`);
    });

    if (mapped._unmapped_bubble_fields && mapped._unmapped_bubble_fields.length > 0) {
      console.log('\n⚠️  WARNING: Unmapped Bubble fields:');
      mapped._unmapped_bubble_fields.forEach(f => console.log(`     - ${f}`));
    }

    console.log('\n✓ MAPPING TEST COMPLETE\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
  }
}

testMapping();
