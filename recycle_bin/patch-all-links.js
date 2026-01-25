const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

/**
 * Comprehensive patch script to fix missing links between:
 * 1. Invoice -> SEDA Registration (invoice.linked_seda_registration)
 * 2. SEDA Registration -> Customer (seda_registration.linked_customer)
 *
 * Usage: node patch-all-links.js
 */
async function patchAllLinks() {
  await client.connect();

  console.log('=== COMPREHENSIVE LINK PATCHING ===\n');

  const results = {
    invoicesPatched: 0,
    sedasPatched: 0,
    errors: []
  };

  // ========================================================================
  // PATCH 1: Invoice -> SEDA Registration
  // ========================================================================
  console.log('PATCH 1: Invoice.linked_seda_registration\n');

  const invoicePatchQuery = `
    UPDATE invoice i
    SET linked_seda_registration = closest_seda.seda_bubble_id
    FROM (
      SELECT
        s.bubble_id as seda_bubble_id,
        s.linked_customer,
        i.bubble_id as invoice_bubble_id,
        ROW_NUMBER() OVER (
          PARTITION BY i.bubble_id
          ORDER BY ABS(EXTRACT(EPOCH FROM (s.created_at - i.created_at)))
        ) as rank
      FROM invoice i
      INNER JOIN seda_registration s ON s.linked_customer = i.linked_customer
      WHERE i.linked_seda_registration IS NULL
        AND i.percent_of_total_amount > 0
        AND i.linked_customer IS NOT NULL
    ) closest_seda
    WHERE i.bubble_id = closest_seda.invoice_bubble_id
      AND closest_seda.rank = 1
    RETURNING
      i.bubble_id as invoice_bubble_id,
      i.invoice_number,
      i.percent_of_total_amount,
      closest_seda.seda_bubble_id
  `;

  const invoiceResult = await client.query(invoicePatchQuery);
  results.invoicesPatched = invoiceResult.rows.length;

  console.log(`✓ Patched ${results.invoicesPatched} invoices with SEDA link`);

  if (invoiceResult.rows.length > 0) {
    console.log('\nSample (first 5):');
    console.table(invoiceResult.rows.slice(0, 5));
  }

  // ========================================================================
  // PATCH 2: SEDA Registration -> Customer
  // ========================================================================
  console.log('\nPATCH 2: SEDA.linked_customer\n');

  const sedaPatchQuery = `
    UPDATE seda_registration s
    SET linked_customer = i.linked_customer
    FROM invoice i
    WHERE i.linked_seda_registration = s.bubble_id
      AND (s.linked_customer IS NULL OR s.linked_customer = '')
      AND i.linked_customer IS NOT NULL
    RETURNING
      s.bubble_id as seda_bubble_id,
      s.linked_customer,
      i.bubble_id as invoice_bubble_id
  `;

  const sedaResult = await client.query(sedaPatchQuery);
  results.sedasPatched = sedaResult.rows.length;

  console.log(`✓ Patched ${results.sedasPatched} SEDAs with customer link`);

  if (sedaResult.rows.length > 0) {
    console.log('\nSample (first 5):');
    console.table(sedaResult.rows.slice(0, 5));
  }

  // ========================================================================
  // VERIFICATION
  // ========================================================================
  console.log('\n=== VERIFICATION ===\n');

  // Check invoice links
  const invoiceStats = await client.query(`
    SELECT
      COUNT(*) as total_invoices,
      COUNT(linked_seda_registration) as with_seda_link,
      SUM(CASE WHEN linked_seda_registration IS NULL THEN 1 ELSE 0 END) as without_seda_link
    FROM invoice
    WHERE percent_of_total_amount > 0
  `);
  console.log('Invoice SEDA links:');
  console.table(invoiceStats.rows);

  // Check SEDA customer links
  const sedaStats = await client.query(`
    SELECT
      COUNT(*) as total_sedas,
      COUNT(linked_customer) as with_customer,
      SUM(CASE WHEN linked_customer IS NULL OR linked_customer = '' THEN 1 ELSE 0 END) as without_customer
    FROM seda_registration
  `);
  console.log('\nSEDA customer links:');
  console.table(sedaStats.rows);

  // Check "need attention" filter
  const attentionQuery = await client.query(`
    SELECT
      COUNT(*) as need_attention_count
    FROM invoice i
    INNER JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE i.percent_of_total_amount > 0
      AND (s.seda_status IS NULL OR s.seda_status != 'APPROVED BY SEDA')
  `);
  console.log('\n"Need Attention" filter:');
  console.log(`Count: ${attentionQuery.rows[0].need_attention_count}`);

  await client.end();

  console.log('\n=== PATCH COMPLETE ===');
  console.log(`Invoices patched: ${results.invoicesPatched}`);
  console.log(`SEDAs patched: ${results.sedasPatched}`);
  console.log(`Errors: ${results.errors.length}`);

  return results;
}

patchAllLinks()
  .then(results => {
    console.log('\n✓ Success!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n✗ Error:', err);
    process.exit(1);
  });
