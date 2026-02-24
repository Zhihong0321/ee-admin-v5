import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
    try {
        console.log("Adding is_deleted column to invoice table...");
        await db.execute(sql`ALTER TABLE invoice ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;`);
        console.log("Adding deleted_at column to invoice table...");
        await db.execute(sql`ALTER TABLE invoice ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;`);
        console.log("Migration completed successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    }
}

main();
