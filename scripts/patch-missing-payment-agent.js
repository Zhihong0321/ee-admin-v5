/**
 * PATCHER: Backfill missing linked_agent in submitted_payment
 * Strategy: Trace agent from linked_invoice
 * 
 * Flow: submitted_payment.linked_invoice -> invoice.linked_agent -> UPDATE submitted_payment.linked_agent
 */

const { Client } = require('pg');

const PROD_DB = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function patchMissingPaymentAgent() {
  const client = new Client({ connectionString: PROD_DB });
  
  try {
    await client.connect();
    console.log('✓ Connected to PRODUCTION database\n');

    // STEP 1: Analyze the issue
    console.log('=== STEP 1: Analyze missing linked_agent ===\n');
    
    const analysis = await client.query(`
      SELECT 
        COUNT(*) as total_payments,
        COUNT(linked_agent) as has_agent,
        COUNT(*) - COUNT(linked_agent) as missing_agent,
        COUNT(linked_invoice) as has_invoice
      FROM submitted_payment;
    `);
    
    const stats = analysis.rows[0];
    console.log(`Total submitted_payments: ${stats.total_payments}`);
    console.log(`Has linked_agent: ${stats.has_agent}`);
    console.log(`Missing linked_agent: ${stats.missing_agent}`);
    console.log(`Has linked_invoice: ${stats.has_invoice}`);
    console.log('');

    if (stats.missing_agent === 0) {
      console.log('✓ No missing agents to patch!');
      return;
    }

    // STEP 2: Find patchable records
    console.log('=== STEP 2: Find patchable records ===\n');
    
    const patchable = await client.query(`
      SELECT 
        sp.id,
        sp.bubble_id as payment_bubble_id,
        sp.linked_agent,
        sp.linked_invoice,
        inv.bubble_id as invoice_bubble_id,
        inv.linked_agent as invoice_agent,
        a.bubble_id as agent_bubble_id,
        a.name as agent_name
      FROM submitted_payment sp
      LEFT JOIN invoice inv ON sp.linked_invoice = inv.bubble_id
      LEFT JOIN agent a ON inv.linked_agent = a.bubble_id
      WHERE sp.linked_agent IS NULL
        AND sp.linked_invoice IS NOT NULL
      ORDER BY sp.created_at DESC;
    `);

    console.log(`Payments with NULL linked_agent but has linked_invoice: ${patchable.rows.length}\n`);
    
    let patchableCount = 0;
    let unpatchableCount = 0;
    
    patchable.rows.forEach((row, i) => {
      console.log(`${i+1}. Payment ID: ${row.id} (${row.payment_bubble_id})`);
      console.log(`   linked_invoice: ${row.linked_invoice}`);
      
      if (row.invoice_bubble_id) {
        console.log(`   ✓ Invoice found: ${row.invoice_bubble_id}`);
        console.log(`   → invoice.linked_agent: ${row.invoice_agent || 'NULL'}`);
        
        if (row.agent_bubble_id) {
          console.log(`   → ✓ Agent resolved: ${row.agent_name}`);
          patchableCount++;
        } else {
          console.log(`   → ✗ Agent NOT found in database`);
          unpatchableCount++;
        }
      } else {
        console.log(`   ✗ Invoice NOT found`);
        unpatchableCount++;
      }
      console.log('');
    });

    console.log(`Patchable: ${patchableCount}`);
    console.log(`Unpatchable: ${unpatchableCount}\n`);

    if (patchableCount === 0) {
      console.log('⚠ No records can be patched (invoices or agents missing)');
      return;
    }

    // STEP 3: DRY RUN - Show what will be updated
    console.log('=== STEP 3: DRY RUN - Preview Updates ===\n');
    
    const dryRun = await client.query(`
      SELECT 
        sp.id,
        sp.bubble_id as payment_bubble_id,
        sp.linked_agent as current_agent,
        inv.linked_agent as new_agent,
        a.name as agent_name
      FROM submitted_payment sp
      INNER JOIN invoice inv ON sp.linked_invoice = inv.bubble_id
      INNER JOIN agent a ON inv.linked_agent = a.bubble_id
      WHERE sp.linked_agent IS NULL
        AND inv.linked_agent IS NOT NULL;
    `);

    console.log(`Records to be updated: ${dryRun.rows.length}\n`);
    
    dryRun.rows.forEach((row, i) => {
      console.log(`${i+1}. Payment ${row.payment_bubble_id}`);
      console.log(`   Current linked_agent: ${row.current_agent || 'NULL'}`);
      console.log(`   → Will set to: ${row.new_agent} (${row.agent_name})`);
      console.log('');
    });

    // STEP 4: Execute UPDATE
    console.log('=== STEP 4: Execute UPDATE ===\n');
    console.log('⚠ WARNING: This will UPDATE the production database!');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Executing UPDATE...\n');
    
    const updateResult = await client.query(`
      UPDATE submitted_payment sp
      SET 
        linked_agent = inv.linked_agent,
        updated_at = NOW()
      FROM invoice inv
      WHERE sp.linked_invoice = inv.bubble_id
        AND sp.linked_agent IS NULL
        AND inv.linked_agent IS NOT NULL
      RETURNING sp.id, sp.bubble_id, sp.linked_agent;
    `);

    console.log(`✓ Updated ${updateResult.rows.length} records\n`);
    
    updateResult.rows.forEach((row, i) => {
      console.log(`${i+1}. Payment ${row.bubble_id} → linked_agent: ${row.linked_agent}`);
    });

    // STEP 5: Verify results
    console.log('\n=== STEP 5: Verify Results ===\n');
    
    const verification = await client.query(`
      SELECT 
        COUNT(*) as total_payments,
        COUNT(linked_agent) as has_agent,
        COUNT(*) - COUNT(linked_agent) as missing_agent
      FROM submitted_payment;
    `);
    
    const afterStats = verification.rows[0];
    console.log('After patching:');
    console.log(`Total submitted_payments: ${afterStats.total_payments}`);
    console.log(`Has linked_agent: ${afterStats.has_agent} (was ${stats.has_agent})`);
    console.log(`Missing linked_agent: ${afterStats.missing_agent} (was ${stats.missing_agent})`);
    
    const fixed = stats.missing_agent - afterStats.missing_agent;
    console.log(`\n✓ Fixed: ${fixed} payments`);
    console.log(`Remaining issues: ${afterStats.missing_agent} (no linked_invoice or invoice has no agent)`);

    console.log('\n=== PATCH COMPLETE ===\n');

  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error);
    throw error;
  } finally {
    await client.end();
    console.log('✓ Database connection closed');
  }
}

patchMissingPaymentAgent().catch(console.error);
