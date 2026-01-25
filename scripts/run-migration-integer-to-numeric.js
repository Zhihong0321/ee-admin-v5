const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Read DATABASE_URL from .env file or use Railway connection
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

const client = new Client({
  connectionString: DATABASE_URL
});

async function runMigration() {
  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../migrations/change-integer-to-numeric-for-json-sync.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Running migration: change-integer-to-numeric-for-json-sync.sql');
    console.log('');
    console.log('This will change the following columns from integer to numeric:');
    console.log('  • payment: payment_index, epp_month, bank_charges');
    console.log('  • submitted_payment: payment_index, epp_month, bank_charges');
    console.log('  • invoice_item: qty, epp, sort');
    console.log('');

    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('');

    // Verify the changes
    console.log('🔍 Verifying column types...');
    const verifyQuery = `
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('payment', 'submitted_payment', 'invoice_item')
        AND column_name IN ('payment_index', 'epp_month', 'bank_charges', 'qty', 'epp', 'sort')
      ORDER BY table_name, column_name;
    `;

    const result = await client.query(verifyQuery);
    console.log('');
    console.table(result.rows);
    console.log('');
    console.log('✅ All columns should now be "numeric" type');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
