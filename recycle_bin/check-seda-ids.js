const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

// Read the list of SEDA Bubble IDs from the file
const fs = require('fs');
const bubbleIds = fs.readFileSync('List_of_UID_Need_attention.txt', 'utf8')
  .split(',')
  .map(id => id.trim())
  .filter(id => id);

console.log(`Total SEDA Registration IDs from file: ${bubbleIds.length}\n`);

async function checkSedaIds() {
  await client.connect();

  console.log('=== STEP 1: CHECK WHICH SEDA REGISTRATIONS EXIST IN POSTGRESQL ===');
  const placeholders = bubbleIds.map((_, i) => `$${i + 1}`).join(',');
  const query = `
    SELECT
      s.bubble_id,
      s.seda_status,
      s.reg_status,
      s.linked_customer,
      s.modified_date,
      s.updated_at,
      s.last_synced_at
    FROM seda_registration s
    WHERE s.bubble_id IN (${placeholders})
  `;

  const result = await client.query(query, bubbleIds);
  console.log(`Found ${result.rows.length} SEDA registrations in PostgreSQL out of ${bubbleIds.length} Bubble IDs\n`);

  const foundIds = result.rows.map(row => row.bubble_id);
  const notFound = bubbleIds.filter(id => !foundIds.includes(id));

  console.log(`--- NOT FOUND IN POSTGRESQL: ${notFound.length} ---`);
  if (notFound.length > 0) {
    console.log('First 10 not found:', notFound.slice(0, 10).join(', '));
  }

  console.log(`\n=== STEP 2: CHECK STATUS OF FOUND SEDA REGISTRATIONS ===`);

  const bySedaStatus = {};
  const byRegStatus = {};

  result.rows.forEach(row => {
    const sStatus = row.seda_status || 'NULL';
    const rStatus = row.reg_status || 'NULL';

    bySedaStatus[sStatus] = (bySedaStatus[sStatus] || 0) + 1;
    byRegStatus[rStatus] = (byRegStatus[rStatus] || 0) + 1;
  });

  console.log('\n--- BY seda_status ---');
  console.table(Object.entries(bySedaStatus).map(([status, count]) => ({ status, count })));

  console.log('\n--- BY reg_status ---');
  console.table(Object.entries(byRegStatus).map(([status, count]) => ({ status, count })));

  console.log(`\n=== STEP 3: FIND LINKED INVOICES FOR THESE SEDA REGISTRATIONS ===`);

  // Now find the invoices linked to these SEDA registrations
  const invoiceQuery = `
    SELECT
      i.bubble_id as invoice_bubble_id,
      i.invoice_number,
      i.percent_of_total_amount,
      i.linked_seda_registration,
      s.bubble_id as seda_bubble_id,
      s.seda_status,
      s.reg_status,
      s.modified_date as seda_modified_date,
      s.updated_at as seda_updated_at,
      s.last_synced_at as seda_last_synced_at,
      i.updated_at as invoice_updated_at
    FROM invoice i
    INNER JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE s.bubble_id IN (${placeholders})
    ORDER BY s.modified_date DESC
  `;

  const invoiceResult = await client.query(invoiceQuery, bubbleIds);
  console.log(`\nFound ${invoiceResult.rows.length} invoices linked to these SEDA registrations\n`);

  console.log('--- SAMPLE DATA (first 20) ---');
  console.table(invoiceResult.rows.slice(0, 20));

  console.log('\n=== STEP 4: CHECK PAYMENT PERCENTAGES ===');

  const withPayment = invoiceResult.rows.filter(row => row.percent_of_total_amount && parseFloat(row.percent_of_total_amount) > 0);
  const withoutPayment = invoiceResult.rows.filter(row => !row.percent_of_total_amount || parseFloat(row.percent_of_total_amount) <= 0);

  console.log(`\nWith payment > 0%: ${withPayment.length}`);
  console.log(`With payment = 0% or empty: ${withoutPayment.length}`);

  console.log('\n--- WITH PAYMENT > 0% (breakdown by seda_status) ---');
  const byStatusWithPayment = {};
  withPayment.forEach(row => {
    const status = row.seda_status || 'NULL';
    byStatusWithPayment[status] = (byStatusWithPayment[status] || 0) + 1;
  });
  console.table(Object.entries(byStatusWithPayment).map(([status, count]) => ({ status, count })));

  console.log('\n=== STEP 5: INVOICES THAT SHOULD MATCH "NEED ATTENTION" ===');
  console.log('Criteria: payment > 0% AND seda_status != "APPROVED BY SEDA"');

  const needAttention = withPayment.filter(row => !row.seda_status || row.seda_status !== 'APPROVED BY SEDA');
  console.log(`\nTotal: ${needAttention.length}`);
  console.table(needAttention.slice(0, 20));

  console.log('\n=== STEP 6: CHECK TIMESTAMP DISCREPANCIES ===');
  console.log('Checking if invoices are newer than SEDA registrations (sync issue)...');

  const timestampCheck = await client.query(`
    SELECT
      i.bubble_id as invoice_bubble_id,
      i.updated_at as invoice_updated,
      s.bubble_id as seda_bubble_id,
      s.updated_at as seda_updated,
      s.last_synced_at as seda_last_synced,
      s.seda_status,
      i.percent_of_total_amount
    FROM invoice i
    INNER JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE s.bubble_id IN (${placeholders})
      AND i.percent_of_total_amount > 0
      AND (s.seda_status IS NULL OR s.seda_status != 'APPROVED BY SEDA')
    ORDER BY s.updated_at DESC
    LIMIT 20
  `, bubbleIds);

  console.table(timestampCheck.rows);

  await client.end();
}

checkSedaIds().catch(console.error);
