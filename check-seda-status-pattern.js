const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

/**
 * Analyze SEDA records that DO have seda_status to find patterns
 */
async function analyzeSedaStatusPattern() {
  await client.connect();

  console.log('=== ANALYZING SEDA STATUS PATTERNS ===\n');

  // 1. Get sample of SEDAs with non-null seda_status
  console.log('1. Sample of SEDAs with non-null seda_status:');
  const query1 = `
    SELECT
      bubble_id,
      seda_status,
      reg_status,
      modified_date,
      created_at
    FROM seda_registration
    WHERE seda_status IS NOT NULL
    ORDER BY modified_date DESC
    LIMIT 20
  `;

  const result1 = await client.query(query1);
  console.table(result1.rows);

  // 2. Check if there's a relationship between bubble_id format and seda_status
  console.log('\n2. Bubble ID format analysis:');
  const withSedaStatus = await client.query(`
    SELECT
      CASE
        WHEN bubble_id LIKE 'seda_%' THEN 'seda_ format'
        WHEN bubble_id LIKE '%x%' THEN 'Bubble format (with x)'
        ELSE 'Other format'
      END as id_format,
      COUNT(*) as count,
      COUNT(seda_status) as with_seda_status,
      COUNT(reg_status) as with_reg_status
    FROM seda_registration
    GROUP BY id_format
  `);
  console.table(withSedaStatus.rows);

  // 3. Check if newer SEDAs have seda_status
  console.log('\n3. SEDA status by creation date:');
  const query3 = `
    SELECT
      DATE_TRUNC('month', created_at) as month,
      COUNT(*) as total_sedas,
      COUNT(seda_status) as with_seda_status,
      ROUND(100.0 * COUNT(seda_status) / COUNT(*), 2) as percentage_with_status
    FROM seda_registration
    WHERE created_at >= '2025-01-01'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY month DESC
  `;

  const result3 = await client.query(query3);
  console.table(result3.rows);

  // 4. Check if any SEDAs from sync have seda_status
  console.log('\n4. Recent SEDAs (last 7 days) - do they have seda_status?');
  const query4 = `
    SELECT
      bubble_id,
      seda_status,
      reg_status,
      created_at,
      modified_date
    FROM seda_registration
    WHERE created_at >= NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 20
  `;

  const result4 = await client.query(query4);
  console.log(`Found ${result4.rows.length} SEDAs created in last 7 days`);
  console.table(result4.rows);

  await client.end();

  console.log('\n=== ANALYSIS COMPLETE ===');
}

analyzeSedaStatusPattern()
  .then(() => {
    console.log('\n✓ Analysis complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n✗ Error:', err);
    process.exit(1);
  });
