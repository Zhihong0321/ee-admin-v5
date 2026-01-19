const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

async function checkMissingInvoices() {
  await client.connect();

  console.log('=== FINDING SEDA REGISTRATIONS WITHOUT LINKED INVOICES ===\n');

  // Get the SEDA IDs
  const fs = require('fs');
  const bubbleIds = fs.readFileSync('List_of_UID_Need_attention.txt', 'utf8')
    .split(',')
    .map(id => id.trim())
    .filter(id => id);

  const placeholders = bubbleIds.map((_, i) => `$${i + 1}`).join(',');

  // Check which SEDA registrations don't have linked invoices
  const query = `
    SELECT
      s.bubble_id as seda_bubble_id,
      s.seda_status,
      s.reg_status,
      s.linked_customer,
      s.modified_date,
      s.last_synced_at,
      i.bubble_id as invoice_bubble_id,
      i.invoice_number,
      i.percent_of_total_amount
    FROM seda_registration s
    LEFT JOIN invoice i ON s.bubble_id = i.linked_seda_registration
    WHERE s.bubble_id IN (${placeholders})
    ORDER BY s.modified_date DESC
    LIMIT 50
  `;

  const result = await client.query(query, bubbleIds);

  const noInvoice = result.rows.filter(row => !row.invoice_bubble_id);
  const withInvoice = result.rows.filter(row => row.invoice_bubble_id);

  console.log(`SEDA registrations WITHOUT linked invoices: ${noInvoice.length}`);
  console.log(`SEDA registrations WITH linked invoices: ${withInvoice.length}\n`);

  console.log('--- SAMPLE: SEDA WITHOUT INVOICE (first 20) ---');
  console.table(noInvoice.slice(0, 20));

  console.log('\n=== CHECKING IF INVOICES EXIST BUT WRONG LINK ===');
  console.log('Checking if invoices exist but linked_seda_registration is NULL or different...\n');

  // Check if any of the SEDAs have a "linked_customer" that might have invoices
  const checkInvoicesByCustomer = await client.query(`
    SELECT DISTINCT
      s.bubble_id as seda_bubble_id,
      s.linked_customer,
      COUNT(i.bubble_id) as invoice_count_for_customer
    FROM seda_registration s
    LEFT JOIN invoice i ON s.linked_customer = i.linked_customer
    WHERE s.bubble_id IN (${placeholders})
      AND s.linked_customer IS NOT NULL
    GROUP BY s.bubble_id, s.linked_customer
    ORDER BY invoice_count_for_customer DESC
    LIMIT 20
  `, bubbleIds);

  console.log('--- INVOICES PER CUSTOMER (for SEDAs without direct invoice link) ---');
  console.table(checkInvoicesByCustomer.rows);

  console.log('\n=== TOTAL INVOICE COUNT IN POSTGRESQL ===');
  const totalInvoices = await client.query(`
    SELECT
      COUNT(*) as total_invoices,
      COUNT(linked_seda_registration) as with_seda_link,
      SUM(CASE WHEN percent_of_total_amount > 0 THEN 1 ELSE 0 END) as with_payment_gt_zero
    FROM invoice
  `);
  console.table(totalInvoices.rows);

  await client.end();
}

checkMissingInvoices().catch(console.error);
