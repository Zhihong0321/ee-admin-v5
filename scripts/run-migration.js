const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
});

async function runMigration() {
  try {
    await client.connect();
    console.log('Connected to Railway PostgreSQL');

    const sql = `
      CREATE TABLE IF NOT EXISTS sync_progress (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        total_invoices INTEGER NOT NULL DEFAULT 0,
        synced_invoices INTEGER NOT NULL DEFAULT 0,
        current_invoice_id TEXT,
        date_from TEXT,
        date_to TEXT,
        error_message TEXT,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE
      );

      CREATE INDEX IF NOT EXISTS idx_sync_progress_session_id ON sync_progress(session_id);
      CREATE INDEX IF NOT EXISTS idx_sync_progress_status ON sync_progress(status);
    `;

    await client.query(sql);
    console.log('✅ Migration completed successfully!');
    console.log('Created: sync_progress table with indexes');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
