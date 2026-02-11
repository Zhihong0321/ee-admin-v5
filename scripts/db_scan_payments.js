
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
});

async function runScan() {
    try {
        console.log('--- GLOBAL Payment Table Scan ---');
        const paymentTotalRes = await pool.query('SELECT count(*) FROM payment');
        const total = parseInt(paymentTotalRes.rows[0].count);
        console.log(`Total Records in 'payment' table: ${total}`);

        const noAttachmentRes = await pool.query(`
      SELECT count(*) FROM payment 
      WHERE (attachment IS NULL 
             OR array_length(attachment, 1) IS NULL 
             OR array_length(attachment, 1) = 0 
             OR attachment[1] = '' 
             OR attachment[1] IS NULL)
    `);
        const noAttachment = parseInt(noAttachmentRes.rows[0].count);
        console.log(`Records WITHOUT Attachment (including empty strings): ${noAttachment}`);

        console.log('\n--- Status Breakdown ---');
        const statusRes = await pool.query(`
      SELECT 
        verified_by IS NOT NULL AND verified_by != '' as is_verified,
        count(*) as total,
        count(*) FILTER (WHERE attachment IS NULL OR array_length(attachment, 1) IS NULL OR array_length(attachment, 1) = 0 OR attachment[1] = '' OR attachment[1] IS NULL) as no_attach
      FROM payment
      GROUP BY 1
    `);
        console.table(statusRes.rows.map(r => ({
            Verified: r.is_verified ? 'YES' : 'NO',
            Total: r.total,
            'No Attachment': r.no_attach,
            'Percentage': ((r.no_attach / r.total) * 100).toFixed(2) + '%'
        })));

        console.log('\n--- Submitted Payment Table Scan ---');
        const submittedRes = await pool.query(`
      SELECT 
        status,
        count(*) as total,
        count(*) FILTER (WHERE attachment IS NULL OR array_length(attachment, 1) IS NULL OR array_length(attachment, 1) = 0 OR attachment[1] = '' OR attachment[1] IS NULL) as no_attach
      FROM submitted_payment
      GROUP BY 1
    `);
        console.table(submittedRes.rows.map(r => ({
            Status: r.status,
            Total: r.total,
            'No Attachment': r.no_attach,
            'Percentage': ((r.no_attach / r.total) * 100).toFixed(2) + '%'
        })));

        console.log('\n--- Top 10 Records with no attachment (Payment Table) ---');
        const samples = await pool.query(`
        SELECT bubble_id, amount, payment_date, verified_by, attachment
        FROM payment
        WHERE (attachment IS NULL OR array_length(attachment, 1) IS NULL OR array_length(attachment, 1) = 0 OR attachment[1] = '' OR attachment[1] IS NULL)
        ORDER BY payment_date DESC NULLS LAST
        LIMIT 10
    `);
        console.table(samples.rows);

    } catch (err) {
        console.error('Error running scan:', err);
    } finally {
        await pool.end();
    }
}

runScan();
