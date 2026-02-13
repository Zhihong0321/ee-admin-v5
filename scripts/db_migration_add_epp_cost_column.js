const { Pool } = require('pg');

const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";

const pool = new Pool({
    connectionString,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Connected to database...');
        console.log('Adding epp_cost column to payment table...');

        // Add epp_cost to payment table only
        await client.query(`
            ALTER TABLE payment
            ADD COLUMN IF NOT EXISTS epp_cost NUMERIC;
        `);
        console.log('✓ Added epp_cost to payment table');

        console.log('\n✅ Migration successful: epp_cost column added to payment table.');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
