
import { db } from "@/lib/db";
import { invoices, customers, agents } from "@/db/schema";
import { eq, or, desc, sql } from "drizzle-orm";

async function run() {
    console.log("Starting debug of getFullyPaidInvoices query...");

    try {
        // Exact logic from actions.ts
        const whereClause = or(
            eq(invoices.paid, true),
            sql`cast(${invoices.percent_of_total_amount} as numeric) >= 99.9`
        );

        console.log("Executing query...");
        const data = await db
            .select({
                id: invoices.id,
                invoice_number: invoices.invoice_number,
                full_payment_date: invoices.full_payment_date
            })
            .from(invoices)
            .leftJoin(customers, eq(invoices.linked_customer, customers.customer_id))
            .leftJoin(agents, eq(invoices.linked_agent, agents.bubble_id))
            .where(whereClause)
            .orderBy(desc(invoices.full_payment_date))
            .limit(5);

        console.log("Query SUCCESS. Rows found:", data.length);
        if (data.length > 0) console.log(data);
        else console.log("No rows returned (unexpected for 701 paid invoices)");

    } catch (error) {
        console.error("Query FAILED. Error details:");
        console.error(error);
    }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
