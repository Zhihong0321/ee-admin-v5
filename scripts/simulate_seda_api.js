const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { pgTable, serial, text, integer, timestamp, numeric, boolean } = require('drizzle-orm/pg-core');
const { eq } = require('drizzle-orm');

// Mock Schema Definition (simplified to relevant parts)
const sedaRegistration = pgTable('seda_registration', {
    id: serial('id').primaryKey(),
    bubble_id: text('bubble_id'),
    tnb_bill_1: text('tnb_bill_1'),
    tnb_bill_2: text('tnb_bill_2'),
    tnb_bill_3: text('tnb_bill_3'),
    installation_address: text('installation_address'),
});

const connectionString = "postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway";
const pool = new Pool({ connectionString });
const db = drizzle(pool);

async function run() {
    try {
        const bubble_id = 'seda_ad3f388d79953cdd'; // Known to have tnb_bill_1
        console.log(`Fetching SEDA registration for ${bubble_id}...`);

        const result = await db
            .select({
                seda: sedaRegistration,
            })
            .from(sedaRegistration)
            .where(eq(sedaRegistration.bubble_id, bubble_id))
            .limit(1);

        if (result.length > 0) {
            console.log('Result found:');
            console.log(JSON.stringify(result[0].seda, null, 2));
        } else {
            console.log('No result found.');
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
