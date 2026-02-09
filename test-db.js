
const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
    });

    try {
        await client.connect();
        const query = `
      SELECT s.bubble_id, c.name, s.ic_no, s.email 
      FROM seda_registration s
      JOIN customer c ON s.linked_customer = c.customer_id
      WHERE c.name ILIKE '%PANG KIEN WING%'
      LIMIT 5
    `;
        const res = await client.query(query);
        console.log('SEARCH_RESULT_START');
        console.log(JSON.stringify(res.rows, null, 2));
        console.log('SEARCH_RESULT_END');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

run();
