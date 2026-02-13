const { Pool } = require('pg');
const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const pool = new Pool({ connectionString });

async function checkSpecificBill() {
    const client = await pool.connect();
    try {
        const bubble_id = '1769496396529x219509204401782800';
        console.log(`Checking bills for bubble_id: ${bubble_id}`);

        const result = await client.query(`
      SELECT id, bubble_id, tnb_bill_1, tnb_bill_2, tnb_bill_3 
      FROM seda_registration 
      WHERE bubble_id = $1
    `, [bubble_id]);

        if (result.rows.length > 0) {
            const row = result.rows[0];
            console.log('Record found:');
            console.log(`tnb_bill_1: ${row.tnb_bill_1 || 'NULL/EMPTY'}`);
            console.log(`tnb_bill_2: ${row.tnb_bill_2 || 'NULL/EMPTY'}`);
            console.log(`tnb_bill_3: ${row.tnb_bill_3 || 'NULL/EMPTY'}`);
        } else {
            console.log('No record found with this bubble_id.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkSpecificBill();
