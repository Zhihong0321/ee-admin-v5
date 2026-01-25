/**
 * CHECK: Do Bubble field names match Postgres column names?
 *
 * This is CRITICAL - if names don't match, data won't sync!
 */

const { Client } = require('pg');

const PG_CONNECTION = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function checkColumnNames() {
  const client = new Client({ connectionString: PG_CONNECTION });

  try {
    await client.connect();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     CRITICAL: COLUMN NAME VERIFICATION                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Get ALL invoice column names
    const result = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'invoice'
        AND table_schema = 'public'
      ORDER BY column_name;
    `);

    const pgColumns = result.rows.map(r => r.column_name);

    console.log(`Postgres has ${pgColumns.length} columns:\n`);

    // Bubble field names from our audit
    const bubbleFields = [
      '1st Payment %',
      '1st Payment Date',
      '2nd Payment %',
      'Amount',
      'Amount Eligible for Comm',
      'Approval Status',
      'Commission Paid?',
      'Created By',
      'Created Date',
      'Dealercode',
      'Eligible Amount Description',
      'Full Payment Date',
      'Invoice Date',
      'Invoice ID',
      'Last Payment Date',
      'Linked Agent',
      'Linked Agreement',
      'Linked Customer',
      'Linked Invoice Item',
      'Linked Package',
      'Linked Payment',
      'Linked SEDA registration',
      'Linked Stock Transaction',
      'Locked Package?',
      'Logs',
      'Modified Date',
      'Need Approval',
      'Normal Commission',
      'Paid?',
      'Panel Qty',
      'Percent of Total Amount',
      'Performance Tier Month',
      'Performance Tier Year',
      'Stamp Cash Price',
      'Stock Status INV',
      'Type',
      'Version',
      'visit',
    ];

    // My mapping (what I used in bubble-field-mappings.ts)
    const myMapping = {
      '1st Payment %': 'first_payment_percent',
      '1st Payment Date': 'first_payment_date',
      '2nd Payment %': 'second_payment_percent',
      'Amount Eligible for Comm': 'amount_eligible_for_comm',
      'Approval Status': 'approval_status',
      'Commission Paid?': 'commission_paid',
      'Dealercode': 'dealercode',
      'Eligible Amount Description': 'eligible_amount_description',
      'Full Payment Date': 'full_payment_date',
      'Last Payment Date': 'last_payment_date',
      'Linked Agreement': 'linked_agreement',
      'Linked Package': 'linked_package',
      'Linked SEDA registration': 'linked_seda_registration',
      'Linked Stock Transaction': 'linked_stock_transaction',
      'Locked Package?': 'locked_package',
      'Logs': 'logs',
      'Need Approval': 'need_approval',
      'Normal Commission': 'normal_commission',
      'Paid?': 'paid',
      'Panel Qty': 'panel_qty',
      'Percent of Total Amount': 'percent_of_total_amount',
      'Performance Tier Month': 'performance_tier_month',
      'Performance Tier Year': 'performance_tier_year',
      'Stamp Cash Price': 'stamp_cash_price',
      'Stock Status INV': 'stock_status_inv',
      'Type': 'type',
      'Version': 'version',
    };

    console.log('═══════════════════════════════════════════════════════════');
    console.log('VERIFICATION: Does my mapping match actual Postgres columns?');
    console.log('═══════════════════════════════════════════════════════════\n');

    const exactMatches = [];
    const differentNames = [];
    const missingInPostgres = [];

    for (const [bubbleField, myColumn] of Object.entries(myMapping)) {
      if (pgColumns.includes(myColumn)) {
        exactMatches.push({ bubble: bubbleField, pg: myColumn });
      } else {
        // Check if there's a similar column in Postgres
        const similar = pgColumns.find(col =>
          col.toLowerCase().includes(bubbleField.toLowerCase().replace(/[^a-z0-9]/g, '')) ||
          bubbleField.toLowerCase().replace(/[^a-z0-9]/g, '').includes(col.toLowerCase())
        );

        if (similar) {
          differentNames.push({
            bubble: bubbleField,
            iMappedTo: myColumn,
            postgresHas: similar
          });
        } else {
          missingInPostgres.push({ bubble: bubbleField, iMappedTo: myColumn });
        }
      }
    }

    console.log(`✅ EXACT MATCHES (${exactMatches.length}):`);
    exactMatches.slice(0, 10).forEach(({ bubble, pg }) => {
      console.log(`   "${bubble}" → ${pg}`);
    });
    if (exactMatches.length > 10) {
      console.log(`   ... and ${exactMatches.length - 10} more`);
    }

    if (differentNames.length > 0) {
      console.log(`\n⚠️  NAME MISMATCHES (${differentNames.length}):`);
      console.log('   I mapped to WRONG column name!\n');
      differentNames.forEach(({ bubble, iMappedTo, postgresHas }) => {
        console.log(`   Bubble: "${bubble}"`);
        console.log(`   I mapped to:     ${iMappedTo} ❌`);
        console.log(`   Postgres has:    ${postgresHas} ✅`);
        console.log('');
      });
    }

    if (missingInPostgres.length > 0) {
      console.log(`\n❌ MISSING FROM POSTGRES (${missingInPostgres.length}):`);
      console.log('   These columns DO NOT EXIST in Postgres:\n');
      missingInPostgres.forEach(({ bubble, iMappedTo }) => {
        console.log(`   Bubble: "${bubble}"`);
        console.log(`   I mapped to: ${iMappedTo} → COLUMN DOESN'T EXIST!`);
        console.log('');
      });
    }

    // Show the actual columns for comparison
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ACTUAL POSTGRES COLUMNS (for reference):');
    console.log('═══════════════════════════════════════════════════════════\n');

    const relevant = pgColumns.filter(col =>
      col.includes('payment') ||
      col.includes('commission') ||
      col.includes('tier') ||
      col.includes('stamp') ||
      col.includes('panel') ||
      col.includes('approval') ||
      col.includes('locked')
    );

    console.log(`Columns matching key Bubble fields:\n`);
    relevant.forEach(col => console.log(`  • ${col}`));

  } finally {
    await client.end();
  }
}

checkColumnNames();
