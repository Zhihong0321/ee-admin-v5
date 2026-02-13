
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { sql, desc, like } from 'drizzle-orm';

const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

async function verifySpecific() {
    console.log("Searching for invoices with non-zero EPP or Voucher costs...");

    try {
        // Look for keywords in description that indicate costs > 0
        // "EPP INTEREST TOTAL : RM 0.00" -> We want != 0.00
        // So looking for "EPP INTEREST TOTAL : RM [1-9]"
        // Or "VOUCHER COST TOTAL : RM [1-9]"

        const result = await db.select()
            .from(schema.invoices)
            .where(sql`${schema.invoices.eligible_amount_description} LIKE '%EPP INTEREST TOTAL : RM [1-9]%' 
                OR ${schema.invoices.eligible_amount_description} LIKE '%VOUCHER COST TOTAL : RM [1-9]%'`)
            .limit(1);

        if (result.length > 0) {
            const inv = result[0];
            console.log(`\n--- Verification for Invoice with Costs: ${inv.invoice_number} ---`);
            console.log(`\nDescription:\n${inv.eligible_amount_description}`);
        } else {
            console.log("No invoices found with non-zero EPP or Voucher costs yet (in the processed batch).");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

verifySpecific();
