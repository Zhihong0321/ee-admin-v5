const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

async function backfillInvoiceSedaLinks() {
  await client.connect();

  console.log('=== BACKFILLING INVOICE-SEDA LINKS (v2) ===\n');
  console.log('Strategy: Match invoices to SEDA by customer + closest timestamp\n');

  // Read the SEDA IDs from file
  const fs = require('fs');
  const bubbleIds = fs.readFileSync('List_of_UID_Need_attention.txt', 'utf8')
    .split(',')
    .map(id => id.trim())
    .filter(id => id);

  console.log(`Processing ${bubbleIds.length} SEDA registrations...\n`);

  const placeholders = bubbleIds.map((_, i) => `$${i + 1}`).join(',');

  // Step 1: Find SEDAs with customer but no linked invoice
  const query = `
    SELECT
      s.bubble_id as seda_bubble_id,
      s.linked_customer,
      s.seda_status,
      s.created_at as seda_created,
      s.modified_date as seda_modified,
      i.bubble_id as invoice_bubble_id,
      i.invoice_number,
      i.percent_of_total_amount,
      i.created_at as invoice_created,
      i.updated_at as invoice_updated,
      ABS(EXTRACT(EPOCH FROM (s.created_at - i.created_at))) as time_diff_seconds
    FROM seda_registration s
    INNER JOIN invoice i ON s.linked_customer = i.linked_customer
    WHERE s.bubble_id IN (${placeholders})
      AND s.linked_customer IS NOT NULL
      AND i.linked_seda_registration IS NULL
      AND i.percent_of_total_amount > 0
    ORDER BY s.bubble_id, ABS(EXTRACT(EPOCH FROM (s.created_at - i.created_at)))
  `;

  const result = await client.query(query, bubbleIds);
  console.log(`Found ${result.rows.length} potential SEDA-invoice pairs\n`);

  // Group by SEDA and pick the closest invoice for each
  const sedaGroups = {};
  result.rows.forEach(row => {
    if (!sedaGroups[row.seda_bubble_id]) {
      sedaGroups[row.seda_bubble_id] = row;
    }
  });

  const uniquePairs = Object.values(sedaGroups);
  console.log(`Unique SEDA-invoice pairs (closest match): ${uniquePairs.length}\n`);

  console.log('=== SAMPLE PAIRS (first 10) ===');
  console.table(uniquePairs.slice(0, 10).map(p => ({
    seda_id: p.seda_bubble_id,
    invoice_id: p.invoice_bubble_id,
    time_diff_hours: (p.time_diff_seconds / 3600).toFixed(2),
    seda_created: p.seda_created,
    invoice_created: p.invoice_created
  })));

  console.log('\n=== UPDATING INVOICES ===');

  let updatedCount = 0;
  const errors = [];

  for (const pair of uniquePairs) {
    try {
      await client.query(`
        UPDATE invoice
        SET linked_seda_registration = $1
        WHERE bubble_id = $2
      `, [pair.seda_bubble_id, pair.invoice_bubble_id]);
      updatedCount++;
    } catch (err) {
      errors.push({ seda: pair.seda_bubble_id, invoice: pair.invoice_bubble_id, error: err.message });
    }
  }

  console.log(`Updated ${updatedCount} invoice records`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    console.table(errors.slice(0, 5));
  }

  console.log('\n=== VERIFYING "NEED ATTENTION" FILTER ===');

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

  console.log('\n=== SAMPLE: MATCHED INVOICES (first 15) ===');
  const sampleQuery = `
    SELECT
      i.bubble_id as invoice_bubble_id,
      i.invoice_number,
      i.percent_of_total_amount,
      s.bubble_id as seda_bubble_id,
      s.seda_status,
      s.reg_status,
      i.linked_customer
    FROM invoice i
    INNER JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE i.percent_of_total_amount > 0
      AND (s.seda_status IS NULL OR s.seda_status != 'APPROVED BY SEDA')
    ORDER BY s.modified_date DESC
    LIMIT 15
  `;

  const sample = await client.query(sampleQuery);
  console.table(sample.rows);

  await client.end();

  console.log('\n=== BACKFILL COMPLETE ===');
  console.log(`Updated: ${updatedCount} invoice records`);
  console.log(`Errors: ${errors.length}`);
}

backfillInvoiceSedaLinks().catch(console.error);
