/**
 * Quick Summary Script: Show patch results
 */

const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { pgTable, serial, text, timestamp, boolean } = require('drizzle-orm/pg-core');
const { eq, and, isNotNull, count, isNull } = require('drizzle-orm');

// Define simplified schema
const invoices = pgTable('invoice', {
  id: serial('id').primaryKey(),
  bubble_id: text('bubble_id'),
  invoice_number: text('invoice_number'),
  full_payment_date: timestamp('full_payment_date', { withTimezone: true }),
  paid: boolean('paid'),
  updated_at: timestamp('updated_at', { withTimezone: true })
});

// Database connection
const pool = new Pool({
  connectionString: "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway",
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const db = drizzle(pool);

async function showSummary() {
  try {
    console.log('📊 INVOICE PAYMENT DATE PATCH SUMMARY');
    console.log('=====================================');
    
    // Count total paid invoices
    const [{ count: totalPaid }] = await db
      .select({ count: count() })
      .from(invoices)
      .where(and(eq(invoices.paid, true), isNotNull(invoices.bubble_id)));
    
    console.log(`Total Paid Invoices: ${totalPaid}`);
    
    // Count invoices with full_payment_date
    const [{ count: withFullPaymentDate }] = await db
      .select({ count: count() })
      .from(invoices)
      .where(and(
        eq(invoices.paid, true),
        isNotNull(invoices.full_payment_date)
      ));
    
    console.log(`Invoices with Full Payment Date: ${withFullPaymentDate}`);
    
    // Count invoices missing full_payment_date
    const [{ count: missingFullPaymentDate }] = await db
      .select({ count: count() })
      .from(invoices)
      .where(and(
        eq(invoices.paid, true),
        isNull(invoices.full_payment_date)
      ));
    
    console.log(`Invoices Missing Full Payment Date: ${missingFullPaymentDate}`);
    
    // Show sample of invoices with dates
    console.log('\n📅 Sample Invoices with Full Payment Dates:');
    const samples = await db
      .select({
        invoice_number: invoices.invoice_number,
        full_payment_date: invoices.full_payment_date
      })
      .from(invoices)
      .where(and(
        eq(invoices.paid, true),
        isNotNull(invoices.full_payment_date)
      ))
      .limit(5);
    
    samples.forEach(sample => {
      console.log(`  • Invoice ${sample.invoice_number}: ${sample.full_payment_date ? new Date(sample.full_payment_date).toISOString().split('T')[0] : 'NULL'}`);
    });
    
    console.log('\n✅ Patch process completed successfully!');
    
  } catch (error) {
    console.error('💥 Error:', error);
  } finally {
    await pool.end();
  }
}

showSummary();