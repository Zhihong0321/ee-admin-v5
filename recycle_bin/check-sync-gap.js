const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

async function analyzeSyncGap() {
  await client.connect();

  console.log('=== ANALYZING SYNC GAP ===\n');

  // Extract timestamps from Bubble IDs
  const fs = require('fs');
  const bubbleIds = fs.readFileSync('List_of_UID_Need_attention.txt', 'utf8')
    .split(',')
    .map(id => id.trim())
    .filter(id => id);

  const timestamps = bubbleIds.map(id => {
    const match = id.match(/^(\d+)x/);
    return match ? parseInt(match[1]) : null;
  }).filter(ts => ts !== null);

  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  console.log(`Bubble IDs timestamp range:`);
  console.log(`  Earliest: ${new Date(minTs).toISOString()}`);
  console.log(`  Latest: ${new Date(maxTs).toISOString()}`);
  console.log(`  Total count: ${bubbleIds.length}\n`);

  // Check what's in PostgreSQL
  console.log('=== POSTGRESQL INVOICE RANGE ===');
  const pgRange = await client.query(`
    SELECT
      MIN(updated_at) as earliest_invoice,
      MAX(updated_at) as latest_invoice,
      COUNT(*) as total_invoices
    FROM invoice
  `);
  console.log(`Earliest invoice: ${pgRange.rows[0].earliest_invoice}`);
  console.log(`Latest invoice: ${pgRange.rows[0].latest_invoice}`);
  console.log(`Total invoices: ${pgRange.rows[0].total_invoices}\n`);

  // Check invoices with payment > 0%
  console.log('=== INVOICES WITH PAYMENT > 0% ===');
  const paymentStats = await client.query(`
    SELECT
      COUNT(*) as total_with_payment,
      COUNT(linked_seda_registration) as with_seda_link,
      SUM(CASE WHEN s.seda_status = 'APPROVED BY SEDA' THEN 1 ELSE 0 END) as approved_count
    FROM invoice i
    LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE i.percent_of_total_amount > 0
  `);
  console.table(paymentStats.rows);

  // Check sync_activity_log for last full sync
  console.log('\n=== LAST SYNC ACTIVITY ===');
  const lastSync = await client.query(`
    SELECT
      activity_type,
      message,
      created_at
    FROM sync_activity_log
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.table(lastSync.rows);

  // Check which Bubble IDs are missing - sample
  console.log('\n=== SAMPLE CHECK: DO ANY OF THESE BUBBLE IDs EXIST? ===');
  const sampleIds = bubbleIds.slice(0, 5);
  const placeholders = sampleIds.map((_, i) => `$${i + 1}`).join(',');
  const sampleCheck = await client.query(`
    SELECT bubble_id, invoice_number, updated_at
    FROM invoice
    WHERE bubble_id IN (${placeholders})
  `, sampleIds);
  console.log(`Sample Bubble IDs checked: ${sampleIds.join(', ')}`);
  console.log(`Found in PostgreSQL: ${sampleCheck.rows.length}`);
  if (sampleCheck.rows.length > 0) {
    console.table(sampleCheck.rows);
  }

  await client.end();
}

analyzeSyncGap().catch(console.error);
