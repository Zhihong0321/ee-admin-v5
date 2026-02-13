
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { desc } from 'drizzle-orm';

const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

async function verify() {
    console.log("Checking for updated invoices...");
    try {
        const result = await db.select()
            .from(schema.invoices)
            .orderBy(desc(schema.invoices.updated_at))
            .limit(1);

        if (result.length > 0) {
            const inv = result[0];
            console.log(`\n--- Verification for Invoice: ${inv.invoice_number} ---`);
            console.log(`Updated At: ${inv.updated_at}`);
            console.log(`Amount Eligible: RM ${inv.amount_eligible_for_comm}`);
            console.log(`\nDescription:\n${inv.eligible_amount_description}`);
        } else {
            console.log("No invoices found.");
        }
    } catch (e) {
        console.error("VERIFICATION ERROR:", e);
    } finally {
        await pool.end();
    }
}

verify();
