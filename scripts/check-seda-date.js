const { Client } = require('pg');
const BUBBLE_API_KEY = 'b870d2b5ee6e6b39bcf99409c59c9e02';
const INVOICE_ID = '1757580492227x987236194607431700';

async function checkSedaDate() {
  // Get invoice from PostgreSQL to find SEDA link
  const client = new Client({
    connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
  });
  await client.connect();

  const result = await client.query(`
    SELECT linked_seda_registration
    FROM invoice
    WHERE bubble_id = $1
  `, [INVOICE_ID]);

  if (result.rows.length > 0) {
    const sedaId = result.rows[0].linked_seda_registration;
    console.log('Linked SEDA Registration:', sedaId);

    if (sedaId) {
      // Fetch SEDA from Bubble
      const url = `https://eternalgy.bubbleapps.io/api/1.1/obj/seda registration/${sedaId}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${BUBBLE_API_KEY}` },
      });
      const data = await response.json();
      const seda = data.response;

      console.log('\n=== SEDA DATES ===');
      console.log('Created Date:', seda['Created Date']);
      console.log('Modified Date:', seda['Modified Date']);
      console.log('Date (if exists):', seda['Date']);

      // Search for 2025-11-09
      Object.entries(seda).forEach(([key, value]) => {
        if (value && typeof value === 'string' && value.includes('2025-11-09')) {
          console.log(`✅ FOUND: ${key} = ${value}`);
        }
      });
    }
  }

  await client.end();
}

checkSedaDate().catch(console.error);
