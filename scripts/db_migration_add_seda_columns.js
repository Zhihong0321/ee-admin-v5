const { Pool } = require('pg');

const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";

const pool = new Pool({
    connectionString,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Connected to database...');

        console.log('Adding missing columns to seda_registration table...');

        await client.query(`
      ALTER TABLE seda_registration 
      ADD COLUMN IF NOT EXISTS installation_address_1 TEXT,
      ADD COLUMN IF NOT EXISTS installation_address_2 TEXT,
      ADD COLUMN IF NOT EXISTS latitude NUMERIC,
      ADD COLUMN IF NOT EXISTS longitude NUMERIC;
    `);

        console.log('Migration successful: Columns added.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
