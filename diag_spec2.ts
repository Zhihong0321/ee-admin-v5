import { db } from "./src/lib/db";
import { invoices, sedaRegistration } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
    const invs = await db.query.invoices.findMany({
        where: eq(invoices.invoice_number, 'INV-1008398')
    });
    console.log("Invoice 1008398:", invs.map(i => i.linked_seda_registration));

    const invs2 = await db.query.invoices.findMany({
        where: eq(invoices.invoice_number, 'INV-1008073')
    });
    console.log("Invoice 1008073:", invs2.map(i => i.linked_seda_registration));

    // let's grab the seda registration 
    const sedaIds = [...invs.map(i => i.linked_seda_registration), ...invs2.map(i => i.linked_seda_registration)].filter(Boolean) as string[];

    for (const sid of sedaIds) {
        const s = await db.query.sedaRegistration.findFirst({
            where: eq(sedaRegistration.bubble_id, sid)
        });
        console.log(`SEDA ${sid} => `, s ? 'FOUND' : 'NOT FOUND');
    }

    process.exit(0);
}
main().catch(console.error);
