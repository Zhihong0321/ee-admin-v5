const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
});

async function run() {
  console.log('Fixing invoice IDs in database...');
  const client = await pool.connect();
  try {
    const res = await client.query(`
      UPDATE invoice 
      SET invoice_id = CAST(regexp_replace(invoice_number, '\\D', '', 'g') AS INTEGER) 
      WHERE invoice_id IS NULL AND invoice_number ~ '\\d'
    `);
    console.log(`Updated ${res.rowCount} invoices.`);
  } catch (err) {
    console.error('Update failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
