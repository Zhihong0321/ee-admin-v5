const { Pool } = require('pg');
const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const pool = new Pool({ connectionString });

async function checkBills() {
    const client = await pool.connect();
    try {
        console.log('Checking tnb_bill_1 in seda_registration...');
        const result = await client.query(`
      SELECT id, bubble_id, tnb_bill_1 
      FROM seda_registration 
      WHERE tnb_bill_1 IS NOT NULL AND tnb_bill_1 != ''
      LIMIT 5
    `);

        console.log(`Found ${result.rows.length} records with tnb_bill_1:`);
        result.rows.forEach(row => {
            console.log(`ID: ${row.id}, BubbleID: ${row.bubble_id}, tnb_bill_1: ${row.tnb_bill_1 ? row.tnb_bill_1.substring(0, 50) + '...' : 'null'}`);
        });

        if (result.rows.length === 0) {
            console.log("No records found with tnb_bill_1 populated.");
            // Check if ALL are null
            const total = await client.query('SELECT count(*) FROM seda_registration');
            const notNull = await client.query('SELECT count(*) FROM seda_registration WHERE tnb_bill_1 IS NOT NULL');
            console.log(`Total records: ${total.rows[0].count}`);
            console.log(`Records with distinct tnb_bill_1: ${notNull.rows[0].count}`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkBills();
