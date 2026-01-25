const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

/**
 * Diagnostic query to check why SEDA status is NULL in "need attention" list
 */
async function diagnoseSedaStatus() {
  await client.connect();

  console.log('=== DIAGNOSING SEDA STATUS IN "NEED ATTENTION" LIST ===\n');

  // 1. Check the query condition (invoices with SEDA link but not approved)
  console.log('1. Sample of invoices in "need attention" condition:');
  console.log('   (percent_of_total_amount > 0, has SEDA link, not approved)\n');

  const query1 = `
    SELECT
      i.bubble_id as invoice_bubble_id,
      i.invoice_number,
      i.percent_of_total_amount,
      i.linked_seda_registration,
      sr.bubble_id as seda_bubble_id,
      sr.seda_status,
      sr.modified_date,
      sr.updated_at
    FROM invoice i
    LEFT JOIN seda_registration sr ON i.linked_seda_registration = sr.bubble_id
    WHERE i.percent_of_total_amount > 0
      AND i.linked_seda_registration IS NOT NULL
      AND (sr.seda_status IS NULL OR sr.seda_status != 'APPROVED BY SEDA')
    ORDER BY sr.modified_date DESC NULLS LAST
    LIMIT 10
  `;

  const result1 = await client.query(query1);
  console.table(result1.rows);

  // 2. Check if SEDA actually exists for these invoices
  console.log('\n2. For each invoice, does the SEDA exist in seda_registration table?');
  const invoiceSedas = result1.rows.map(row => ({
    invoice_id: row.invoice_bubble_id,
    seda_id_from_invoice: row.linked_seda_registration,
    seda_id_found: row.seda_bubble_id,
    seda_status: row.seda_status,
    match: row.linked_seda_registration === row.seda_bubble_id ? '✓' : '✗'
  }));
  console.table(invoiceSedas);

  // 3. Check distinct SEDA statuses in database
  console.log('\n3. All distinct SEDA statuses in database:');
  const query3 = `
    SELECT
      seda_status,
      COUNT(*) as count
    FROM seda_registration
    GROUP BY seda_status
    ORDER BY count DESC
  `;
  const result3 = await client.query(query3);
  console.table(result3.rows);

  // 4. Check invoices with SEDA link but SEDA not found
  console.log('\n4. Invoices with linked_seda_registration but SEDA not found:');
  const query4 = `
    SELECT
      i.bubble_id,
      i.invoice_number,
      i.linked_seda_registration,
      sr.bubble_id as seda_exists
    FROM invoice i
    LEFT JOIN seda_registration sr ON i.linked_seda_registration = sr.bubble_id
    WHERE i.linked_seda_registration IS NOT NULL
      AND sr.bubble_id IS NULL
    LIMIT 10
  `;
  const result4 = await client.query(query4);
  console.log(`Found ${result4.rows.length} invoices with broken SEDA links`);
  if (result4.rows.length > 0) {
    console.table(result4.rows);
  }

  // 5. Check the actual data quality
  console.log('\n5. Data quality check for "need attention" condition:');
  const query5 = `
    SELECT
      COUNT(*) as total_invoices_with_seda,
      SUM(CASE WHEN sr.seda_status IS NULL THEN 1 ELSE 0 END) as with_null_status,
      SUM(CASE WHEN sr.seda_status IS NOT NULL THEN 1 ELSE 0 END) as with_status,
      SUM(CASE WHEN sr.bubble_id IS NULL THEN 1 ELSE 0 END) as seda_not_found
    FROM invoice i
    LEFT JOIN seda_registration sr ON i.linked_seda_registration = sr.bubble_id
    WHERE i.percent_of_total_amount > 0
      AND i.linked_seda_registration IS NOT NULL
      AND (sr.seda_status IS NULL OR sr.seda_status != 'APPROVED BY SEDA')
  `;
  const result5 = await client.query(query5);
  console.table(result5.rows);

  // 6. Sample some SEDAs that DO have status
  console.log('\n6. Sample of SEDAs with non-null status:');
  const query6 = `
    SELECT
      bubble_id,
      seda_status,
      modified_date,
      created_at
    FROM seda_registration
    WHERE seda_status IS NOT NULL
    ORDER BY modified_date DESC
    LIMIT 10
  `;
  const result6 = await client.query(query6);
  console.log(`Found ${result6.rows.length} SEDAs with status`);
  console.table(result6.rows);

  await client.end();

  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

diagnoseSedaStatus()
  .then(() => {
    console.log('\n✓ Diagnosis complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n✗ Error:', err);
    process.exit(1);
  });
