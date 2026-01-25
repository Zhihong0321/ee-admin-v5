/**
 * ============================================================================
 * MIGRATION RUNNER: SEDA Integer to Numeric
 * ============================================================================
 * 
 * Runs the migration to change SEDA registration integer fields to numeric
 * to support decimal values from JSON sync.
 * 
 * Usage: node scripts/run-migration-seda-integer-to-numeric.js
 */

const { readFileSync } = require('fs');
const { join } = require('path');

// PostgreSQL connection string from user
const DATABASE_URL = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function runMigration() {
  console.log('🚀 Starting SEDA integer to numeric migration...\n');
  
  let pg;
  try {
    // Dynamic import of pg
    pg = await import('pg');
  } catch (error) {
    console.error('❌ pg module not found. Installing...');
    const { execSync } = require('child_process');
    execSync('npm install pg', { stdio: 'inherit' });
    pg = await import('pg');
  }

  const { Client } = pg.default || pg;
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Read migration SQL
    const migrationPath = join(__dirname, '..', 'migrations', 'change-seda-integer-to-numeric.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📄 Executing migration SQL...\n');
    const result = await client.query(migrationSQL);
    
    console.log('\n✅ Migration completed successfully!\n');
    
    // Verify changes
    console.log('🔍 Verifying column types...\n');
    const verifyQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'seda_registration' 
        AND column_name IN ('system_size_in_form_kwp', 'system_size', 'inverter_kwac', 'average_tnb')
      ORDER BY column_name;
    `;
    
    const verification = await client.query(verifyQuery);
    
    console.log('Current column types:');
    verification.rows.forEach(row => {
      console.log(`  ${row.column_name.padEnd(30)} → ${row.data_type}`);
    });
    
    console.log('\n✨ All done! SEDA registration table now accepts decimal values.\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed.');
  }
}

runMigration();
