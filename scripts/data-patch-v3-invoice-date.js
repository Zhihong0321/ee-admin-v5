const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
});

async function patchInvoiceDates() {
  await client.connect();

  console.log('\n=== DATA PATCH v3: Fill invoice_date with created_at ===\n');

  // Step 1: Check current state
  console.log('Step 1: Analyzing invoice_date field...');
  const checkResult = await client.query(`
    SELECT
      COUNT(*) as total_invoices,
      COUNT(invoice_date) as has_invoice_date,
      COUNT(*) - COUNT(invoice_date) as null_invoice_date
    FROM invoice
  `);

  const stats = checkResult.rows[0];
  console.log(`  Total invoices: ${stats.total_invoices}`);
  console.log(`  Has invoice_date: ${stats.has_invoice_date}`);
  console.log(`  NULL invoice_date: ${stats.null_invoice_date}`);

  // Step 2: Show sample of affected records
  console.log('\nStep 2: Sample of invoices with NULL invoice_date:');
  const sampleResult = await client.query(`
    SELECT
      bubble_id,
      invoice_id,
      invoice_date,
      created_at,
      modified_date
    FROM invoice
    WHERE invoice_date IS NULL
    LIMIT 5
  `);

  sampleResult.rows.forEach(inv => {
    console.log(`  - ${inv.bubble_id}`);
    console.log(`    invoice_date: ${inv.invoice_date}`);
    console.log(`    created_at: ${inv.created_at}`);
  });

  // Step 3: Apply the patch
  console.log('\nStep 3: Applying patch...');
  const patchResult = await client.query(`
    UPDATE invoice
    SET invoice_date = created_at
    WHERE invoice_date IS NULL
  `);

  console.log(`  ✅ Patched ${patchResult.rowCount} records`);

  // Step 4: Verify
  console.log('\nStep 4: Verifying patch...');
  const verifyResult = await client.query(`
    SELECT
      COUNT(*) as total_invoices,
      COUNT(invoice_date) as has_invoice_date,
      COUNT(*) - COUNT(invoice_date) as null_invoice_date,
      MIN(invoice_date) as earliest_date,
      MAX(invoice_date) as latest_date
    FROM invoice
  `);

  const afterStats = verifyResult.rows[0];
  console.log(`  Total invoices: ${afterStats.total_invoices}`);
  console.log(`  Has invoice_date: ${afterStats.has_invoice_date}`);
  console.log(`  NULL invoice_date: ${afterStats.null_invoice_date}`);
  console.log(`  Date range: ${afterStats.earliest_date?.toISOString().split('T')[0]} to ${afterStats.latest_date?.toISOString().split('T')[0]}`);

  // Check the specific invoice from the bug report
  console.log('\nStep 5: Verifying bug report invoice (1757580492227x987236194607431700)...');
  const bugInvoice = await client.query(`
    SELECT
      bubble_id,
      invoice_date,
      created_at,
      modified_date
    FROM invoice
    WHERE bubble_id = $1
  `, ['1757580492227x987236194607431700']);

  if (bugInvoice.rows.length > 0) {
    const inv = bugInvoice.rows[0];
    console.log(`  bubble_id: ${inv.bubble_id}`);
    console.log(`  invoice_date: ${inv.invoice_date}`);
    console.log(`  created_at: ${inv.created_at}`);
    console.log(`  Year of invoice_date: ${inv.invoice_date?.getFullYear()}`);
    console.log(`  ✅ invoice_date is no longer 1970!`);
  } else {
    console.log('  ❌ Invoice not found');
  }

  await client.end();
  console.log('\n✅ Data patch v3 complete!\n');
}

patchInvoiceDates().catch(console.error);
