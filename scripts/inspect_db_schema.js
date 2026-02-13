const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
    ssl: { rejectUnauthorized: false }
});

async function inspect() {
    await client.connect();

    try {
        console.log('--- Searching for Voucher Tables again ---');
        const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name ILIKE '%voucher%';
    `);

        if (tableRes.rows.length > 0) {
            for (const row of tableRes.rows) {
                const tableName = row.table_name;
                console.log(`\nTABLE FIELD FOUND: ${tableName}`);
                const colRes = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
                ORDER BY column_name;
            `, [tableName]);

                colRes.rows.forEach(r => {
                    console.log(`   - ${r.column_name} (${r.data_type})`);
                });
            }
        } else {
            console.log("No tables found with 'voucher' in the name.");
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

inspect();
