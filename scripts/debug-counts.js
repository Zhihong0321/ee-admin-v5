const { Client } = require('pg');

async function checkCounts() {
    const client = new Client({
        connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
    });

    try {
        await client.connect();

        const sedaCount = await client.query("SELECT COUNT(*) FROM seda_registration WHERE reg_status != 'Deleted';");
        console.log('Total SEDA Registrations:', sedaCount.rows[0].count);

        const invoiceCount = await client.query("SELECT COUNT(*) FROM invoice WHERE CAST(total_amount AS FLOAT) > 0 AND CAST(percent_of_total_amount AS FLOAT) > 0;");
        console.log('Invoices with Payment:', invoiceCount.rows[0].count);

        const linkedCount = await client.query("SELECT COUNT(*) FROM invoice WHERE linked_seda_registration IS NOT NULL;");
        console.log('Linked Invoices:', linkedCount.rows[0].count);

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkCounts();
