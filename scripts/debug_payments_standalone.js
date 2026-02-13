
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { pgTable, text, numeric, boolean, timestamp, integer } = require('drizzle-orm/pg-core');
const { eq, isNotNull, sql } = require('drizzle-orm');

// --- SCHEMA DEFINITION (Minimal for this script) ---
const invoices = pgTable('invoice', {
    id: integer('id'),
    bubble_id: text('bubble_id'),
    total_amount: numeric('total_amount'),
    linked_payment: text('linked_payment').array(),
    percent_of_total_amount: numeric('percent_of_total_amount'),
    status: text('status'),
    amount: numeric('amount')
});

const payments = pgTable('payment', {
    id: integer('id'),
    bubble_id: text('bubble_id'),
    amount: numeric('amount'),
    payment_date: timestamp('payment_date'),
    linked_invoice: text('linked_invoice')
});

// Setup DB Connection
const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const pool = new Pool({ connectionString });
const db = drizzle(pool);

async function inspectData() {
    try {
        console.log("Searching for invoices with linked_payment...");

        // Find invoices that have entries in the linked_payment array
        const sampleInvoices = await db.select({
            id: invoices.id,
            bubble_id: invoices.bubble_id,
            total_amount: invoices.total_amount,
            linked_payment: invoices.linked_payment,
            percent: invoices.percent_of_total_amount
        })
            .from(invoices)
            .where(
                // Check if array has content. Drizzle raw SQL for array length check
                sql`cardinality(${invoices.linked_payment}) > 0`
            )
            .limit(5);

        console.log(`Found ${sampleInvoices.length} sample invoices.`);

        for (const inv of sampleInvoices) {
            console.log(`\n--- Invoice: ${inv.bubble_id} ---`);
            console.log(`Total: ${inv.total_amount}`);
            console.log(`Linked Payment Array:`, inv.linked_payment);

            if (inv.linked_payment && inv.linked_payment.length > 0) {
                for (const pid of inv.linked_payment) {
                    if (!pid) continue;

                    // Check if payment exists by bubble_id
                    const pay = await db.select({
                        bubble_id: payments.bubble_id,
                        amount: payments.amount,
                        linked_invoice: payments.linked_invoice
                    })
                        .from(payments)
                        .where(eq(payments.bubble_id, pid));

                    if (pay.length > 0) {
                        const p = pay[0];
                        console.log(`   > FOUND Payment ${pid}: Amount=${p.amount}, BackLink=${p.linked_invoice}`);

                        // Verify back link
                        if (p.linked_invoice !== inv.bubble_id) {
                            console.log(`     WARNING: Payment ${pid} backlink '${p.linked_invoice}' != Invoice '${inv.bubble_id}'`);
                        }
                    } else {
                        console.log(`   > MISSING Payment ${pid} in DB`);
                    }
                }
            } else {
                console.log("Empty linked_payment array");
            }
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

inspectData();
