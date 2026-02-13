
import { db } from "@/lib/db";
import { invoices, customers } from "@/db/schema";
import { eq, sql, isNotNull } from "drizzle-orm";

async function verify() {
    console.log("Verifying Join...");

    // 1. Check a sample linked_customer value
    const sample = await db.select({
        id: invoices.id,
        linked_customer: invoices.linked_customer
    }).from(invoices)
        .where(isNotNull(invoices.linked_customer))
        .limit(1);

    console.log("Sample Invoice Linked Customer:", sample[0]);

    // 2. Check Customers table and try to join
    try {
        console.log("Attempting join on bubble_id...");
        const res = await db.select({
            id: invoices.id,
            customer_name: customers.name
        })
            .from(invoices)
            // @ts-ignore - suspecting bubble_id exists but might not be in types if I don't see schema
            .leftJoin(customers, eq(invoices.linked_customer, customers.bubble_id))
            .where(eq(invoices.paid, true))
            .limit(2);

        console.log("Join SUCCESS. Rows:", res.length);
        console.log(res);
    } catch (e) {
        const err = e as Error;
        console.log("Join FAILED:", err.message);
    }
}
verify().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
