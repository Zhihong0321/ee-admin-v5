import { db } from "./src/lib/db";
import { sedaRegistration, invoices, customers } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
    const sedaId = 'seda_ad3f388d79953cdd60751102000';
    const rec = await db.query.sedaRegistration.findFirst({
        where: eq(sedaRegistration.bubble_id, sedaId)
    });
    console.log("SEDA Record:", rec);

    const inv = await db.query.invoices.findFirst({
        where: eq(invoices.linked_seda_registration, sedaId)
    });
    console.log("Invoice:", inv?.invoice_number);

    process.exit(0);
}
main().catch(console.error);
