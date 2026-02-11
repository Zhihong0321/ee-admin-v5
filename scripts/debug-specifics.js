const { Client } = require('pg');

async function checkSpecifics() {
    const client = new Client({
        connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
    });

    try {
        await client.connect();

        const customers = [
            'WONG SEW MOI',
            'TAY SONG JER',
            'TANG YI JING',
            'RICHARD TAI JIA XIAN',
            'TOI KOK SIANG',
            'SYAHRUL AZRIN BINTI GHAFAR',
            'Wong Ye Foo'
        ];

        for (const name of customers) {
            const res = await client.query(`
        SELECT 
          i.invoice_number, 
          i.linked_customer, 
          c.name, 
          i.linked_seda_registration,
          s.bubble_id as seda_id
        FROM invoice i
        JOIN customer c ON i.linked_customer = c.customer_id
        LEFT JOIN seda_registration s ON i.linked_seda_registration = s.bubble_id
        WHERE c.name ILIKE $1
        LIMIT 1
      `, [name]);

            if (res.rows.length > 0) {
                console.log(`${name}: Invoice=${res.rows[0].invoice_number}, Linked SEDA=${res.rows[0].linked_seda_registration}, Found SEDA=${res.rows[0].seda_id}`);
            } else {
                console.log(`${name}: Not found`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkSpecifics();
