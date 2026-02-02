const { Client } = require('pg');
const client = new Client('postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway');

async function run() {
  await client.connect();
  const targetId = '1725871762096x912791834464616400';
  
  const res = await client.query('SELECT bubble_id, linked_invoice FROM seda_registration WHERE $1 = ANY(linked_invoice)', [targetId]);
  console.log('SPECIFIC_MATCH:', JSON.stringify(res.rows));
  
  const res2 = await client.query('SELECT count(*) FROM seda_registration WHERE array_length(linked_invoice, 1) > 0');
  console.log('TOTAL_SEDAS_WITH_LINKS:', res2.rows[0].count);
  
  await client.end();
}

run().catch(console.error);
