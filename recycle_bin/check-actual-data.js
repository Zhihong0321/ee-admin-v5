/**
 * CHECK: Query actual invoice data to see which columns have values
 * This will reveal the TRUE mapping between Bubble and Postgres
 */

const { Client } = require('pg');

const PG_CONNECTION = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';
const invoiceId = '1708327130811x106027240349761540';

async function checkActualData() {
  const client = new Client({ connectionString: PG_CONNECTION });

  try {
    await client.connect();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     FINDING TRUE BUBBLE → POSTGRES MAPPINGS               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Get the invoice from Postgres
    const result = await client.query(`
      SELECT *
      FROM invoice
      WHERE bubble_id = $1
    `, [invoiceId]);

    if (result.rows.length === 0) {
      console.log('❌ Invoice not found in Postgres');
      return;
    }

    const pg = result.rows[0];

    console.log('Sample Invoice Data from Postgres:\n');

    // Show all non-null columns related to payments/commission
    const relevantFields = [
      'bubble_id',
      'invoice_id',
      'invoice_number',
      'amount',
      'total_amount',
      'invoice_date',
      'created_date',
      'modified_date',
      // Payment fields
      '1st_payment',
      '1st_payment__',
      '1st_payment_date',
      '2nd_payment',
      '2nd_payment__',
      'full_payment_date',
      'last_payment_date',
      // Commission
      'normal_commission',
      'perf_tier_commission',
      'amount_eligible_for_comm',
      'commission_paid',
      // Tiers
      'performance_tier_month',
      'performance_tier_year',
      // Status
      'approval_status',
      'paid',
      'need_approval',
      'locked_package',
      // Other
      'panel_qty',
      'stamp_cash_price',
      'stock_status_inv',
      'type',
      'version',
      'dealercode',
      'linked_agent',
      'linked_customer',
      'linked_payment',
      'linked_seda_registration',
      'linked_invoice_item',
      'linked_package',
      'linked_agreement',
      'linked_stock_transaction',
      // Logs
      'logs',
    ];

    console.log('═══════════════════════════════════════════════════════════');
    console.log('ACTUAL DATA IN POSTGRES');
    console.log('═══════════════════════════════════════════════════════════\n');

    const data = {};
    relevantFields.forEach(field => {
      const value = pg[field];
      if (value !== null && value !== undefined) {
        data[field] = value;
        const display = Array.isArray(value) ? `Array[${value.length}]` :
                       typeof value === 'object' ? JSON.stringify(value).substring(0, 50) :
                       String(value);
        console.log(`  ${field.padEnd(35)} ${display}`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('BUBBLE DATA (for comparison)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Fetch from Bubble for comparison
    const bubbleRes = await fetch(`https://eternalgy.bubbleapps.io/api/1.1/obj/invoice/${invoiceId}`, {
      headers: { 'Authorization': 'Bearer b870d2b5ee6e6b39bcf99409c59c9e02' }
    });

    const bubbleData = await bubbleRes.json();
    const bubble = bubbleData.response;

    console.log('Bubble fields → Postgres columns:\n');

    const bubbleToPostgresMap = {
      'Amount': 'amount',
      'Total Amount': 'total_amount',
      'Invoice Date': 'invoice_date',
      'Created Date': 'created_date',
      'Modified Date': 'modified_date',
      '1st Payment %': data['1st_payment'] !== undefined ? '1st_payment' : '???',
      '1st Payment Date': data['1st_payment_date'] !== undefined ? '1st_payment_date' : '???',
      '2nd Payment %': data['2nd_payment'] !== undefined ? '2nd_payment' : '???',
      'Full Payment Date': data['full_payment_date'] !== undefined ? 'full_payment_date' : '???',
      'Last Payment Date': data['last_payment_date'] !== undefined ? 'last_payment_date' : '???',
      'Normal Commission': data['normal_commission'] !== undefined ? 'normal_commission' : '???',
      'Amount Eligible for Comm': data['amount_eligible_for_comm'] !== undefined ? 'amount_eligible_for_comm' : '???',
      'Commission Paid?': data['commission_paid'] !== undefined ? 'commission_paid' : '???',
      'Performance Tier Month': data['performance_tier_month'] !== undefined ? 'performance_tier_month' : '???',
      'Performance Tier Year': data['performance_tier_year'] !== undefined ? 'performance_tier_year' : '???',
      'Panel Qty': data['panel_qty'] !== undefined ? 'panel_qty' : '???',
      'Stamp Cash Price': data['stamp_cash_price'] !== undefined ? 'stamp_cash_price' : '???',
      'Approval Status': data['approval_status'] !== undefined ? 'approval_status' : '???',
      'Paid?': data['paid'] !== undefined ? 'paid' : '???',
      'Need Approval': data['need_approval'] !== undefined ? 'need_approval' : '???',
      'Locked Package?': data['locked_package'] !== undefined ? 'locked_package' : '???',
      'Stock Status INV': data['stock_status_inv'] !== undefined ? 'stock_status_inv' : '???',
      'Type': data['type'] !== undefined ? 'type' : '???',
      'Version': data['version'] !== undefined ? 'version' : '???',
      'Dealercode': data['dealercode'] !== undefined ? 'dealercode' : '???',
      'Linked Customer': data['linked_customer'] !== undefined ? 'linked_customer' : '???',
      'Linked Agent': data['linked_agent'] !== undefined ? 'linked_agent' : '???',
      'Linked Payment': data['linked_payment'] !== undefined ? 'linked_payment' : '???',
      'Linked SEDA registration': data['linked_seda_registration'] !== undefined ? 'linked_seda_registration' : '???',
      'Linked Invoice Item': data['linked_invoice_item'] !== undefined ? 'linked_invoice_item' : '???',
      'Linked Package': data['linked_package'] !== undefined ? 'linked_package' : '???',
      'Linked Agreement': data['linked_agreement'] !== undefined ? 'linked_agreement' : '???',
      'Linked Stock Transaction': data['linked_stock_transaction'] !== undefined ? 'linked_stock_transaction' : '???',
      'Logs': data['logs'] !== undefined ? 'logs' : '???',
    };

    Object.entries(bubbleToPostgresMap).forEach(([bubble, pgCol]) => {
      const bubbleValue = bubble[bubble];
      const pgValue = pg[pgCol.replace('???', '')];
      const match = pgCol !== '???';

      const bubbleDisplay = Array.isArray(bubbleValue) ? `Array[${bubbleValue.length}]` :
                          bubbleValue === undefined ? '(undefined)' :
                          String(bubbleValue).substring(0, 40);
      const pgDisplay = pgValue === undefined ? '(undefined)' :
                       String(pgValue).substring(0, 40);

      const status = match ? '✅' : '❌';
      const pgDisplayFull = match ? pgCol : 'COLUMN NOT FOUND';

      console.log(`  ${status} ${bubble.padEnd(35)} → ${pgDisplayFull.padEnd(35)}`);
      if (match && bubbleValue !== pgValue) {
        console.log(`     Bubble: ${bubbleDisplay}`);
        console.log(`     PG:     ${pgDisplay}`);
        console.log('');
      }
    });

  } finally {
    await client.end();
  }
}

checkActualData();
