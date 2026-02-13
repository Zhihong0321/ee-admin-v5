
import { db } from "./src/lib/db";
import { sedaRegistration, invoices } from "./src/db/schema";
import { sql, or, eq, desc } from "drizzle-orm";

async function diag() {
    try {
        console.log("Checking Invoice Payment Distribution (> 0%):");
        const counts = await db.select({
            count: sql`count(*)`,
            range: sql`CASE 
        WHEN CAST(percent_of_total_amount AS NUMERIC) >= 5 THEN '>= 5%'
        WHEN CAST(percent_of_total_amount AS NUMERIC) >= 4 THEN '4-5%'
        WHEN CAST(percent_of_total_amount AS NUMERIC) > 0 THEN '0-4%'
        ELSE '0%' END`
        }).from(invoices).groupBy(sql`2`);
        console.table(counts);

        console.log("\nChecking SEDA Status Distribution:");
        const sedaStatuses = await db.select({
            status: sedaRegistration.seda_status,
            count: sql`count(*)`
        }).from(sedaRegistration).groupBy(sedaRegistration.seda_status);
        console.table(sedaStatuses);

        console.log("\nChecking Join Results (Invoices >= 4% joined with SEDA):");
        const joinResult = await db
            .select({
                inv_id: invoices.bubble_id,
                seda_id: sedaRegistration.bubble_id,
                percent: invoices.percent_of_total_amount,
                status: sedaRegistration.seda_status
            })
            .from(invoices)
            .innerJoin(sedaRegistration, or(
                eq(invoices.linked_seda_registration, sedaRegistration.bubble_id),
                sql`${invoices.bubble_id} = ANY(${sedaRegistration.linked_invoice})`
            ))
            .where(sql`CAST(${invoices.percent_of_total_amount} AS NUMERIC) >= 4`)
            .limit(10);
        console.table(joinResult);

    } catch (e) {
        console.error(e);
    }
}

diag();
