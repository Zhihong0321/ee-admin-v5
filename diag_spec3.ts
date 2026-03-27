import { db } from "./src/lib/db";
import { sedaRegistration } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
    const rec = await db.query.sedaRegistration.findFirst({
        where: eq(sedaRegistration.bubble_id, 'seda_019f2e3d8f71067a')
    });
    console.log("SEDA:", JSON.stringify(rec, null, 2));
    process.exit(0);
}
main().catch(console.error);
