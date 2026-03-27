import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

async function main() {
    try {
        console.log("Checking Postgres columns for 'invoice' table...");
        const result = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'invoice';
        `);
        console.log(result.rows.map((r: any) => r.column_name));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
