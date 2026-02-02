/**
 * PATCHER: Backfill missing linked_customer in submitted_payment
 * Strategy: Trace customer from linked_invoice
 * 
 * Flow: submitted_payment.linked_invoice -> invoice.linked_customer -> UPDATE submitted_payment.linked_customer
 */

const { Client } = require('pg');

const PROD_DB = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

async function patchMissingPaymentCustomer() {
  const client = new Client({ connectionString: PROD_DB });
  
  try {
    await client.connect();
    console.log('✓ Connected to PRODUCTION database\n');

    // STEP 1: Analyze the issue
    console.log('=== STEP 1: Analyze missing linked_customer ===\n');
    
    const analysis = await client.query(`
      SELECT 
        COUNT(*) as total_payments,
        COUNT(linked_customer) as has_customer,
        COUNT(*) - COUNT(linked_customer) as missing_customer,
        COUNT(linked_invoice) as has_invoice
      FROM submitted_payment;
    `);
    
    const stats = analysis.rows[0];
    console.log(`Total submitted_payments: ${stats.total_payments}`);
    console.log(`Has linked_customer: ${stats.has_customer}`);
    console.log(`Missing linked_customer: ${stats.missing_customer}`);
    console.log(`Has linked_invoice: ${stats.has_invoice}`);
    console.log('');

    if (stats.missing_customer === 0) {
      console.log('✓ No missing customers to patch!');
      return;
    }

    // STEP 2: Find patchable records
    console.log('=== STEP 2: Find patchable records ===\n');
    
    const patchable = await client.query(`
      SELECT 
        sp.id,
        sp.bubble_id as payment_bubble_id,
        sp.linked_customer,
        sp.linked_invoice,
        inv.bubble_id as invoice_bubble_id,
        inv.linked_customer as invoice_customer,
        c.customer_id as customer_id,
        c.name as customer_name
      FROM submitted_payment sp
      LEFT JOIN invoice inv ON sp.linked_invoice = inv.bubble_id
      LEFT JOIN customer c ON inv.linked_customer = c.customer_id
      WHERE sp.linked_customer IS NULL
        AND sp.linked_invoice IS NOT NULL
      ORDER BY sp.created_at DESC;
    `);

    console.log(`Payments with NULL linked_customer but has linked_invoice: ${patchable.rows.length}\n`);
    
    let patchableCount = 0;
    let unpatchableCount = 0;
    
    patchable.rows.forEach((row, i) => {
      console.log(`${i+1}. Payment ID: ${row.id} (${row.payment_bubble_id})`);
      console.log(`   linked_invoice: ${row.linked_invoice}`);
      
      if (row.invoice_bubble_id) {
        console.log(`   ✓ Invoice found: ${row.invoice_bubble_id}`);
        console.log(`   → invoice.linked_customer: ${row.invoice_customer || 'NULL'}`);
        
        if (row.customer_id) {
          console.log(`   → ✓ Customer resolved: ${row.customer_name}`);
          patchableCount++;
        } else {
          console.log(`   → ✗ Customer NOT found in database`);
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
      console.log('⚠ No records can be patched (invoices or customers missing)');
      return;
    }

    // STEP 3: DRY RUN - Show what will be updated
    console.log('=== STEP 3: DRY RUN - Preview Updates ===\n');
    
    const dryRun = await client.query(`
      SELECT 
        sp.id,
        sp.bubble_id as payment_bubble_id,
        sp.linked_customer as current_customer,
        inv.linked_customer as new_customer,
        c.name as customer_name
      FROM submitted_payment sp
      INNER JOIN invoice inv ON sp.linked_invoice = inv.bubble_id
      INNER JOIN customer c ON inv.linked_customer = c.customer_id
      WHERE sp.linked_customer IS NULL
        AND inv.linked_customer IS NOT NULL;
    `);

    console.log(`Records to be updated: ${dryRun.rows.length}\n`);
    
    dryRun.rows.forEach((row, i) => {
      console.log(`${i+1}. Payment ${row.payment_bubble_id}`);
      console.log(`   Current linked_customer: ${row.current_customer || 'NULL'}`);
      console.log(`   → Will set to: ${row.new_customer} (${row.customer_name})`);
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
        linked_customer = inv.linked_customer,
        updated_at = NOW()
      FROM invoice inv
      WHERE sp.linked_invoice = inv.bubble_id
        AND sp.linked_customer IS NULL
        AND inv.linked_customer IS NOT NULL
      RETURNING sp.id, sp.bubble_id, sp.linked_customer;
    `);

    console.log(`✓ Updated ${updateResult.rows.length} records\n`);
    
    updateResult.rows.forEach((row, i) => {
      console.log(`${i+1}. Payment ${row.bubble_id} → linked_customer: ${row.linked_customer}`);
    });

    // STEP 5: Verify results
    console.log('\n=== STEP 5: Verify Results ===\n');
    
    const verification = await client.query(`
      SELECT 
        COUNT(*) as total_payments,
        COUNT(linked_customer) as has_customer,
        COUNT(*) - COUNT(linked_customer) as missing_customer
      FROM submitted_payment;
    `);
    
    const afterStats = verification.rows[0];
    console.log('After patching:');
    console.log(`Total submitted_payments: ${afterStats.total_payments}`);
    console.log(`Has linked_customer: ${afterStats.has_customer} (was ${stats.has_customer})`);
    console.log(`Missing linked_customer: ${afterStats.missing_customer} (was ${stats.missing_customer})`);
    
    const fixed = stats.missing_customer - afterStats.missing_customer;
    console.log(`\n✓ Fixed: ${fixed} payments`);
    console.log(`Remaining issues: ${afterStats.missing_customer} (no linked_invoice or invoice has no customer)`);

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

patchMissingPaymentCustomer().catch(console.error);
