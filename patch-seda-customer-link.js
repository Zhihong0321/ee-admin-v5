const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

async function patchSedaCustomerLinks() {
  await client.connect();

  console.log('=== PATCHING SEDA REGISTRATION linked_customer ===\n');
  console.log('Strategy: Find missing linked_customer from linked invoices\n');

  // Step 1: Find SEDAs with missing linked_customer
  const findQuery = `
    SELECT DISTINCT
      s.bubble_id as seda_bubble_id,
      s.linked_customer as current_customer,
      s.linked_invoice as linked_invoice_array,
      i.bubble_id as invoice_bubble_id,
      i.invoice_number,
      i.linked_customer as invoice_customer,
      i.percent_of_total_amount
    FROM seda_registration s
    LEFT JOIN invoice i ON i.linked_seda_registration = s.bubble_id
    WHERE (s.linked_customer IS NULL OR s.linked_customer = '')
      AND i.linked_customer IS NOT NULL
      AND i.bubble_id IS NOT NULL
    ORDER BY s.bubble_id
  `;

  const result = await client.query(findQuery);
  console.log(`Found ${result.rows.length} SEDA registrations with missing linked_customer but have linked invoices\n`);

  if (result.rows.length === 0) {
    console.log('No SEDA registrations need patching!');
    await client.end();
    return;
  }

  console.log('=== SAMPLE: SEDAs needing patch (first 10) ===');
  console.table(result.rows.slice(0, 10).map(r => ({
    seda_id: r.seda_bubble_id,
    invoice_id: r.invoice_bubble_id,
    invoice_customer: r.invoice_customer,
    current_customer: r.current_customer || 'NULL'
  })));

  // Step 2: Update each SEDA with the customer from its linked invoice
  console.log('\n=== UPDATING SEDA REGISTRATIONS ===\n');

  let updatedCount = 0;
  const errors = [];
  const skipped = [];

  for (const row of result.rows) {
    try {
      // Verify that the invoice customer is not null
      if (!row.invoice_customer) {
        skipped.push({
          seda: row.seda_bubble_id,
          reason: 'Invoice has no linked_customer'
        });
        continue;
      }

      await client.query(`
        UPDATE seda_registration
        SET linked_customer = $1
        WHERE bubble_id = $2
      `, [row.invoice_customer, row.seda_bubble_id]);

      updatedCount++;

      if (updatedCount <= 10) {
        console.log(`✓ Updated SEDA ${row.seda_bubble_id} -> Customer ${row.invoice_customer}`);
      }
    } catch (err) {
      errors.push({
        seda: row.seda_bubble_id,
        error: err.message
      });
    }
  }

  console.log(`\n... ${updatedCount - 10} more updates ...`);

  console.log('\n=== SUMMARY ===');
  console.log(`Updated: ${updatedCount} SEDA registrations`);
  console.log(`Skipped: ${skipped.length} (no customer on invoice)`);
  console.log(`Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    console.table(errors.slice(0, 5));
  }

  // Step 3: Verify the results
  console.log('\n=== VERIFYING PATCH ===');

  const verifyQuery = `
    SELECT
      COUNT(*) as total_sedas,
      COUNT(linked_customer) as with_customer,
      SUM(CASE WHEN linked_customer IS NULL OR linked_customer = '' THEN 1 ELSE 0 END) as without_customer
    FROM seda_registration
  `;

  const verifyResult = await client.query(verifyQuery);
  console.table(verifyResult.rows);

  // Step 4: Check "need attention" count after patch
  console.log('\n=== CHECKING "NEED ATTENTION" FILTER ===');

  const attentionQuery = `
    SELECT
      COUNT(*) as count
    FROM invoice i
    INNER JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE i.percent_of_total_amount > 0
      AND (s.seda_status IS NULL OR s.seda_status != 'APPROVED BY SEDA')
  `;

  const attentionResult = await client.query(attentionQuery);
  console.log(`\nInvoices matching "need attention" filter: ${attentionResult.rows[0].count}`);

  // Step 5: Show sample of patched SEDAs
  console.log('\n=== SAMPLE: PATCHED SEDAs (first 10) ===');

  const sampleQuery = `
    SELECT
      s.bubble_id as seda_bubble_id,
      s.seda_status,
      s.linked_customer,
      i.bubble_id as invoice_bubble_id,
      i.invoice_number,
      i.percent_of_total_amount
    FROM seda_registration s
    INNER JOIN invoice i ON i.linked_seda_registration = s.bubble_id
    WHERE i.percent_of_total_amount > 0
      AND (s.seda_status IS NULL OR s.seda_status != 'APPROVED BY SEDA')
    ORDER BY s.modified_date DESC
    LIMIT 10
  `;

  const sample = await client.query(sampleQuery);
  console.table(sample.rows);

  await client.end();

  console.log('\n=== PATCH COMPLETE ===');
}

patchSedaCustomerLinks().catch(console.error);
