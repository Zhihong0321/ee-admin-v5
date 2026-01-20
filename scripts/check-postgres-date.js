const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
});

async function checkPostgres() {
  await client.connect();

  const invoiceId = '1757580492227x987236194607431700';

  console.log('\n=== CHECKING POSTGRESQL ===\n');

  const result = await client.query(`
    SELECT
      bubble_id,
      invoice_id,
      invoice_date,
      created_at,
      updated_at,
      created_date,
      modified_date
    FROM invoice
    WHERE bubble_id = $1
  `, [invoiceId]);

  if (result.rows.length === 0) {
    console.log('❌ Invoice NOT FOUND in database!');
  } else {
    const inv = result.rows[0];
    console.log('Invoice in PostgreSQL:');
    console.log('  bubble_id:', inv.bubble_id);
    console.log('  invoice_id:', inv.invoice_id);
    console.log('  invoice_date:', inv.invoice_date);
    console.log('  created_at:', inv.created_at);
    console.log('  updated_at:', inv.updated_at);
    console.log('  created_date:', inv.created_date);
    console.log('  modified_date:', inv.modified_date);

    console.log('\n=== ISSUE ===');
    console.log('invoice_date year:', inv.invoice_date ? inv.invoice_date.getFullYear() : 'NULL');
    console.log('Is 1970?', inv.invoice_date && inv.invoice_date.getFullYear() === 1970);
  }

  await client.end();
}

checkPostgres().catch(console.error);
