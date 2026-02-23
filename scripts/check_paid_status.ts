
import { db } from "@/lib/db";
import { invoices } from "@/db/schema";
import { eq, sql, gt, gte, and } from "drizzle-orm";

async function checkPaidInvoices() {
    console.log("Checking invoices table...");

    // 1. Count invoices with paid = true
    const paidCount = await db.select({ count: sql`count(*)` })
        .from(invoices)
        .where(eq(invoices.paid, true));

    console.log("Invoices with paid = true:", paidCount[0].count);

    // 2. Count invoices with percent >= 99.9
    const percentCount = await db.select({ count: sql`count(*)` })
        .from(invoices)
        .where(sql`cast(${invoices.percent_of_total_amount} as numeric) >= 99.9`);

    console.log("Invoices with percent >= 99.9:", percentCount[0].count);

    // 3. Sample a few "paid" invoices
    const sample = await db.select({
        id: invoices.id,
        bubble_id: invoices.bubble_id,
        paid: invoices.paid,
        percent: invoices.percent_of_total_amount,
        updated_at: invoices.updated_at
    })
        .from(invoices)
        .where(eq(invoices.paid, true))
        .limit(5);

    console.log("Sample paid invoices:", sample);
}

checkPaidInvoices().catch(console.error).finally(() => process.exit());
