/**
 * Patch Script: Update full_payment_date for all paid invoices
 * 
 * This script will:
 * 1. Find all invoices where paid = true
 * 2. For each invoice, find the latest payment date from linked payments
 * 3. Update the invoice's full_payment_date with that latest payment date
 */

const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { pgTable, serial, text, integer, timestamp, numeric, boolean } = require('drizzle-orm/pg-core');
const { eq, desc, and, isNotNull } = require('drizzle-orm');

// Define simplified schema for the tables we need
const invoices = pgTable('invoice', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  invoice_number: text('invoice_number'),
  full_payment_date: timestamp('full_payment_date', { withTimezone: true }),
  paid: boolean('paid'),
  updated_at: timestamp('updated_at', { withTimezone: true })
});

const payments = pgTable('payment', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  payment_date: timestamp('payment_date', { withTimezone: true }),
  amount: numeric('amount'),
  linked_invoice: text('linked_invoice')
});

// Database connection
const pool = new Pool({
  connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const db = drizzle(pool);

async function patchFullPaymentDates() {
  console.log('🔍 Starting full payment date patch...');
  
  try {
    // 1. Get all paid invoices
    const paidInvoices = await db
      .select({
        id: invoices.id,
        bubble_id: invoices.bubble_id,
        invoice_number: invoices.invoice_number,
        full_payment_date: invoices.full_payment_date,
        paid: invoices.paid
      })
      .from(invoices)
      .where(and(eq(invoices.paid, true), isNotNull(invoices.bubble_id)));
    
    console.log(`📋 Found ${paidInvoices.length} paid invoices`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    // 2. Process each paid invoice
    for (const invoice of paidInvoices) {
      try {
        // Get all payments linked to this invoice
        const linkedPayments = await db
          .select({
            payment_date: payments.payment_date,
            amount: payments.amount
          })
          .from(payments)
          .where(eq(payments.linked_invoice, invoice.bubble_id))
          .orderBy(desc(payments.payment_date));
        
        if (linkedPayments.length === 0) {
          console.log(`⚠️  Invoice ${invoice.invoice_number} (${invoice.bubble_id}): No linked payments found`);
          skippedCount++;
          continue;
        }
        
        // Get the latest payment date
        const latestPaymentDate = linkedPayments[0].payment_date;
        
        if (!latestPaymentDate) {
          console.log(`⚠️  Invoice ${invoice.invoice_number} (${invoice.bubble_id}): Latest payment has no date`);
          skippedCount++;
          continue;
        }
        
        // Check if update is needed
        const currentFullPaymentDate = invoice.full_payment_date;
        const needsUpdate = !currentFullPaymentDate || 
                           new Date(currentFullPaymentDate).getTime() !== new Date(latestPaymentDate).getTime();
        
        if (needsUpdate) {
          // Update the invoice
          await db
            .update(invoices)
            .set({
              full_payment_date: latestPaymentDate,
              updated_at: new Date()
            })
            .where(eq(invoices.bubble_id, invoice.bubble_id));
          
          console.log(`✅ Updated invoice ${invoice.invoice_number} (${invoice.bubble_id}): ${currentFullPaymentDate ? 'Updated' : 'Set'} full_payment_date to ${latestPaymentDate.toISOString()}`);
          updatedCount++;
        } else {
          console.log(`➖ Invoice ${invoice.invoice_number} (${invoice.bubble_id}): Already up to date`);
          skippedCount++;
        }
        
      } catch (error) {
        console.error(`❌ Error processing invoice ${invoice.invoice_number} (${invoice.bubble_id}):`, error.message);
      }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`✅ Updated: ${updatedCount} invoices`);
    console.log(`➖ Skipped: ${skippedCount} invoices`);
    console.log(`📋 Total: ${paidInvoices.length} paid invoices processed`);
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the patch
if (require.main === module) {
  patchFullPaymentDates()
    .then(() => {
      console.log('✨ Patch completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Patch failed:', error);
      process.exit(1);
    });
}

module.exports = { patchFullPaymentDates };