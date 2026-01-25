const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

// Read the list of Bubble IDs from the file
const fs = require('fs');
const bubbleIds = fs.readFileSync('List_of_UID_Need_attention.txt', 'utf8')
  .split(',')
  .map(id => id.trim())
  .filter(id => id);

console.log(`Total Bubble IDs from file: ${bubbleIds.length}\n`);

async function checkBubbleIds() {
  await client.connect();

  console.log('=== STEP 1: CHECK WHICH INVOICES EXIST IN POSTGRESQL ===');
  const placeholders = bubbleIds.map((_, i) => `$${i + 1}`).join(',');
  const query = `
    SELECT
      i.bubble_id,
      i.invoice_number,
      i.percent_of_total_amount,
      i.linked_seda_registration,
      s.seda_status,
      s.reg_status,
      s.modified_date as seda_modified_date,
      s.updated_at as seda_updated_at
    FROM invoice i
    LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE i.bubble_id IN (${placeholders})
  `;

  const result = await client.query(query, bubbleIds);
  console.log(`Found ${result.rows.length} invoices in PostgreSQL out of ${bubbleIds.length} Bubble IDs\n`);

  console.log('=== STEP 2: ANALYZE DISCREPANCIES ===');

  const notFound = [];
  const noSedaLink = [];
  const withSedaLink = [];
  const paymentZeroOrEmpty = [];
  const paymentPositive = [];

  result.rows.forEach(row => {
    const percent = parseFloat(row.percent_of_total_amount);

    // Check payment percentage
    if (!row.percent_of_total_amount || isNaN(percent) || percent <= 0) {
      paymentZeroOrEmpty.push({
        bubble_id: row.bubble_id,
        invoice_number: row.invoice_number,
        percent_of_total_amount: row.percent_of_total_amount,
        linked_seda_registration: row.linked_seda_registration,
        seda_status: row.seda_status
      });
    } else {
      paymentPositive.push({
        bubble_id: row.bubble_id,
        invoice_number: row.invoice_number,
        percent_of_total_amount: percent,
        linked_seda_registration: row.linked_seda_registration,
        seda_status: row.seda_status
      });
    }

    // Check SEDA link
    if (!row.linked_seda_registration) {
      noSedaLink.push({
        bubble_id: row.bubble_id,
        invoice_number: row.invoice_number,
        percent_of_total_amount: row.percent_of_total_amount
      });
    } else {
      withSedaLink.push({
        bubble_id: row.bubble_id,
        invoice_number: row.invoice_number,
        percent_of_total_amount: percent,
        linked_seda_registration: row.linked_seda_registration,
        seda_status: row.seda_status
      });
    }
  });

  // Find which Bubble IDs are NOT in PostgreSQL
  const foundIds = result.rows.map(row => row.bubble_id);
  bubbleIds.forEach(id => {
    if (!foundIds.includes(id)) {
      notFound.push(id);
    }
  });

  console.log(`\n--- NOT FOUND IN POSTGRESQL: ${notFound.length} ---`);
  if (notFound.length > 0) {
    console.log('First 10 not found:', notFound.slice(0, 10).join(', '));
  }

  console.log(`\n--- PAYMENT ZERO OR EMPTY: ${paymentZeroOrEmpty.length} ---`);
  if (paymentZeroOrEmpty.length > 0) {
    console.table(paymentZeroOrEmpty.slice(0, 10));
  }

  console.log(`\n--- PAYMENT > 0%: ${paymentPositive.length} ---`);
  console.log('Breakdown by SEDA link:');
  console.log(`  - With SEDA link: ${withSedaLink.length}`);
  console.log(`  - Without SEDA link: ${noSedaLink.filter(x => x.percent_of_total_amount && parseFloat(x.percent_of_total_amount) > 0).length}`);

  console.log(`\n--- WITH PAYMENT > 0% AND SEDA LINK (by seda_status) ---`);
  const withSedaAndPayment = withSedaLink.filter(x => x.percent_of_total_amount > 0);
  const byStatus = {};
  withSedaAndPayment.forEach(row => {
    const status = row.seda_status || 'NULL';
    byStatus[status] = (byStatus[status] || 0) + 1;
  });
  console.table(Object.entries(byStatus).map(([status, count]) => ({ status, count })));

  console.log(`\n--- WOULD MATCH "NEED ATTENTION" FILTER (payment > 0%, seda_status != 'APPROVED BY SEDA') ---`);
  const wouldMatch = withSedaAndPayment.filter(row => !row.seda_status || row.seda_status !== 'APPROVED BY SEDA');
  console.log(`Count: ${wouldMatch.length}`);
  if (wouldMatch.length > 0) {
    console.table(wouldMatch.slice(0, 15));
  }

  console.log(`\n=== STEP 3: CHECK SYNC TIMESTAMP COMPARISON ===`);
  // Check if the issue is that these invoices were updated but not synced
  console.log('\nChecking last_synced_at for invoices with SEDA links...');

  const syncCheckQuery = `
    SELECT
      i.bubble_id,
      i.updated_at as invoice_updated_at,
      s.last_synced_at as seda_last_synced_at,
      s.updated_at as seda_updated_at,
      s.seda_status
    FROM invoice i
    LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE i.bubble_id IN (${placeholders})
      AND i.linked_seda_registration IS NOT NULL
    ORDER BY s.updated_at DESC NULLS LAST
    LIMIT 20
  `;

  const syncCheck = await client.query(syncCheckQuery, bubbleIds);
  console.table(syncCheck.rows);

  await client.end();
}

checkBubbleIds().catch(console.error);
