const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

async function checkAllInvoices() {
  await client.connect();

  console.log('=== ALL INVOICES WITH PAYMENT > 0% ===');

  const breakdown = await client.query(`
    SELECT
      COALESCE(s.seda_status, 'No SEDA') as seda_status,
      COUNT(*) as count,
      COUNT(CASE WHEN i.linked_seda_registration IS NOT NULL THEN 1 END) as with_seda_link,
      COUNT(CASE WHEN s.seda_status = 'APPROVED BY SEDA' THEN 1 END) as approved
    FROM invoice i
    LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE i.percent_of_total_amount > 0
    GROUP BY s.seda_status
    ORDER BY count DESC
  `);
  console.table(breakdown.rows);

  console.log('\n=== SUMMARY ===');
  const summary = await client.query(`
    SELECT
      COUNT(*) as total_with_payment,
      COUNT(i.linked_seda_registration) as has_seda_link,
      COUNT(*) - COUNT(i.linked_seda_registration) as no_seda_link
    FROM invoice i
    WHERE i.percent_of_total_amount > 0
  `);
  console.table(summary.rows);

  console.log('\n=== CHECK APPROVED STATUS ===');
  const approved = await client.query(`
    SELECT COUNT(*) as approved_count
    FROM invoice i
    LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE i.percent_of_total_amount > 0
      AND s.seda_status = 'APPROVED BY SEDA'
  `);
  console.table(approved.rows);

  await client.end();
}

checkAllInvoices().catch(console.error);
