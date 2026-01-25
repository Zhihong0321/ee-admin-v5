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

  console.log('=== BACKFILLING INVOICE-SEDA LINKS ===\n');
  console.log('Strategy: Match invoices to SEDA registrations via customer\n');

  // Step 1: Find SEDA registrations where customer has exactly 1 invoice with payment > 0%
  // and that invoice has no linked_seda_registration
  const matchQuery = `
    UPDATE invoice i
    SET linked_seda_registration = s.bubble_id
    FROM seda_registration s
    WHERE i.linked_customer = s.linked_customer
      AND i.linked_seda_registration IS NULL
      AND i.percent_of_total_amount > 0
      AND s.bubble_id IN (
        -- Only match if customer has exactly 1 invoice with payment > 0% (safe match)
        SELECT i2.linked_customer
        FROM invoice i2
        WHERE i2.linked_customer IS NOT NULL
          AND i2.percent_of_total_amount > 0
          AND i2.linked_seda_registration IS NULL
        GROUP BY i2.linked_customer
        HAVING COUNT(*) = 1
      )
      AND s.bubble_id IN (
        -- And this SEDA is the only one for this customer
        SELECT s2.linked_customer
        FROM seda_registration s2
        WHERE s2.linked_customer IS NOT NULL
          AND s2.bubble_id IN (
            SELECT unnest(string_to_array($1, ','))
          )
        GROUP BY s2.linked_customer
        HAVING COUNT(*) = 1
      )
    RETURNING
      i.bubble_id as invoice_bubble_id,
      i.invoice_number,
      i.percent_of_total_amount,
      s.bubble_id as seda_bubble_id,
      s.seda_status,
      i.linked_customer
  `;

  // Read the SEDA IDs from file
  const fs = require('fs');
  const bubbleIds = fs.readFileSync('List_of_UID_Need_attention.txt', 'utf8')
    .split(',')
    .map(id => id.trim())
    .filter(id => id);

  console.log(`Processing ${bubbleIds.length} SEDA registrations...\n`);

  console.log('=== STEP 1: FINDING SAFE MATCHES (1:1 relationships) ===');
  console.log('Matching SEDAs to invoices where:\n');
  console.log('  - Customer has exactly 1 invoice with payment > 0%');
  console.log('  - Customer has exactly 1 SEDA registration');
  console.log('  - Invoice has no linked_seda_registration yet\n');

  const result = await client.query(matchQuery, [bubbleIds.join(',')]);

  console.log(`Updated ${result.rows.length} invoice records!\n`);

  if (result.rows.length > 0) {
    console.log('=== UPDATED RECORDS (sample 20) ===');
    console.table(result.rows.slice(0, 20));

    console.log('\n=== SUMMARY OF UPDATES ===');
    const byStatus = {};
    result.rows.forEach(row => {
      const status = row.seda_status || 'NULL';
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    console.log('Breakdown by SEDA status:');
    console.table(Object.entries(byStatus).map(([status, count]) => ({ status, count })));
  }

  console.log('\n=== STEP 2: CHECKING REMAINING UNMATCHED ===');

  // Check remaining SEDAs that couldn't be matched
  const remainingQuery = `
    SELECT
      s.bubble_id as seda_bubble_id,
      s.linked_customer,
      s.seda_status,
      COUNT(i.bubble_id) as invoice_count,
      STRING_AGG(i.bubble_id, ', ') as invoice_ids
    FROM seda_registration s
    LEFT JOIN invoice i ON s.linked_customer = i.linked_customer
      AND i.percent_of_total_amount > 0
      AND i.linked_seda_registration IS NULL
    WHERE s.bubble_id IN ($1)
      AND s.linked_customer IS NOT NULL
    GROUP BY s.bubble_id, s.linked_customer, s.seda_status
    HAVING COUNT(i.bubble_id) > 0
    ORDER BY COUNT(i.bubble_id) DESC
    LIMIT 30
  `;

  const remaining = await client.query(remainingQuery, [bubbleIds.join(',')]);

  console.log(`\nFound ${remaining.rows.length} SEDAs with unmatched invoices:`);
  console.table(remaining.rows);

  console.log('\n=== STEP 3: VERIFYING "NEED ATTENTION" FILTER ===');

  // Now check how many match the "need attention" filter
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

  console.log('\n=== SAMPLE: MATCHED INVOICES (first 10) ===');
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
    LIMIT 10
  `;

  const sample = await client.query(sampleQuery);
  console.table(sample.rows);

  await client.end();

  console.log('\n=== BACKFILL COMPLETE ===');
  console.log(`Updated ${result.rows.length} invoice records.`);
  console.log(`Remaining unmatched: ${remaining.rows.length} SEDA registrations.`);
}

backfillInvoiceSedaLinks().catch(console.error);
