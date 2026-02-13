
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { sql, desc } from 'drizzle-orm';

const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

async function verifyDeductions() {
    console.log("Checking for invoices with commission deductions...");

    // Find invoice where amount_eligible_for_comm < total_amount
    // Note: amount_eligible_for_comm is string in insert, but numeric in DB. Drizzle might return string.
    // Casting to numeric for comparison.
    // Also filtering where eligible_amount_description IS NOT NULL to ensure we only check processed ones.

    try {
        const result = await db.select()
            .from(schema.invoices)
            .where(sql`${schema.invoices.eligible_amount_description} IS NOT NULL 
                AND CAST(${schema.invoices.amount_eligible_for_comm} AS NUMERIC) < CAST(${schema.invoices.total_amount} AS NUMERIC)`)
            .orderBy(desc(schema.invoices.updated_at))
            .limit(1);

        if (result.length > 0) {
            const inv = result[0];
            console.log(`\n--- Verification for Invoice with Deductions: ${inv.invoice_number} ---`);
            console.log(`Total Amount: RM ${inv.total_amount}`);
            console.log(`Amount Eligible: RM ${inv.amount_eligible_for_comm}`);
            console.log(`\nDescription:\n${inv.eligible_amount_description}`);
        } else {
            console.log("No processed invoices found with deductions yet (or all had 0 deductions).");

            // Check one without deductions just to be sure
            const result2 = await db.select()
                .from(schema.invoices)
                .where(sql`${schema.invoices.eligible_amount_description} IS NOT NULL`)
                .limit(1);

            if (result2.length > 0) {
                console.log("Found processed invoices without deductions, e.g. " + result2[0].invoice_number);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

verifyDeductions();
