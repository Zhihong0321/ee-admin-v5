const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

async function checkRecentInvoices() {
  await client.connect();

  console.log('=== CHECKING IF INVOICES FOR THESE SEDAs EXIST BUT WRONG LINK ===\n');

  // Get the SEDA IDs
  const fs = require('fs');
  const bubbleIds = fs.readFileSync('List_of_UID_Need_attention.txt', 'utf8')
    .split(',')
    .map(id => id.trim())
    .filter(id => id);

  const placeholders = bubbleIds.map((_, i) => `$${i + 1}`).join(',');

  // Check SEDA registrations with their linked_customer
  const sedaWithCustomers = await client.query(`
    SELECT
      s.bubble_id as seda_bubble_id,
      s.linked_customer,
      s.seda_status,
      s.modified_date,
      s.last_synced_at
    FROM seda_registration s
    WHERE s.bubble_id IN (${placeholders})
      AND s.linked_customer IS NOT NULL
    ORDER BY s.modified_date DESC
    LIMIT 100
  `, bubbleIds);

  console.log(`Found ${sedaWithCustomers.rows.length} SEDAs with linked_customer\n`);

  // For each customer, check if they have invoices WITHOUT linked_seda_registration
  let matchCount = 0;
  const results = [];

  for (const seda of sedaWithCustomers.rows) {
    const invoiceCheck = await client.query(`
      SELECT
        bubble_id as invoice_bubble_id,
        invoice_number,
        percent_of_total_amount,
        linked_seda_registration,
        updated_at,
        created_at
      FROM invoice
      WHERE linked_customer = $1
        AND percent_of_total_amount > 0
      `, [seda.linked_customer]);

    if (invoiceCheck.rows.length > 0) {
      matchCount++;
      results.push({
        seda_bubble_id: seda.seda_bubble_id,
        linked_customer: seda.linked_customer,
        seda_status: seda.seda_status,
        invoices_found: invoiceCheck.rows.length,
        invoices_without_seda_link: invoiceCheck.rows.filter(i => !i.linked_seda_registration).length,
        sample_invoices: invoiceCheck.rows.slice(0, 2).map(i => ({
          bubble_id: i.invoice_bubble_id,
          invoice_number: i.invoice_number,
          percent_paid: i.percent_of_total_amount,
          has_seda_link: !!i.linked_seda_registration,
          linked_seda_id: i.linked_seda_registration,
          invoice_updated: i.updated_at,
          invoice_created: i.created_at
        }))
      });
    }
  }

  console.log(`Found ${matchCount} SEDAs where customer has invoices with payment > 0%\n`);

  console.log('=== BREAKDOWN ===');
  const withMissingLink = results.filter(r => r.invoices_without_seda_link > 0);
  const withLink = results.filter(r => r.invoices_without_seda_link === 0);

  console.log(`SEDA registrations where customer invoices are MISSING linked_seda_registration: ${withMissingLink.length}`);
  console.log(`SEDA registrations where customer invoices HAVE linked_seda_registration: ${withLink.length}\n`);

  console.log('=== SAMPLE: CUSTOMERS WITH INVOICES BUT NO SEDA LINK ===');
  console.table(withMissingLink.slice(0, 10).map(r => ({
    seda_id: r.seda_bubble_id,
    seda_status: r.seda_status,
    invoices_found: r.invoices_found,
    missing_link: r.invoices_without_seda_link
  })));

  console.log('\n=== DETAILED SAMPLE (first 5) ===');
  withMissingLink.slice(0, 5).forEach(r => {
    console.log(`\nSEDA: ${r.seda_bubble_id}`);
    console.log(`  Status: ${r.seda_status}`);
    console.log(`  Customer: ${r.linked_customer}`);
    console.log(`  Invoices: ${r.invoices_found} (missing link: ${r.invoices_without_seda_link})`);
    console.table(r.sample_invoices);
  });

  await client.end();
}

checkRecentInvoices().catch(console.error);
