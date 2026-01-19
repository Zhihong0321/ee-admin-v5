const { Client } = require('pg');

const client = new Client({
  host: 'shinkansen.proxy.rlwy.net',
  port: 34999,
  database: 'railway',
  user: 'postgres',
  password: 'tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA'
});

async function checkSchema() {
  await client.connect();

  console.log('=== INVOICE TABLE STRUCTURE ===');
  const invoiceCols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'invoice'
    AND column_name LIKE '%seda%'
    ORDER BY ordinal_position
  `);
  console.table(invoiceCols.rows);

  console.log('\n=== SEDA_REGISTRATION TABLE STRUCTURE ===');
  const sedaCols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'seda_registration'
    ORDER BY ordinal_position
    LIMIT 20
  `);
  console.table(sedaCols.rows);

  console.log('\n=== SAMPLE DATA: INVOICE.SEDA LINKS ===');
  const sampleLinks = await client.query(`
    SELECT
      bubble_id,
      invoice_number,
      linked_seda_registration
    FROM invoice
    WHERE linked_seda_registration IS NOT NULL
    LIMIT 5
  `);
  console.table(sampleLinks.rows);

  console.log('\n=== CHECK: Do linked_seda_registration values exist in seda_registration table? ===');
  const linkCheck = await client.query(`
    SELECT
      i.invoice_number,
      i.linked_seda_registration as invoice_link,
      s.bubble_id as seda_bubble_id,
      s.seda_status
    FROM invoice i
    LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE i.linked_seda_registration IS NOT NULL
    LIMIT 10
  `);
  console.table(linkCheck.rows);

  console.log('\n=== COUNT: Links found vs not found ===');
  const countStats = await client.query(`
    SELECT
      COUNT(*) as total_invoices_with_seda_link,
      COUNT(s.bubble_id) as found_in_seda_table,
      COUNT(*) - COUNT(s.bubble_id) as not_found_in_seda_table
    FROM invoice i
    LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
    WHERE i.linked_seda_registration IS NOT NULL
  `);
  console.table(countStats.rows);

  await client.end();
}

checkSchema().catch(console.error);
