const { Pool } = require('pg');

const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";

const pool = new Pool({
    connectionString,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Connected to database...');
        console.log('Adding epp_cost column to payment and submitted_payment tables...');

        // Add epp_cost to payment table
        await client.query(`
            ALTER TABLE payment
            ADD COLUMN IF NOT EXISTS epp_cost NUMERIC;
        `);
        console.log('✓ Added epp_cost to payment table');

        // Add epp_cost to submitted_payment table
        await client.query(`
            ALTER TABLE submitted_payment
            ADD COLUMN IF NOT EXISTS epp_cost NUMERIC;
        `);
        console.log('✓ Added epp_cost to submitted_payment table');

        console.log('\n✅ Migration successful: epp_cost columns added.');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
