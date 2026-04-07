import { db } from './src/lib/db';
import { sql } from 'drizzle-orm';

async function run() {
  console.log('Starting data fix for null invoice_id fields...');
  try {
    const result = await db.execute(sql`
      UPDATE invoice 
      SET invoice_id = CAST(regexp_replace(invoice_number, '\\D', '', 'g') AS INTEGER) 
      WHERE invoice_id IS NULL 
      AND invoice_number ~ '\\d'
    `);
    console.log(`Successfully updated labels for existing records.`);
  } catch (error) {
    console.error('Error during update:', error);
    process.exit(1);
  }
}

run();
