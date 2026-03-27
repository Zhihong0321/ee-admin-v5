const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway'
});

const lines = [];
function log(msg) {
  lines.push(typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2));
}

async function main() {
  await client.connect();
  log('Connected to PROD DB\n');

  // 1. submitted_payment - summary
  const statusDist = await client.query(`SELECT status, COUNT(*) as count FROM submitted_payment GROUP BY status ORDER BY count DESC`);
  log('=== submitted_payment STATUS DISTRIBUTION ===');
  log(statusDist.rows);
  log('');

  // 2. submitted_payment - all records with join
  const joinedView = await client.query(`
    SELECT 
      sp.id, sp.bubble_id, sp.status, sp.amount, sp.linked_invoice, sp.linked_agent, sp.linked_customer,
      a.name as agent_name,
      c.name as customer_name,
      i.bubble_id as invoice_bubble_id,
      i.invoice_id as invoice_int_id
    FROM submitted_payment sp
    LEFT JOIN agent a ON sp.linked_agent = a.bubble_id
    LEFT JOIN customer c ON sp.linked_customer = c.customer_id  
    LEFT JOIN invoice i ON (sp.linked_invoice = i.bubble_id OR sp.linked_invoice = CAST(i.invoice_id AS TEXT))
    WHERE sp.status = 'pending'
  `);
  log('=== JOINED VIEW - pending submitted_payment ===');
  log(joinedView.rows);
  log('');

  // 3. submit_payment columns
  const submitCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name='submit_payment' AND table_schema='public' 
    ORDER BY ordinal_position
  `);
  log('=== submit_payment COLUMNS ===');
  log(submitCols.rows.map(r => `${r.column_name} (${r.data_type})`).join('\n'));
  log('');

  // 4. submit_payment - all records
  const submitAll = await client.query(`SELECT * FROM submit_payment ORDER BY created_at DESC`);
  log(`=== submit_payment ALL RECORDS (${submitAll.rowCount} total) ===`);
  log(submitAll.rows);
  log('');

  // 5. Cross check: bubble_ids in submit_payment vs submitted_payment
  const notInSubmitted = await client.query(`
    SELECT sp.*
    FROM submit_payment sp
    WHERE sp.bubble_id IS NOT NULL
      AND sp.bubble_id NOT IN (
        SELECT bubble_id FROM submitted_payment WHERE bubble_id IS NOT NULL
      )
  `);
  log(`=== submit_payment records NOT in submitted_payment (${notInSubmitted.rowCount}) ===`);
  log(notInSubmitted.rows);
  log('');

  // 6. All submitted_payment records (all statuses)
  const allSubmitted = await client.query(`SELECT * FROM submitted_payment ORDER BY created_at DESC`);
  log(`=== ALL submitted_payment (${allSubmitted.rowCount} total) ===`);
  log(allSubmitted.rows);
  log('');

  // 7. payment table - recent records to see if submitted ones were verified
  const recentPayments = await client.query(`
    SELECT id, bubble_id, amount, payment_date, payment_method, payment_method_v2, linked_invoice, linked_agent, verified_by, created_at
    FROM payment 
    ORDER BY created_at DESC 
    LIMIT 30
  `);
  log(`=== payment (verified) RECENT 30 RECORDS ===`);
  log(recentPayments.rows);

  await client.end();
  fs.writeFileSync('scripts/payment_check_result.txt', lines.join('\n'), 'utf8');
  console.log('Done! Saved to scripts/payment_check_result.txt');
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  fs.writeFileSync('scripts/payment_check_result.txt', lines.join('\n') + '\nFATAL: ' + e.message, 'utf8');
  process.exit(1);
});
