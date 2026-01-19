const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

async function checkNeedAttention() {
  await client.connect();

  console.log('=== NEED ATTENTION QUERY ===');
  console.log('Criteria: payment > 0%, has SEDA link, seda_status != APPROVED BY SEDA\n');

  const result = await client.query(`
    SELECT
      COUNT(*) as total_count
    FROM invoice i
    LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE
      i.percent_of_total_amount > 0
      AND i.linked_seda_registration IS NOT NULL
      AND (s.seda_status IS NULL OR s.seda_status != 'APPROVED BY SEDA')
  `);

  console.log(`Total need attention: ${result.rows[0].total_count}`);

  console.log('\n=== BREAKDOWN BY SEDA STATUS ===');
  const breakdown = await client.query(`
    SELECT
      COALESCE(s.seda_status, 'No Status') as seda_status,
      COUNT(*) as count
    FROM invoice i
    LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE
      i.percent_of_total_amount > 0
      AND i.linked_seda_registration IS NOT NULL
      AND (s.seda_status IS NULL OR s.seda_status != 'APPROVED BY SEDA')
    GROUP BY s.seda_status
    ORDER BY count DESC
  `);
  console.table(breakdown.rows);

  console.log('\n=== SAMPLE DATA (first 10) ===');
  const samples = await client.query(`
    SELECT
      i.invoice_number,
      i.percent_of_total_amount,
      i.linked_seda_registration,
      s.seda_status,
      s.reg_status,
      s.modified_date,
      s.updated_at
    FROM invoice i
    LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE
      i.percent_of_total_amount > 0
      AND i.linked_seda_registration IS NOT NULL
      AND (s.seda_status IS NULL OR s.seda_status != 'APPROVED BY SEDA')
    ORDER BY COALESCE(s.modified_date, s.updated_at, i.updated_at) DESC
    LIMIT 10
  `);
  console.table(samples.rows);

  await client.end();
}

checkNeedAttention().catch(console.error);
