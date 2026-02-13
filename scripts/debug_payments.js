
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { text, integer, numeric, boolean } = require('drizzle-orm/pg-core');
const { pgTable, serial, timestamp } = require('drizzle-orm/pg-core');
const schema = require('./src/db/schema'); // Adjust path as needed
const { invoices, payments } = schema;
const { eq, isNotNull, sql, desc, limit } = require('drizzle-orm');

// Setup DB Connection
const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

async function inspectData() {
    try {
        console.log("Inspecting Invoices with linked_payment...");
        const sampleInvoices = await db.select({
            bubble_id: invoices.bubble_id,
            total_amount: invoices.total_amount,
            linked_payment: invoices.linked_payment,
            percent: invoices.percent_of_total_amount
        })
            .from(invoices)
            .where(
                // Find invoices that SHOULD have payments
                sql`${invoices.linked_payment} IS NOT NULL AND array_length(${invoices.linked_payment}, 1) > 0`
            )
            .limit(5);

        console.log("Sample Invoices:", JSON.stringify(sampleInvoices, null, 2));

        if (sampleInvoices.length > 0) {
            const firstInv = sampleInvoices[0];
            const pids = firstInv.linked_payment;
            console.log(`Checking payments for first invoice (bubble_id: ${firstInv.bubble_id}), PIDs:`, pids);

            // Check payments table for these IDs
            for (const pid of pids) {
                if (!pid) continue;
                const pay = await db.select({
                    bubble_id: payments.bubble_id,
                    amount: payments.amount,
                    linked_invoice: payments.linked_invoice
                })
                    .from(payments)
                    .where(eq(payments.bubble_id, pid));

                console.log(`Payment check for ${pid}:`, pay.length > 0 ? pay[0] : "NOT FOUND");
            }
        }

        console.log("\nChecking payments.linked_invoice column validity...");
        const samplePayments = await db.select({
            bubble_id: payments.bubble_id,
            linked_invoice: payments.linked_invoice // Is this populated?
        })
            .from(payments)
            .where(isNotNull(payments.linked_invoice))
            .limit(5);

        console.log("Sample Payments with linked_invoice:", JSON.stringify(samplePayments, null, 2));

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

inspectData();
