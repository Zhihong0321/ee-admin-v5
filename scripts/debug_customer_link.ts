
import { db } from "@/lib/db";
import { invoices, customers } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";

async function verify() {
    console.log("Inspecting linked customer relationship...");

    // 1. Get an invoice with linked_customer
    const inv = await db.select({
        id: invoices.id,
        linked_customer: invoices.linked_customer
    }).from(invoices)
        .where(isNotNull(invoices.linked_customer))
        .limit(1);

    if (!inv[0]) {
        console.log("No invoice with linked_customer found.");
        return;
    }

    const targetId = inv[0].linked_customer;
    if (!targetId) return;
    console.log("Invoice linked_customer ID (from DB):", targetId);

    // 2. Try to find this customer using 'customer_id' column
    const match = await db.select({
        id: customers.id,
        customer_id: customers.customer_id,
        name: customers.name
    }).from(customers)
        .where(eq(customers.customer_id, targetId)) // Using customer_id
        .limit(1);

    if (match.length > 0) {
        console.log("✅ MATCH FOUND in customers.customer_id!");
        console.log(match[0]);
    } else {
        console.log("❌ NO MATCH FOUND in customers.customer_id.");
        // Dump a sample customer to see ID format
        const sample = await db.select({
            id: customers.id,
            customer_id: customers.customer_id,
            name: customers.name
        }).from(customers).limit(1);

        if (sample.length > 0) {
            console.log("Sample customer from DB:", sample[0]);
            console.log("Length of invoice ID:", targetId.length);
            console.log("Length of customer ID:", sample[0].customer_id?.length);
        } else {
            console.log("Customers table is EMPTY!");
        }
    }
}
verify().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
